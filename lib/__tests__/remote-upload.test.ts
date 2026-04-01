import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Client, SFTPWrapper } from 'ssh2'
import { uploadRemoteStream } from '@/lib/remote-upload'
import { execCommand } from '@/lib/ssh'

vi.mock('@/lib/ssh', () => ({
  execCommand: vi.fn(),
}))

function createStream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(Buffer.from(chunk)))
      }
      controller.close()
    },
  })
}

describe('uploadRemoteStream', () => {
  beforeEach(() => {
    vi.mocked(execCommand).mockReset()
  })

  it('writes to a temp file and renames it into place on success', async () => {
    const writes: Array<{ position: number; chunk: string }> = []
    const open = vi.fn((path: string, _mode: string, callback: (err: Error | undefined, handle: Buffer) => void) => {
      callback(undefined, Buffer.from('handle'))
    })
    const write = vi.fn((
      _handle: Buffer,
      buffer: Buffer,
      offset: number,
      length: number,
      position: number,
      callback: (err?: Error) => void
    ) => {
      writes.push({
        position,
        chunk: buffer.subarray(offset, offset + length).toString(),
      })
      callback()
    })
    const close = vi.fn((_handle: Buffer, callback: (err?: Error) => void) => callback())
    const unlink = vi.fn((_path: string, callback: (err?: Error) => void) => callback())
    const sftp = { open, write, close, unlink } as unknown as SFTPWrapper

    vi.mocked(execCommand).mockResolvedValue({ stdout: '', stderr: '', code: 0 })

    await uploadRemoteStream(
      {} as Client,
      sftp,
      '/remote/world/server.jar',
      createStream('hello', 'world')
    )

    const tempPath = open.mock.calls[0]?.[0]
    expect(tempPath).toMatch(/^\/remote\/world\/server\.jar\.part-/)
    expect(writes).toEqual([
      { position: 0, chunk: 'hello' },
      { position: 5, chunk: 'world' },
    ])
    expect(close).toHaveBeenCalledTimes(1)
    expect(unlink).not.toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith(
      expect.anything(),
      `mv -f -- '${tempPath}' '/remote/world/server.jar'`
    )
  })

  it('removes the temp file when a write fails', async () => {
    const open = vi.fn((path: string, _mode: string, callback: (err: Error | undefined, handle: Buffer) => void) => {
      callback(undefined, Buffer.from('handle'))
    })
    const write = vi.fn((
      _handle: Buffer,
      _buffer: Buffer,
      _offset: number,
      _length: number,
      position: number,
      callback: (err?: Error) => void
    ) => {
      callback(position === 0 ? undefined : new Error('disk full'))
    })
    const close = vi.fn((_handle: Buffer, callback: (err?: Error) => void) => callback())
    const unlink = vi.fn((_path: string, callback: (err?: Error) => void) => callback())
    const sftp = { open, write, close, unlink } as unknown as SFTPWrapper

    await expect(
      uploadRemoteStream(
        {} as Client,
        sftp,
        '/remote/world/server.jar',
        createStream('hello', 'world')
      )
    ).rejects.toThrow('disk full')

    const tempPath = open.mock.calls[0]?.[0]
    expect(close).toHaveBeenCalledTimes(1)
    expect(unlink).toHaveBeenCalledWith(tempPath, expect.any(Function))
    expect(execCommand).not.toHaveBeenCalled()
  })
})
