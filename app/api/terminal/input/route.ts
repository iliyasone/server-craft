import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { writeToTerminal } from '@/lib/terminal-sessions'

const ROOT_SESSION_ID = '__root__'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data } = await request.json()
    if (typeof data !== 'string') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    writeToTerminal(ROOT_SESSION_ID, data)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
