import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { getServerStatus, getServerUptime } from '@/lib/servers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const status = await getServerStatus(client, id)
    const uptime = await getServerUptime(client, id)

    return NextResponse.json({
      id,
      name: id,
      path: `/servers/${id}`,
      status,
      uptime,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
