import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { sendServerTerminalInput } from '@/lib/server-terminal'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const { data } = await request.json()
    if (typeof data !== 'string') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    await sendServerTerminalInput(client, id, data, { ensureSession: false })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write to terminal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
