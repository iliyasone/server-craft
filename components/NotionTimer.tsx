'use client'

import { useState, useEffect, useRef } from 'react'

interface NotionEntry {
  date: string
  checked: boolean
  notes?: string
}

interface NotionStatusData {
  checkedToday: boolean
  checkedYesterday: boolean
  shutdownAt: string
  timeUntilShutdown: number
  streak: number
  canStart: boolean
  isLimited: boolean
  entries?: NotionEntry[]
}

interface NotionTimerProps {
  notionStatus: NotionStatusData
  onRefresh: () => void
}

const MOTIVATIONAL_MESSAGES = [
  'Keep going!',
  "You're on fire! 🔥",
  'Consistency wins.',
  'Unstoppable!',
  'Build that habit!',
  'Legend in progress.',
  'Day by day.',
  'Iron will!',
  'No days off!',
  'Absolute monster!',
]

function formatTimeUntil(ms: number): string {
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const s = Math.floor((abs % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function CalendarModal({
  entries,
  onClose,
}: {
  entries: NotionEntry[]
  onClose: () => void
}) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const entryMap = new Map(entries.map((e) => [e.date, e]))

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()

  // Show last 3 months
  const months = [-2, -1, 0].map((offset) => {
    const d = new Date(Date.UTC(year, month + offset, 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
  })

  function getDaysInMonth(y: number, m: number) {
    return new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  }

  function getFirstDayOfWeek(y: number, m: number) {
    const day = new Date(Date.UTC(y, m, 1)).getUTCDay()
    return day === 0 ? 6 : day - 1 // Mon=0
  }

  const todayKey = now.toISOString().slice(0, 10)

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#00000070',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        style={{
          background: '#300a2e',
          border: '1px solid #fd87f6',
          borderRadius: '20px',
          padding: '32px',
          width: 'min(700px, 95vw)',
          color: 'white',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Training Calendar</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#876f86', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {months.map(({ year: y, month: m }) => {
            const daysInMonth = getDaysInMonth(y, m)
            const firstDay = getFirstDayOfWeek(y, m)
            const monthName = new Date(Date.UTC(y, m, 1)).toLocaleString('default', { month: 'long', year: 'numeric' })

            return (
              <div key={`${y}-${m}`} style={{ flex: '1', minWidth: '180px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fd87f6', marginBottom: '10px', textAlign: 'center' }}>
                  {monthName}
                </div>
                {/* Weekday headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: '10px', color: '#61475f', padding: '2px' }}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* Days grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                  {/* Empty cells before first day */}
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {/* Day cells */}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const entry = entryMap.get(dateKey)
                    const isToday = dateKey === todayKey
                    const isFuture = dateKey > todayKey

                    return (
                      <div
                        key={day}
                        title={entry?.notes || undefined}
                        onMouseEnter={(e) => {
                          if (entry?.notes) {
                            setTooltip({
                              text: entry.notes,
                              x: e.clientX,
                              y: e.clientY,
                            })
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          aspectRatio: '1',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: isToday ? '700' : '400',
                          background: entry?.checked
                            ? '#22c55e'
                            : entry
                            ? '#dc262630'
                            : 'transparent',
                          color: entry?.checked
                            ? 'white'
                            : isFuture
                            ? '#3d1f3b'
                            : isToday
                            ? '#fd87f6'
                            : '#876f86',
                          outline: isToday ? '1px solid #fd87f6' : 'none',
                          cursor: entry?.notes ? 'help' : 'default',
                          opacity: isFuture ? 0.3 : 1,
                        }}
                      >
                        {day}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '16px', fontSize: '12px', color: '#876f86' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '3px', display: 'inline-block' }} />
            Completed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', background: '#dc262630', borderRadius: '3px', display: 'inline-block' }} />
            Missed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', outline: '1px solid #fd87f6', borderRadius: '3px', display: 'inline-block' }} />
            Today
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            background: '#1a0a1a',
            border: '1px solid #fd87f640',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '12px',
            color: 'white',
            maxWidth: '200px',
            pointerEvents: 'none',
            zIndex: 300,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

export default function NotionTimer({ notionStatus, onRefresh }: NotionTimerProps) {
  const [timeLeft, setTimeLeft] = useState(notionStatus.timeUntilShutdown)
  const [showCalendar, setShowCalendar] = useState(false)
  const shutdownAt = new Date(notionStatus.shutdownAt)

  useEffect(() => {
    setTimeLeft(shutdownAt.getTime() - Date.now())
    const interval = setInterval(() => {
      setTimeLeft(shutdownAt.getTime() - Date.now())
    }, 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionStatus.shutdownAt])

  const isPast = timeLeft < 0
  const isDisabled = !notionStatus.canStart
  const isUrgent = !isPast && timeLeft < 18 * 60 * 60 * 1000
  const color = isDisabled || isPast ? '#f87171' : isUrgent ? '#fbbf24' : '#22c55e'

  const streak = notionStatus.streak
  const message = streak > 1 ? MOTIVATIONAL_MESSAGES[streak % MOTIVATIONAL_MESSAGES.length] : null

  return (
    <>
      <div
        style={{
          background: `${color}12`,
          borderBottom: `1px solid ${color}40`,
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {/* Countdown (clickable → calendar) */}
        <button
          onClick={() => setShowCalendar(true)}
          title="View training calendar"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: 0,
          }}
        >
          <span style={{ color: '#876f86', fontSize: '12px' }}>
            {isDisabled ? '🚫 Servers locked' : isPast ? 'Should have shut down' : 'Shutdown in'}
          </span>
          <span
            style={{
              color,
              fontWeight: '700',
              fontSize: '15px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isDisabled
              ? 'No recent workout'
              : isPast
              ? `${formatTimeUntil(timeLeft)} ago`
              : formatTimeUntil(timeLeft)}
          </span>
          <span style={{ color: '#61475f', fontSize: '11px' }}>📅</span>
        </button>

        {/* Streak */}
        {streak > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: '#fbbf24' }}>🔥 {streak} day{streak !== 1 ? 's' : ''} streak!</span>
            {message && <span style={{ color: '#61475f', fontSize: '12px' }}>{message}</span>}
          </div>
        )}

        {!notionStatus.checkedToday && notionStatus.canStart && (
          <span style={{ color: '#fbbf24', fontSize: '12px' }}>
            ⚠ Today&apos;s workout not logged
          </span>
        )}

        <button
          onClick={onRefresh}
          title="Refresh"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: `1px solid ${color}40`,
            color,
            padding: '3px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          ↻
        </button>
      </div>

      {showCalendar && (
        <CalendarModal
          entries={notionStatus.entries ?? []}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </>
  )
}
