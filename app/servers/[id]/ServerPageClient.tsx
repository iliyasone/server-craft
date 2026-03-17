'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import FileExplorer from '@/components/FileExplorer'
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
      Loading terminal…
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
  entries?: Array<{ date: string; checked: boolean; notes?: string }>
}

interface ServerPageClientProps {
  id: string
  host: string
}

export default function ServerPageClient({ id, host }: ServerPageClientProps) {
  const [status, setStatus] = useState<'running' | 'stopped'>('stopped')
  const [uptime, setUptime] = useState<string | null>(null)
  const [notionStatus, setNotionStatus] = useState<NotionStatusData | null>(null)
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
        if (data.status) setNotionStatus(data.status)
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

  // canStart: if notion is configured and user is limited, check canStart flag
  const notionBlocked = notionStatus !== null && notionStatus.isLimited && !notionStatus.canStart

  async function handleStart() {
    if (notionBlocked) return
    setActionLoading(true)
    try {
      await fetch(`/api/servers/${id}/start`, { method: 'POST' })
      setTimeout(fetchStatus, 1500)
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
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '18px', fontWeight: '700' }}>{id}</span>

        {/* Status badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: isRunning ? '#14532d40' : '#3f3f4640',
            border: `1px solid ${isRunning ? '#22c55e' : '#6b7280'}`,
            borderRadius: '20px',
            padding: '3px 10px',
            fontSize: '12px',
          }}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: isRunning ? '#22c55e' : '#6b7280',
            }}
          />
          {isRunning ? 'Running' : 'Stopped'}
        </div>

        {uptime && isRunning && (
          <span style={{ color: '#876f86', fontSize: '12px' }}>up {uptime}</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowNewServer(true)}
            style={{
              background: 'transparent',
              border: '1px solid #fd87f6',
              color: '#fd87f6',
              padding: '5px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            + New
          </button>

          {isRunning ? (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              title="Send Ctrl+C to terminal"
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                padding: '7px 18px',
                borderRadius: '8px',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? '…' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading || notionBlocked}
              title={notionBlocked ? 'Blocked: no recent workout logged' : 'Start server'}
              style={{
                background: notionBlocked ? '#374151' : '#22c55e',
                color: 'white',
                border: 'none',
                padding: '7px 18px',
                borderRadius: '8px',
                cursor: actionLoading || notionBlocked ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '14px',
                opacity: actionLoading ? 0.7 : 1,
              }}
            >
              {actionLoading ? '…' : notionBlocked ? '🔒 Start' : 'Start'}
            </button>
          )}
        </div>
      </div>

      {/* Notion Timer — always visible if data available */}
      {notionStatus && (
        <NotionTimer notionStatus={notionStatus} onRefresh={fetchNotionStatus} />
      )}

      {/* Main content: Terminal + File Explorer */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Terminal (60%) */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ServerTerminal serverId={id} />
        </div>

        {/* File Explorer (40%) */}
        <div
          style={{
            flex: '0 0 40%',
            borderLeft: '1px solid #fd87f6',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <FileExplorer serverId={id} />
        </div>
      </div>

      {showNewServer && (
        <NewServerModal onClose={() => setShowNewServer(false)} />
      )}
    </div>
  )
}
