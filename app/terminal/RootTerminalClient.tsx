'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'

// Reuse ServerTerminal but with special session IDs pointing to root terminal API
const ServerTerminal = dynamic(() => import('@/components/ServerTerminal'), {
  ssr: false,
  loading: () => (
    <div style={{ background: '#000', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#876f86' }}>
      Loading terminal…
    </div>
  ),
})

export default function RootTerminalClient({ username }: { username: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#20141f', color: 'white' }}>
      {/* Header */}
      <div style={{ background: '#300a2e', borderBottom: '1px solid #fd87f6', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <Link href="/dashboard" style={{ color: '#fd87f6', textDecoration: 'none', fontSize: '13px' }}>
          ← Dashboard
        </Link>
        <span style={{ color: '#61475f' }}>|</span>
        <span style={{ fontSize: '14px', fontWeight: '600' }}>Root Terminal</span>
        <span style={{ color: '#876f86', fontSize: '12px' }}>({username}@server)</span>
      </div>

      {/* Terminal uses special "__root__" session */}
      <ServerTerminal serverId="__root__" terminalApiBase="/api/terminal" />
    </div>
  )
}
