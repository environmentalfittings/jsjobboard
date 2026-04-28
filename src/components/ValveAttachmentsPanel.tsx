import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  attachmentPublicUrl,
  deleteValveAttachment,
  isImageMime,
  uploadValveAttachment,
} from '../lib/valveAttachments'
import { supabase } from '../lib/supabase'
import type { ValveAttachment } from '../types'

interface ValveAttachmentsPanelProps {
  valveRowId: number
  disabled?: boolean
  onListChange?: () => void
}

export function ValveAttachmentsPanel({ valveRowId, disabled, onListChange }: ValveAttachmentsPanelProps) {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ValveAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('valve_attachments')
      .select('id,valve_row_id,storage_path,file_name,mime_type,kind,created_at')
      .eq('valve_row_id', valveRowId)
      .order('created_at', { ascending: false })

    setLoading(false)
    if (error) {
      showToast('Could not load attachments')
      setLoadError(error.message || 'unknown error')
      setRows([])
      return
    }
    setLoadError(null)
    setRows((data ?? []) as ValveAttachment[])
  }, [valveRowId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const notifyChange = () => {
    onListChange?.()
  }

  const handleFiles = async (fileList: FileList | null, kind: 'photo' | 'file') => {
    if (!fileList?.length || disabled || busy) return
    setBusy(true)
    try {
      for (const file of Array.from(fileList)) {
        const { error } = await uploadValveAttachment(valveRowId, file, kind)
        if (error) {
          showToast(error)
          setBusy(false)
          return
        }
      }
      showToast(fileList.length > 1 ? 'Files uploaded' : 'Uploaded')
      await load()
      notifyChange()
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const remove = async (row: ValveAttachment) => {
    if (disabled || busy) return
    if (!window.confirm(`Remove “${row.file_name}”?`)) return
    setBusy(true)
    const { error } = await deleteValveAttachment(row)
    setBusy(false)
    if (error) {
      showToast(error)
      return
    }
    showToast('Attachment removed')
    await load()
    notifyChange()
  }

  return (
    <div className="valve-attachments-panel">
      <div className="modal-label">Attachments & photos</div>
      <p className="valve-attachments-hint">Add files from your device or take a picture (mobile opens the camera).</p>

      <div className="valve-attachments-actions">
        <input
          ref={fileInputRef}
          type="file"
          className="valve-attachments-file-input"
          accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.txt,.csv"
          multiple
          disabled={disabled || busy}
          onChange={(e) => void handleFiles(e.target.files, 'file')}
        />
        <input
          ref={cameraInputRef}
          type="file"
          className="valve-attachments-file-input"
          accept="image/*"
          capture="environment"
          disabled={disabled || busy}
          onChange={(e) => void handleFiles(e.target.files, 'photo')}
        />
        <button
          type="button"
          className="button-secondary"
          disabled={disabled || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? 'Working…' : 'Add files'}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={disabled || busy}
          onClick={() => cameraInputRef.current?.click()}
        >
          Take photo
        </button>
      </div>

      {loading ? (
        <p className="placeholder-copy">Loading attachments…</p>
      ) : loadError ? (
        <div className="valve-attachments-error" role="alert">
          <p className="valve-attachments-error-title">Attachments are unavailable right now.</p>
          <p className="valve-attachments-error-body">
            This appears to be a backend/storage configuration issue, not something you did. Please contact an admin.
          </p>
          <p className="valve-attachments-error-meta">Details: {loadError}</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="placeholder-copy">No attachments yet.</p>
      ) : (
        <ul className="valve-attachments-grid">
          {rows.map((row) => {
            const url = attachmentPublicUrl(row.storage_path)
            const image = isImageMime(row.mime_type, row.file_name)
            return (
              <li key={row.id} className="valve-attachment-tile">
                {image ? (
                  <a href={url} target="_blank" rel="noreferrer" className="valve-attachment-thumb-wrap">
                    <img src={url} alt="" className="valve-attachment-thumb" />
                  </a>
                ) : (
                  <a href={url} target="_blank" rel="noreferrer" className="valve-attachment-file-link">
                    {row.file_name}
                  </a>
                )}
                <div className="valve-attachment-meta">
                  <span className="valve-attachment-name" title={row.file_name}>
                    {row.file_name}
                  </span>
                  <button
                    type="button"
                    className="valve-attachment-remove"
                    disabled={disabled || busy}
                    onClick={() => void remove(row)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
