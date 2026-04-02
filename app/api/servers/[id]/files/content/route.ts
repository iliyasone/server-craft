import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, sftpStat } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'

function getServerRoot(id: string): string {
  return `${SERVERS_DIR}/${id}`
}

function isAllowedPath(path: string, serverRoot: string): boolean {
  return path === serverRoot || path.startsWith(serverRoot + '/')
}

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

function sftpReadFile(sftp: import('ssh2').SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = sftp.createReadStream(path)
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

function sftpWriteFile(sftp: import('ssh2').SFTPWrapper, path: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(path)
    stream.on('close', () => resolve())
    stream.on('error', reject)
    stream.end(data)
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const filePath = request.nextUrl.searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const serverRoot = getServerRoot(id)
  if (!isAllowedPath(filePath, serverRoot)) {
    return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
  }

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const stats = await sftpStat(sftp, filePath)
    if (stats.isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory' }, { status: 400 })
    }
    if ((stats.size ?? 0) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large to edit (max 2MB)' }, { status: 400 })
    }

    const buffer = await sftpReadFile(sftp, filePath)
    const content = buffer.toString('utf-8')

    return NextResponse.json({ content, size: stats.size })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const { path: filePath, content } = await request.json()
    if (!filePath || typeof filePath !== 'string' || typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const serverRoot = getServerRoot(id)
    if (!isAllowedPath(filePath, serverRoot)) {
      return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    await sftpWriteFile(sftp, filePath, Buffer.from(content, 'utf-8'))

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to write file'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
