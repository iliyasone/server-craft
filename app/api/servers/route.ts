import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient } from '@/lib/ssh'
import { listServers, createServer } from '@/lib/servers'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const servers = await listServers(client)
    return NextResponse.json({ servers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list servers'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { name } = await request.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }

    // Sanitize name
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '').trim()
    if (!sanitized) {
      return NextResponse.json({ error: 'Invalid server name' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    await createServer(client, sanitized)

    return NextResponse.json({ id: sanitized })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create server'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
