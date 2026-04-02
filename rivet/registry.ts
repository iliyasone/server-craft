import { StringDecoder } from 'node:string_decoder'
import type { Client, ClientChannel } from 'ssh2'
import { actor, event, setup, UserError } from 'rivetkit'
import { createSSHClient } from '@/lib/ssh'
import {
  buildAttachServerSessionCommand,
  buildInteractiveLoginShellCommand,
} from '@/lib/server-terminal'
import {
  formatTerminalError,
  normalizeTerminalSize,
  type TerminalActorState,
} from '@/lib/terminal-rivet'

interface TerminalConnParams {
  cols?: number
  rows?: number
}

interface TerminalConnState {
  cols: number
  rows: number
}

interface TerminalVars {
  client: Client | null
  stream: ClientChannel | null
  stdoutDecoder: StringDecoder | null
  stderrDecoder: StringDecoder | null
  connecting: Promise<void> | null
}

const terminalDataEvent = event<{ data: string }>()
const terminalEvents = {
  data: terminalDataEvent,
}

function getTerminalCommand(state: TerminalActorState): string {
  if (state.target.kind === 'root') {
    return buildInteractiveLoginShellCommand()
  }

  return buildAttachServerSessionCommand(state.target.serverId)
}

function detachTerminalBridge(vars: TerminalVars) {
  const current = {
    client: vars.client,
    stream: vars.stream,
    stdoutDecoder: vars.stdoutDecoder,
    stderrDecoder: vars.stderrDecoder,
  }

  vars.client = null
  vars.stream = null
  vars.stdoutDecoder = null
  vars.stderrDecoder = null

  return current
}

function flushTerminalDecoder(
  decoder: StringDecoder | null,
  send: (data: string) => void
) {
  if (!decoder) return
  const pending = decoder.end()
  if (pending) send(pending)
}

function closeTerminalBridge(vars: TerminalVars) {
  const current = detachTerminalBridge(vars)
  try { current.stream?.end() } catch {}
  try { current.client?.end() } catch {}
}

function sendTerminalData(
  context: { broadcast: (name: 'data', payload: { data: string }) => void },
  data: string
) {
  if (!data) return
  context.broadcast('data', { data })
}

function applyTerminalSize(stream: ClientChannel | null, cols: number, rows: number) {
  if (!stream || typeof stream.setWindow !== 'function') return
  stream.setWindow(rows, cols, 0, 0)
}

function pickTerminalSize(
  conns: Map<string, { state: TerminalConnState }>
): TerminalConnState {
  for (const conn of conns.values()) {
    return normalizeTerminalSize(conn.state)
  }

  return normalizeTerminalSize()
}

async function ensureTerminalBridge(
  context: {
    state: TerminalActorState
    vars: TerminalVars
    conns: Map<string, { state: TerminalConnState }>
    broadcast: (name: 'data', payload: { data: string }) => void
  },
  cols: number,
  rows: number
) {
  const size = normalizeTerminalSize({ cols, rows })

  if (context.vars.stream) {
    applyTerminalSize(context.vars.stream, size.cols, size.rows)
    return
  }

  if (!context.vars.connecting) {
    context.vars.connecting = (async () => {
      closeTerminalBridge(context.vars)

      if (!context.state.session.host || !context.state.session.username || !context.state.session.password) {
        throw new UserError('Terminal session is missing SSH credentials')
      }

      const client = await createSSHClient(
        context.state.session.host,
        context.state.session.username,
        context.state.session.password
      )

      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        client.exec(
          getTerminalCommand(context.state),
          {
            pty: {
              term: 'xterm-256color',
              cols: size.cols,
              rows: size.rows,
            },
          },
          (error, nextStream) => {
            if (error) {
              reject(error)
              return
            }

            resolve(nextStream)
          }
        )
      })

      context.vars.client = client
      context.vars.stream = stream
      context.vars.stdoutDecoder = new StringDecoder('utf8')
      context.vars.stderrDecoder = new StringDecoder('utf8')

      stream.on('data', (chunk: Buffer) => {
        sendTerminalData(context, context.vars.stdoutDecoder?.write(chunk) ?? chunk.toString())
      })

      stream.stderr?.on('data', (chunk: Buffer) => {
        sendTerminalData(context, context.vars.stderrDecoder?.write(chunk) ?? chunk.toString())
      })

      stream.once('close', () => {
        const current = detachTerminalBridge(context.vars)
        flushTerminalDecoder(current.stdoutDecoder, (data) => sendTerminalData(context, data))
        flushTerminalDecoder(current.stderrDecoder, (data) => sendTerminalData(context, data))
        try { current.client?.end() } catch {}
      })

      stream.once('error', (error: Error) => {
        sendTerminalData(context, formatTerminalError(error.message))
        closeTerminalBridge(context.vars)
      })

      client.once('close', () => {
        closeTerminalBridge(context.vars)
      })

      client.once('error', (error: Error) => {
        sendTerminalData(context, formatTerminalError(error.message))
        closeTerminalBridge(context.vars)
      })
    })()
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Terminal connection failed'
        sendTerminalData(context, formatTerminalError(message))
        closeTerminalBridge(context.vars)
        throw error
      })
      .finally(() => {
        context.vars.connecting = null
      })
  }

  await context.vars.connecting

  if (context.vars.stream) {
    applyTerminalSize(context.vars.stream, size.cols, size.rows)
  }
}

export const terminal = actor<
  TerminalActorState,
  TerminalConnParams | undefined,
  TerminalConnState,
  TerminalVars,
  TerminalActorState | undefined,
  undefined,
  typeof terminalEvents
>({
  createState: (_context, input: TerminalActorState | undefined) => {
    if (!input?.session || !input.target) {
      throw new UserError('Terminal actor requires a bootstrap payload')
    }

    return input
  },
  createConnState: (_context, params: TerminalConnParams | undefined): TerminalConnState =>
    normalizeTerminalSize(params),
  createVars: (): TerminalVars => ({
    client: null,
    stream: null,
    stdoutDecoder: null,
    stderrDecoder: null,
    connecting: null,
  }),
  events: terminalEvents,
  onConnect: async (context) => {
    await ensureTerminalBridge(context, context.conn.state.cols, context.conn.state.rows)
  },
  onDisconnect: async (context) => {
    if (context.conns.size === 0) {
      closeTerminalBridge(context.vars)
    }
  },
  onWake: async (context) => {
    if (context.conns.size === 0) return
    const size = pickTerminalSize(context.conns)
    await ensureTerminalBridge(context, size.cols, size.rows)
  },
  onSleep: async (context) => {
    closeTerminalBridge(context.vars)
  },
  onDestroy: async (context) => {
    closeTerminalBridge(context.vars)
  },
  actions: {
    input: async (context, data: string) => {
      if (typeof data !== 'string' || data.length === 0) return
      await ensureTerminalBridge(context, context.conn.state.cols, context.conn.state.rows)
      context.vars.stream?.write(data)
    },
    binary: async (context, data: string) => {
      if (typeof data !== 'string' || data.length === 0) return
      await ensureTerminalBridge(context, context.conn.state.cols, context.conn.state.rows)
      context.vars.stream?.write(Buffer.from(data, 'base64'))
    },
    resize: async (context, cols: number, rows: number) => {
      const nextSize = normalizeTerminalSize({ cols, rows })
      context.conn.state = nextSize
      await ensureTerminalBridge(context, nextSize.cols, nextSize.rows)
      applyTerminalSize(context.vars.stream, nextSize.cols, nextSize.rows)
    },
  },
})

export const registry = setup({
  use: { terminal },
})
