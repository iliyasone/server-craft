import { Client, SFTPWrapper } from 'ssh2'

export interface SSHCredentials {
  host: string
  username: string
  password: string
}

// Global pool (persists across requests in Node.js process)
declare global {
  var sshPool: Map<string, { client: Client; creds: SSHCredentials; lastUsed: number }> | undefined
  var sshExecQueues: Map<string, Promise<unknown>> | undefined
}

if (!global.sshPool) global.sshPool = new Map()
if (!global.sshExecQueues) global.sshExecQueues = new Map()

function isClientAlive(client: Client): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)._sock?.writable === true
  } catch {
    return false
  }
}

function dropFromPool(key: string) {
  const entry = global.sshPool!.get(key)
  if (entry) {
    try { entry.client.end() } catch {}
    global.sshPool!.delete(key)
  }
  global.sshExecQueues!.delete(key)
}

export async function getSSHClient(
  host: string,
  username: string,
  password: string
): Promise<Client> {
  const key = `${username}@${host}`
  const existing = global.sshPool!.get(key)

  if (existing && isClientAlive(existing.client)) {
    existing.lastUsed = Date.now()
    return existing.client
  }

  // Clean up dead connection
  if (existing) dropFromPool(key)

  const client = await connectSSH(host, username, password)
  global.sshPool!.set(key, { client, creds: { host, username, password }, lastUsed: Date.now() })

  client.on('close', () => { global.sshPool!.delete(key) })
  client.on('error', () => { dropFromPool(key) })

  return client
}

export async function createSSHClient(
  host: string,
  username: string,
  password: string
): Promise<Client> {
  return connectSSH(host, username, password)
}

// Force reconnect: drop current connection and create a new one
async function reconnectSSH(key: string): Promise<Client> {
  const entry = global.sshPool!.get(key)
  if (!entry) throw new Error('No connection to reconnect')

  const { creds } = entry
  dropFromPool(key)

  const client = await connectSSH(creds.host, creds.username, creds.password)
  global.sshPool!.set(key, { client, creds, lastUsed: Date.now() })

  client.on('close', () => { global.sshPool!.delete(key) })
  client.on('error', () => { dropFromPool(key) })

  return client
}

function isRetriableConnectError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return (
    message.includes('Timed out while waiting for handshake') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('EHOSTUNREACH')
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function connectSSHOnce(host: string, username: string, password: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()

    client.on('ready', () => resolve(client))
    client.on('error', reject)

    client.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 20000,
      keepaliveInterval: 30000,
    })
  })
}

async function connectSSH(host: string, username: string, password: string): Promise<Client> {
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await connectSSHOnce(host, username, password)
    } catch (err) {
      lastError = err
      if (!isRetriableConnectError(err) || attempt === 1) {
        throw err
      }
      await delay(1000 * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error('SSH connection failed')
}

function execCommandOnce(
  client: Client,
  command: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err)

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => { stdout += data.toString() })
      stream.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

      stream.on('close', (code: number) => {
        resolve({ stdout, stderr, code: code ?? 0 })
      })

      stream.on('error', reject)
    })
  })
}

function getPoolKey(client: Client): string {
  const pooledKey = getPoolKeyForClient(client)
  if (pooledKey) return pooledKey

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sock = (client as any)._sock
  const remoteAddress = sock?.remoteAddress ?? 'unknown'
  const remotePort = sock?.remotePort ?? 'unknown'
  const localPort = sock?.localPort ?? 'unknown'
  return `${remoteAddress}:${remotePort}:${localPort}`
}

function getPoolKeyForClient(client: Client): string | undefined {
  for (const [key, entry] of global.sshPool!.entries()) {
    if (entry.client === client) return key
  }
  return undefined
}

// Serialize SSH operations per connection to prevent channel exhaustion
// If channel fails, reconnect and retry once
export async function execCommand(
  client: Client,
  command: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  const queueKey = getPoolKey(client)
  const queue = global.sshExecQueues!.get(queueKey) ?? Promise.resolve()

  const task = async (): Promise<{ stdout: string; stderr: string; code: number }> => {
    try {
      return await execCommandOnce(client, command)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Channel open failure')) {
        // Connection is saturated — reconnect
        const poolKey = getPoolKeyForClient(client)
        if (poolKey) {
          const newClient = await reconnectSSH(poolKey)
          return await execCommandOnce(newClient, command)
        }
      }
      throw err
    }
  }

  const next = queue.then(task, task)
  global.sshExecQueues!.set(queueKey, next.catch(() => {}))
  return next
}

function getSFTPOnce(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err)
      resolve(sftp)
    })
  })
}

// Queue SFTP alongside exec commands; reconnect on channel failure
export async function getSFTP(client: Client): Promise<SFTPWrapper> {
  const queueKey = getPoolKey(client)
  const queue = global.sshExecQueues!.get(queueKey) ?? Promise.resolve()

  const task = async (): Promise<SFTPWrapper> => {
    try {
      return await getSFTPOnce(client)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Channel open failure')) {
        const poolKey = getPoolKeyForClient(client)
        if (poolKey) {
          const newClient = await reconnectSSH(poolKey)
          return await getSFTPOnce(newClient)
        }
      }
      throw err
    }
  }

  const next = queue.then(task, task)
  global.sshExecQueues!.set(queueKey, next.catch(() => {}))
  return next
}

export function sftpReaddir(sftp: SFTPWrapper, path: string): Promise<import('ssh2').FileEntryWithStats[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) return reject(err)
      resolve(list)
    })
  })
}

export function sftpStat(sftp: SFTPWrapper, path: string): Promise<import('ssh2').Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (err, stats) => {
      if (err) return reject(err)
      resolve(stats)
    })
  })
}
