import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { getInstallCommand } from '@/lib/servers'
import { sendServerTerminalInput } from '@/lib/server-terminal'

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

    await sendServerTerminalInput(client, id, '\x15' + cmd + '\r')

    return NextResponse.json({ ok: true, command: cmd })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to install server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
