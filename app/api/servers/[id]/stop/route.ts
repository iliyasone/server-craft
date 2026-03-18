import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { hasServerSession, sendServerTerminalInput } from '@/lib/server-terminal'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    if (await hasServerSession(client, id)) {
      await sendServerTerminalInput(client, id, '\x03', { ensureSession: false })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to stop server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
