'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import NewServerModal from './NewServerModal'

interface Server {
  id: string
  name: string
  status: 'running' | 'stopped'
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [servers, setServers] = useState<Server[]>([])
  const [showNewServer, setShowNewServer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch('/api/servers')
      if (res.ok) {
        const data = await res.json()
        setServers(data.servers || [])
      }
    } catch {}
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 5000)

    // Get username for root terminal link
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (d.username) setUsername(d.username) })
      .catch(() => {})

    return () => clearInterval(interval)
  }, [fetchServers])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const activeId = pathname.startsWith('/servers/')
    ? pathname.split('/servers/')[1]?.split('/')[0]
    : undefined
  const onTerminal = pathname === '/terminal'

  return (
    <>
      <aside
        style={{
          background: '#300a2e',
          width: '220px',
          minWidth: '220px',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #fd87f640',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px 12px' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <h1
              className="font-title"
              style={{ color: 'white', fontSize: '22px', margin: 0, lineHeight: 1.2 }}
            >
              ServerCraft
            </h1>
          </Link>
        </div>

        {/* New Server button */}
        <div style={{ padding: '0 10px 12px' }}>
          <button
            onClick={() => setShowNewServer(true)}
            style={{
              background: '#fd87f6',
              color: '#20141f',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 14px',
              width: '100%',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
            }}
          >
            + New Server
          </button>
        </div>

        <div style={{ padding: '0 12px', marginBottom: '6px' }}>
          <span style={{ color: '#61475f', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Servers
          </span>
        </div>

        {/* Server list */}
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {loading ? (
            <div style={{ color: '#61475f', padding: '8px 12px', fontSize: '13px' }}>Loading…</div>
          ) : servers.length === 0 ? (
            <div style={{ color: '#61475f', padding: '8px 12px', fontSize: '13px' }}>No servers yet</div>
          ) : (
            servers.map((server) => (
              <Link
                key={server.id}
                href={`/servers/${server.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: activeId === server.id ? 'white' : '#d4b8d4',
                  background: activeId === server.id ? '#fd87f618' : 'transparent',
                  border: activeId === server.id ? '1px solid #fd87f630' : '1px solid transparent',
                  marginBottom: '2px',
                  fontSize: '14px',
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: server.status === 'running' ? '#22c55e' : '#61475f',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {server.name}
                </span>
              </Link>
            ))
          )}
        </nav>

        {/* Root Terminal (only for root/sudo users) */}
        {username === 'root' && (
          <div style={{ padding: '8px 10px' }}>
            <Link
              href="/terminal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                textDecoration: 'none',
                color: onTerminal ? 'white' : '#876f86',
                background: onTerminal ? '#fd87f618' : 'transparent',
                border: onTerminal ? '1px solid #fd87f630' : '1px solid transparent',
                fontSize: '13px',
              }}
            >
              <span>⌨</span>
              Root Terminal
            </Link>
          </div>
        )}

        {/* Logout */}
        <div style={{ padding: '8px 10px 16px' }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid #3d1f3b',
              color: '#61475f',
              borderRadius: '8px',
              padding: '7px 14px',
              width: '100%',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {showNewServer && (
        <NewServerModal
          onClose={() => setShowNewServer(false)}
          onCreated={() => {
            setShowNewServer(false)
            fetchServers()
          }}
        />
      )}
    </>
  )
}
