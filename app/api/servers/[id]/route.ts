import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, execCommand } from '@/lib/ssh'
import { getServerRuntimeInfo, shellQuote } from '@/lib/server-terminal'
import { SERVERS_DIR } from '@/lib/servers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const { status, uptime } = await getServerRuntimeInfo(client, id)

    return NextResponse.json(
      {
        id,
        name: id,
        path: `/servers/${id}`,
        status,
        uptime,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Sanitize: only allow valid server names
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid server name' }, { status: 400 })
  }

  try {
    const client = await getSSHClient(session.host, session.username, session.password)

    // Kill tmux session if running
    await execCommand(client, `tmux kill-session -t craft-${shellQuote(id)} 2>/dev/null || true`)

    // Remove server directory
    const serverPath = `${SERVERS_DIR}/${id}`
    await execCommand(client, `rm -rf -- ${shellQuote(serverPath)}`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
