import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, execCommand } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'
import {
  flushServerWorldForSnapshot,
  restoreServerWorldAutosave,
  shellQuote,
} from '@/lib/server-terminal'

export const maxDuration = 300

function getServerRoot(id: string): string {
  return `${SERVERS_DIR}/${id}`
}

function isAllowedPath(path: string, serverRoot: string): boolean {
  return path === serverRoot || path.startsWith(serverRoot + '/')
}

function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const lastSlashIndex = trimmed.lastIndexOf('/')
  return lastSlashIndex >= 0 ? trimmed.slice(lastSlashIndex + 1) : trimmed
}

function parentDir(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const lastSlashIndex = trimmed.lastIndexOf('/')
  if (lastSlashIndex <= 0) return '/'
  return trimmed.slice(0, lastSlashIndex)
}

function safeDownloadName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'download'
}

function archiveFileName(paths: string[]): string {
  if (paths.length !== 1) return 'download.tar.gz'
  return `${safeDownloadName(baseName(paths[0]))}.tar.gz`
}

function buildTarCommand(tarPath: string, paths: string[]): string {
  const parents = new Set(paths.map(parentDir))

  if (parents.size === 1) {
    const [parent] = Array.from(parents)
    const entries = paths
      .map((path) => shellQuote(`./${baseName(path)}`))
      .join(' ')

    return `tar -C ${shellQuote(parent)} -czf ${shellQuote(tarPath)} ${entries}`
  }

  const entries = paths
    .map((path) => shellQuote(`./${path.replace(/^\/+/, '').replace(/\/+$/, '')}`))
    .join(' ')

  return `tar -C / -czf ${shellQuote(tarPath)} ${entries}`
}

async function pathType(client: Awaited<ReturnType<typeof getSSHClient>>, path: string): Promise<'file' | 'directory' | 'missing'> {
  const { stdout } = await execCommand(
    client,
    `if [ -d ${shellQuote(path)} ]; then echo directory; elif [ -f ${shellQuote(path)} ]; then echo file; else echo missing; fi`
  )
  const value = stdout.trim()
  if (value === 'directory' || value === 'file') return value
  return 'missing'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const pathsParam = searchParams.get('paths')

  if (!pathsParam) {
    return NextResponse.json({ error: 'Missing paths' }, { status: 400 })
  }

  const serverRoot = getServerRoot(id)
  const paths = pathsParam
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

  if (!paths.length) {
    return NextResponse.json({ error: 'No valid paths' }, { status: 400 })
  }

  if (!paths.every((p) => isAllowedPath(p, serverRoot))) {
    return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
  }

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const types = await Promise.all(paths.map((p) => pathType(client, p)))
    const missingPath = paths[types.findIndex((type) => type === 'missing')]

    if (missingPath) {
      return NextResponse.json({ error: `Path not found: ${missingPath}` }, { status: 404 })
    }

    const shouldArchive = paths.length > 1 || types[0] === 'directory'

    if (!shouldArchive) {
      const sftp = await getSFTP(client)
      const filePath = paths[0]
      const readStream = sftp.createReadStream(filePath)
      const fileName = filePath.split('/').pop() || 'download'

      const stream = new ReadableStream({
        start(controller) {
          readStream.on('data', (chunk: Buffer) => {
            controller.enqueue(chunk)
          })
          readStream.on('end', () => {
            controller.close()
          })
          readStream.on('error', (err: Error) => {
            controller.error(err)
          })
        },
        cancel() {
          readStream.destroy()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    } else {
      const safeId = safeDownloadName(id)
      const tarPath = `/tmp/craft-${safeId}-download-${Date.now()}.tar.gz`
      let autosaveDisabled = false

      try {
        try {
          autosaveDisabled = await flushServerWorldForSnapshot(client, id)
          const { stderr, code } = await execCommand(client, buildTarCommand(tarPath, paths))

          if (code !== 0) {
            throw new Error(stderr.trim() || 'Archive failed')
          }
        } finally {
          if (autosaveDisabled) {
            await restoreServerWorldAutosave(client, id)
          }
        }
      } catch (err) {
        await execCommand(client, `rm -f ${shellQuote(tarPath)}`).catch(() => {})
        throw err
      }

      const sftp = await getSFTP(client)
      const readStream = sftp.createReadStream(tarPath)
      const downloadName = archiveFileName(paths)

      const stream = new ReadableStream({
        start(controller) {
          readStream.on('data', (chunk: Buffer) => {
            controller.enqueue(chunk)
          })
          readStream.on('end', () => {
            controller.close()
            execCommand(client, `rm -f ${shellQuote(tarPath)}`).catch(() => {})
          })
          readStream.on('error', (err: Error) => {
            controller.error(err)
            execCommand(client, `rm -f ${shellQuote(tarPath)}`).catch(() => {})
          })
        },
        cancel() {
          readStream.destroy()
          execCommand(client, `rm -f ${shellQuote(tarPath)}`).catch(() => {})
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="${downloadName}"`,
        },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
