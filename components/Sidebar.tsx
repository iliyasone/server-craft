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
    return () => clearInterval(interval)
  }, [fetchServers])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const activeId = pathname.startsWith('/servers/')
    ? pathname.split('/servers/')[1]?.split('/')[0]
    : undefined

  return (
    <>
      <aside
        style={{
          background: '#300a2e',
          width: '240px',
          minWidth: '240px',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #fd87f680',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px' }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <h1
              className="font-title"
              style={{
                color: 'white',
                fontSize: '24px',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Server Craft
            </h1>
          </Link>
        </div>

        {/* New Server button */}
        <div style={{ padding: '0 12px 16px' }}>
          <button
            onClick={() => setShowNewServer(true)}
            style={{
              background: '#fd87f6',
              color: '#20141f',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              width: '100%',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            + new server
          </button>
        </div>

        <div style={{ padding: '0 12px', marginBottom: '8px' }}>
          <span style={{ color: '#876f86', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            All servers
          </span>
        </div>

        {/* Server list */}
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {loading ? (
            <div style={{ color: '#876f86', padding: '8px 12px', fontSize: '14px' }}>
              Loading...
            </div>
          ) : servers.length === 0 ? (
            <div style={{ color: '#876f86', padding: '8px 12px', fontSize: '14px' }}>
              No servers yet
            </div>
          ) : (
            servers.map((server) => (
              <Link
                key={server.id}
                href={`/servers/${server.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'white',
                  background: activeId === server.id ? '#fd87f620' : 'transparent',
                  border: activeId === server.id ? '1px solid #fd87f640' : '1px solid transparent',
                  marginBottom: '4px',
                  transition: 'background 0.15s',
                  fontSize: '15px',
                }}
              >
                {/* Status dot */}
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: server.status === 'running' ? '#22c55e' : '#6b7280',
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

        {/* Logout button */}
        <div style={{ padding: '16px 12px' }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid #876f86',
              color: '#876f86',
              borderRadius: '8px',
              padding: '8px 16px',
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
