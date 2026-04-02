'use client'

import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Keep menu in viewport
  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${x - rect.width}px`
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${y - rect.height}px`
    }
  }, [x, y])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        minWidth: '180px',
        background: '#1a0a1a',
        border: '1px solid #61475f70',
        borderRadius: '10px',
        boxShadow: '0 8px 24px #00000066',
        zIndex: 300,
        padding: '5px',
        overflow: 'hidden',
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            if (!item.disabled) {
              item.onClick()
              onClose()
            }
          }}
          disabled={item.disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            color: item.disabled ? '#61475f' : item.danger ? '#f87171' : 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '13px',
            cursor: item.disabled ? 'default' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) (e.currentTarget.style.background = item.danger ? '#dc262625' : '#fd87f615')
          }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {item.icon && <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
