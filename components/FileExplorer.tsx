'use client'

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

interface FileExplorerProps {
  serverId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString()
}

export default function FileExplorer({ serverId }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState(`/servers/${serverId}`)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    try {
      const res = await fetch(`/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      } else {
        setError('Failed to load files')
      }
    } catch {
      setError('Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchFiles(currentPath)
  }, [currentPath, fetchFiles])

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === files.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(files.map((f) => f.path)))
    }
  }

  async function handleDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} item(s)?`)) return

    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selected) }),
      })
      if (res.ok) {
        fetchFiles(currentPath)
      } else {
        setError('Failed to delete files')
      }
    } catch {
      setError('Failed to delete files')
    }
  }

  async function handleDownload() {
    if (selected.size === 0) return
    const paths = Array.from(selected).join(',')
    const url = `/api/servers/${serverId}/files/download?paths=${encodeURIComponent(paths)}`
    window.open(url, '_blank')
  }

  async function uploadFiles(fileList: FileList) {
    if (!fileList.length) return
    setUploading(true)
    setUploadProgress(`Uploading ${fileList.length} file(s)...`)

    try {
      const formData = new FormData()
      formData.append('path', currentPath)
      for (const file of Array.from(fileList)) {
        formData.append('files', file)
      }

      const res = await fetch(`/api/servers/${serverId}/files/upload`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setUploadProgress(null)
        fetchFiles(currentPath)
      } else {
        const data = await res.json()
        setError(data.error || 'Upload failed')
        setUploadProgress(null)
      }
    } catch {
      setError('Upload failed')
      setUploadProgress(null)
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function navigateTo(path: string) {
    setCurrentPath(path)
  }

  function navigateUp() {
    const parts = currentPath.split('/').filter(Boolean)
    if (parts.length <= 1) return
    const parent = '/' + parts.slice(0, -1).join('/')
    // Don't go above /servers/{serverId}
    if (!parent.startsWith(`/servers/${serverId}`)) return
    navigateTo(parent)
  }

  // Build breadcrumbs
  const basePath = `/servers/${serverId}`
  const relativePath = currentPath.replace(basePath, '') || '/'
  const breadcrumbParts = relativePath.split('/').filter(Boolean)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        color: 'white',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <div
        style={{
          background: '#1a0a1a',
          borderBottom: '1px solid #fd87f640',
          padding: '6px 12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: '#876f86' }}>File Explorer</span>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload files"
              style={{
                background: '#fd87f620',
                border: '1px solid #fd87f660',
                color: '#fd87f6',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Upload
            </button>
            <button
              onClick={handleDownload}
              disabled={selected.size === 0}
              title="Download selected"
              style={{
                background: selected.size > 0 ? '#22c55e20' : '#33333340',
                border: `1px solid ${selected.size > 0 ? '#22c55e60' : '#55555560'}`,
                color: selected.size > 0 ? '#22c55e' : '#6b7280',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: selected.size > 0 ? 'pointer' : 'default',
                fontSize: '11px',
              }}
            >
              Download
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0}
              title="Delete selected"
              style={{
                background: selected.size > 0 ? '#dc262620' : '#33333340',
                border: `1px solid ${selected.size > 0 ? '#dc262660' : '#55555560'}`,
                color: selected.size > 0 ? '#f87171' : '#6b7280',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: selected.size > 0 ? 'pointer' : 'default',
                fontSize: '11px',
              }}
            >
              Delete
            </button>
            <button
              onClick={() => fetchFiles(currentPath)}
              title="Refresh"
              style={{
                background: 'transparent',
                border: '1px solid #55555560',
                color: '#876f86',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              ↻
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigateTo(basePath)}
            style={{ background: 'none', border: 'none', color: '#fd87f6', cursor: 'pointer', padding: '0 2px', fontSize: '12px' }}
          >
            {serverId}
          </button>
          {breadcrumbParts.map((part, idx) => {
            const partPath = basePath + '/' + breadcrumbParts.slice(0, idx + 1).join('/')
            return (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#876f86' }}>/</span>
                <button
                  onClick={() => navigateTo(partPath)}
                  style={{ background: 'none', border: 'none', color: idx === breadcrumbParts.length - 1 ? 'white' : '#fd87f6', cursor: 'pointer', padding: '0 2px', fontSize: '12px' }}
                >
                  {part}
                </button>
              </span>
            )
          })}
        </div>
      </div>

      {/* Upload progress */}
      {uploadProgress && (
        <div style={{ background: '#22c55e20', padding: '6px 12px', fontSize: '12px', color: '#22c55e', flexShrink: 0 }}>
          {uploadProgress}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#dc262620', padding: '6px 12px', fontSize: '12px', color: '#f87171', flexShrink: 0 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Drop overlay */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#fd87f620',
            border: '2px dashed #fd87f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            fontSize: '18px',
            color: '#fd87f6',
            pointerEvents: 'none',
          }}
        >
          Drop files to upload
        </div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '16px', color: '#876f86', fontSize: '13px' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #fd87f620' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#876f86', fontWeight: '500', width: '28px' }}>
                  <input
                    type="checkbox"
                    checked={files.length > 0 && selected.size === files.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', accentColor: '#fd87f6' }}
                  />
                </th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#876f86', fontWeight: '500' }}>Name</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#876f86', fontWeight: '500', width: '70px' }}>Size</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#876f86', fontWeight: '500', width: '80px' }}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {/* Up directory */}
              {currentPath !== basePath && (
                <tr
                  onClick={navigateUp}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #ffffff10' }}
                >
                  <td style={{ padding: '6px 8px' }}></td>
                  <td style={{ padding: '6px 8px', color: '#876f86' }}>
                    <span style={{ marginRight: '6px' }}>📁</span>
                    ..
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              )}

              {files.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '16px', color: '#876f86', textAlign: 'center' }}>
                    Empty directory
                  </td>
                </tr>
              )}

              {files.map((file) => (
                <tr
                  key={file.path}
                  style={{
                    background: selected.has(file.path) ? '#fd87f615' : 'transparent',
                    borderBottom: '1px solid #ffffff10',
                    cursor: file.isDirectory ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (file.isDirectory) navigateTo(file.path)
                  }}
                >
                  <td
                    style={{ padding: '6px 8px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelect(file.path)
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(file.path)}
                      onChange={() => toggleSelect(file.path)}
                      style={{ cursor: 'pointer', accentColor: '#fd87f6' }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                    <span style={{ marginRight: '6px' }}>
                      {file.isDirectory ? '📁' : '📄'}
                    </span>
                    <span style={{ color: file.isDirectory ? '#fd87f6' : 'white' }}>
                      {file.name}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#876f86', fontVariantNumeric: 'tabular-nums' }}>
                    {file.isDirectory ? '—' : formatSize(file.size)}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#876f86' }}>
                    {formatDate(file.mtime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) {
            uploadFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />
    </div>
  )
}
