'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface FileEditorProps {
  serverId: string
  filePath: string
  fileName: string
  onClose: () => void
}

function getLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    json: 'json',
    yml: 'yaml', yaml: 'yaml',
    toml: 'toml',
    properties: 'properties',
    cfg: 'properties', conf: 'properties', ini: 'properties',
    sh: 'shell', bash: 'shell',
    txt: 'text', md: 'text', log: 'text',
    xml: 'xml', html: 'xml',
    js: 'javascript', ts: 'javascript', mjs: 'javascript',
    py: 'python',
  }
  return map[ext] || 'text'
}

// Lightweight syntax highlighter
function highlightLine(text: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  if (lang === 'text') return esc(text)

  if (lang === 'json') {
    return esc(text)
      .replace(/("(?:[^"\\]|\\.)*")\s*:/g, '<span style="color:#fd87f6">$1</span>:')
      .replace(/:(\s*)("(?:[^"\\]|\\.)*")/g, ':$1<span style="color:#86efac">$2</span>')
      .replace(/:\s*(true|false|null)\b/g, ': <span style="color:#67e8f9">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*)/g, ': <span style="color:#fbbf24">$1</span>')
  }

  if (lang === 'yaml') {
    // Comment lines
    if (/^\s*#/.test(text)) return `<span style="color:#6b7280">${esc(text)}</span>`
    // Key-value
    return esc(text)
      .replace(/^(\s*)([\w./-]+)(\s*:)/gm, '$1<span style="color:#fd87f6">$2</span>$3')
      .replace(/:\s*(true|false|yes|no|null|~)\s*$/gi, ': <span style="color:#67e8f9">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*)\s*$/g, ': <span style="color:#fbbf24">$1</span>')
      .replace(/:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/g, ': <span style="color:#86efac">$1</span>')
  }

  if (lang === 'properties' || lang === 'toml') {
    if (/^\s*[#;]/.test(text)) return `<span style="color:#6b7280">${esc(text)}</span>`
    if (/^\s*\[/.test(text)) return `<span style="color:#a78bfa">${esc(text)}</span>`
    return esc(text)
      .replace(/^(\s*)([\w./-]+)(\s*[=:])/gm, '$1<span style="color:#fd87f6">$2</span>$3')
      .replace(/=\s*(true|false)\b/gi, '= <span style="color:#67e8f9">$1</span>')
      .replace(/=\s*(-?\d+\.?\d*)\s*$/g, '= <span style="color:#fbbf24">$1</span>')
      .replace(/=\s*("(?:[^"\\]|\\.)*")/g, '= <span style="color:#86efac">$1</span>')
  }

  if (lang === 'shell') {
    if (/^\s*#/.test(text)) return `<span style="color:#6b7280">${esc(text)}</span>`
    return esc(text)
      .replace(/\b(if|then|else|fi|for|do|done|while|case|esac|function|return|exit|export|source|echo|cd|set)\b/g,
        '<span style="color:#a78bfa">$1</span>')
      .replace(/"(?:[^"\\]|\\.)*"/g, '<span style="color:#86efac">$&</span>')
      .replace(/\$\{?\w+\}?/g, '<span style="color:#fbbf24">$&</span>')
  }

  if (lang === 'xml') {
    if (/^\s*<!--/.test(text)) return `<span style="color:#6b7280">${esc(text)}</span>`
    return esc(text)
      .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span style="color:#fd87f6">$2</span>')
      .replace(/([\w:-]+)(=)("(?:[^"\\]|\\.)*")/g,
        '<span style="color:#fbbf24">$1</span>$2<span style="color:#86efac">$3</span>')
  }

  if (lang === 'javascript') {
    if (/^\s*\/\//.test(text)) return `<span style="color:#6b7280">${esc(text)}</span>`
    return esc(text)
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|typeof|instanceof)\b/g,
        '<span style="color:#a78bfa">$1</span>')
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '<span style="color:#86efac">$&</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#fbbf24">$1</span>')
      .replace(/\b(true|false|null|undefined)\b/g, '<span style="color:#67e8f9">$1</span>')
  }

  if (lang === 'python') {
    if (/^\s*#/.test(text)) return `<span style="color:#6b7280">${esc(text)}</span>`
    return esc(text)
      .replace(/\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|raise|with|lambda|pass|break|continue|yield|async|await|not|and|or|in|is)\b/g,
        '<span style="color:#a78bfa">$1</span>')
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '<span style="color:#86efac">$&</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#fbbf24">$1</span>')
      .replace(/\b(True|False|None)\b/g, '<span style="color:#67e8f9">$1</span>')
  }

  return esc(text)
}

export default function FileEditor({ serverId, filePath, fileName, onClose }: FileEditorProps) {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  const language = getLanguage(fileName)
  const hasChanges = content !== originalContent

  function handleClose() {
    if (hasChanges) {
      setShowUnsavedDialog(true)
    } else {
      onClose()
    }
  }

  const fetchContent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load file')
      setContent(data.content)
      setOriginalContent(data.content)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }, [serverId, filePath])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/servers/${serverId}/files/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setOriginalContent(content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Ctrl+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasChanges && !saving) handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  // Sync scroll between textarea and highlight overlay
  function syncScroll() {
    if (textareaRef.current && preRef.current && lineNumbersRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop
      preRef.current.scrollLeft = textareaRef.current.scrollLeft
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // Handle tab key in textarea
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current!
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  const lines = content.split('\n')
  const lineCount = lines.length

  const highlightedHtml = lines
    .map((line) => highlightLine(line, language))
    .join('\n')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d', position: 'relative' }}>
      {/* Unsaved changes dialog */}
      {showUnsavedDialog && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#00000088',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowUnsavedDialog(false)
          }}
        >
          <div
            style={{
              background: '#300a2e',
              border: '1px solid #fd87f6',
              borderRadius: '16px',
              padding: '28px 32px',
              width: '340px',
              color: 'white',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
              Unsaved changes
            </h3>
            <p style={{ color: '#876f86', fontSize: '13px', marginBottom: '20px', lineHeight: 1.5 }}>
              You have unsaved changes in <strong style={{ color: '#fd87f6' }}>{fileName}</strong>. Do you want to save before closing?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowUnsavedDialog(false)
                  onClose()
                }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #dc262660',
                  color: '#f87171',
                  padding: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Discard
              </button>
              <button
                onClick={() => setShowUnsavedDialog(false)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #61475f',
                  color: '#876f86',
                  padding: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowUnsavedDialog(false)
                  await handleSave()
                  onClose()
                }}
                style={{
                  flex: 1,
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  padding: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Editor toolbar */}
      <div
        style={{
          padding: '8px 14px',
          background: '#1a0a1a',
          borderBottom: '1px solid #fd87f620',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#876f86',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="Close editor"
        >
          ←
        </button>
        <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{fileName}</span>
        <span
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '4px',
            background: '#fd87f615',
            color: '#fd87f6',
            textTransform: 'uppercase',
          }}
        >
          {language}
        </span>
        {hasChanges && (
          <span style={{ fontSize: '11px', color: '#fbbf24' }}>unsaved</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saved && <span style={{ color: '#22c55e', fontSize: '12px' }}>Saved</span>}
          {error && <span style={{ color: '#f87171', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{
              background: hasChanges ? '#22c55e' : '#22c55e40',
              color: 'white',
              border: 'none',
              padding: '5px 14px',
              borderRadius: '6px',
              cursor: hasChanges && !saving ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span style={{ color: '#61475f', fontSize: '11px' }}>Ctrl+S</span>
        </div>
      </div>

      {/* Editor body */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#876f86' }}>
          Loading…
        </div>
      ) : error && !content ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
          {error}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Line numbers */}
          <div
            ref={lineNumbersRef}
            style={{
              width: '48px',
              flexShrink: 0,
              overflow: 'hidden',
              background: '#0d0d0d',
              borderRight: '1px solid #ffffff10',
              padding: '10px 0',
              userSelect: 'none',
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                style={{
                  textAlign: 'right',
                  paddingRight: '10px',
                  fontSize: '13px',
                  lineHeight: '20px',
                  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                  color: '#3d1f3b',
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code area */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* Syntax highlighted overlay */}
            <pre
              ref={preRef}
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                margin: 0,
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: '20px',
                fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                color: '#e2e8f0',
                overflow: 'auto',
                whiteSpace: 'pre',
                pointerEvents: 'none',
                background: 'transparent',
              }}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
            {/* Textarea for editing */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={syncScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                margin: 0,
                padding: '10px 12px',
                fontSize: '13px',
                lineHeight: '20px',
                fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                color: 'transparent',
                caretColor: '#fd87f6',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                whiteSpace: 'pre',
                overflow: 'auto',
                tabSize: 2,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
