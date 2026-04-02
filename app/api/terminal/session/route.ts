import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(
    {
      actorKey: crypto.randomUUID(),
      session,
      target: { kind: 'root' as const },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
