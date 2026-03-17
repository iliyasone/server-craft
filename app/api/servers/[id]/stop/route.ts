import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { writeToTerminal } from '@/lib/terminal-sessions'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    await getSSHClient(session.host, session.username, session.password)

    // Send Ctrl+C to the terminal (kills whatever is running in tmux)
    writeToTerminal(id, '\x03')

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to stop server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
