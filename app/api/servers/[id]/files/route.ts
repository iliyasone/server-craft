import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, sftpReaddir, execCommand } from '@/lib/ssh'
import { SERVERS_DIR } from '@/lib/servers'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const dirPath = searchParams.get('path') || `${SERVERS_DIR}/${id}`

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params

  try {
    const { paths } = await request.json()
    if (!Array.isArray(paths)) {
      return NextResponse.json({ error: 'Invalid paths' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)

    for (const p of paths) {
      if (typeof p === 'string' && p.startsWith(SERVERS_DIR + '/')) {
        await execCommand(client, `rm -rf "${p}"`)
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

  await params

  try {
    const { from, to } = await request.json()
    if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
      return NextResponse.json({ error: 'Invalid paths' }, { status: 400 })
    }

    // Security: must stay within SERVERS_DIR
    if (!from.startsWith(SERVERS_DIR + '/') || !to.startsWith(SERVERS_DIR + '/')) {
      return NextResponse.json({ error: 'Path outside allowed directory' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    await execCommand(client, `mv "${from}" "${to}"`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to move/rename'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
