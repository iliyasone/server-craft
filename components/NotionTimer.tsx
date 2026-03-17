'use client'

import { useState, useEffect } from 'react'

interface NotionStatusData {
  checkedToday: boolean
  checkedYesterday: boolean
  shutdownAt: string
  timeUntilShutdown: number
  streak: number
  canStart: boolean
  isLimited: boolean
}

interface NotionTimerProps {
  notionStatus: NotionStatusData
  onRefresh: () => void
}

const MOTIVATIONAL_MESSAGES = [
  "Keep it up! Every day counts.",
  "You're on a roll! Don't stop now.",
  "Consistency is the key to success!",
  "Amazing dedication! Keep going.",
  "You're building great habits!",
  "Incredible streak! Stay strong.",
  "One day at a time. You've got this!",
  "Your dedication is inspiring!",
  "Legend status incoming!",
  "Absolutely unstoppable!",
]

function formatTimeUntil(ms: number): string {
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / (1000 * 60 * 60))
  const minutes = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((abs % (1000 * 60)) / 1000)

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export default function NotionTimer({ notionStatus, onRefresh }: NotionTimerProps) {
  const [timeLeft, setTimeLeft] = useState(notionStatus.timeUntilShutdown)
  const shutdownAt = new Date(notionStatus.shutdownAt)

  useEffect(() => {
    setTimeLeft(shutdownAt.getTime() - Date.now())
    const interval = setInterval(() => {
      setTimeLeft(shutdownAt.getTime() - Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [notionStatus.shutdownAt])

  const isPast = timeLeft < 0
  const isUrgent = !isPast && timeLeft < 18 * 60 * 60 * 1000 // < 18 hours
  const color = isPast ? '#f87171' : (isUrgent ? '#fbbf24' : '#22c55e')

  const streak = notionStatus.streak
  const message = streak > 0 ? MOTIVATIONAL_MESSAGES[streak % MOTIVATIONAL_MESSAGES.length] : null

  return (
    <div
      style={{
        background: `${color}15`,
        borderBottom: `1px solid ${color}50`,
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      {/* Countdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#876f86', fontSize: '13px' }}>
          {isPast ? 'Server should have shut down' : 'Shutdown in'}
        </span>
        <span
          style={{
            color,
            fontWeight: '700',
            fontSize: '16px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isPast ? `${formatTimeUntil(timeLeft)} ago` : formatTimeUntil(timeLeft)}
        </span>
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
          <span style={{ color: '#fbbf24' }}>{streak} days streak! 🔥</span>
          {message && (
            <span style={{ color: '#876f86', fontSize: '12px' }}>
              {message}
            </span>
          )}
        </div>
      )}

      {!notionStatus.checkedToday && (
        <div style={{ color: '#fbbf24', fontSize: '13px', marginLeft: 'auto' }}>
          ⚠️ Today&apos;s workout not checked
        </div>
      )}

      <button
        onClick={onRefresh}
        style={{
          background: 'transparent',
          border: `1px solid ${color}50`,
          color,
          padding: '3px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '11px',
          marginLeft: notionStatus.checkedToday ? 'auto' : '0',
        }}
      >
        Refresh
      </button>
    </div>
  )
}
