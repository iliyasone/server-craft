import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createSSHClient, getSSHClient } from '@/lib/ssh'
import { getInstallCommand } from '@/lib/servers'
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
    const cmd = await getInstallCommand(client, id)

    if (!cmd) {
      return NextResponse.json({ error: 'No installation needed for this server' }, { status: 400 })
    }

    await getOrCreateTerminalSession(
      id,
      () => createSSHClient(session.host, session.username, session.password)
    )
    // Ctrl+U clears line, then send install command
    writeToTerminal(id, '\x15' + cmd + '\r')

    return NextResponse.json({ ok: true, command: cmd })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to install server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
