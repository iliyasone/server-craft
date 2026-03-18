import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { createSSHClient } from '@/lib/ssh'
import { buildAttachServerSessionCommand } from '@/lib/server-terminal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const cols = clampDimension(request.nextUrl.searchParams.get('cols'), 80, 40, 400)
  const rows = clampDimension(request.nextUrl.searchParams.get('rows'), 24, 10, 200)

  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      let keepAlive: ReturnType<typeof setInterval> | null = null
      let client: Awaited<ReturnType<typeof createSSHClient>> | null = null
      let terminalStream: NodeJS.ReadWriteStream | null = null

      const pushData = (data: string) => {
        try {
          const msg = `data: ${JSON.stringify({ type: 'data', data })}\n\n`
          controller.enqueue(encoder.encode(msg))
        } catch {
          close()
        }
      }

      const close = () => {
        if (closed) return
        closed = true
        if (keepAlive) clearInterval(keepAlive)
        request.signal.removeEventListener('abort', close)
        try { (terminalStream as NodeJS.WritableStream | null)?.end() } catch {}
        try { client?.end() } catch {}
        try {
          controller.close()
        } catch {}
      }

      cleanup = close
      request.signal.addEventListener('abort', close)

      keepAlive = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          close()
        }
      }, 15000)

      try {
        client = await createSSHClient(session.host, session.username, session.password)
        if (closed) return

        await new Promise<void>((resolve, reject) => {
          client!.exec(
            buildAttachServerSessionCommand(id),
            {
              pty: {
                term: 'screen-256color',
                cols,
                rows,
              },
            },
            (err, attachedStream) => {
              if (err) {
                reject(err)
                return
              }

              terminalStream = attachedStream as unknown as NodeJS.ReadWriteStream

              attachedStream.on('data', (data: Buffer) => {
                pushData(data.toString())
              })

              attachedStream.stderr?.on('data', (data: Buffer) => {
                pushData(data.toString())
              })

              attachedStream.on('close', () => {
                close()
              })

              attachedStream.on('error', (streamErr: Error) => {
                reject(streamErr)
              })

              resolve()
            }
          )
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Terminal connection failed'
        pushData(`\r\n\x1b[31m[${message}]\x1b[0m\r\n`)
        close()
      }
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none',
      'X-Accel-Buffering': 'no',
    },
  })
}
