'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from 'rivetkit/client'
import { formatTerminalError, type TerminalBootstrap } from '@/lib/terminal-rivet'
import type { registry } from '@/rivet/registry'

interface ServerTerminalProps {
  serverId: string
  terminalApiBase?: string
}

function createBrowserRivetClient() {
  return createClient<typeof registry>({
    endpoint: new URL('/api/rivet', window.location.origin).toString(),
    devtools: false,
  })
}

// Filter xterm.js terminal response sequences (DA responses, cursor reports, DCS)
// that get emitted via onData when the remote side queries the terminal
const TERMINAL_RESPONSE_RE = /\x1b\[[\?>]?[\d;]*c|\x1b\[\d+;\d+R|\x1bP[^\x1b]*\x1b\\/g

export default function ServerTerminal({ serverId, terminalApiBase }: ServerTerminalProps) {
  const sessionEndpoint = terminalApiBase
    ? `${terminalApiBase}/session`
    : `/api/servers/${encodeURIComponent(serverId)}/terminal/session`
  const termRef = useRef<HTMLDivElement>(null)
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!termRef.current) return
    const container = termRef.current

    // Disposed flag prevents stale async work after React strict-mode double-mount
    let disposed = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let terminal: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let connection: any = null
    const rivetClient = createBrowserRivetClient()
    let resizeObserver: ResizeObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    // Store handleResize so cleanup can remove the window listener
    let handleResize: (() => void) | null = null
    let handlePointerUp: (() => void) | null = null
    let handleKeyUp: (() => void) | null = null
    let handleServerDeleting: ((event: Event) => void) | null = null
    let handleDocumentCopy: ((event: ClipboardEvent) => void) | null = null
    let handleDocumentPaste: ((event: ClipboardEvent) => void) | null = null
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null
    let selectionChanged = false
    let reconnectNoticeShown = false
    const connectionCleanup = new Set<() => void>()

    function setClipboardFeedback(message: string) {
      setClipboardStatus(message)
      if (feedbackTimer) clearTimeout(feedbackTimer)
      feedbackTimer = setTimeout(() => {
        setClipboardStatus(null)
      }, 1800)
    }

    async function writeTextToClipboard(text: string): Promise<boolean> {
      if (!text) return false

      if (window.isSecureContext && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          return true
        } catch {}
      }

      return false
    }

    function triggerNativeCopy(): boolean {
      try {
        return document.execCommand('copy')
      } catch {
        return false
      }
    }

    async function copySelectionToClipboard(mode: 'auto' | 'manual') {
      if (!terminal || !terminal.hasSelection()) return false

      const selection = terminal.getSelection()
      if (!selection) return false

      const copied = await writeTextToClipboard(selection)
      if (copied) {
        setClipboardFeedback('Copied')
        return true
      }

      if (mode === 'manual' && triggerNativeCopy()) {
        return true
      }

      if (mode === 'manual') {
        setClipboardFeedback('Copy blocked by browser')
      }
      return false
    }

    async function pasteFromClipboard() {
      if (!terminal) return false

      if (!window.isSecureContext || !navigator.clipboard?.readText) {
        setClipboardFeedback('Use browser paste')
        return false
      }

      try {
        const text = await navigator.clipboard.readText()
        if (!text) return false

        terminal.paste(text)
        setClipboardFeedback('Pasted')
        return true
      } catch {
        setClipboardFeedback('Paste blocked by browser')
        return false
      }
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

    function disposeConnection() {
      for (const cleanup of connectionCleanup) {
        cleanup()
      }
      connectionCleanup.clear()

      if (!connection) return
      const current = connection
      connection = null
      void current.dispose?.()
    }

    function stopTerminalForDelete() {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      if (feedbackTimer) clearTimeout(feedbackTimer)
      if (resizeObserver) resizeObserver.disconnect()
      if (handleResize) window.removeEventListener('resize', handleResize)
      if (handlePointerUp) window.removeEventListener('pointerup', handlePointerUp)
      if (handleKeyUp) window.removeEventListener('keyup', handleKeyUp)
      if (handleDocumentCopy) document.removeEventListener('copy', handleDocumentCopy)
      if (handleDocumentPaste) document.removeEventListener('paste', handleDocumentPaste)
      disposeConnection()
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

        if (withTerminalModifier && key === 'c' && terminal.hasSelection()) {
          event.preventDefault()
          void copySelectionToClipboard('manual')
          return false
        }

        if (withTerminalModifier && event.shiftKey && key === 'v') {
          event.preventDefault()
          void pasteFromClipboard()
          return false
        }

        return true
      })

      terminal.onData((data: string) => {
        if (disposed || !connection || connection.connStatus !== 'connected') return
        const filtered = data.replace(TERMINAL_RESPONSE_RE, '')
        if (!filtered) return
        void connection.input(filtered).catch(() => {})
      })

      terminal.onBinary((data: string) => {
        if (disposed || !connection || connection.connStatus !== 'connected') return
        void connection.binary(btoa(data)).catch(() => {})
      })

      terminal.onSelectionChange(() => {
        const nextHasSelection = terminal.hasSelection()

        if (!nextHasSelection) {
          selectionChanged = false
          return
        }

        selectionChanged = true
      })

      try {
        const response = await fetch(sessionEndpoint, {
          method: 'POST',
          cache: 'no-store',
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            typeof error?.error === 'string' ? error.error : 'Failed to start terminal session'
          )
        }

        const bootstrap = await response.json() as TerminalBootstrap
        if (disposed) return

        const terminalActor = rivetClient.terminal.getOrCreate(bootstrap.actorKey, {
          createWithInput: {
            session: bootstrap.session,
            target: bootstrap.target,
          },
          getParams: async () => ({
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        })

        connection = terminalActor.connect()

        connectionCleanup.add(connection.on('data', (payload: { data?: string }) => {
          if (disposed || typeof payload?.data !== 'string') return
          terminal.write(payload.data)
        }))

        connectionCleanup.add(connection.onOpen(() => {
          if (disposed || !connection) return
          reconnectNoticeShown = false
          terminal.reset()
          terminal.focus()
          void connection.resize(terminal.cols, terminal.rows).catch(() => {})
        }))

        connectionCleanup.add(connection.onClose(() => {
          if (disposed || reconnectNoticeShown) return
          reconnectNoticeShown = true
          terminal.write('\r\n\x1b[33m[Connection lost. Reconnecting...]\x1b[0m\r\n')
        }))

        connectionCleanup.add(connection.onError(() => {}))
      } catch (error) {
        if (disposed) return
        const message = error instanceof Error ? error.message : 'Terminal connection failed'
        terminal.write(formatTerminalError(message))
      }

      // --- Resize: debounced fit + server sync over the actor connection ---
      handleResize = () => {
        if (disposed) return
        fitAddon.fit()
        const cols = terminal.cols
        const rows = terminal.rows
        if (cols && rows) {
          if (resizeTimer) clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => {
            if (disposed || !connection) return
            void connection.resize(cols, rows).catch(() => {})
          }, 200)
        }
      }

      resizeObserver = new ResizeObserver(handleResize)
      resizeObserver.observe(container)
      window.addEventListener('resize', handleResize)

      handlePointerUp = () => {
        if (!selectionChanged) return
        selectionChanged = false
        void copySelectionToClipboard('auto')
      }
      handleKeyUp = () => {
        if (!selectionChanged) return
        selectionChanged = false
        void copySelectionToClipboard('auto')
      }

      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('keyup', handleKeyUp)

      handleDocumentCopy = (event: ClipboardEvent) => {
        if (!terminal?.hasSelection()) return

        const eventTarget = event.target as Node | null
        const activeElement = document.activeElement
        const isTerminalContext =
          (eventTarget ? container.contains(eventTarget) : false) ||
          (activeElement ? container.contains(activeElement) : false)

        if (!isTerminalContext) return

        const selection = terminal.getSelection()
        if (!selection) return

        event.preventDefault()
        event.clipboardData?.setData('text/plain', selection)
        setClipboardFeedback('Copied')
      }

      handleDocumentPaste = (event: ClipboardEvent) => {
        if (!terminal) return

        const eventTarget = event.target as Node | null
        const activeElement = document.activeElement
        const isTerminalContext =
          (eventTarget ? container.contains(eventTarget) : false) ||
          (activeElement ? container.contains(activeElement) : false)

        if (!isTerminalContext) return

        const text = event.clipboardData?.getData('text/plain')
        if (!text) return

        event.preventDefault()
        terminal.paste(text)
        setClipboardFeedback('Pasted')
      }

      document.addEventListener('copy', handleDocumentCopy)
      document.addEventListener('paste', handleDocumentPaste)

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
  }, [serverId, sessionEndpoint])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '11px', color: clipboardStatus ? '#fd87f6' : '#61475f', textAlign: 'right' }}>
            {clipboardStatus || 'Hold Shift while selecting to copy terminal text'}
          </span>
        </div>
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
