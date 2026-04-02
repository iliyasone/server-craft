import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, sftpReaddir, execCommand } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'
import { shellQuote } from '@/lib/server-terminal'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

function getServerRoot(id: string): string {
  return `${SERVERS_DIR}/${id}`
}

function isAllowedPath(path: string, serverRoot: string): boolean {
  return path === serverRoot || path.startsWith(serverRoot + '/')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const serverRoot = getServerRoot(id)
  const dirPath = searchParams.get('path') || serverRoot

  if (!isAllowedPath(dirPath, serverRoot)) {
    return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
  }

  try {
    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const entries = await sftpReaddir(sftp, dirPath)

    const files: FileEntry[] = entries.map((entry) => ({
      name: entry.filename,
      path: `${dirPath}/${entry.filename}`,
      isDirectory: entry.attrs.isDirectory(),
      size: entry.attrs.size ?? 0,
      mtime: (entry.attrs.mtime ?? 0) * 1000,
    }))

    // Sort: directories first, then files, both alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ files })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list files'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const serverRoot = getServerRoot(id)

  try {
    const { path } = await request.json()
    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (!isAllowedPath(path, serverRoot)) {
      return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const { stderr, code } = await execCommand(client, `mkdir -p ${shellQuote(path)}`)
    if (code !== 0) {
      return NextResponse.json({ error: stderr.trim() || 'Create folder failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, path })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create folder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const serverRoot = getServerRoot(id)

  try {
    const { paths } = await request.json()
    if (!Array.isArray(paths)) {
      return NextResponse.json({ error: 'Invalid paths' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)

    for (const p of paths) {
      if (typeof p === 'string' && isAllowedPath(p, serverRoot)) {
        await execCommand(client, `rm -rf -- ${shellQuote(p)}`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete files'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const serverRoot = getServerRoot(id)

  try {
    const { from, to } = await request.json()
    if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
      return NextResponse.json({ error: 'Invalid paths' }, { status: 400 })
    }

    if (!isAllowedPath(from, serverRoot) || !isAllowedPath(to, serverRoot)) {
      return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
    }

    if (from === to) {
      return NextResponse.json({ ok: true })
    }

    if (to.startsWith(from + '/')) {
      return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const { stderr, code } = await execCommand(client, `mv -- ${shellQuote(from)} ${shellQuote(to)}`)

    if (code !== 0) {
      return NextResponse.json(
        { error: stderr.trim() || 'Move/rename failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to move/rename'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
