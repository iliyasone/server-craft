'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const router = useRouter()
  const [credential, setCredential] = useState('') // "user@host" format
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function parseCredential(value: string): { username: string; host: string } | null {
    const atIdx = value.lastIndexOf('@')
    if (atIdx < 1) return null
    const username = value.slice(0, atIdx).trim()
    const host = value.slice(atIdx + 1).trim()
    if (!username || !host) return null
    return { username, host }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const parsed = parseCredential(credential)
    if (!parsed) {
      setError('Enter credentials as user@host (e.g. root@192.168.1.1)')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: parsed.host, username: parsed.username, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.push('/setup')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: '#20141f' }}
    >
      {/* Title */}
      <h1
        className="font-title text-white mb-8 text-center"
        style={{ fontSize: '72px', lineHeight: 1.1, letterSpacing: '-1px' }}
      >
        ServerCraft
      </h1>

      {/* Card */}
      <div
        style={{
          background: '#300a2e',
          border: '1px solid #fd87f6',
          borderRadius: '32px',
          width: '400px',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2
          className="text-white font-bold text-center mb-1"
          style={{ fontSize: '28px' }}
        >
          Connect
        </h2>
        <p
          className="text-center mb-8"
          style={{ color: '#876f86', fontSize: '14px' }}
        >
          SSH into your Linux server
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* user@host */}
          <div>
            <label
              style={{ color: '#fd87f6', fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Server
            </label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="root@192.168.1.1"
              required
              style={{
                background: '#3d1f3b',
                border: '1px solid #61475f',
                borderRadius: '10px',
                color: 'white',
                padding: '11px 14px',
                fontSize: '15px',
                width: '100%',
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
          </div>

          {/* Password */}
          <div>
            <label
              style={{ color: '#fd87f6', fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Password
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                background: '#3d1f3b',
                border: '1px solid #61475f',
                borderRadius: '10px',
                color: 'white',
                padding: '11px 14px',
                fontSize: '15px',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#f87171', fontSize: '13px', textAlign: 'center', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#1a8a3e' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '13px',
              fontSize: '16px',
              fontWeight: '700',
              width: '100%',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '4px',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-4 mt-6"
        style={{ color: '#876f86', fontSize: '13px' }}
      >
        <span>by iliyasone 2026</span>
        <a
          href="https://github.com/iliyasone"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#fd87f6', textDecoration: 'none' }}
        >
          GitHub
        </a>
      </div>
    </div>
  )
}
