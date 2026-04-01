import { Client } from 'ssh2'
import { getServerRuntimeInfo, type ServerRuntimeStatus } from './server-terminal'
import { SERVERS_DIR } from './server-config'
import { execCommand } from './ssh'

export { SERVERS_DIR } from './server-config'

export interface Server {
  id: string
  name: string
  path: string
  status: ServerRuntimeStatus
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
      `echo "$name"; ` +
    `done`
  )

  const names = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const servers = await Promise.all(
    names.map(async (name) => {
      try {
        const { status } = await getServerRuntimeInfo(client, name)
        return {
          id: name,
          name,
          path: `${SERVERS_DIR}/${name}`,
          status,
        }
      } catch {
        return {
          id: name,
          name,
          path: `${SERVERS_DIR}/${name}`,
          status: 'stopped' as const,
        }
      }
    })
  )

  return servers
}

export async function getServerStatus(
  client: Client,
  name: string
): Promise<ServerRuntimeStatus> {
  const { status } = await getServerRuntimeInfo(client, name)
  return status
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
