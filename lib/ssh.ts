import { Client, SFTPWrapper } from 'ssh2'

// Global pool (persists across requests in Node.js process)
declare global {
  var sshPool: Map<string, { client: Client; lastUsed: number }> | undefined
}

if (!global.sshPool) global.sshPool = new Map()

function isClientAlive(client: Client): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)._sock?.writable === true
  } catch {
    return false
  }
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
  if (existing) {
    try { existing.client.end() } catch {}
    global.sshPool!.delete(key)
  }

  const client = await connectSSH(host, username, password)
  global.sshPool!.set(key, { client, lastUsed: Date.now() })

  // On close, remove from pool
  client.on('close', () => {
    global.sshPool!.delete(key)
  })
  client.on('error', () => {
    global.sshPool!.delete(key)
  })

  return client
}

function connectSSH(host: string, username: string, password: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()

    client.on('ready', () => resolve(client))
    client.on('error', reject)

    client.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 10000,
      keepaliveInterval: 30000,
    })
  })
}

export async function execCommand(
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

export function getSFTP(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) return reject(err)
      resolve(sftp)
    })
  })
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
