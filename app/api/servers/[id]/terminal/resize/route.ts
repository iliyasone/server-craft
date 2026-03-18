import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { resizeTerminal } from '@/lib/terminal-sessions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { cols, rows } = await request.json()

  if (typeof cols === 'number' && typeof rows === 'number' && cols > 0 && rows > 0) {
    resizeTerminal(id, cols, rows)
  }

  return NextResponse.json({ ok: true })
}
