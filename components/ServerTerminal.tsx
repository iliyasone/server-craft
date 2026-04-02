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
  const wsPath = terminalApiBase
    ? `${terminalApiBase}/ws`
    : `/api/servers/${encodeURIComponent(serverId)}/terminal/ws`
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!termRef.current) return
    const container = termRef.current

    // Disposed flag prevents stale async work after React strict-mode double-mount
    let disposed = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any = null
    let socket: WebSocket | null = null
    let resizeObserver: ResizeObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectDelay = 1000
    // Store handleResize so cleanup can remove the window listener
    let handleResize: (() => void) | null = null
    let handlePointerUp: (() => void) | null = null
    let handleKeyUp: (() => void) | null = null
    let handleServerDeleting: ((event: Event) => void) | null = null
    let selectionChanged = false
    let lastCopiedSelection = ''

    async function copySelectionToClipboard() {
      if (
        !terminal ||
        !terminal.hasSelection() ||
        !window.isSecureContext ||
        !navigator.clipboard?.writeText
      ) {
        return
      }

      const selection = terminal.getSelection()
      if (!selection || selection === lastCopiedSelection) return

      try {
        await navigator.clipboard.writeText(selection)
        lastCopiedSelection = selection
      } catch {}
    }

    async function pasteFromClipboard() {
      if (!terminal || !window.isSecureContext || !navigator.clipboard?.readText) {
        return
      }

      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          terminal.paste(text)
        }
      } catch {}
    }

    function getWheelLineDelta(event: WheelEvent): number {
      if (!terminal) return 0

      let delta = event.deltaY
      if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        delta /= 40
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        delta *= terminal.rows
      }

      if (!Number.isFinite(delta) || delta === 0) return 0
      return delta > 0 ? Math.ceil(delta) : Math.floor(delta)
    }

    function createSocketUrl(cols: number, rows: number): string {
      const url = new URL(wsPath, window.location.origin)
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('cols', String(cols))
      url.searchParams.set('rows', String(rows))
      return url.toString()
    }

    function sendMessage(message: unknown) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify(message))
    }

    function closeSocket() {
      if (!socket) return
      const current = socket
      socket = null
      current.onopen = null
      current.onmessage = null
      current.onerror = null
      current.onclose = null
      if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
        current.close()
      }
    }

    function stopTerminalForDelete() {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (resizeObserver) resizeObserver.disconnect()
      if (handleResize) window.removeEventListener('resize', handleResize)
      if (handlePointerUp) window.removeEventListener('pointerup', handlePointerUp)
      if (handleKeyUp) window.removeEventListener('keyup', handleKeyUp)
      closeSocket()
      terminal?.dispose()
      terminal = null
    }

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

      terminal.attachCustomWheelEventHandler((event: WheelEvent) => {
        if (disposed || terminal.buffer.active.type !== 'normal') {
          return true
        }

        const lineDelta = getWheelLineDelta(event)
        if (lineDelta === 0) {
          return false
        }

        terminal.scrollLines(lineDelta)
        event.preventDefault()
        return false
      })

      terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type !== 'keydown') return true

        const key = event.key.toLowerCase()
        const withTerminalModifier = event.ctrlKey || event.metaKey

        if (withTerminalModifier && event.shiftKey && key === 'c') {
          event.preventDefault()
          void copySelectionToClipboard()
          return false
        }

        if (withTerminalModifier && event.shiftKey && key === 'v') {
          event.preventDefault()
          void pasteFromClipboard()
          return false
        }

        return true
      })

      const connect = () => {
        if (disposed) return
        closeSocket()

        const nextSocket = new WebSocket(createSocketUrl(terminal.cols, terminal.rows))
        socket = nextSocket

        nextSocket.onopen = () => {
          if (disposed || socket !== nextSocket) return
          reconnectDelay = 1000
          terminal.reset()
          terminal.focus()
          sendMessage({ type: 'resize', cols: terminal.cols, rows: terminal.rows })
        }

        nextSocket.onmessage = (event) => {
          if (disposed || socket !== nextSocket || typeof event.data !== 'string') return
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'data' && typeof msg.data === 'string') {
              terminal.write(msg.data)
            }
          } catch {}
        }

        nextSocket.onerror = () => {
          if (socket !== nextSocket) return
          try { nextSocket.close() } catch {}
        }

        nextSocket.onclose = () => {
          if (socket === nextSocket) {
            socket = null
          }
          if (disposed) return
          terminal.write('\r\n\x1b[33m[Connection lost. Reconnecting...]\x1b[0m\r\n')
          if (reconnectTimer) return
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (disposed) return
            connect()
          }, reconnectDelay)
          reconnectDelay = Math.min(reconnectDelay * 2, 5000)
        }
      }

      // --- Input: send each keystroke immediately over the same socket ---
      terminal.onData((data: string) => {
        if (disposed) return
        const filtered = data.replace(TERMINAL_RESPONSE_RE, '')
        if (!filtered) return
        sendMessage({ type: 'input', data: filtered })
      })

      terminal.onBinary((data: string) => {
        if (disposed) return
        sendMessage({ type: 'binary', data: btoa(data) })
      })

      terminal.onSelectionChange(() => {
        if (!terminal.hasSelection()) {
          selectionChanged = false
          lastCopiedSelection = ''
          return
        }

        selectionChanged = true
      })

      connect()

      // --- Resize: debounced fit + server sync over the same socket ---
      handleResize = () => {
        if (disposed) return
        fitAddon.fit()
        const cols = terminal.cols
        const rows = terminal.rows
        if (cols && rows) {
          if (resizeTimer) clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => {
            if (disposed) return
            sendMessage({ type: 'resize', cols, rows })
          }, 200)
        }
      }

      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
      window.addEventListener('resize', handleResize)

      handlePointerUp = () => {
        if (!selectionChanged) return
        selectionChanged = false
        void copySelectionToClipboard()
      }
      handleKeyUp = () => {
        if (!selectionChanged) return
        selectionChanged = false
        void copySelectionToClipboard()
      }

      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('keyup', handleKeyUp)

      handleServerDeleting = (event: Event) => {
        const customEvent = event as CustomEvent<{ serverId?: string }>
        if (customEvent.detail?.serverId !== serverId) return
        stopTerminalForDelete()
      }
      window.addEventListener('servercraft:server-deleting', handleServerDeleting)
    }

    init()

    return () => {
      if (handleServerDeleting) {
        window.removeEventListener('servercraft:server-deleting', handleServerDeleting)
      }
      stopTerminalForDelete()
    }
  }, [serverId, wsPath])

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
          color: '#876f86',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '12px' }}>Terminal — {serverId}</span>
        <span style={{ fontSize: '11px', color: '#61475f', textAlign: 'right' }}>
          Select to copy • Paste with Ctrl/Cmd+Shift+V
        </span>
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
