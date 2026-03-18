'use client'

import { useEffect, useRef } from 'react'

interface ServerTerminalProps {
  serverId: string
  terminalApiBase?: string
}

// Filter xterm.js terminal response sequences (DA responses, cursor reports, DCS)
// that get emitted via onData when the remote side queries the terminal
const TERMINAL_RESPONSE_RE = /\x1b\[[\?>]?[\d;]*c|\x1b\[\d+;\d+R|\x1bP[^\x1b]*\x1b\\/g

export default function ServerTerminal({ serverId, terminalApiBase }: ServerTerminalProps) {
  const sseUrl = terminalApiBase ?? `/api/servers/${serverId}/terminal`
  const inputUrl = terminalApiBase ? `${terminalApiBase}/input` : `/api/servers/${serverId}/terminal/input`
  const resizeUrl = terminalApiBase ? `${terminalApiBase}/resize` : `/api/servers/${serverId}/terminal/resize`
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!termRef.current) return
    const container = termRef.current

    // Disposed flag prevents stale async work after React strict-mode double-mount
    let disposed = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any = null
    let sse: EventSource | null = null
    let resizeObserver: ResizeObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    // Store handleResize so cleanup can remove the window listener
    let handleResize: (() => void) | null = null

    async function init() {
      const [
        { Terminal },
        { FitAddon },
        { WebLinksAddon },
        { Unicode11Addon },
      ] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
        import('@xterm/addon-unicode11'),
      ])

      // If cleanup already ran while we were loading, bail out
      if (disposed) return

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
        scrollback: 10000,
        allowProposedApi: true,
      })

      const fitAddon = new FitAddon()
      const unicode11 = new Unicode11Addon()
      terminal.loadAddon(unicode11)
      terminal.unicode.activeVersion = '11'
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())

      if (disposed) { terminal.dispose(); return }

      terminal.open(container)
      fitAddon.fit()

      // --- Input: send each keystroke immediately ---
      terminal.onData((data: string) => {
        if (disposed) return
        const filtered = data.replace(TERMINAL_RESPONSE_RE, '')
        if (!filtered) return
        fetch(inputUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: filtered }),
        }).catch(() => {})
      })

      // --- Output: SSE stream ---
      sse = new EventSource(sseUrl)
      sse.onmessage = (event) => {
        if (disposed) return
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'history' || msg.type === 'data') {
            terminal.write(msg.data)
          }
        } catch {}
      }
      sse.onerror = () => {
        if (disposed) return
        terminal.write('\r\n\x1b[33m[Connection lost. Reconnecting...]\x1b[0m\r\n')
      }

      // --- Resize: debounced fit + server sync ---
      handleResize = () => {
        if (disposed) return
        fitAddon.fit()
        const cols = terminal.cols
        const rows = terminal.rows
        if (cols && rows) {
          if (resizeTimer) clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => {
            if (disposed) return
            fetch(resizeUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cols, rows }),
            }).catch(() => {})
          }, 200)
        }
      }

      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
      window.addEventListener('resize', handleResize)
    }

    init()

    return () => {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      if (resizeObserver) resizeObserver.disconnect()
      if (handleResize) window.removeEventListener('resize', handleResize)
      sse?.close()
      terminal?.dispose()
    }
  }, [serverId, sseUrl, inputUrl, resizeUrl])

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
