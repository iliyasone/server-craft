'use client'

import { useState } from 'react'
import NewServerModal from './NewServerModal'

export default function DashboardEmpty() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ color: 'white' }}
    >
      <div
        style={{
          background: '#300a2e',
          border: '1px solid #fd87f6',
          borderRadius: '24px',
          padding: '48px',
          textAlign: 'center',
          maxWidth: '480px',
        }}
      >
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>⛏️</div>
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>
          No servers yet
        </h2>
        <p style={{ color: '#876f86', marginBottom: '32px', lineHeight: 1.6 }}>
          Create your first Minecraft server to get started. Upload a JAR file
          and launch it right here.
        </p>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: '#22c55e',
            color: 'white',
            padding: '12px 32px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: '700',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          + Create your first server
        </button>
      </div>

      {showModal && <NewServerModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
