import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getNotionStatus } from '@/lib/notion'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ip = request.nextUrl.searchParams.get('ip') || session.host

  try {
    const status = await getNotionStatus(ip)
    if (!status) {
      return NextResponse.json({ status: null })
    }

    return NextResponse.json({
      status: {
        ...status,
        shutdownAt: status.shutdownAt.toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get Notion status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
