import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { resizeTerminal } from '@/lib/terminal-sessions'

const ROOT_SESSION_ID = '__root__'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cols, rows } = await request.json()

  if (typeof cols === 'number' && typeof rows === 'number' && cols > 0 && rows > 0) {
    resizeTerminal(ROOT_SESSION_ID, cols, rows)
  }

  return NextResponse.json({ ok: true })
}
