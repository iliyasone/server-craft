import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { getStartCommand } from '@/lib/servers'
import { getOrCreateTerminalSession, writeToTerminal } from '@/lib/terminal-sessions'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const cmd = await getStartCommand(client, id)

    // Ensure terminal session is open and send the start command through it
    await getOrCreateTerminalSession(id, client)
    writeToTerminal(id, cmd + '\r')

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
