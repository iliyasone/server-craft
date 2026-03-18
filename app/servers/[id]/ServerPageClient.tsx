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

interface ServerInfo {
  type: 'forge' | 'vanilla' | 'unknown'
  jar: string | null
  hasRunSh: boolean
  needsInstall: boolean
  installCommand: string | null
  startCommand: string
}

interface ServerPageClientProps {
  id: string
  host: string
}

export default function ServerPageClient({ id, host }: ServerPageClientProps) {
  const [status, setStatus] = useState<'running' | 'starting' | 'stopped'>('stopped')
  const [uptime, setUptime] = useState<string | null>(null)
  const [notionStatus, setNotionStatus] = useState<NotionStatusData | null>(null)
  const [notionError, setNotionError] = useState<string | null>(null)
  const [showNewServer, setShowNewServer] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${id}/status`)
      if (res.ok) {
        const data = await res.json()
        setStatus(data.status === 'running' || data.status === 'starting' ? data.status : 'stopped')
        setUptime(data.uptime)
      }
    } catch {}
  }, [id])

  const fetchServerInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${id}/info`)
      if (res.ok) {
        setServerInfo(await res.json())
      }
    } catch {}
  }, [id])

  const fetchNotionStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/notion/status?ip=${encodeURIComponent(host)}`)
      const data = await res.json()
      if (res.ok) {
        if (data.status) {
          setNotionStatus(data.status)
          setNotionError(null)
        }
      } else if (data.error) {
        setNotionError(data.error)
      }
    } catch {}
  }, [host])

  useEffect(() => {
    fetchStatus()
    fetchServerInfo()
    fetchNotionStatus()
    const statusInterval = setInterval(fetchStatus, 5000)
    const notionInterval = setInterval(fetchNotionStatus, 60000)
    return () => {
      clearInterval(statusInterval)
      clearInterval(notionInterval)
    }
  }, [fetchStatus, fetchServerInfo, fetchNotionStatus])

  const notionBlocked = notionStatus !== null && notionStatus.isLimited && !notionStatus.canStart

  async function handleInstall() {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/servers/${id}/install`, { method: 'POST' })
      if (res.ok) {
        // Re-fetch info after install starts (it runs in terminal, takes time)
        setTimeout(fetchServerInfo, 3000)
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function handleStart() {
    if (notionBlocked) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/servers/${id}/start`, { method: 'POST' })
      if (res.ok) {
        setStatus('starting')
        setUptime(null)
        setTimeout(fetchStatus, 1500)
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function handleStop() {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/servers/${id}/stop`, { method: 'POST' })
      if (res.ok) {
        setTimeout(fetchStatus, 2000)
      }
    } finally {
      setActionLoading(false)
    }
  }

  const isRunning = status === 'running'
  const isStarting = status === 'starting'
  const isStarted = status !== 'stopped'
  const needsInstall = serverInfo?.needsInstall ?? false
  const statusLabel = isRunning ? 'Running' : isStarting ? 'Starting' : 'Stopped'
  const statusColor = isRunning ? '#22c55e' : isStarting ? '#f59e0b' : '#6b7280'
  const statusBackground = isRunning ? '#14532d40' : isStarting ? '#78350f40' : '#3f3f4640'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        color: 'white',
        minHeight: 0,
        minWidth: 0,
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

        {/* Server type badge */}
        {serverInfo && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: serverInfo.type === 'forge' ? '#7c3aed20' : '#06b6d420',
              border: `1px solid ${serverInfo.type === 'forge' ? '#7c3aed' : '#06b6d4'}`,
              color: serverInfo.type === 'forge' ? '#a78bfa' : '#67e8f9',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {serverInfo.type}
          </span>
        )}

        {/* Status badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: statusBackground,
            border: `1px solid ${statusColor}`,
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
              background: statusColor,
            }}
          />
          {statusLabel}
        </div>

        {uptime && isStarted && (
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

          {isStarted ? (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              title="Send Ctrl+C to the remote tmux session"
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
            <>
              {needsInstall && (
                <button
                  onClick={handleInstall}
                  disabled={actionLoading}
                  title={serverInfo?.installCommand ?? 'Install server'}
                  style={{
                    background: '#7c3aed',
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
                  {actionLoading ? '…' : 'Install'}
                </button>
              )}
              <button
                onClick={handleStart}
                disabled={actionLoading || notionBlocked}
                title={notionBlocked ? 'Blocked: no recent workout logged' : (serverInfo?.startCommand ?? 'Start server')}
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
            </>
          )}
        </div>
      </div>

      {/* Install info banner */}
      {needsInstall && serverInfo?.installCommand && !isStarted && (
        <div
          style={{
            background: '#7c3aed15',
            borderBottom: '1px solid #7c3aed40',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: '#a78bfa',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600 }}>Install needed:</span>
          <code
            style={{
              background: '#0d0d0d',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#e2e8f0',
            }}
          >
            {serverInfo.installCommand}
          </code>
        </div>
      )}

      {/* Start command preview */}
      {serverInfo && !needsInstall && !isStarted && (
        <div
          style={{
            background: '#22c55e10',
            borderBottom: '1px solid #22c55e30',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: '#86efac',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600 }}>Start command:</span>
          <code
            style={{
              background: '#0d0d0d',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#e2e8f0',
            }}
          >
            {serverInfo.startCommand}
          </code>
        </div>
      )}

      {/* Notion Timer */}
      {notionStatus && (
        <NotionTimer notionStatus={notionStatus} onRefresh={fetchNotionStatus} />
      )}

      {notionError && !notionStatus && (
        <div
          style={{
            background: '#f8717112',
            borderBottom: '1px solid #f8717140',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#f87171',
            flexShrink: 0,
          }}
        >
          <span>Notion: {notionError}</span>
          <button
            onClick={fetchNotionStatus}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid #f8717140',
              color: '#f87171',
              padding: '3px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content: Terminal + File Explorer */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
        {/* Terminal (60%) */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
          <ServerTerminal key={id} serverId={id} />
        </div>

        {/* File Explorer (40%) */}
        <div
          style={{
            flex: '0 0 40%',
            borderLeft: '1px solid #fd87f6',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <FileExplorer key={id} serverId={id} />
        </div>
      </div>

      {showNewServer && (
        <NewServerModal onClose={() => setShowNewServer(false)} />
      )}
    </div>
  )
}
