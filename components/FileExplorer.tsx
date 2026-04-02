'use client'

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import { SERVERS_DIR_CLIENT } from '@/lib/client-constants'
import { uploadFileWithProgress } from '@/lib/client-upload'
import ContextMenu, { ContextMenuItem } from './ContextMenu'
import { ConfirmDialog } from './ConfirmDialog'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

interface FileExplorerProps {
  serverId: string
  onOpenFile?: (path: string, name: string) => void
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

const EDITABLE_EXTENSIONS = new Set([
  'json', 'yml', 'yaml', 'toml', 'properties', 'conf', 'cfg', 'txt', 'md',
  'sh', 'bash', 'xml', 'html', 'js', 'ts', 'py', 'ini', 'log', 'csv',
  'env', 'gitignore', 'dockerfile',
])

function isEditable(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const baseName = name.toLowerCase()
  return EDITABLE_EXTENSIONS.has(ext) || ['eula.txt', 'server.properties', 'dockerfile', '.env', '.gitignore'].includes(baseName)
}

export default function FileExplorer({ serverId, onOpenFile }: FileExplorerProps) {
  const basePath = `${SERVERS_DIR_CLIENT}/${serverId}`
  const [currentPath, setCurrentPath] = useState(basePath)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadDragging, setUploadDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; name: string; status: 'pending' | 'uploading' | 'done' | 'error'; progress: number }>>([])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [createFolderName, setCreateFolderName] = useState('')
  const [creatingFolderLoading, setCreatingFolderLoading] = useState(false)
  const [creatingFile, setCreatingFile] = useState(false)
  const [createFileName, setCreateFileName] = useState('')
  const [creatingFileLoading, setCreatingFileLoading] = useState(false)
  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const createFolderInputRef = useRef<HTMLInputElement>(null)
  const createFileInputRef = useRef<HTMLInputElement>(null)
  // Drag-to-move state
  const [draggedEntry, setDraggedEntry] = useState<FileEntry | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file?: FileEntry } | null>(null)
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ paths: string[]; message: string } | null>(null)
  // Track last clicked index for shift-select
  const lastClickedRef = useRef<number | null>(null)
  const draggedPath = draggedEntry?.path ?? null

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
    setCreatingFile(false)
    setCreateFileName('')
    setError(null)
  }, [basePath])

  useEffect(() => {
    fetchFiles(currentPath)
  }, [currentPath, fetchFiles])

  // ── Selection (shift-click) ──────────────────────────────────────────────
  function handleRowClick(file: FileEntry, index: number, e: React.MouseEvent) {
    if (renamingPath === file.path) return

    if (e.shiftKey && lastClickedRef.current !== null) {
      // Range select
      const start = Math.min(lastClickedRef.current, index)
      const end = Math.max(lastClickedRef.current, index)
      setSelected((prev) => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) {
          next.add(files[i].path)
        }
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle single
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(file.path)) next.delete(file.path)
        else next.add(file.path)
        return next
      })
      lastClickedRef.current = index
    } else {
      // Single click — just select this one (don't navigate)
      setSelected(new Set([file.path]))
      lastClickedRef.current = index
    }
  }

  function handleDoubleClick(file: FileEntry) {
    if (file.isDirectory) {
      navigateTo(file.path)
    } else if (isEditable(file.name) && onOpenFile) {
      onOpenFile(file.path, file.name)
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────
  function navigateTo(path: string) {
    setCurrentPath(path)
    setRenamingPath(null)
    setCreatingFolder(false)
    setCreateFolderName('')
    setCreatingFile(false)
    setCreateFileName('')
  }

  function clearDragState() {
    setDraggedEntry(null)
    setDropTargetPath(null)
  }

  function navigateUp() {
    const parts = currentPath.split('/').filter(Boolean)
    if (parts.length <= 1) return
    const parent = '/' + parts.slice(0, -1).join('/')
    if (!parent.startsWith(basePath)) return
    navigateTo(parent)
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  function requestDelete(paths: string[]) {
    if (paths.length === 0) return
    const names = paths.map((p) => p.split('/').pop()!)
    const message = paths.length === 1
      ? `Delete "${names[0]}"? This cannot be undone.`
      : `Delete ${paths.length} items? This cannot be undone.`
    setDeleteConfirm({ paths, message })
  }

  async function executeDelete(paths: string[]) {
    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      })
      if (res.ok) {
        setSelected(new Set())
        fetchFiles(currentPath)
      } else {
        setError('Delete failed')
      }
    } catch {
      setError('Delete failed')
    }
    setDeleteConfirm(null)
  }

  // ── Download ─────────────────────────────────────────────────────────────
  function handleDownload(paths?: string[]) {
    const downloadPaths = paths || Array.from(selected)
    if (downloadPaths.length === 0) return
    window.open(
      `/api/servers/${serverId}/files/download?paths=${encodeURIComponent(downloadPaths.join(','))}`,
      '_blank'
    )
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  async function uploadFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    const targetPath = currentPath

    setUploading(true)
    setError(null)
    const queue = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      status: 'pending' as const,
      progress: 0,
    }))
    setUploadQueue(queue)

    try {
      let uploadedAny = false

      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        setUploadQueue((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: 'uploading', progress: 0 } : item))
        )

        const uploadUrl = `/api/servers/${serverId}/files/upload?path=${encodeURIComponent(targetPath)}&relativePath=${encodeURIComponent(relativePath)}`
        const res = await uploadFileWithProgress(uploadUrl, file, (progress) => {
          setUploadQueue((prev) =>
            prev.map((item, i) => (i === index ? { ...item, progress } : item))
          )
        })

        if (!res.ok) {
          setUploadQueue((prev) =>
            prev.map((item, i) => (i === index ? { ...item, status: 'error' } : item))
          )
          setError(res.error || `Upload failed for ${relativePath}`)
          continue
        }

        setUploadQueue((prev) =>
          prev.map((item, i) => (i === index ? { ...item, status: 'done', progress: 100 } : item))
        )
        uploadedAny = true
      }

      if (uploadedAny) {
        await fetchFiles(targetPath)
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
    if (e.dataTransfer.files.length && !draggedPath) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    if (!draggedPath) setUploadDragging(true)
  }

  // ── Create folder ────────────────────────────────────────────────────────
  function openCreateFolder() {
    setCreatingFolder(true)
    setCreatingFile(false)
    setCreateFolderName('')
    setTimeout(() => createFolderInputRef.current?.focus(), 30)
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

  // ── Create file ──────────────────────────────────────────────────────────
  function openCreateFile() {
    setCreatingFile(true)
    setCreatingFolder(false)
    setCreateFileName('')
    setTimeout(() => createFileInputRef.current?.focus(), 30)
  }

  function cancelCreateFile() {
    setCreatingFile(false)
    setCreateFileName('')
  }

  async function submitCreateFile() {
    const fileName = createFileName.trim()
    if (!fileName) return cancelCreateFile()

    if (fileName.includes('/')) {
      setError('File name cannot contain "/"')
      return
    }

    setCreatingFileLoading(true)
    try {
      const filePath = `${currentPath}/${fileName}`
      const res = await fetch(`/api/servers/${serverId}/files/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '' }),
      })
      if (res.ok) {
        cancelCreateFile()
        fetchFiles(currentPath)
        if (isEditable(fileName) && onOpenFile) {
          onOpenFile(filePath, fileName)
        }
      } else {
        const data = await res.json()
        setError(data.error || 'Create file failed')
      }
    } catch {
      setError('Create file failed')
    } finally {
      setCreatingFileLoading(false)
    }
  }

  // ── Rename ───────────────────────────────────────────────────────────────
  function startRename(file: FileEntry) {
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
  function getParentPath(path: string): string {
    const separatorIndex = path.lastIndexOf('/')
    return separatorIndex > 0 ? path.slice(0, separatorIndex) : path
  }

  function canDropInto(targetDirectoryPath: string): boolean {
    if (!draggedEntry) return false
    if (draggedEntry.path === targetDirectoryPath) return false

    const sourceParent = getParentPath(draggedEntry.path)
    if (sourceParent === targetDirectoryPath) return false

    if (draggedEntry.isDirectory && targetDirectoryPath.startsWith(draggedEntry.path + '/')) {
      return false
    }

    return true
  }

  async function handleMoveDrop(targetDirectoryPath: string) {
    if (!draggedEntry || !canDropInto(targetDirectoryPath)) {
      clearDragState()
      return
    }

    const sourcePath = draggedEntry.path
    const filename = sourcePath.split('/').pop()!
    const newPath = `${targetDirectoryPath}/${filename}`
    try {
      const res = await fetch(`/api/servers/${serverId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sourcePath, to: newPath }),
      })
      if (res.ok) {
        await fetchFiles(currentPath)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Move failed')
      }
    } catch {
      setError('Move failed')
    }
    clearDragState()
  }

  // ── Context menu ─────────────────────────────────────────────────────────
  function handleContextMenu(e: React.MouseEvent, file?: FileEntry) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  function getContextMenuItems(): ContextMenuItem[] {
    const file = contextMenu?.file
    if (file) {
      // File-specific context menu
      const items: ContextMenuItem[] = []
      if (file.isDirectory) {
        items.push({ label: 'Open', icon: '📂', onClick: () => navigateTo(file.path) })
      } else if (isEditable(file.name) && onOpenFile) {
        items.push({ label: 'Edit', icon: '✎', onClick: () => onOpenFile(file.path, file.name) })
      }
      items.push(
        { label: 'Rename', icon: '✏️', onClick: () => startRename(file) },
        { label: 'Download', icon: '↓', onClick: () => handleDownload([file.path]) },
        { label: 'Delete', icon: '🗑', danger: true, onClick: () => requestDelete([file.path]) },
      )
      return items
    }

    // Empty space context menu
    return [
      { label: 'New file', icon: '📄', onClick: openCreateFile },
      { label: 'New folder', icon: '📁', onClick: openCreateFolder },
      { label: 'Upload files', icon: '↑', onClick: () => fileInputRef.current?.click() },
      { label: 'Upload folder', icon: '📂', onClick: () => folderInputRef.current?.click() },
    ]
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
      onContextMenu={(e) => {
        // Only show if right-clicking empty space (not on a file row)
        if ((e.target as HTMLElement).closest('[data-file-row]')) return
        handleContextMenu(e)
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

      {/* Upload area */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid #fd87f620',
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '14px 12px',
            background: '#1a0a1a',
            border: 'none',
            borderRight: '1px solid #fd87f620',
            color: uploading ? '#61475f' : '#876f86',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
          onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.background = '#fd87f610' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1a0a1a' }}
        >
          <span style={{ fontSize: '18px' }}>↑</span>
          Upload Files
        </button>
        <button
          onClick={() => folderInputRef.current?.click()}
          disabled={uploading}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '14px 12px',
            background: '#1a0a1a',
            border: 'none',
            color: uploading ? '#61475f' : '#876f86',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
          onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.background = '#fd87f610' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1a0a1a' }}
        >
          <span style={{ fontSize: '18px' }}>📂</span>
          Upload Folder
        </button>
      </div>

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
            onDragOver={(e) => {
              if (!canDropInto(basePath)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropTargetPath(basePath)
            }}
            onDragLeave={() => {
              if (dropTargetPath === basePath) setDropTargetPath(null)
            }}
            onDrop={(e) => {
              if (!canDropInto(basePath)) return
              e.preventDefault()
              e.stopPropagation()
              void handleMoveDrop(basePath)
            }}
            style={{
              background: dropTargetPath === basePath ? '#fd87f620' : 'none',
              border: dropTargetPath === basePath ? '1px solid #fd87f680' : '1px solid transparent',
              borderRadius: '6px',
              color: '#fd87f6',
              cursor: 'pointer',
              padding: '2px 4px',
              fontSize: '13px',
              flexShrink: 0,
            }}
          >
            {serverId}
          </button>
          {breadcrumbParts.map((part, idx) => {
            const partPath = basePath + '/' + breadcrumbParts.slice(0, idx + 1).join('/')
            const isBreadcrumbDropTarget = dropTargetPath === partPath
            return (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: idx < breadcrumbParts.length - 1 ? 0 : 1, overflow: 'hidden' }}>
                <span style={{ color: '#61475f' }}>/</span>
                <button
                  onClick={() => navigateTo(partPath)}
                  onDragOver={(e) => {
                    if (!canDropInto(partPath)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropTargetPath(partPath)
                  }}
                  onDragLeave={() => {
                    if (dropTargetPath === partPath) setDropTargetPath(null)
                  }}
                  onDrop={(e) => {
                    if (!canDropInto(partPath)) return
                    e.preventDefault()
                    e.stopPropagation()
                    void handleMoveDrop(partPath)
                  }}
                  style={{
                    background: isBreadcrumbDropTarget ? '#fd87f620' : 'none',
                    border: isBreadcrumbDropTarget ? '1px solid #fd87f680' : '1px solid transparent',
                    borderRadius: '6px',
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

        {/* Selection actions */}
        {hasSelection && (
          <>
            <span style={{ color: '#876f86', fontSize: '12px', marginRight: '2px' }}>
              {selected.size} selected
            </span>
            <IconBtn title="Download selected" onClick={() => handleDownload()}>↓</IconBtn>
            <IconBtn title="Delete selected" onClick={() => requestDelete(Array.from(selected))} danger>🗑</IconBtn>
            <div style={{ width: '1px', background: '#61475f40', height: '16px', margin: '0 2px' }} />
          </>
        )}
        <IconBtn title="Refresh" onClick={() => fetchFiles(currentPath)}>↻</IconBtn>
      </div>

      {/* Create folder inline */}
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

      {/* Create file inline */}
      {creatingFile && (
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
            New file
          </span>
          <input
            ref={createFileInputRef}
            value={createFileName}
            onChange={(e) => setCreateFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreateFile()
              if (e.key === 'Escape') cancelCreateFile()
            }}
            placeholder="filename.txt"
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
            onClick={submitCreateFile}
            disabled={creatingFileLoading}
            style={{
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: creatingFileLoading ? 'not-allowed' : 'pointer',
              opacity: creatingFileLoading ? 0.7 : 1,
            }}
          >
            {creatingFileLoading ? '…' : 'Create'}
          </button>
          <button
            onClick={cancelCreateFile}
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
            <span key={item.id} style={{ color: item.status === 'error' ? '#f87171' : '#d3fadf', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  background:
                    item.status === 'pending'
                      ? '#6b7280'
                      : item.status === 'uploading'
                      ? '#22c55e'
                      : item.status === 'done'
                      ? '#16a34a'
                      : '#dc2626',
                }}
              />
              {item.name}
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
                  onDoubleClick={navigateUp}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #ffffff08' }}
                  className="file-row"
                >
                  <td style={{ padding: '7px 12px', color: '#61475f' }}>
                    <span style={{ marginRight: '6px' }}>📁</span>
                    <span style={{ fontFamily: 'monospace' }}>..</span>
                  </td>
                  <td colSpan={2} />
                </tr>
              )}

              {files.length === 0 && !currentPath.endsWith(basePath) && (
                <tr>
                  <td colSpan={3} style={{ padding: '32px', color: '#61475f', textAlign: 'center', fontSize: '14px' }}>
                    Empty directory
                  </td>
                </tr>
              )}

              {uploadQueue
                .filter((item) => item.status === 'pending' || item.status === 'uploading')
                .map((item) => (
                  <tr
                    key={`uploading-${item.id}`}
                    style={{
                      borderBottom: '1px solid #ffffff08',
                      background: item.status === 'pending' ? '#ffffff06' : '#22c55e0f',
                    }}
                  >
                    <td style={{ padding: '7px 12px', color: '#d3fadf' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          marginRight: '6px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '999px',
                          background: item.status === 'pending' ? '#6b7280' : '#22c55e',
                        }}
                      />
                      <span title={item.name}>{item.name}</span>
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: item.status === 'pending' ? '#9ca3af' : '#9cf6bc', width: '70px' }}>
                      {item.status === 'pending' ? 'queued' : `${item.progress}%`}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: item.status === 'pending' ? '#9ca3af' : '#9cf6bc', width: '80px' }}>
                      {item.status === 'pending' ? (
                        'waiting'
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            width: '70px',
                            height: '8px',
                            borderRadius: '999px',
                            background: '#ffffff22',
                            overflow: 'hidden',
                            verticalAlign: 'middle',
                          }}
                        >
                          <span
                            style={{
                              display: 'block',
                              width: `${item.progress}%`,
                              height: '100%',
                              background: '#22c55e',
                              transition: 'width 120ms linear',
                            }}
                          />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

              {files.map((file, index) => {
                const isSelected = selected.has(file.path)
                const isRenaming = renamingPath === file.path
                const isDropTarget = dropTargetPath === file.path

                return (
                  <tr
                    key={file.path}
                    data-file-row
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggedEntry(file)
                      setUploadDragging(false)
                    }}
                    onDragEnd={clearDragState}
                    onDragOver={(e) => {
                      if (file.isDirectory && canDropInto(file.path)) {
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'move'
                        setDropTargetPath(file.path)
                      }
                    }}
                    onDragLeave={() => {
                      if (dropTargetPath === file.path) setDropTargetPath(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (file.isDirectory) void handleMoveDrop(file.path)
                    }}
                    onClick={(e) => handleRowClick(file, index, e)}
                    onDoubleClick={() => handleDoubleClick(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    style={{
                      background: isDropTarget
                        ? '#fd87f625'
                        : isSelected
                        ? '#fd87f610'
                        : draggedPath === file.path
                        ? '#ffffff08'
                        : 'transparent',
                      borderBottom: '1px solid #ffffff08',
                      cursor: 'default',
                      opacity: draggedPath === file.path ? 0.5 : 1,
                      outline: isDropTarget ? '1px solid #fd87f640' : 'none',
                    }}
                  >
                    {/* Name */}
                    <td style={{ padding: '7px 12px', verticalAlign: 'middle' }}>
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
                            width: '200px',
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
                            maxWidth: 'calc(100% - 30px)',
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

                    {/* Date */}
                    <td
                      style={{
                        padding: '7px 8px',
                        textAlign: 'right',
                        color: '#61475f',
                        whiteSpace: 'nowrap',
                        width: '70px',
                        verticalAlign: 'middle',
                      }}
                    >
                      {formatDate(file.mtime)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden file inputs */}
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete"
          message={deleteConfirm.message}
          onConfirm={() => executeDelete(deleteConfirm.paths)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      <style>{`
        tr[data-file-row]:hover td { background: #ffffff05; }
      `}</style>
    </div>
  )
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
  loading,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
  loading?: boolean
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
        width: '28px',
        height: '28px',
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
