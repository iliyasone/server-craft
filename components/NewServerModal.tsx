'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { SERVERS_DIR_CLIENT } from '@/lib/client-constants'
import { uploadFileWithProgress } from '@/lib/client-upload'

interface NewServerModalProps {
  onClose: () => void
  onCreated?: () => void
}

function extractNameFromJar(filename: string): string {
  const base = filename
    .replace(/\.jar$/i, '')
    .replace(/[-_](installer|universal|server|latest|snapshot|setup)$/i, '')

  const parts = base.split('-')
  const result: string[] = []
  let versionFound = false

  for (const part of parts) {
    if (/^\d/.test(part)) {
      if (versionFound) break
      versionFound = true
    }
    result.push(part)
  }

  return result
    .join('-')
    .replace(/\./g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40)
}

export default function NewServerModal({ onClose, onCreated }: NewServerModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [jarFile, setJarFile] = useState<File | null>(null)
  const [step, setStep] = useState<'form' | 'creating' | 'uploading' | 'done' | 'error'>('form')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch existing server names
  useEffect(() => {
    fetch('/api/servers', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.servers) {
          setExistingNames(new Set(data.servers.map((s: { id: string }) => s.id.toLowerCase())))
        }
      })
      .catch(() => {})
  }, [])

  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '').trim().toLowerCase()
  const nameConflict = sanitizedName.length > 0 && existingNames.has(sanitizedName)

  function handleJarSelect(file: File) {
    setJarFile(file)
    if (!name.trim()) {
      const suggested = extractNameFromJar(file.name)
      if (suggested) setName(suggested)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Server name is required')
      return
    }
    if (nameConflict) {
      setError('A server with this name already exists')
      return
    }

    setStep('creating')
    setError('')
    setProgress('Creating server directory…')
    setUploadProgress(0)

    try {
      const createRes = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      const createData = await createRes.json()
      if (!createRes.ok) {
        throw new Error(createData.error || 'Failed to create server')
      }

      const serverId = createData.id

      if (jarFile) {
        setStep('uploading')
        setProgress(`Uploading ${jarFile.name}…`)

        const uploadUrl = `/api/servers/${serverId}/files/upload?path=${encodeURIComponent(`${SERVERS_DIR_CLIENT}/${serverId}`)}&relativePath=${encodeURIComponent(jarFile.name)}`

        const result = await uploadFileWithProgress(uploadUrl, jarFile, (pct) => {
          setUploadProgress(pct)
        })

        if (!result.ok) {
          throw new Error(result.error || 'Failed to upload JAR')
        }
      }

      setStep('done')
      setProgress('Server created successfully!')
      if (onCreated) onCreated()

      setTimeout(() => {
        router.push(`/servers/${serverId}`)
        onClose()
      }, 800)
    } catch (err) {
      setStep('error')
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const isLoading = step === 'creating' || step === 'uploading'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#00000088',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose()
      }}
    >
      <div
        style={{
          background: '#300a2e',
          border: '1px solid #fd87f6',
          borderRadius: '24px',
          padding: '40px',
          width: '420px',
          color: 'white',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
          New Server
        </h2>
        <p style={{ color: '#876f86', marginBottom: '24px', fontSize: '14px' }}>
          Create a Minecraft server on your remote host
        </p>

        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <p style={{ color: '#22c55e', fontWeight: '700' }}>{progress}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* JAR file first — auto-fills name */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{ color: '#fd87f6', fontWeight: '600', fontSize: '13px', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Server JAR
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: '#3d1f3b',
                  border: jarFile ? '1px solid #22c55e80' : '1px dashed #61475f',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: jarFile ? '#22c55e' : '#876f86',
                  transition: 'border-color 0.15s',
                }}
              >
                {jarFile
                  ? `✓ ${jarFile.name}`
                  : 'Click to select a .jar file'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jar"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleJarSelect(e.target.files[0])
                }}
              />
              <p style={{ color: '#61475f', fontSize: '12px', marginTop: '4px' }}>
                Server name will be auto-suggested from the filename
              </p>
            </div>

            {/* Server name */}
            <div style={{ marginBottom: '24px' }}>
              <label
                style={{ color: '#fd87f6', fontWeight: '600', fontSize: '13px', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Server Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))
                  setError('')
                }}
                placeholder="my-server"
                disabled={isLoading}
                pattern="[a-zA-Z0-9_-]+"
                required
                style={{
                  background: '#3d1f3b',
                  border: nameConflict ? '1px solid #dc2626' : '1px solid #61475f',
                  borderRadius: '10px',
                  color: 'white',
                  padding: '11px 14px',
                  fontSize: '15px',
                  width: '100%',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
              />
              {nameConflict ? (
                <p style={{ color: '#f87171', fontSize: '12px', marginTop: '4px' }}>
                  A server named &quot;{sanitizedName}&quot; already exists
                </p>
              ) : (
                <p style={{ color: '#61475f', fontSize: '12px', marginTop: '4px' }}>
                  Letters, numbers, hyphens, underscores
                </p>
              )}
            </div>

            {isLoading && (
              <div
                style={{
                  background: '#22c55e15',
                  border: '1px solid #22c55e40',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: '#22c55e',
                }}
              >
                <div style={{ marginBottom: step === 'uploading' ? '8px' : 0 }}>{progress}</div>
                {step === 'uploading' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        flex: 1,
                        height: '6px',
                        borderRadius: '999px',
                        background: '#ffffff18',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${uploadProgress}%`,
                          height: '100%',
                          borderRadius: '999px',
                          background: '#22c55e',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '12px', minWidth: '36px', textAlign: 'right' }}>
                      {uploadProgress}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {(error || step === 'error') && (
              <div
                style={{
                  background: '#dc262615',
                  border: '1px solid #dc262640',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  color: '#f87171',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #61475f',
                  color: '#876f86',
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || nameConflict}
                style={{
                  flex: 2,
                  background: isLoading || nameConflict ? '#16a34a99' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: isLoading || nameConflict ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '15px',
                }}
              >
                {isLoading ? (step === 'uploading' ? 'Uploading…' : 'Creating…') : 'Create Server'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
