import { Client } from 'ssh2'
import { SERVERS_DIR } from './servers'
import { execCommand } from './ssh'

interface TerminalSession {
  stream: NodeJS.ReadWriteStream
  buffer: string[]
  listeners: Set<(data: string) => void>
  createdAt: number
}

declare global {
  var terminalSessions: Map<string, TerminalSession> | undefined
}

if (!global.terminalSessions) global.terminalSessions = new Map()

const MAX_BUFFER = 20000

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function appendToBuffer(session: TerminalSession, text: string, insertAtStart = false) {
  if (!text) return
  if (insertAtStart) {
    session.buffer.unshift(text)
  } else {
    session.buffer.push(text)
  }
  if (session.buffer.length > MAX_BUFFER) {
    session.buffer.splice(0, session.buffer.length - MAX_BUFFER)
  }
}

async function captureTmuxHistory(client: Client, serverId: string): Promise<string> {
  const sessionName = `craft-${serverId}`
  const { stdout } = await execCommand(
    client,
    `tmux capture-pane -p -S -10000 -t ${shellQuote(sessionName)} 2>/dev/null || true`
  )
  return stdout
}

function isStreamAlive(session: TerminalSession): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = session.stream as any
    return !s.destroyed && s.writable !== false
  } catch {
    return false
  }
}

export async function getOrCreateTerminalSession(
  serverId: string,
  client: Client,
  options?: { rootShell?: boolean }
): Promise<TerminalSession> {
  const existing = global.terminalSessions!.get(serverId)

  if (existing && isStreamAlive(existing)) {
    return existing
  }

  if (existing) {
    try { (existing.stream as NodeJS.WritableStream).end() } catch {}
    global.terminalSessions!.delete(serverId)
  }

  const session = await new Promise<TerminalSession>((resolve, reject) => {
    client.shell(
      {
        term: options?.rootShell ? 'xterm-256color' : 'screen-256color',
        cols: 80,
        rows: 24,
      },
      (err, stream) => {
        if (err) return reject(err)

        const newSession: TerminalSession = {
          stream: stream as unknown as NodeJS.ReadWriteStream,
          buffer: [],
          listeners: new Set(),
          createdAt: Date.now(),
        }

        stream.on('data', (data: Buffer) => {
          const text = data.toString()
          appendToBuffer(newSession, text)
          for (const listener of newSession.listeners) {
            try { listener(text) } catch {}
          }
        })

        stream.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          appendToBuffer(newSession, text)
          for (const listener of newSession.listeners) {
            try { listener(text) } catch {}
          }
        })

        stream.on('close', () => {
          global.terminalSessions!.delete(serverId)
        })

        stream.on('error', () => {
          global.terminalSessions!.delete(serverId)
        })

        if (options?.rootShell) {
          resolve(newSession)
          return
        }

        const serverDir = `${SERVERS_DIR}/${serverId}`
        const sessionName = `craft-${serverId}`
        const initCommand =
          `mkdir -p ${shellQuote(serverDir)} 2>/dev/null; ` +
          `if command -v tmux >/dev/null 2>&1; then ` +
            `tmux has-session -t ${shellQuote(sessionName)} 2>/dev/null || ` +
            `tmux new-session -d -s ${shellQuote(sessionName)} -c ${shellQuote(serverDir)}; ` +
            `tmux set-option -t ${shellQuote(sessionName)} history-limit 50000 >/dev/null 2>&1 || true; ` +
            `tmux attach-session -t ${shellQuote(sessionName)}; ` +
          `else ` +
            `cd ${shellQuote(serverDir)}; ` +
          `fi\n`

        stream.write(initCommand, async () => {
          try {
            const history = await captureTmuxHistory(client, serverId)
            appendToBuffer(newSession, history, true)
          } catch {}
          resolve(newSession)
        })
      }
    )
  })

  global.terminalSessions!.set(serverId, session)
  return session
}

export function writeToTerminal(serverId: string, data: string): boolean {
  const session = global.terminalSessions!.get(serverId)
  if (!session || !isStreamAlive(session)) return false
  try {
    (session.stream as NodeJS.WritableStream).write(data)
    return true
  } catch {
    return false
  }
}

export function subscribeToTerminal(
  serverId: string,
  cb: (data: string) => void
): () => void {
  const session = global.terminalSessions!.get(serverId)
  if (!session) return () => {}

  session.listeners.add(cb)
  return () => {
    session.listeners.delete(cb)
  }
}

export function resizeTerminal(serverId: string, cols: number, rows: number): void {
  const session = global.terminalSessions!.get(serverId)
  if (!session || !isStreamAlive(session)) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = session.stream as any
    if (typeof stream.setWindow === 'function') {
      stream.setWindow(rows, cols, 0, 0)
    }
  } catch {}
}

export function getTerminalBuffer(serverId: string): string[] {
  return global.terminalSessions!.get(serverId)?.buffer ?? []
}
