import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { writeToTerminal } from '@/lib/terminal-sessions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const { data } = await request.json()
    if (typeof data !== 'string') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const ok = writeToTerminal(id, data)
    if (!ok) {
      return NextResponse.json({ error: 'Terminal session not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write to terminal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
