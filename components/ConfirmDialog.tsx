'use client'

import { useState, useRef, useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#00000088',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: '#300a2e',
          border: `1px solid ${danger ? '#dc2626' : '#fd87f6'}`,
          borderRadius: '16px',
          padding: '28px 32px',
          width: '380px',
          color: 'white',
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{title}</h3>
        <p style={{ color: '#876f86', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #61475f',
              color: '#876f86',
              padding: '9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              background: danger ? '#dc2626' : '#22c55e',
              color: 'white',
              border: 'none',
              padding: '9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '14px',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface DeleteServerDialogProps {
  serverName: string
  onConfirm: () => void
  onCancel: () => void
  deleting?: boolean
}

export function DeleteServerDialog({ serverName, onConfirm, onCancel, deleting }: DeleteServerDialogProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const canDelete = input === serverName

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#00000088',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel() }}
    >
      <div
        style={{
          background: '#300a2e',
          border: '1px solid #dc2626',
          borderRadius: '16px',
          padding: '28px 32px',
          width: '420px',
          color: 'white',
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#f87171' }}>
          Delete Server
        </h3>
        <p style={{ color: '#876f86', fontSize: '14px', marginBottom: '16px', lineHeight: 1.5 }}>
          This will permanently delete the server and all its files. This cannot be undone.
        </p>

        <p style={{ color: '#876f86', fontSize: '13px', marginBottom: '8px' }}>
          Type the server name to confirm:
        </p>
        <div
          style={{
            background: '#0d0d0d',
            border: '1px solid #61475f',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              color: '#fd87f6',
              fontFamily: 'monospace',
              fontSize: '14px',
              userSelect: 'text',
            }}
          >
            {serverName}
          </span>
        </div>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canDelete && !deleting) onConfirm()
            if (e.key === 'Escape' && !deleting) onCancel()
          }}
          placeholder={serverName}
          disabled={deleting}
          style={{
            width: '100%',
            background: '#3d1f3b',
            border: `1px solid ${canDelete ? '#dc2626' : '#61475f'}`,
            borderRadius: '8px',
            color: 'white',
            padding: '10px 14px',
            fontSize: '14px',
            fontFamily: 'monospace',
            outline: 'none',
            marginBottom: '20px',
          }}
        />

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #61475f',
              color: '#876f86',
              padding: '9px',
              borderRadius: '8px',
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canDelete || deleting}
            style={{
              flex: 1,
              background: canDelete ? '#dc2626' : '#dc262640',
              color: 'white',
              border: 'none',
              padding: '9px',
              borderRadius: '8px',
              cursor: canDelete && !deleting ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: '14px',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete Server'}
          </button>
        </div>
      </div>
    </div>
  )
}
