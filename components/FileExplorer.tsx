'use client'

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import { SERVERS_DIR_CLIENT } from '@/lib/client-constants'

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
  const d = new Date(ms)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function fileIcon(file: FileEntry): string {
  if (file.isDirectory) return '📁'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jar') return '☕'
  if (ext === 'log') return '📋'
  if (['sh', 'bash'].includes(ext)) return '⚙️'
  if (['json', 'yml', 'yaml', 'toml', 'properties', 'conf', 'cfg', 'txt', 'md'].includes(ext)) return '📄'
  if (['zip', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return '🗜️'
  return '📄'
}

export default function FileExplorer({ serverId }: FileExplorerProps) {
  const basePath = `${SERVERS_DIR_CLIENT}/${serverId}`
  const [currentPath, setCurrentPath] = useState(basePath)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadDragging, setUploadDragging] = useState(false) // files from desktop
  const [uploading, setUploading] = useState(false)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; name: string; status: 'uploading' | 'done' | 'error' }>>([])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [createFolderName, setCreateFolderName] = useState('')
  const [creatingFolderLoading, setCreatingFolderLoading] = useState(false)
  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const createFolderInputRef = useRef<HTMLInputElement>(null)
  // Drag-to-move state
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadMenuRef = useRef<HTMLDivElement>(null)

  const fetchFiles = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      setSelected(new Set())
      try {
        const res = await fetch(
          `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`
        )
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
    },
    [serverId]
  )

  useEffect(() => {
    setCurrentPath(basePath)
    setFiles([])
    setSelected(new Set())
    setRenamingPath(null)
    setRenameValue('')
    setCreatingFolder(false)
    setCreateFolderName('')
    setError(null)
  }, [basePath])

  useEffect(() => {
    fetchFiles(currentPath)
  }, [currentPath, fetchFiles])

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!uploadMenuRef.current?.contains(event.target as Node)) {
        setUploadMenuOpen(false)
      }
    }
    if (uploadMenuOpen) {
      document.addEventListener('mousedown', onClickOutside)
    }
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [uploadMenuOpen])

  // ── Selection ────────────────────────────────────────────────────────────
  function toggleSelect(path: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function navigateTo(path: string) {
    setCurrentPath(path)
    setRenamingPath(null)
    setCreatingFolder(false)
    setCreateFolderName('')
  }

  function navigateUp() {
    const parts = currentPath.split('/').filter(Boolean)
    if (parts.length <= 1) return
    const parent = '/' + parts.slice(0, -1).join('/')
    if (!parent.startsWith(basePath)) return
    navigateTo(parent)
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} item(s)? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selected) }),
      })
      if (res.ok) fetchFiles(currentPath)
      else setError('Delete failed')
    } catch {
      setError('Delete failed')
    }
  }

  // ── Download ─────────────────────────────────────────────────────────────
  function handleDownload() {
    if (selected.size === 0) return
    const paths = Array.from(selected).join(',')
    window.open(
      `/api/servers/${serverId}/files/download?paths=${encodeURIComponent(paths)}`,
      '_blank'
    )
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  async function uploadFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (!files.length) return

    setUploading(true)
    setError(null)
    const queue = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      status: 'uploading' as const,
    }))
    setUploadQueue(queue)

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name

        const formData = new FormData()
        formData.append('path', currentPath)
        formData.append('files', file)
        formData.append('relativePaths', relativePath)

        const res = await fetch(`/api/servers/${serverId}/files/upload`, {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setUploadQueue((prev) =>
            prev.map((item, i) => (i === index ? { ...item, status: 'error' } : item))
          )
          setError(data.error || `Upload failed for ${relativePath}`)
          continue
        }

        setUploadQueue((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: 'done' } : item))
        )
        await fetchFiles(currentPath)
      }
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadQueue([]), 2500)
    }
  }

  // Desktop drag-and-drop upload
  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setUploadDragging(false)
    // Only handle desktop file drops (not internal drag-to-move)
    if (e.dataTransfer.files.length && !draggedPath) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    // Only show upload overlay when dragging from desktop (not internal)
    if (!draggedPath) setUploadDragging(true)
  }

  // ── Create folder ────────────────────────────────────────────────────────
  function openCreateFolder() {
    setCreatingFolder(true)
    setCreateFolderName('')
    setTimeout(() => {
      createFolderInputRef.current?.focus()
    }, 30)
  }

  function cancelCreateFolder() {
    setCreatingFolder(false)
    setCreateFolderName('')
  }

  async function submitCreateFolder() {
    const folderName = createFolderName.trim()
    if (!folderName) return cancelCreateFolder()

    if (folderName === '.' || folderName === '..' || folderName.includes('/')) {
      setError('Folder name cannot contain "/" and cannot be "." or ".."')
      return
    }

    setCreatingFolderLoading(true)
    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${currentPath}/${folderName}` }),
      })
      if (res.ok) {
        cancelCreateFolder()
        fetchFiles(currentPath)
      } else {
        const data = await res.json()
        setError(data.error || 'Create folder failed')
      }
    } catch {
      setError('Create folder failed')
    } finally {
      setCreatingFolderLoading(false)
    }
  }

  // ── Rename ───────────────────────────────────────────────────────────────
  function startRename(file: FileEntry, e: React.MouseEvent) {
    e.stopPropagation()
    setRenamingPath(file.path)
    setRenameValue(file.name)
    setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 30)
  }

  function cancelRename() {
    setRenamingPath(null)
    setRenameValue('')
  }

  async function submitRename() {
    if (!renamingPath || !renameValue.trim()) return cancelRename()
    const dir = renamingPath.substring(0, renamingPath.lastIndexOf('/'))
    const newPath = `${dir}/${renameValue.trim()}`
    if (newPath === renamingPath) return cancelRename()

    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: renamingPath, to: newPath }),
      })
      if (res.ok) fetchFiles(currentPath)
      else setError('Rename failed')
    } catch {
      setError('Rename failed')
    }
    cancelRename()
  }

  // ── Drag-to-move ─────────────────────────────────────────────────────────
  async function handleMoveDrop(targetFolder: FileEntry) {
    if (!draggedPath) return
    if (draggedPath === targetFolder.path) return
    const filename = draggedPath.split('/').pop()!
    const newPath = `${targetFolder.path}/${filename}`
    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: draggedPath, to: newPath }),
      })
      if (res.ok) fetchFiles(currentPath)
      else setError('Move failed')
    } catch {
      setError('Move failed')
    }
    setDraggedPath(null)
    setDropTargetPath(null)
  }

  // ── Breadcrumbs ──────────────────────────────────────────────────────────
  const relativePath = currentPath.replace(basePath, '') || '/'
  const breadcrumbParts = relativePath.split('/').filter(Boolean)

  const hasSelection = selected.size > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        color: 'white',
        position: 'relative',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setUploadDragging(false)
        }
      }}
    >
      {/* Upload drop overlay */}
      {uploadDragging && !draggedPath && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#fd87f618',
            border: '2px dashed #fd87f6',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            fontSize: '16px',
            color: '#fd87f6',
            pointerEvents: 'none',
            borderRadius: '4px',
          }}
        >
          <span style={{ fontSize: '32px', marginBottom: '8px' }}>↑</span>
          Drop to upload
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #fd87f620',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          background: '#1a0a1a',
        }}
      >
        {/* Breadcrumbs */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', fontSize: '13px', overflow: 'hidden' }}>
          <button
            onClick={() => navigateTo(basePath)}
            style={{ background: 'none', border: 'none', color: '#fd87f6', cursor: 'pointer', padding: '2px 4px', fontSize: '13px', flexShrink: 0 }}
          >
            {serverId}
          </button>
          {breadcrumbParts.map((part, idx) => {
            const partPath = basePath + '/' + breadcrumbParts.slice(0, idx + 1).join('/')
            return (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: idx < breadcrumbParts.length - 1 ? 0 : 1, overflow: 'hidden' }}>
                <span style={{ color: '#61475f' }}>/</span>
                <button
                  onClick={() => navigateTo(partPath)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: idx === breadcrumbParts.length - 1 ? 'white' : '#fd87f6',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: '13px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100px',
                  }}
                >
                  {part}
                </button>
              </span>
            )
          })}
        </div>

        {/* Action icons */}
        {hasSelection && (
          <>
            <span style={{ color: '#876f86', fontSize: '12px', marginRight: '2px' }}>
              {selected.size} selected
            </span>
            <IconBtn title="Download selected" onClick={handleDownload}>↓</IconBtn>
            <IconBtn title="Delete selected" onClick={handleDelete} danger>🗑</IconBtn>
            <div style={{ width: '1px', background: '#61475f40', height: '16px', margin: '0 2px' }} />
          </>
        )}
        <div ref={uploadMenuRef} style={{ position: 'relative' }}>
          <IconBtn
            title="Upload files or folder"
            onClick={() => setUploadMenuOpen((v) => !v)}
            loading={uploading}
            wide
          >
            {uploading ? '…' : 'Upload'}
          </IconBtn>
          {uploadMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                minWidth: '180px',
                background: '#1a0a1a',
                border: '1px solid #61475f70',
                borderRadius: '8px',
                boxShadow: '0 8px 20px #00000055',
                zIndex: 25,
                padding: '6px',
              }}
            >
              <button
                onClick={() => {
                  setUploadMenuOpen(false)
                  fileInputRef.current?.click()
                }}
                style={uploadMenuItemStyle}
              >
                Upload files…
              </button>
              <button
                onClick={() => {
                  setUploadMenuOpen(false)
                  folderInputRef.current?.click()
                }}
                style={uploadMenuItemStyle}
              >
                Upload folder…
              </button>
            </div>
          )}
        </div>
        <IconBtn title="Create folder" onClick={openCreateFolder} loading={creatingFolderLoading}>
          +
        </IconBtn>
        {currentPath !== basePath && (
          <IconBtn title="Go up" onClick={navigateUp}>⬆</IconBtn>
        )}
        <IconBtn title="Refresh" onClick={() => fetchFiles(currentPath)}>↻</IconBtn>
      </div>

      {creatingFolder && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #fd87f620',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#140714',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#876f86', fontSize: '12px', whiteSpace: 'nowrap' }}>
            New folder
          </span>
          <input
            ref={createFolderInputRef}
            value={createFolderName}
            onChange={(e) => setCreateFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreateFolder()
              if (e.key === 'Escape') cancelCreateFolder()
            }}
            placeholder="folder-name"
            style={{
              flex: 1,
              background: '#3d1f3b',
              border: '1px solid #61475f',
              borderRadius: '6px',
              color: 'white',
              padding: '6px 10px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <button
            onClick={submitCreateFolder}
            disabled={creatingFolderLoading}
            style={{
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: creatingFolderLoading ? 'not-allowed' : 'pointer',
              opacity: creatingFolderLoading ? 0.7 : 1,
            }}
          >
            {creatingFolderLoading ? '…' : 'Create'}
          </button>
          <button
            onClick={cancelCreateFolder}
            style={{
              background: 'transparent',
              color: '#876f86',
              border: '1px solid #61475f50',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Status messages */}
      {error && (
        <div style={{ background: '#dc262618', padding: '6px 12px', fontSize: '12px', color: '#f87171', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: '14px' }}>✕</button>
        </div>
      )}

      {uploadQueue.length > 0 && (
        <div
          style={{
            background: '#22c55e12',
            borderBottom: '1px solid #fd87f620',
            padding: '6px 12px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#9cf6bc' }}>
            Uploading {uploadQueue.filter((i) => i.status === 'uploading').length}/{uploadQueue.length}
          </span>
          {uploadQueue.slice(0, 4).map((item) => (
            <span key={item.id} style={{ color: item.status === 'error' ? '#f87171' : '#d3fadf' }}>
              {item.status === 'uploading' ? '⏳' : item.status === 'done' ? '✅' : '❌'} {item.name}
            </span>
          ))}
        </div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '20px', color: '#876f86', fontSize: '13px', textAlign: 'center' }}>
            Loading…
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {/* Up directory row */}
              {currentPath !== basePath && (
                <tr
                  onClick={navigateUp}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #ffffff08' }}
                  className="file-row"
                >
                  <td style={{ padding: '7px 12px', width: '24px' }} />
                  <td style={{ padding: '7px 8px', color: '#61475f' }}>
                    <span style={{ marginRight: '6px' }}>📁</span>
                    <span style={{ fontFamily: 'monospace' }}>..</span>
                  </td>
                  <td colSpan={2} />
                </tr>
              )}

              {files.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '32px', color: '#61475f', textAlign: 'center', fontSize: '14px' }}>
                    Empty directory
                  </td>
                </tr>
              )}

              {uploadQueue
                .filter((item) => item.status === 'uploading')
                .map((item) => (
                  <tr key={`uploading-${item.id}`} style={{ borderBottom: '1px solid #ffffff08', background: '#22c55e0f' }}>
                    <td style={{ padding: '7px 12px', width: '24px' }} />
                    <td style={{ padding: '7px 8px', color: '#d3fadf' }}>
                      <span style={{ marginRight: '6px' }}>⏳</span>
                      <span title={item.name}>{item.name}</span>
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#9cf6bc' }}>uploading…</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#9cf6bc' }}>in progress</td>
                  </tr>
                ))}

              {files.map((file) => {
                const isSelected = selected.has(file.path)
                const isRenaming = renamingPath === file.path
                const isDropTarget = dropTargetPath === file.path

                return (
                  <tr
                    key={file.path}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggedPath(file.path)
                      setUploadDragging(false)
                    }}
                    onDragEnd={() => {
                      setDraggedPath(null)
                      setDropTargetPath(null)
                    }}
                    onDragOver={(e) => {
                      if (file.isDirectory && draggedPath && draggedPath !== file.path) {
                        e.preventDefault()
                        e.stopPropagation()
                        setDropTargetPath(file.path)
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetPath === file.path) setDropTargetPath(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (file.isDirectory) handleMoveDrop(file)
                    }}
                    onClick={(e) => {
                      if (isRenaming) return
                      if (file.isDirectory) {
                        navigateTo(file.path)
                      } else {
                        // Click to toggle select
                        toggleSelect(file.path, e)
                      }
                    }}
                    style={{
                      background: isDropTarget
                        ? '#fd87f625'
                        : isSelected
                        ? '#fd87f610'
                        : draggedPath === file.path
                        ? '#ffffff08'
                        : 'transparent',
                      borderBottom: '1px solid #ffffff08',
                      cursor: file.isDirectory ? 'pointer' : 'default',
                      opacity: draggedPath === file.path ? 0.5 : 1,
                      outline: isDropTarget ? '1px solid #fd87f640' : 'none',
                    }}
                  >
                    {/* Checkbox */}
                    <td
                      style={{ padding: '7px 12px', width: '24px', verticalAlign: 'middle' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelect(file.path, e)
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: 'pointer', accentColor: '#fd87f6' }}
                      />
                    </td>

                    {/* Name */}
                    <td
                      style={{ padding: '7px 8px', verticalAlign: 'middle', maxWidth: '160px' }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        if (!isRenaming) startRename(file, e)
                      }}
                    >
                      <span style={{ marginRight: '6px', userSelect: 'none' }}>
                        {fileIcon(file)}
                      </span>
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={submitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename()
                            if (e.key === 'Escape') cancelRename()
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: '#3d1f3b',
                            border: '1px solid #fd87f6',
                            borderRadius: '4px',
                            color: 'white',
                            padding: '2px 6px',
                            fontSize: '13px',
                            outline: 'none',
                            width: '140px',
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            color: file.isDirectory ? '#fd87f6' : 'white',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            display: 'inline-block',
                            maxWidth: '140px',
                            verticalAlign: 'bottom',
                          }}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      )}
                    </td>

                    {/* Size */}
                    <td
                      style={{
                        padding: '7px 8px',
                        textAlign: 'right',
                        color: '#61475f',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        width: '70px',
                        verticalAlign: 'middle',
                      }}
                    >
                      {file.isDirectory ? '' : formatSize(file.size)}
                    </td>

                    {/* Actions + Date */}
                    <td
                      style={{
                        padding: '7px 8px',
                        textAlign: 'right',
                        color: '#61475f',
                        whiteSpace: 'nowrap',
                        width: '100px',
                        verticalAlign: 'middle',
                      }}
                    >
                      <span className="file-actions" style={{ display: 'inline-flex', gap: '4px', opacity: 0 }}>
                        <span
                          title="Rename (or double-click)"
                          onClick={(e) => startRename(file, e)}
                          style={{ cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', background: '#fd87f620', fontSize: '11px' }}
                        >
                          ✎
                        </span>
                        <span
                          title="Download"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(`/api/servers/${serverId}/files/download?paths=${encodeURIComponent(file.path)}`, '_blank')
                          }}
                          style={{ cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', background: '#22c55e20', fontSize: '11px' }}
                        >
                          ↓
                        </span>
                        <span
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete "${file.name}"?`)) {
                              fetch(`/api/servers/${serverId}/files`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ paths: [file.path] }),
                              }).then(() => fetchFiles(currentPath))
                            }
                          }}
                          style={{ cursor: 'pointer', padding: '1px 4px', borderRadius: '3px', background: '#dc262620', fontSize: '11px' }}
                        >
                          🗑
                        </span>
                      </span>
                      <span style={{ marginLeft: '4px' }}>{formatDate(file.mtime)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Hint */}
      {!loading && files.length > 0 && (
        <div style={{ padding: '6px 12px', fontSize: '11px', color: '#3d1f3b', borderTop: '1px solid #ffffff08', flexShrink: 0 }}>
          Create folders from the toolbar · Double-click to rename · Drag files to a folder to move · Drop files from desktop to upload
        </div>
      )}

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
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: 'true', directory: 'true' } as unknown as Record<string, string>)}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) {
            uploadFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />

      <style>{`
        .file-row:hover td { background: #ffffff05; }
        tr:hover .file-actions { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

const uploadMenuItemStyle: {
  width: string
  textAlign: 'left'
  background: string
  color: string
  border: string
  borderRadius: string
  padding: string
  fontSize: string
  cursor: 'pointer'
} = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  padding: '7px 10px',
  fontSize: '13px',
  cursor: 'pointer',
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  loading,
  wide,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
  loading?: boolean
  wide?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={loading}
      style={{
        background: 'transparent',
        border: '1px solid ' + (danger ? '#dc262650' : '#61475f50'),
        color: danger ? '#f87171' : '#876f86',
        width: wide ? 'auto' : '28px',
        height: '28px',
        padding: wide ? '0 10px' : undefined,
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
