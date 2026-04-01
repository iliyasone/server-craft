import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, execCommand } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'
import { shellQuote } from '@/lib/server-terminal'
import { createWriteStream } from 'fs'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { finished } from 'stream/promises'

function normalizeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return null
  return normalized
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params

  try {
    const formData = await request.formData()
    const destPath = formData.get('path') as string
    const files = formData.getAll('files') as File[]
    const relativePaths = formData.getAll('relativePaths').map((v) => String(v))

    if (!destPath || !files.length) {
      return NextResponse.json({ error: 'Missing path or files' }, { status: 400 })
    }

    if (!destPath.startsWith(SERVERS_DIR + '/')) {
      return NextResponse.json({ error: 'Invalid destination path' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const tmpDir = await mkdtemp(join(tmpdir(), 'craft-upload-'))
    const uploadedFiles: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const relativePath = normalizeRelativePath(relativePaths[i] || file.name)
        if (!relativePath) {
          return NextResponse.json({ error: `Invalid file path: ${file.name}` }, { status: 400 })
        }

        const tmpFile = join(tmpDir, relativePath)
        await mkdir(join(tmpDir, relativePath.substring(0, Math.max(relativePath.lastIndexOf('/'), 0))), { recursive: true })
        const fileStream = file.stream()
        if (!fileStream) {
          return NextResponse.json({ error: `Cannot read file stream: ${file.name}` }, { status: 400 })
        }
        const writeStream = createWriteStream(tmpFile)
        const reader = fileStream.getReader()
        async function pump(): Promise<void> {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (!writeStream.write(value)) {
              await new Promise<void>((resolve) => writeStream.once('drain', resolve))
            }
          }
          writeStream.end()
        }
        await pump()
        await finished(writeStream)

        const remotePath = `${destPath}/${relativePath}`
        const remoteDir = remotePath.includes('/') ? remotePath.slice(0, remotePath.lastIndexOf('/')) : destPath
        await execCommand(client, `mkdir -p ${shellQuote(remoteDir)}`)
        await new Promise<void>((resolve, reject) => {
          sftp.fastPut(tmpFile, remotePath, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })

        uploadedFiles.push(remotePath)
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }

    return NextResponse.json({ ok: true, uploaded: uploadedFiles })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
