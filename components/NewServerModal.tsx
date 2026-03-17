'use client'

import { useState, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

interface NewServerModalProps {
  onClose: () => void
  onCreated?: () => void
}

export default function NewServerModal({ onClose, onCreated }: NewServerModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [jarFile, setJarFile] = useState<File | null>(null)
  const [step, setStep] = useState<'form' | 'creating' | 'uploading' | 'done' | 'error'>('form')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Server name is required')
      return
    }

    setStep('creating')
    setError('')
    setProgress('Creating server directory...')

    try {
      // Step 1: Create server
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

      // Step 2: Upload JAR if provided
      if (jarFile) {
        setStep('uploading')
        setProgress(`Uploading ${jarFile.name}...`)

        const formData = new FormData()
        formData.append('path', `/servers/${serverId}`)
        formData.append('files', jarFile)

        const uploadRes = await fetch(`/api/servers/${serverId}/files/upload`, {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const uploadData = await uploadRes.json()
          throw new Error(uploadData.error || 'Failed to upload JAR')
        }
      }

      setStep('done')
      setProgress('Server created successfully!')

      if (onCreated) onCreated()

      // Redirect to new server
      setTimeout(() => {
        router.push(`/servers/${serverId}`)
        onClose()
      }, 1000)
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
        background: '#00000080',
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
          width: '400px',
          color: 'white',
        }}
      >
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
          New Server
        </h2>
        <p style={{ color: '#876f86', marginBottom: '24px', fontSize: '14px' }}>
          Create a new Minecraft server on your remote host
        </p>

        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <p style={{ color: '#22c55e', fontWeight: '700' }}>{progress}</p>
            <p style={{ color: '#876f86', fontSize: '13px', marginTop: '8px' }}>Redirecting to server...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Server name */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  color: '#fd87f6',
                  fontWeight: '700',
                  fontSize: '16px',
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                Server Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="my-server"
                disabled={isLoading}
                pattern="[a-zA-Z0-9_-]+"
                required
                style={{
                  background: '#61475f',
                  border: '1px solid #000',
                  borderRadius: '10px',
                  color: 'white',
                  padding: '10px 14px',
                  fontSize: '16px',
                  width: '100%',
                  outline: 'none',
                }}
              />
              <p style={{ color: '#876f86', fontSize: '12px', marginTop: '4px' }}>
                Letters, numbers, hyphens, underscores only
              </p>
            </div>

            {/* JAR file */}
            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  color: '#fd87f6',
                  fontWeight: '700',
                  fontSize: '16px',
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                Server JAR (optional)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: '#61475f',
                  border: '1px dashed #876f86',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: jarFile ? '#22c55e' : '#876f86',
                }}
              >
                {jarFile ? `✅ ${jarFile.name}` : 'Click to select a .jar file'}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jar"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setJarFile(e.target.files[0])
                  }
                }}
              />
            </div>

            {/* Progress */}
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
                {progress}
              </div>
            )}

            {/* Error */}
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
                  border: '1px solid #876f86',
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
                disabled={isLoading}
                style={{
                  flex: 2,
                  background: isLoading ? '#16a34a99' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '8px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '15px',
                }}
              >
                {isLoading ? (step === 'uploading' ? 'Uploading...' : 'Creating...') : 'Create Server'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
