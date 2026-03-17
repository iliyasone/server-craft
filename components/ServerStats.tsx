'use client'

interface ServerStatsProps {
  serverId: string
  status: 'running' | 'stopped'
  uptime: string | null
  onStart: () => void
  onStop: () => void
  actionLoading: boolean
}

export default function ServerStats({
  serverId,
  status,
  uptime,
  onStart,
  onStop,
  actionLoading,
}: ServerStatsProps) {
  const isRunning = status === 'running'

  return (
    <div
      style={{
        background: '#1a0a1a',
        borderBottom: '1px solid #fd87f640',
        padding: '16px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '14px', color: '#876f86', marginBottom: '2px' }}>Server</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: 'white' }}>{serverId}</div>
        </div>

        {/* Status + Action button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: isRunning ? '#22c55e' : '#6b7280',
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

          <button
            onClick={isRunning ? onStop : onStart}
            disabled={actionLoading}
            style={{
              background: isRunning ? '#dc2626' : '#22c55e',
              color: 'white',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '8px',
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              fontWeight: '700',
              fontSize: '14px',
              opacity: actionLoading ? 0.7 : 1,
              minWidth: '80px',
            }}
          >
            {actionLoading ? '...' : (isRunning ? 'Stop' : 'Start')}
          </button>
        </div>
      </div>

      {uptime && isRunning && (
        <div
          style={{
            background: '#fd87f610',
            border: '1px solid #fd87f630',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <span style={{ color: '#876f86' }}>Uptime</span>
          <span style={{ color: '#fd87f6', fontWeight: '600' }}>{uptime}</span>
        </div>
      )}
    </div>
  )
}
