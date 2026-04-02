import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createSSHClient, getSFTP, execCommand } from '@/lib/ssh'
import {
  uploadRemoteFile,
  uploadRemoteStream,
} from '@/lib/remote-upload'
import { SERVERS_DIR } from '@/lib/servers'
import { shellQuote } from '@/lib/server-terminal'

export const maxDuration = 300

function normalizeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) return null
  return normalized
}

function normalizeUploadId(value: string): string | null {
  return /^[a-zA-Z0-9-]+$/.test(value) ? value : null
}

async function validateUploadPath(destPath: string): Promise<string | null> {
  if (!destPath || !destPath.startsWith(SERVERS_DIR + '/')) return null
  return destPath
}

function getRemoteDir(remotePath: string): string {
  const lastSlashIndex = remotePath.lastIndexOf('/')
  return lastSlashIndex >= 0 ? remotePath.slice(0, lastSlashIndex) || '/' : '.'
}

function createChunkTempDir(remotePath: string, uploadId: string): string {
  return `${getRemoteDir(remotePath)}/.craft-upload-${uploadId}`
}

function createChunkPartPath(remotePath: string, uploadId: string, chunkIndex: number): string {
  return `${createChunkTempDir(remotePath, uploadId)}/part-${String(chunkIndex).padStart(6, '0')}`
}

function createChunkMergedPath(remotePath: string, uploadId: string): string {
  return `${createChunkTempDir(remotePath, uploadId)}/merged`
}

function formatUploadError(error: unknown): string {
  if (!(error instanceof Error)) return 'Upload failed'

  const code = 'code' in error && typeof error.code !== 'undefined'
    ? ` [code ${String(error.code)}]`
    : ''

  return `${error.name}${code}: ${error.message}`
}

async function finalizeChunkedUpload(
  client: Awaited<ReturnType<typeof createSSHClient>>,
  remotePath: string,
  uploadId: string,
  totalChunks: number
) {
  const chunkPaths = Array.from({ length: totalChunks }, (_, index) =>
    createChunkPartPath(remotePath, uploadId, index)
  )
  const tempDir = createChunkTempDir(remotePath, uploadId)
  const mergedPath = createChunkMergedPath(remotePath, uploadId)
  const quotedChunkPaths = chunkPaths.map((path) => shellQuote(path)).join(' ')

  const { stderr, code } = await execCommand(
    client,
    [
      `cat ${quotedChunkPaths} > ${shellQuote(mergedPath)}`,
      `mv -f -- ${shellQuote(mergedPath)} ${shellQuote(remotePath)}`,
      `rm -rf -- ${shellQuote(tempDir)}`,
    ].join(' && ')
  )

  if (code !== 0) {
    throw new Error(stderr.trim() || 'Failed to assemble uploaded file chunks')
  }
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
    const uploadId = normalizeUploadId(search.get('uploadId') || '') || ''
    const chunkIndexParam = search.get('chunkIndex')
    const totalChunksParam = search.get('totalChunks')
    const chunkIndex = chunkIndexParam ? Number.parseInt(chunkIndexParam, 10) : null
    const totalChunks = totalChunksParam ? Number.parseInt(totalChunksParam, 10) : null

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

    const isChunkedUpload = uploadId && chunkIndex !== null && totalChunks !== null

    if (isChunkedUpload) {
      if (!Number.isFinite(chunkIndex) || !Number.isFinite(totalChunks) || chunkIndex < 0 || totalChunks < 1 || chunkIndex >= totalChunks) {
        return NextResponse.json({ error: 'Invalid upload chunk metadata' }, { status: 400 })
      }

      await execCommand(client, `mkdir -p ${shellQuote(createChunkTempDir(remotePath, uploadId))}`)
      const chunkPath = createChunkPartPath(remotePath, uploadId, chunkIndex)
      await uploadRemoteStream(client, sftp, chunkPath, request.body)

      if (chunkIndex === totalChunks - 1) {
        await finalizeChunkedUpload(client, remotePath, uploadId, totalChunks)
      }

      return NextResponse.json({
        ok: true,
        uploaded: chunkIndex === totalChunks - 1 ? [remotePath] : [],
        partial: chunkIndex !== totalChunks - 1,
      })
    }

    await uploadRemoteStream(client, sftp, remotePath, request.body)

    return NextResponse.json({ ok: true, uploaded: [remotePath] })
  } catch (err) {
    const message = formatUploadError(err)
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    client?.end()
  }
}
