'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import FileExplorer from '@/components/FileExplorer'
import ServerStats from '@/components/ServerStats'
import NotionTimer from '@/components/NotionTimer'
import NewServerModal from '@/components/NewServerModal'

const ServerTerminal = dynamic(() => import('@/components/ServerTerminal'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        background: '#000',
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#876f86',
      }}
    >
      Loading terminal...
    </div>
  ),
})

interface NotionStatusData {
  checkedToday: boolean
  checkedYesterday: boolean
  shutdownAt: string
  timeUntilShutdown: number
  streak: number
  canStart: boolean
  isLimited: boolean
}

interface ServerPageClientProps {
  id: string
  host: string
}

export default function ServerPageClient({ id, host }: ServerPageClientProps) {
  const [status, setStatus] = useState<'running' | 'stopped'>('stopped')
  const [uptime, setUptime] = useState<string | null>(null)
  const [notionStatus, setNotionStatus] = useState<NotionStatusData | null>(null)
  const [isLimited, setIsLimited] = useState(false)
  const [showNewServer, setShowNewServer] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${id}/status`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data.status)
        setUptime(data.uptime)
      }
    } catch {}
  }, [id])

  const fetchNotionStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/notion/status?ip=${encodeURIComponent(host)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.status) {
          setNotionStatus(data.status)
          setIsLimited(data.status.isLimited)
        }
      }
    } catch {}
  }, [host])

  useEffect(() => {
    fetchStatus()
    fetchNotionStatus()
    const statusInterval = setInterval(fetchStatus, 5000)
    const notionInterval = setInterval(fetchNotionStatus, 60000)
    return () => {
      clearInterval(statusInterval)
      clearInterval(notionInterval)
    }
  }, [fetchStatus, fetchNotionStatus])

  async function handleStart() {
    setActionLoading(true)
    try {
      await fetch(`/api/servers/${id}/start`, { method: 'POST' })
      await fetchStatus()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleStop() {
    setActionLoading(true)
    try {
      await fetch(`/api/servers/${id}/stop`, { method: 'POST' })
      setTimeout(fetchStatus, 2000)
    } finally {
      setActionLoading(false)
    }
  }

  const isRunning = status === 'running'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        color: 'white',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          background: '#300a2e',
          borderBottom: '1px solid #fd87f6',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <h1 className="font-title" style={{ fontSize: '28px', margin: 0 }}>
          {id}
        </h1>

        {/* Status badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: isRunning ? '#14532d55' : '#3f3f4655',
            border: `1px solid ${isRunning ? '#22c55e' : '#6b7280'}`,
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isRunning ? '#22c55e' : '#6b7280',
            }}
          />
          {isRunning ? 'Running' : 'Stopped'}
        </div>

        {uptime && isRunning && (
          <span style={{ color: '#876f86', fontSize: '13px' }}>up {uptime}</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowNewServer(true)}
            style={{
              background: 'transparent',
              border: '1px solid #fd87f6',
              color: '#fd87f6',
              padding: '6px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            + New Server
          </button>

          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '8px',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? '...' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              style={{
                background: '#22c55e',
                color: 'white',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '8px',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? '...' : 'Start'}
            </button>
          )}
        </div>
      </div>

      {/* Notion Timer (if limited) */}
      {isLimited && notionStatus && (
        <NotionTimer
          notionStatus={notionStatus}
          onRefresh={fetchNotionStatus}
        />
      )}

      {/* Main content: Terminal + File Explorer */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Terminal (60%) */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ServerTerminal serverId={id} />
        </div>

        {/* Right panel (40%) */}
        <div
          style={{
            flex: '0 0 40%',
            borderLeft: '1px solid #fd87f6',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ServerStats
            serverId={id}
            status={status}
            uptime={uptime}
            onStart={handleStart}
            onStop={handleStop}
            actionLoading={actionLoading}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <FileExplorer serverId={id} />
          </div>
        </div>
      </div>

      {showNewServer && (
        <NewServerModal onClose={() => setShowNewServer(false)} />
      )}
    </div>
  )
}
