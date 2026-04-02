import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  return NextResponse.json(
    {
      actorKey: crypto.randomUUID(),
      session,
      target: { kind: 'server' as const, serverId: id },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
