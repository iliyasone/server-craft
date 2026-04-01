import http from 'node:http'
import { parse as parseUrl } from 'node:url'
import { StringDecoder } from 'node:string_decoder'
import type { Duplex } from 'node:stream'
import next from 'next'
import type { ClientChannel } from 'ssh2'
import { WebSocket, WebSocketServer } from 'ws'
import type { RawData } from 'ws'
import { createSSHClient } from './lib/ssh'
import {
  buildAttachServerSessionCommand,
  buildInteractiveLoginShellCommand,
} from './lib/server-terminal'
import { getSessionFromCookieHeader, type SessionData } from './lib/session-core'

type TerminalTarget =
  | { kind: 'root' }
  | { kind: 'server'; serverId: string }

type TerminalMessage =
  | { type: 'input'; data: string }
  | { type: 'binary'; data: string }
  | { type: 'resize'; cols: number; rows: number }

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const terminalSocketServer = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
})

function clampDimension(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseTerminalTarget(pathname: string | null): TerminalTarget | null {
  if (pathname === '/api/terminal/ws') {
    return { kind: 'root' }
  }

  const match = pathname?.match(/^\/api\/servers\/([^/]+)\/terminal\/ws$/)
  if (!match) return null

  return {
    kind: 'server',
    serverId: decodeURIComponent(match[1]),
  }
}

function writeUpgradeError(
  socket: Duplex,
  statusCode: number,
  message: string
): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    `Content-Length: ${Buffer.byteLength(message)}\r\n` +
    '\r\n' +
    message
  )
  socket.destroy()
}

function readWebSocketData(raw: RawData): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return Buffer.concat(raw).toString()
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString()
  return Buffer.from(raw).toString()
}

function sendTerminalData(ws: WebSocket, data: string): void {
  if (!data || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'data', data }))
}

function formatTerminalError(message: string): string {
  return `\r\n\x1b[31m[${message}]\x1b[0m\r\n`
}

async function bridgeTerminalSocket(
  ws: WebSocket,
  target: TerminalTarget,
  session: SessionData,
  cols: number,
  rows: number
): Promise<void> {
  let closed = false
  let client: Awaited<ReturnType<typeof createSSHClient>> | null = null
  let stream: ClientChannel | null = null
  const queuedMessages: TerminalMessage[] = []
  const stdoutDecoder = new StringDecoder('utf8')
  const stderrDecoder = new StringDecoder('utf8')

  const flushDecoder = (decoder: StringDecoder) => {
    const pending = decoder.end()
    if (pending) {
      sendTerminalData(ws, pending)
    }
  }

  const cleanup = (closeSocket = true) => {
    if (closed) return
    closed = true

    flushDecoder(stdoutDecoder)
    flushDecoder(stderrDecoder)

    try { stream?.end() } catch {}
    try { client?.end() } catch {}

    if (closeSocket && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close() } catch {}
    }
  }

  const applyMessage = (message: TerminalMessage) => {
    if (!stream || closed) return

    if (message.type === 'input') {
      stream.write(message.data)
      return
    }

    if (message.type === 'binary') {
      stream.write(Buffer.from(message.data, 'base64'))
      return
    }

    if (typeof stream.setWindow === 'function') {
      stream.setWindow(message.rows, message.cols, 0, 0)
    }
  }

  ws.on('message', (raw: RawData) => {
    if (closed) return

    let parsed: unknown
    try {
      parsed = JSON.parse(readWebSocketData(raw))
    } catch {
      return
    }

    const message = parsed as Partial<TerminalMessage>
    if (message.type === 'input' && typeof message.data === 'string') {
      const payload: TerminalMessage = { type: 'input', data: message.data }
      if (stream) applyMessage(payload)
      else queuedMessages.push(payload)
      return
    }

    if (message.type === 'binary' && typeof message.data === 'string') {
      const payload: TerminalMessage = { type: 'binary', data: message.data }
      if (stream) applyMessage(payload)
      else queuedMessages.push(payload)
      return
    }

    if (message.type === 'resize' && typeof message.cols === 'number' && typeof message.rows === 'number') {
      const payload: TerminalMessage = {
        type: 'resize',
        cols: clampDimension(String(message.cols), cols, 40, 400),
        rows: clampDimension(String(message.rows), rows, 10, 200),
      }
      if (stream) applyMessage(payload)
      else queuedMessages.push(payload)
    }
  })

  ws.once('close', () => cleanup(false))
  ws.once('error', () => cleanup(false))

  try {
    client = await createSSHClient(session.host, session.username, session.password)

    const command = target.kind === 'root'
      ? buildInteractiveLoginShellCommand()
      : buildAttachServerSessionCommand(target.serverId)

    stream = await new Promise<ClientChannel>((resolve, reject) => {
      client!.exec(
        command,
        {
          pty: {
            term: 'xterm-256color',
            cols,
            rows,
          },
        },
        (err, nextStream) => {
          if (err) {
            reject(err)
            return
          }

          nextStream.on('data', (chunk: Buffer) => {
            sendTerminalData(ws, stdoutDecoder.write(chunk))
          })

          nextStream.stderr?.on('data', (chunk: Buffer) => {
            sendTerminalData(ws, stderrDecoder.write(chunk))
          })

          nextStream.once('close', () => cleanup())
          nextStream.once('error', (streamErr: Error) => {
            sendTerminalData(ws, formatTerminalError(streamErr.message))
            cleanup()
          })

          resolve(nextStream)
        }
      )
    })

    for (const queued of queuedMessages.splice(0)) {
      applyMessage(queued)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terminal connection failed'
    sendTerminalData(ws, formatTerminalError(message))
    cleanup()
  }
}

async function main(): Promise<void> {
  const app = next({ dev, hostname, port })
  await app.prepare()
  const handle = app.getRequestHandler()
  const handleUpgrade = app.getUpgradeHandler()

  const server = http.createServer((req, res) => {
    const parsedUrl = parseUrl(req.url ?? '', true)
    void handle(req, res, parsedUrl)
  })

  server.on('upgrade', async (req, socket, head) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const target = parseTerminalTarget(requestUrl.pathname)

    if (!target) {
      try {
        await handleUpgrade(req, socket, head)
      } catch {
        socket.destroy()
      }
      return
    }

    const session = await getSessionFromCookieHeader(req.headers.cookie)
    if (!session) {
      writeUpgradeError(socket, 401, 'Unauthorized')
      return
    }

    const cols = clampDimension(requestUrl.searchParams.get('cols'), 80, 40, 400)
    const rows = clampDimension(requestUrl.searchParams.get('rows'), 24, 10, 200)

    terminalSocketServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      void bridgeTerminalSocket(ws, target, session, cols, rows)
    })
  })

  server.listen(port, hostname, () => {
    const protocol = 'http'
    console.log(`> Ready on ${protocol}://${hostname}:${port}`)
  })
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
