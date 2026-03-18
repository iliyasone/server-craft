'use client'

import { useEffect, useRef } from 'react'

interface ServerTerminalProps {
  serverId: string
  terminalApiBase?: string // defaults to /api/servers/${serverId}/terminal
}

function normalizeWheelDelta(event: WheelEvent, rows: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * rows
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
    return event.deltaY / 16
  }
  return event.deltaY
}

export default function ServerTerminal({ serverId, terminalApiBase }: ServerTerminalProps) {
  const sseUrl = terminalApiBase ?? `/api/servers/${serverId}/terminal`
  const inputUrl = terminalApiBase ? `${terminalApiBase}/input` : `/api/servers/${serverId}/terminal/input`
  const termRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<{ fit: () => void } | null>(null)
  const sseRef = useRef<EventSource | null>(null)
  const wheelCarryRef = useRef(0)

  useEffect(() => {
    if (!termRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      const { Unicode11Addon } = await import('@xterm/addon-unicode11')

      terminal = new Terminal({
        theme: {
          background: '#0d0d0d',
          foreground: '#f8f8f2',
          cursor: '#fd87f6',
          selectionBackground: '#fd87f640',
        },
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 50000,
        scrollOnUserInput: false,
        smoothScrollDuration: 0,
        allowProposedApi: true,
      })

      const fitAddon = new FitAddon()
      fitAddonRef.current = fitAddon

      const unicode11 = new Unicode11Addon()
      terminal.loadAddon(unicode11)
      terminal.unicode.activeVersion = '11'

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())

      if (termRef.current) {
        terminal.open(termRef.current)
        fitAddon.fit()
      }

      xtermRef.current = terminal
      wheelCarryRef.current = 0

      // Keep mouse wheel for browser-side scrollback instead of passing it through
      // to tmux, which makes server terminal history unreadable in the panel.
      terminal.attachCustomWheelEventHandler((event: WheelEvent) => {
        if (event.ctrlKey) return true

        event.preventDefault()
        event.stopPropagation()

        wheelCarryRef.current += normalizeWheelDelta(event, terminal.rows || 24)
        const wholeLines = wheelCarryRef.current > 0
          ? Math.floor(wheelCarryRef.current)
          : Math.ceil(wheelCarryRef.current)

        if (wholeLines !== 0) {
          terminal.scrollLines(wholeLines)
          wheelCarryRef.current -= wholeLines
        }

        return false
      })

      // Handle user input
      terminal.onData((data: string) => {
        fetch(inputUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        }).catch(() => {})
      })

      // Connect SSE
      const sse = new EventSource(sseUrl)
      sseRef.current = sse

      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'history' || msg.type === 'data') {
            terminal.write(msg.data)
          }
        } catch {}
      }

      sse.onerror = () => {
        terminal.write('\r\n\x1b[33m[Connection lost. Reconnecting...]\x1b[0m\r\n')
      }
    }

    init()

    // Handle resize — sync terminal size to server
    const resizeUrl = terminalApiBase ? `${terminalApiBase}/resize` : `/api/servers/${serverId}/terminal/resize`
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    function handleResize() {
      if (!fitAddonRef.current || !xtermRef.current) return
      fitAddonRef.current.fit()
      const t = xtermRef.current
      const cols = t.cols
      const rows = t.rows
      if (cols && rows) {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          fetch(resizeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cols, rows }),
          }).catch(() => {})
        }, 150)
      }
    }
    const resizeObserver = new ResizeObserver(handleResize)
    if (termRef.current) resizeObserver.observe(termRef.current)
    window.addEventListener('resize', handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      sseRef.current?.close()
      xtermRef.current?.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, sseUrl, inputUrl])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#0d0d0d',
        overflow: 'hidden',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        style={{
          background: '#1a0a1a',
          borderBottom: '1px solid #fd87f640',
          padding: '6px 12px',
          fontSize: '12px',
          color: '#876f86',
          flexShrink: 0,
        }}
      >
        Terminal — {serverId}
      </div>
      <div
        ref={termRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '4px',
          minHeight: 0,
          minWidth: 0,
        }}
      />
    </div>
  )
}
