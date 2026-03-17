import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import {
  getOrCreateTerminalSession,
  subscribeToTerminal,
  getTerminalBuffer,
} from '@/lib/terminal-sessions'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params

  const client = await getSSHClient(session.host, session.username, session.password)

  // Ensure session exists
  await getOrCreateTerminalSession(id, client)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send buffered history first
      const buffer = getTerminalBuffer(id)
      if (buffer.length > 0) {
        const historyData = buffer.join('')
        const msg = `data: ${JSON.stringify({ type: 'history', data: historyData })}\n\n`
        controller.enqueue(encoder.encode(msg))
      }

      // Subscribe to new data
      const unsubscribe = subscribeToTerminal(id, (data: string) => {
        try {
          const msg = `data: ${JSON.stringify({ type: 'data', data })}\n\n`
          controller.enqueue(encoder.encode(msg))
        } catch {
          // Stream closed
        }
      })

      // Keep alive ping
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          clearInterval(keepAlive)
          unsubscribe()
        }
      }, 15000)

      // Store cleanup in the controller
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
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
