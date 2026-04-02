'use client'

const VERCEL_SAFE_CHUNK_SIZE = 4 * 1024 * 1024

function appendUploadParams(url: string, params: Record<string, string>): string {
  const nextUrl = new URL(url, window.location.origin)

  for (const [key, value] of Object.entries(params)) {
    nextUrl.searchParams.set(key, value)
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

function uploadBlobWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (value: number) => void
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      const progress = Math.min(100, Math.round((event.loaded / event.total) * 100))
      onProgress(progress)
    }

    xhr.onerror = () => resolve({ ok: false, error: 'Network error during upload' })
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve({ ok: true })
        return
      }

      try {
        const payload = JSON.parse(xhr.responseText || '{}')
        resolve({ ok: false, error: payload.error || `Upload failed (${xhr.status})` })
      } catch {
        resolve({ ok: false, error: `Upload failed (${xhr.status})` })
      }
    }

    xhr.send(blob)
  })
}

export async function uploadFileWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void
): Promise<{ ok: boolean; error?: string }> {
  const contentType = file.type || 'application/octet-stream'

  if (file.size <= VERCEL_SAFE_CHUNK_SIZE) {
    return uploadBlobWithProgress(url, file, contentType, onProgress)
  }

  const uploadId = crypto.randomUUID()
  const totalChunks = Math.ceil(file.size / VERCEL_SAFE_CHUNK_SIZE)

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * VERCEL_SAFE_CHUNK_SIZE
    const end = Math.min(file.size, start + VERCEL_SAFE_CHUNK_SIZE)
    const chunk = file.slice(start, end)
    const chunkUrl = appendUploadParams(url, {
      uploadId,
      chunkIndex: String(chunkIndex),
      totalChunks: String(totalChunks),
    })

    const result = await uploadBlobWithProgress(chunkUrl, chunk, contentType, (chunkProgress) => {
      const uploadedBytes = start + (chunk.size * chunkProgress / 100)
      const overallProgress = Math.min(100, Math.round((uploadedBytes / file.size) * 100))
      onProgress(overallProgress)
    })

    if (!result.ok) {
      return result
    }
  }

  onProgress(100)
  return { ok: true }
}
