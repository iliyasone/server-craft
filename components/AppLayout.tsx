'use client'

import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import { useIsMobile } from '@/lib/useIsMobile'

export default function AppLayout({
  children,
  mainOverflow = 'hidden',
}: {
  children: React.ReactNode
  mainOverflow?: string
}) {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar on navigation (listen for popstate / route changes)
  useEffect(() => {
    if (!isMobile) return
    const close = () => setSidebarOpen(false)
    window.addEventListener('popstate', close)
    return () => window.removeEventListener('popstate', close)
  }, [isMobile])

  // Expose a global event so the server page can open sidebar
  useEffect(() => {
    const handler = () => setSidebarOpen(true)
    window.addEventListener('servercraft:open-sidebar', handler)
    return () => window.removeEventListener('servercraft:open-sidebar', handler)
  }, [])

  if (isMobile) {
    return (
      <div style={{ background: '#20141f', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: '#000000aa',
                zIndex: 90,
              }}
            />
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: '260px',
                zIndex: 100,
                boxShadow: '4px 0 24px #00000066',
              }}
            >
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* Mobile top bar with hamburger */}
        <div
          style={{
            background: '#300a2e',
            borderBottom: '1px solid #fd87f640',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fd87f6',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '2px 4px',
              lineHeight: 1,
            }}
            aria-label="Open sidebar"
          >
            ☰
          </button>
          <span
            className="font-title"
            style={{ color: 'white', fontSize: '17px', fontWeight: 700 }}
          >
            ServerCraft
          </span>
        </div>

        <main style={{ flex: 1, overflow: mainOverflow, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    )
  }

  // Desktop layout — unchanged
  return (
    <div className="flex min-h-screen" style={{ background: '#20141f' }}>
      <Sidebar />
      <main className="flex-1" style={{ overflow: mainOverflow }}>{children}</main>
    </div>
  )
}
