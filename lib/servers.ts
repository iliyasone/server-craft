import { Client } from 'ssh2'
import { execCommand } from './ssh'

export const SERVERS_DIR = '/home/server-craft'

export interface Server {
  id: string
  name: string
  path: string
  status: 'running' | 'stopped'
}

export interface ServerInfo {
  type: 'forge' | 'vanilla' | 'unknown'
  jar: string | null
  hasRunSh: boolean
  needsInstall: boolean
  installCommand: string | null
  startCommand: string
}

export async function listServers(client: Client): Promise<Server[]> {
  const { stdout } = await execCommand(client,
    `mkdir -p ${SERVERS_DIR} 2>/dev/null; ` +
    `for dir in ${SERVERS_DIR}/*/; do ` +
      `[ -d "$dir" ] || continue; ` +
      `name=$(basename "$dir"); ` +
      `status="stopped"; ` +
      `if command -v tmux >/dev/null 2>&1; then ` +
        `if tmux has-session -t "craft-$name" 2>/dev/null; then ` +
          `cmd=$(tmux list-panes -t "craft-$name" -F "#{pane_current_command}" 2>/dev/null); ` +
          `case "$cmd" in bash|sh|zsh|fish|dash|tmux|"") ;; *) status="running" ;; esac; ` +
        `fi; ` +
      `else ` +
        `pgrep -f "java.*${SERVERS_DIR}/$name" >/dev/null 2>&1 && status="running"; ` +
      `fi; ` +
      `echo "$name:$status"; ` +
    `done`
  )

  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes(':'))
    .map((line) => {
      const [name, status] = line.split(':')
      return {
        id: name,
        name,
        path: `${SERVERS_DIR}/${name}`,
        status: (status === 'running' ? 'running' : 'stopped') as 'running' | 'stopped',
      }
    })
}

export async function getServerStatus(
  client: Client,
  name: string
): Promise<'running' | 'stopped'> {
  const { stdout } = await execCommand(client,
    `if command -v tmux >/dev/null 2>&1; then ` +
      `if tmux has-session -t craft-${name} 2>/dev/null; then ` +
        `cmd=$(tmux list-panes -t craft-${name} -F "#{pane_current_command}" 2>/dev/null); ` +
        `case "$cmd" in bash|sh|zsh|fish|dash|tmux|"") echo stopped ;; *) echo running ;; esac; ` +
      `else echo stopped; fi; ` +
    `else ` +
      `pgrep -f "java.*${SERVERS_DIR}/${name}" >/dev/null 2>&1 && echo running || echo stopped; ` +
    `fi`
  )
  return stdout.trim() === 'running' ? 'running' : 'stopped'
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function isForgeJar(jarName: string): boolean {
  return /forge/i.test(jarName)
}

export async function getServerInfo(client: Client, name: string): Promise<ServerInfo> {
  const serverDir = `${SERVERS_DIR}/${name}`
  const q = shellQuote(serverDir)

  // Single SSH call to get: run.sh existence, jar list
  const { stdout } = await execCommand(client,
    `echo "---RUN---"; test -f ${q}/run.sh && echo yes || echo no; ` +
    `echo "---JARS---"; ls ${q}/*.jar 2>/dev/null || true`
  )

  const runSection = stdout.split('---JARS---')[0] || ''
  const jarSection = stdout.split('---JARS---')[1] || ''

  const hasRunSh = runSection.includes('yes')
  const jars = jarSection.split('\n').map(l => l.trim()).filter(l => l.endsWith('.jar')).map(l => l.split('/').pop()!)

  // Detect server type from jar names
  const forgeJar = jars.find(j => isForgeJar(j))
  const anyJar = jars[0] || null
  const type: ServerInfo['type'] = forgeJar ? 'forge' : anyJar ? 'vanilla' : 'unknown'

  // Forge needs install if there's no run.sh yet
  const needsInstall = type === 'forge' && !hasRunSh

  let installCommand: string | null = null
  if (needsInstall && forgeJar) {
    installCommand = `cd ${q} && java -jar ${shellQuote(forgeJar)} --installServer`
  }

  // Start command: run.sh if exists, otherwise java -jar
  let startCommand: string
  if (hasRunSh) {
    startCommand = `cd ${q} && bash run.sh nogui`
  } else if (anyJar) {
    startCommand = `cd ${q} && java -Xmx2G -Xms1G -jar ${shellQuote(anyJar)} nogui`
  } else {
    startCommand = `echo "No jar files found in ${serverDir}"`
  }

  return {
    type,
    jar: forgeJar || anyJar,
    hasRunSh,
    needsInstall,
    installCommand,
    startCommand,
  }
}

export async function getStartCommand(client: Client, name: string): Promise<string> {
  const info = await getServerInfo(client, name)
  return info.startCommand
}

export async function getInstallCommand(client: Client, name: string): Promise<string | null> {
  const info = await getServerInfo(client, name)
  return info.installCommand
}

export async function createServer(client: Client, name: string): Promise<void> {
  await execCommand(client, `mkdir -p ${SERVERS_DIR}/${name}`)
  await execCommand(client, `echo "eula=true" > ${SERVERS_DIR}/${name}/eula.txt`)
}

export async function getServerUptime(client: Client, name: string): Promise<string | null> {
  const { stdout, code } = await execCommand(
    client,
    `tmux display-message -t craft-${name} -p "#{session_created}" 2>/dev/null`
  )

  if (code !== 0 || !stdout.trim()) return null

  const created = parseInt(stdout.trim(), 10)
  if (isNaN(created)) return null

  const uptimeMs = Date.now() - created * 1000
  const uptimeSec = Math.floor(uptimeMs / 1000)

  if (uptimeSec < 60) return `${uptimeSec}s`
  const uptimeMin = Math.floor(uptimeSec / 60)
  if (uptimeMin < 60) return `${uptimeMin}m ${uptimeSec % 60}s`
  const uptimeHr = Math.floor(uptimeMin / 60)
  return `${uptimeHr}h ${uptimeMin % 60}m`
}
