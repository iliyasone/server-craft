import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP } from '@/lib/ssh'
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await params // resolve params

  try {
    const formData = await request.formData()
    const destPath = formData.get('path') as string
    const files = formData.getAll('files') as File[]

    if (!destPath || !files.length) {
      return NextResponse.json({ error: 'Missing path or files' }, { status: 400 })
    }

    // Ensure destination is within /servers
    if (!destPath.startsWith('/servers/')) {
      return NextResponse.json({ error: 'Invalid destination path' }, { status: 400 })
    }

    const client = await getSSHClient(session.host, session.username, session.password)
    const sftp = await getSFTP(client)

    const tmpDir = await mkdtemp(join(tmpdir(), 'craft-upload-'))
    const uploadedFiles: string[] = []

    try {
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer())
        const tmpFile = join(tmpDir, file.name.replace(/[^a-zA-Z0-9._-]/g, '_'))
        await writeFile(tmpFile, buffer)

        const remotePath = `${destPath}/${file.name}`
        await new Promise<void>((resolve, reject) => {
          sftp.fastPut(tmpFile, remotePath, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })

        uploadedFiles.push(remotePath)
        await unlink(tmpFile)
      }
    } finally {
      try { await unlink(tmpDir) } catch {}
    }

    return NextResponse.json({ ok: true, uploaded: uploadedFiles })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
