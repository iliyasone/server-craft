import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSSHClient, getSFTP, execCommand } from '@/lib/ssh'

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

  const paths = pathsParam.split(',').filter((p) => p.startsWith('/servers/'))

  if (!paths.length) {
    return NextResponse.json({ error: 'No valid paths' }, { status: 400 })
  }

  try {
    const client = await getSSHClient(session.host, session.username, session.password)

    if (paths.length === 1) {
      // Single file: stream via SFTP
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
      // Multiple files: tar on remote and stream
      const tarPath = `/tmp/craft-${id}-download-${Date.now()}.tar.gz`
      const fileList = paths.map((p) => `"${p}"`).join(' ')

      await execCommand(client, `tar czf ${tarPath} ${fileList}`)

      const sftp = await getSFTP(client)
      const readStream = sftp.createReadStream(tarPath)

      const stream = new ReadableStream({
        start(controller) {
          readStream.on('data', (chunk: Buffer) => {
            controller.enqueue(chunk)
          })
          readStream.on('end', () => {
            controller.close()
            // Clean up temp file
            execCommand(client, `rm -f ${tarPath}`).catch(() => {})
          })
          readStream.on('error', (err: Error) => {
            controller.error(err)
            execCommand(client, `rm -f ${tarPath}`).catch(() => {})
          })
        },
        cancel() {
          readStream.destroy()
          execCommand(client, `rm -f ${tarPath}`).catch(() => {})
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="download.tar.gz"`,
        },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
