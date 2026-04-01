import { Client } from 'ssh2'
import { SERVERS_DIR } from './servers'
import { execCommand } from './ssh'

export type ServerRuntimeStatus = 'running' | 'starting' | 'stopped'

interface TerminalKeyToken {
  kind: 'literal' | 'key'
  value: string
}

const READY_MARKERS = ['Done (', 'For help, type "help"']
const SHELL_COMMANDS = new Set(['', 'bash', 'sh', 'zsh', 'fish', 'dash', 'tmux'])
const ESCAPE_SEQUENCES: Array<[string, string]> = [
  ['\x1b[1;5A', 'C-Up'],
  ['\x1b[1;5B', 'C-Down'],
  ['\x1b[1;5C', 'C-Right'],
  ['\x1b[1;5D', 'C-Left'],
  ['\x1b[3~', 'DC'],
  ['\x1b[5~', 'PageUp'],
  ['\x1b[6~', 'PageDown'],
  ['\x1b[H', 'Home'],
  ['\x1b[F', 'End'],
  ['\x1bOH', 'Home'],
  ['\x1bOF', 'End'],
  ['\x1b[A', 'Up'],
  ['\x1b[B', 'Down'],
  ['\x1b[C', 'Right'],
  ['\x1b[D', 'Left'],
]

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function getServerSessionName(serverId: string): string {
  return `craft-${serverId}`
}

export function buildInteractiveLoginShellCommand(): string {
  return (
    `if [ -x /bin/bash ]; then ` +
      `exec /bin/bash -il; ` +
    `elif [ -n "$SHELL" ] && [ -x "$SHELL" ]; then ` +
      `exec "$SHELL" -il; ` +
    `else ` +
      `exec sh -i; ` +
    `fi`
  )
}

function getServerDir(serverId: string): string {
  return `${SERVERS_DIR}/${serverId}`
}

export function buildEnsureServerSessionCommand(serverId: string): string {
  const sessionName = getServerSessionName(serverId)
  const serverDir = getServerDir(serverId)

  return (
    `if ! command -v tmux >/dev/null 2>&1; then ` +
      `echo "tmux is not installed on the remote host" >&2; exit 127; ` +
    `fi; ` +
    `mkdir -p ${shellQuote(serverDir)} 2>/dev/null; ` +
    `tmux has-session -t ${shellQuote(sessionName)} 2>/dev/null || ` +
      `if [ -x /bin/bash ]; then ` +
        `tmux new-session -d -s ${shellQuote(sessionName)} -c ${shellQuote(serverDir)} /bin/bash -il; ` +
      `else ` +
        `tmux new-session -d -s ${shellQuote(sessionName)} -c ${shellQuote(serverDir)}; ` +
      `fi; ` +
    `tmux set-option -t ${shellQuote(sessionName)} history-limit 50000 >/dev/null 2>&1 || true`
  )
}

export function buildAttachServerSessionCommand(serverId: string): string {
  const sessionName = getServerSessionName(serverId)
  return `${buildEnsureServerSessionCommand(serverId)}; exec tmux attach-session -t ${shellQuote(sessionName)}`
}

export async function ensureServerSession(client: Client, serverId: string): Promise<void> {
  const { stderr, code } = await execCommand(client, buildEnsureServerSessionCommand(serverId))
  if (code !== 0) {
    throw new Error(stderr.trim() || 'Failed to prepare remote tmux session')
  }
}

export async function hasServerSession(client: Client, serverId: string): Promise<boolean> {
  const { code } = await execCommand(
    client,
    `command -v tmux >/dev/null 2>&1 && tmux has-session -t ${shellQuote(getServerSessionName(serverId))} 2>/dev/null`
  )
  return code === 0
}

function tokenizeTerminalInput(data: string): TerminalKeyToken[] {
  const tokens: TerminalKeyToken[] = []
  let literal = ''

  function flushLiteral() {
    if (!literal) return
    tokens.push({ kind: 'literal', value: literal })
    literal = ''
  }

  for (let index = 0; index < data.length;) {
    const sequence = ESCAPE_SEQUENCES.find(([value]) => data.startsWith(value, index))
    if (sequence) {
      flushLiteral()
      tokens.push({ kind: 'key', value: sequence[1] })
      index += sequence[0].length
      continue
    }

    const codePoint = data.codePointAt(index)
    if (codePoint === undefined) break

    const char = String.fromCodePoint(codePoint)
    const charLength = codePoint > 0xffff ? 2 : 1

    if (char === '\r') {
      flushLiteral()
      tokens.push({ kind: 'key', value: 'C-m' })
    } else if (char === '\n') {
      flushLiteral()
      tokens.push({ kind: 'key', value: 'C-j' })
    } else if (char === '\t') {
      flushLiteral()
      tokens.push({ kind: 'key', value: 'Tab' })
    } else if (char === '\b' || char === '\x7f') {
      flushLiteral()
      tokens.push({ kind: 'key', value: 'BSpace' })
    } else if (char === '\x1b') {
      flushLiteral()
      tokens.push({ kind: 'key', value: 'Escape' })
    } else if (codePoint >= 1 && codePoint <= 26) {
      flushLiteral()
      const letter = String.fromCharCode(96 + codePoint)
      tokens.push({ kind: 'key', value: `C-${letter}` })
    } else if (codePoint < 32 || codePoint === 127) {
      flushLiteral()
    } else {
      literal += char
    }

    index += charLength
  }

  flushLiteral()
  return tokens
}

export function buildTmuxSendKeysCommand(serverId: string, data: string): string {
  const sessionName = shellQuote(getServerSessionName(serverId))
  const tokens = tokenizeTerminalInput(data)
  if (tokens.length === 0) return 'true'

  return tokens
    .map((token) => {
      if (token.kind === 'literal') {
        return `tmux send-keys -t ${sessionName} -l -- ${shellQuote(token.value)}`
      }
      return `tmux send-keys -t ${sessionName} ${token.value}`
    })
    .join('; ')
}

export async function sendServerTerminalInput(
  client: Client,
  serverId: string,
  data: string,
  options?: { ensureSession?: boolean }
): Promise<void> {
  if (!data) return

  if (options?.ensureSession !== false) {
    await ensureServerSession(client, serverId)
  }

  const command = buildTmuxSendKeysCommand(serverId, data)
  if (command === 'true') return

  const { stderr, code } = await execCommand(client, command)
  if (code !== 0) {
    throw new Error(stderr.trim() || 'Failed to send input to remote terminal')
  }
}

export function parseServerRuntimeStatus(
  paneCommand: string,
  paneOutput: string
): ServerRuntimeStatus {
  const currentCommand = paneCommand.trim()
  if (SHELL_COMMANDS.has(currentCommand)) {
    return 'stopped'
  }

  if (READY_MARKERS.some((marker) => paneOutput.includes(marker))) {
    return 'running'
  }

  return 'starting'
}

export function formatServerUptime(createdAtEpochSeconds: string): string | null {
  const createdAt = Number.parseInt(createdAtEpochSeconds.trim(), 10)
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null

  const now = Math.floor(Date.now() / 1000)
  const elapsed = Math.max(0, now - createdAt)

  if (elapsed < 60) return `${elapsed}s`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
}

export async function getServerRuntimeInfo(
  client: Client,
  serverId: string
): Promise<{ status: ServerRuntimeStatus; uptime: string | null }> {
  const sessionName = getServerSessionName(serverId)
  const { stdout, stderr, code } = await execCommand(
    client,
    `if command -v tmux >/dev/null 2>&1 && tmux has-session -t ${shellQuote(sessionName)} 2>/dev/null; then ` +
      `cmd=$(tmux list-panes -t ${shellQuote(sessionName)} -F '#{pane_current_command}' 2>/dev/null | head -n 1); ` +
      `created=$(tmux display-message -t ${shellQuote(sessionName)} -p '#{session_created}' 2>/dev/null); ` +
      `pane=$(tmux capture-pane -p -S -200 -t ${shellQuote(sessionName)} 2>/dev/null || true); ` +
      `printf '%s\\0%s\\0%s' "$cmd" "$created" "$pane"; ` +
    `else ` +
      `printf '\\0\\0'; ` +
    `fi`
  )

  if (code !== 0) {
    throw new Error(stderr.trim() || 'Failed to inspect remote tmux session')
  }

  const [paneCommand = '', createdAt = '', paneOutput = ''] = stdout.split('\0')
  return {
    status: parseServerRuntimeStatus(paneCommand, paneOutput),
    uptime: formatServerUptime(createdAt),
  }
}
