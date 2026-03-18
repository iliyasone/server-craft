'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SetupStep {
  step: string
  status: 'checking' | 'installing' | 'done' | 'skip'
  detail?: string
}

const STEP_LABELS: Record<string, string> = {
  directory: 'Server Directory',
  tmux: 'tmux (terminal multiplexer)',
  java: 'Java Runtime',
  complete: 'Setup Complete',
  error: 'Error',
}

export default function SetupClient() {
  const router = useRouter()
  const [steps, setSteps] = useState<SetupStep[]>([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sse = new EventSource('/api/setup')

    sse.onmessage = (event) => {
      try {
        const data: SetupStep = JSON.parse(event.data)

        if (data.step === 'complete') {
          setDone(true)
          sse.close()
          setTimeout(() => router.push('/dashboard'), 800)
          return
        }

        if (data.step === 'error') {
          setError(data.detail || 'Setup failed')
          sse.close()
          return
        }

        setSteps((prev) => {
          const existing = prev.findIndex((s) => s.step === data.step)
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = data
            return updated
          }
          return [...prev, data]
        })
      } catch {}
    }

    sse.onerror = () => {
      sse.close()
      if (!done) setError('Connection lost during setup')
    }

    return () => sse.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#20141f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
      }}
    >
      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
        Setting up server environment
      </h1>
      <p style={{ color: '#876f86', fontSize: '14px', marginBottom: '32px' }}>
        Installing required dependencies...
      </p>

      <div
        style={{
          background: '#300a2e',
          border: '1px solid #fd87f640',
          borderRadius: '16px',
          padding: '24px 32px',
          width: 'min(500px, 90vw)',
        }}
      >
        {steps.map((s) => (
          <div
            key={s.step}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 0',
              borderBottom: '1px solid #3d1f3b',
            }}
          >
            <div style={{ width: '20px', textAlign: 'center', fontSize: '14px' }}>
              {s.status === 'checking' && <span style={{ color: '#fbbf24' }}>...</span>}
              {s.status === 'installing' && (
                <span style={{ color: '#60a5fa', animation: 'pulse 1.5s infinite' }}>
                  {'>>'}
                </span>
              )}
              {s.status === 'done' && <span style={{ color: '#22c55e' }}>OK</span>}
              {s.status === 'skip' && <span style={{ color: '#6b7280' }}>--</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '600' }}>
                {STEP_LABELS[s.step] || s.step}
              </div>
              {s.detail && (
                <div style={{ fontSize: '12px', color: '#876f86', marginTop: '2px' }}>
                  {s.detail}
                </div>
              )}
            </div>
          </div>
        ))}

        {steps.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#876f86' }}>
            Connecting...
          </div>
        )}

        {done && (
          <div style={{ textAlign: 'center', padding: '16px 0 4px', color: '#22c55e', fontWeight: '600' }}>
            Redirecting to dashboard...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
            <div style={{ color: '#f87171', marginBottom: '12px' }}>{error}</div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#fd87f6',
                color: '#1a0a1a',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 20px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
