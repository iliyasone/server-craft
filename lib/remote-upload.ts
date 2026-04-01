import type { Client, SFTPWrapper } from 'ssh2'
import { execCommand } from '@/lib/ssh'
import { shellQuote } from '@/lib/server-terminal'

function createTempRemotePath(remotePath: string): string {
  return `${remotePath}.part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toBuffer(chunk: Uint8Array): Buffer {
  return Buffer.isBuffer(chunk)
    ? chunk
    : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

function openRemoteFile(
  sftp: SFTPWrapper,
  remotePath: string,
  mode: 'w' | 'a' = 'w'
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.open(remotePath, mode, (err, handle) => {
      if (err) return reject(err)
      resolve(handle)
    })
  })
}

function writeRemoteChunk(
  sftp: SFTPWrapper,
  handle: Buffer,
  chunk: Buffer,
  position: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.write(handle, chunk, 0, chunk.length, position, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function closeRemoteFile(sftp: SFTPWrapper, handle: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.close(handle, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function removeRemoteFile(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function moveRemoteFile(client: Client, from: string, to: string): Promise<void> {
  const { stderr, code } = await execCommand(
    client,
    `mv -f -- ${shellQuote(from)} ${shellQuote(to)}`
  )
  if (code !== 0) {
    throw new Error(stderr.trim() || 'Failed to finalize uploaded file')
  }
}

export async function uploadRemoteStream(
  client: Client,
  sftp: SFTPWrapper,
  remotePath: string,
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const tempPath = createTempRemotePath(remotePath)
  const reader = stream.getReader()
  let handle: Buffer | null = null
  let position = 0

  try {
    handle = await openRemoteFile(sftp, tempPath)

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue

      const chunk = toBuffer(value)
      await writeRemoteChunk(sftp, handle, chunk, position)
      position += chunk.length
    }

    await closeRemoteFile(sftp, handle)
    handle = null

    await moveRemoteFile(client, tempPath, remotePath)
  } catch (error) {
    if (handle) {
      try {
        await closeRemoteFile(sftp, handle)
      } catch {}
    }

    try {
      await removeRemoteFile(sftp, tempPath)
    } catch {}

    throw error
  } finally {
    try {
      reader.releaseLock()
    } catch {}
  }
}

export async function uploadRemoteFile(
  client: Client,
  sftp: SFTPWrapper,
  remotePath: string,
  file: File
): Promise<void> {
  await uploadRemoteStream(client, sftp, remotePath, file.stream())
}
