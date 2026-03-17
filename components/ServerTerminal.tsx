'use client'

import { useEffect, useRef } from 'react'

interface ServerTerminalProps {
  serverId: string
}

export default function ServerTerminal({ serverId }: ServerTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<{ fit: () => void } | null>(null)
  const sseRef = useRef<EventSource | null>(null)

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
        fontFamily: 'monospace',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 10000,
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

      // Handle user input
      terminal.onData((data: string) => {
        fetch(`/api/servers/${serverId}/terminal/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        }).catch(() => {})
      })

      // Connect SSE
      const sse = new EventSource(`/api/servers/${serverId}/terminal`)
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

    // Handle resize
    function handleResize() {
      fitAddonRef.current?.fit()
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
  }, [serverId])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#0d0d0d',
        overflow: 'hidden',
        height: '100%',
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
        }}
      />
    </div>
  )
}
