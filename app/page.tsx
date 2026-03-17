'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [host, setHost] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      router.push('/dashboard')
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
        style={{ fontSize: '80px', lineHeight: 1.1 }}
      >
        Server Craft
      </h1>

      {/* Card */}
      <div
        style={{
          background: '#300a2e',
          border: '1px solid #fd87f6',
          borderRadius: '51px',
          width: '416px',
          minHeight: '589px',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2
          className="text-white font-black text-center mb-2"
          style={{ fontSize: '40px' }}
        >
          Login
        </h2>

        <p
          className="text-center mb-6"
          style={{ color: '#876f86', fontSize: '14px', lineHeight: 1.5 }}
        >
          Enter your server SSH credentials to manage your Minecraft servers
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* IP Address */}
          <div>
            <label
              style={{
                color: '#fd87f6',
                fontSize: '20px',
                fontWeight: '700',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              IP address
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.1"
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
          </div>

          {/* User */}
          <div>
            <label
              style={{
                color: '#fd87f6',
                fontSize: '20px',
                fontWeight: '700',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              User
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
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
          </div>

          {/* Password */}
          <div>
            <label
              style={{
                color: '#fd87f6',
                fontSize: '20px',
                fontWeight: '700',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
          </div>

          {error && (
            <p style={{ color: '#f87171', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </p>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#16a34a99' : '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '18px',
              fontWeight: '700',
              width: '100%',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Connecting...' : 'Login'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-4 mt-6"
        style={{ color: '#876f86', fontSize: '14px' }}
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
