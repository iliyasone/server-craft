import { Client } from 'ssh2'
import { execCommand } from './ssh'

export const SERVERS_DIR = '/home/server-craft'

export interface Server {
  id: string
  name: string
  path: string
  status: 'running' | 'stopped'
}

export async function listServers(client: Client): Promise<Server[]> {
  // Single SSH command: list dirs and check status for each
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
  // Single SSH command checks tmux availability, session, and pane command
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

export async function getStartCommand(client: Client, name: string): Promise<string> {
  const { stdout: startSh } = await execCommand(
    client,
    `test -f ${SERVERS_DIR}/${name}/start.sh && echo exists || echo missing`
  )

  if (startSh.trim() === 'exists') {
    return `bash ${SERVERS_DIR}/${name}/start.sh`
  }

  const { stdout: jarList } = await execCommand(
    client,
    `ls ${SERVERS_DIR}/${name}/*.jar 2>/dev/null | head -1`
  )
  const jar = jarList.trim()
  if (jar) {
    return `cd ${SERVERS_DIR}/${name} && java -Xmx2G -jar "${jar}" nogui`
  }

  return `echo "No start.sh or jar found in ${SERVERS_DIR}/${name}"`
}

export async function createServer(client: Client, name: string): Promise<void> {
  await execCommand(client, `mkdir -p ${SERVERS_DIR}/${name}`)

  await execCommand(
    client,
    `echo "eula=true" > ${SERVERS_DIR}/${name}/eula.txt`
  )

  const startScript = `#!/bin/bash
cd ${SERVERS_DIR}/${name}
JAR=$(ls *.jar 2>/dev/null | head -1)
if [ -z "$JAR" ]; then
  echo "No jar file found in ${SERVERS_DIR}/${name}"
  exit 1
fi
java -Xmx2G -Xms1G -jar "$JAR" nogui`

  await execCommand(
    client,
    `cat > ${SERVERS_DIR}/${name}/start.sh << 'STARTSCRIPT'\n${startScript}\nSTARTSCRIPT`
  )
  await execCommand(client, `chmod +x ${SERVERS_DIR}/${name}/start.sh`)
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
