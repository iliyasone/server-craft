import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, execCommand } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'
import { shellQuote } from '@/lib/server-terminal'
import type { SFTPWrapper } from 'ssh2'

export const maxDuration = 300

function normalizeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return null
  return normalized
}

async function writeRemoteFile(sftp: SFTPWrapper, remotePath: string, file: File): Promise<void> {
  await writeRemoteStream(sftp, remotePath, file.stream())
}

async function writeRemoteStream(
  sftp: SFTPWrapper,
  remotePath: string,
  stream: ReadableStream<Uint8Array>
): Promise<void> {
  const reader = stream.getReader()
  const remoteWriteStream = sftp.createWriteStream(remotePath)

  const remoteFinished = new Promise<void>((resolve, reject) => {
    remoteWriteStream.once('finish', () => resolve())
    remoteWriteStream.once('error', (error: Error) => reject(error))
  })

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    if (!remoteWriteStream.write(value)) {
      await new Promise<void>((resolve) => remoteWriteStream.once('drain', resolve))
    }
  }

  remoteWriteStream.end()
  await remoteFinished
}

async function validateUploadPath(destPath: string): Promise<string | null> {
  if (!destPath || !destPath.startsWith(SERVERS_DIR + '/')) return null
  return destPath
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

    if (!(await validateUploadPath(destPath))) {
      return NextResponse.json({ error: 'Invalid destination path' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const uploadedFiles: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = normalizeRelativePath(relativePaths[i] || file.name)
      if (!relativePath) {
        return NextResponse.json({ error: `Invalid file path: ${file.name}` }, { status: 400 })
      }

      const remotePath = `${destPath}/${relativePath}`
      const remoteDir = remotePath.includes('/') ? remotePath.slice(0, remotePath.lastIndexOf('/')) : destPath
      await execCommand(client, `mkdir -p ${shellQuote(remoteDir)}`)
      await writeRemoteFile(sftp, remotePath, file)
      uploadedFiles.push(remotePath)
    }

    return NextResponse.json({ ok: true, uploaded: uploadedFiles })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params

  try {
    const search = request.nextUrl.searchParams
    const destPath = search.get('path') || ''
    const relativePath = normalizeRelativePath(search.get('relativePath') || '')

    if (!(await validateUploadPath(destPath)) || !relativePath) {
      return NextResponse.json({ error: 'Invalid upload path' }, { status: 400 })
    }

    if (!request.body) {
      return NextResponse.json({ error: 'Missing request body' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const remotePath = `${destPath}/${relativePath}`
    const remoteDir = remotePath.includes('/') ? remotePath.slice(0, remotePath.lastIndexOf('/')) : destPath
    await execCommand(client, `mkdir -p ${shellQuote(remoteDir)}`)
    await writeRemoteStream(sftp, remotePath, request.body)

    return NextResponse.json({ ok: true, uploaded: [remotePath] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
