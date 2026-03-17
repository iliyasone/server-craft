import { Client } from 'ssh2'
import { execCommand } from './ssh'

const SERVERS_DIR = '/servers'

export interface Server {
  id: string
  name: string
  path: string
  status: 'running' | 'stopped'
}

export async function listServers(client: Client): Promise<Server[]> {
  await execCommand(client, `mkdir -p ${SERVERS_DIR}`)

  const { stdout } = await execCommand(
    client,
    `ls -la ${SERVERS_DIR} | grep "^d" | awk '{print $9}' | grep -v "^\\.\\.\\?$"`
  )

  const names = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== '.' && l !== '..')

  const servers: Server[] = []

  for (const name of names) {
    const status = await getServerStatus(client, name)
    servers.push({
      id: name,
      name,
      path: `${SERVERS_DIR}/${name}`,
      status,
    })
  }

  return servers
}

export async function getServerStatus(
  client: Client,
  name: string
): Promise<'running' | 'stopped'> {
  const { stdout } = await execCommand(
    client,
    `tmux has-session -t craft-${name} 2>/dev/null && echo running || echo stopped`
  )
  return stdout.trim() === 'running' ? 'running' : 'stopped'
}

export async function startServer(client: Client, name: string): Promise<void> {
  // Create session if not exists
  await execCommand(
    client,
    `tmux has-session -t craft-${name} 2>/dev/null || tmux new-session -d -s craft-${name} -c ${SERVERS_DIR}/${name}`
  )

  // Set up log capture
  await execCommand(
    client,
    `tmux pipe-pane -o -t craft-${name} 'cat >> /tmp/craft-${name}.log'`
  )

  // Run start script if it exists, otherwise try to find a jar
  const { stdout: startSh } = await execCommand(
    client,
    `test -f ${SERVERS_DIR}/${name}/start.sh && echo exists || echo missing`
  )

  if (startSh.trim() === 'exists') {
    await execCommand(
      client,
      `tmux send-keys -t craft-${name} 'bash ${SERVERS_DIR}/${name}/start.sh' Enter`
    )
  } else {
    // Try to find a jar
    const { stdout: jarList } = await execCommand(
      client,
      `ls ${SERVERS_DIR}/${name}/*.jar 2>/dev/null | head -1`
    )
    const jar = jarList.trim()
    if (jar) {
      await execCommand(
        client,
        `tmux send-keys -t craft-${name} 'cd ${SERVERS_DIR}/${name} && java -Xmx2G -jar ${jar} nogui' Enter`
      )
    }
  }
}

export async function stopServer(client: Client, name: string): Promise<void> {
  await execCommand(client, `tmux send-keys -t craft-${name} 'stop' Enter`)
}

export async function createServer(client: Client, name: string): Promise<void> {
  await execCommand(client, `mkdir -p ${SERVERS_DIR}/${name}`)

  // Create eula.txt
  await execCommand(
    client,
    `echo "eula=true" > ${SERVERS_DIR}/${name}/eula.txt`
  )

  // Create start.sh template
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
