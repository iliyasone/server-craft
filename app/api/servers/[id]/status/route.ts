import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, execCommand } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const client = await getSSHClient(session.host, session.username, session.password)

    // Single SSH command: get status + uptime
    const { stdout } = await execCommand(client,
      `status="stopped"; uptime=""; ` +
      `if command -v tmux >/dev/null 2>&1; then ` +
        `if tmux has-session -t craft-${id} 2>/dev/null; then ` +
          `cmd=$(tmux list-panes -t craft-${id} -F "#{pane_current_command}" 2>/dev/null); ` +
          `case "$cmd" in bash|sh|zsh|fish|dash|tmux|"") ;; *) status="running" ;; esac; ` +
          `created=$(tmux display-message -t craft-${id} -p "#{session_created}" 2>/dev/null); ` +
          `if [ -n "$created" ]; then ` +
            `now=$(date +%s); elapsed=$((now - created)); ` +
            `if [ $elapsed -lt 60 ]; then uptime="${'${elapsed}'}s"; ` +
            `elif [ $elapsed -lt 3600 ]; then uptime="$((elapsed/60))m $((elapsed%60))s"; ` +
            `else uptime="$((elapsed/3600))h $(((elapsed%3600)/60))m"; fi; ` +
          `fi; ` +
        `fi; ` +
      `else ` +
        `pgrep -f "java.*${SERVERS_DIR}/${id}" >/dev/null 2>&1 && status="running"; ` +
      `fi; ` +
      `echo "$status|$uptime"`
    )

    const [status, uptime] = stdout.trim().split('|')
    return NextResponse.json({
      status: status === 'running' ? 'running' : 'stopped',
      uptime: uptime || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
