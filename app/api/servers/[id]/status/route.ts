import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { getServerRuntimeInfo } from '@/lib/server-terminal'

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
    return NextResponse.json({
      status,
      uptime,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
