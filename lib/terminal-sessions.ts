import { Client } from 'ssh2'

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

const MAX_BUFFER = 5000

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
  client: Client
): Promise<TerminalSession> {
  const existing = global.terminalSessions!.get(serverId)

  if (existing && isStreamAlive(existing)) {
    return existing
  }

  // Clean up old session
  if (existing) {
    try { (existing.stream as NodeJS.WritableStream).end() } catch {}
    global.terminalSessions!.delete(serverId)
  }

  // Create new shell session
  const session = await new Promise<TerminalSession>((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols: 220, rows: 50 }, (err, stream) => {
      if (err) return reject(err)

      const newSession: TerminalSession = {
        stream: stream as unknown as NodeJS.ReadWriteStream,
        buffer: [],
        listeners: new Set(),
        createdAt: Date.now(),
      }

      stream.on('data', (data: Buffer) => {
        const text = data.toString()
        newSession.buffer.push(text)
        if (newSession.buffer.length > MAX_BUFFER) {
          newSession.buffer.splice(0, newSession.buffer.length - MAX_BUFFER)
        }
        for (const listener of newSession.listeners) {
          try { listener(text) } catch {}
        }
      })

      stream.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        newSession.buffer.push(text)
        if (newSession.buffer.length > MAX_BUFFER) {
          newSession.buffer.splice(0, newSession.buffer.length - MAX_BUFFER)
        }
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

      resolve(newSession)

      // Attach to tmux session
      stream.write(
        `tmux attach-session -t craft-${serverId} 2>/dev/null || (echo "Session not started" && sleep 999999)\n`
      )
    })
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

export function getTerminalBuffer(serverId: string): string[] {
  return global.terminalSessions!.get(serverId)?.buffer ?? []
}
