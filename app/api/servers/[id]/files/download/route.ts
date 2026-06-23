import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, execCommand, execStream } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'
import {
  flushServerWorldForSnapshot,
  restoreServerWorldAutosave,
  shellQuote,
} from '@/lib/server-terminal'

// A multi-GB world streams at disk/network speed but can still take a while on
// a slow client link, so give the streaming response plenty of headroom.
export const maxDuration = 3600

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
  if (paths.length !== 1) return 'download.tar'
  return `${safeDownloadName(baseName(paths[0]))}.tar`
}

// Build a `tar` command that writes the archive to stdout (`-cf -`) so it can be
// streamed straight to the client. We intentionally do NOT gzip: a Minecraft
// world is almost entirely `.mca` region files, which are already compressed.
// gzip would burn minutes of CPU for a ~20% size win while delaying the first
// byte until the whole archive is built — the old behavior that truncated large
// downloads. Plain tar starts streaming immediately.
function buildTarCommand(paths: string[]): string {
  const parents = new Set(paths.map(parentDir))

  if (parents.size === 1) {
    const [parent] = Array.from(parents)
    const entries = paths
      .map((path) => shellQuote(`./${baseName(path)}`))
      .join(' ')

    return `tar -C ${shellQuote(parent)} -cf - ${entries}`
  }

  const entries = paths
    .map((path) => shellQuote(`./${path.replace(/^\/+/, '').replace(/\/+$/, '')}`))
    .join(' ')

  return `tar -C / -cf - ${entries}`
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
      // Flush the live world to disk so the snapshot is consistent, then stream
      // `tar` straight from the remote stdout into the response. Autosave stays
      // off for the whole stream (restored once it ends) so region files don't
      // change mid-archive.
      let autosaveDisabled = false
      try {
        autosaveDisabled = await flushServerWorldForSnapshot(client, id)
      } catch {
        autosaveDisabled = false
      }

      let channel: Awaited<ReturnType<typeof execStream>>
      try {
        channel = await execStream(client, buildTarCommand(paths))
      } catch (err) {
        if (autosaveDisabled) {
          await restoreServerWorldAutosave(client, id).catch(() => {})
        }
        throw err
      }

      let restored = false
      const restoreAutosave = () => {
        if (restored) return
        restored = true
        if (autosaveDisabled) {
          restoreServerWorldAutosave(client, id).catch(() => {})
        }
      }

      const downloadName = archiveFileName(paths)

      const stream = new ReadableStream({
        start(controller) {
          channel.on('data', (chunk: Buffer) => {
            controller.enqueue(chunk)
            // Backpressure: if the consumer is slower than the SSH channel,
            // stop reading until pull() is called, so a slow client doesn't
            // make us buffer the whole (multi-GB) archive in memory.
            if ((controller.desiredSize ?? 0) <= 0) {
              channel.pause()
            }
          })
          // Drain stderr so the channel's flow-control window doesn't stall.
          channel.stderr?.on('data', () => {})
          channel.on('close', () => {
            controller.close()
            restoreAutosave()
          })
          channel.on('error', (err: Error) => {
            controller.error(err)
            restoreAutosave()
          })
        },
        pull() {
          channel.resume()
        },
        cancel() {
          try {
            channel.close()
          } catch {
            channel.destroy()
          }
          restoreAutosave()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-tar',
          'Content-Disposition': `attachment; filename="${downloadName}"`,
        },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
