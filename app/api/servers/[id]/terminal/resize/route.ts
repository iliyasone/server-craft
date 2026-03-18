import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, execCommand } from '@/lib/ssh'
import { getServerSessionName, shellQuote } from '@/lib/server-terminal'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { cols, rows } = await request.json()

  if (typeof cols === 'number' && typeof rows === 'number' && cols > 0 && rows > 0) {
    const client = await getSSHClient(session.host, session.username, session.password)
    const sessionName = getServerSessionName(id)
    await execCommand(
      client,
      `if command -v tmux >/dev/null 2>&1 && tmux has-session -t ${shellQuote(sessionName)} 2>/dev/null; then ` +
        `tmux resize-window -t ${shellQuote(sessionName)} -x ${Math.floor(cols)} -y ${Math.floor(rows)} >/dev/null 2>&1 || true; ` +
      `fi`
    )
  }

  return NextResponse.json({ ok: true })
}
