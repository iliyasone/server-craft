import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import {
  getOrCreateTerminalSession,
  subscribeToTerminal,
  getTerminalBuffer,
} from '@/lib/terminal-sessions'

const ROOT_SESSION_ID = '__root__'

export async function GET(_request: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const client = await getSSHClient(session.host, session.username, session.password)
  await getOrCreateTerminalSession(ROOT_SESSION_ID, client, { rootShell: true })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const buffer = getTerminalBuffer(ROOT_SESSION_ID)
      if (buffer.length > 0) {
        const msg = `data: ${JSON.stringify({ type: 'history', data: buffer.join('') })}\n\n`
        controller.enqueue(encoder.encode(msg))
      }

      const unsubscribe = subscribeToTerminal(ROOT_SESSION_ID, (data: string) => {
        try {
          const msg = `data: ${JSON.stringify({ type: 'data', data })}\n\n`
          controller.enqueue(encoder.encode(msg))
        } catch {}
      })

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          clearInterval(keepAlive)
          unsubscribe()
        }
      }, 15000)

      ;(controller as unknown as { _cleanup: () => void })._cleanup = () => {
        clearInterval(keepAlive)
        unsubscribe()
      }
    },
    cancel(controller) {
      const ctrl = controller as unknown as { _cleanup?: () => void }
      if (ctrl._cleanup) ctrl._cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
