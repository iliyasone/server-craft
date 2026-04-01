import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createSSHClient, getSFTP, execCommand } from '@/lib/ssh'
import { uploadRemoteFile, uploadRemoteStream } from '@/lib/remote-upload'
import { SERVERS_DIR } from '@/lib/servers'
import { shellQuote } from '@/lib/server-terminal'

export const maxDuration = 300

function normalizeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return null
  return normalized
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

  let client: Awaited<ReturnType<typeof createSSHClient>> | null = null

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

    client = await createSSHClient(session.host, session.username, session.password)
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
      await uploadRemoteFile(client, sftp, remotePath, file)
      uploadedFiles.push(remotePath)
    }

    return NextResponse.json({ ok: true, uploaded: uploadedFiles })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    client?.end()
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params

  let client: Awaited<ReturnType<typeof createSSHClient>> | null = null

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

    client = await createSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const remotePath = `${destPath}/${relativePath}`
    const remoteDir = remotePath.includes('/') ? remotePath.slice(0, remotePath.lastIndexOf('/')) : destPath
    await execCommand(client, `mkdir -p ${shellQuote(remoteDir)}`)
    await uploadRemoteStream(client, sftp, remotePath, request.body)

    return NextResponse.json({ ok: true, uploaded: [remotePath] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    client?.end()
  }
}
