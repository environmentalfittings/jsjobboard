import { useRef, useState } from 'react'
import { uploadItpFlagPhoto } from '../lib/itpLibraryAttachments'
import type { ItpLibraryAttachment } from '../types/itpLibraryPlan'

const MAX_FLAG_PHOTOS = 3

type Props = {
  valveRowId: number
  itemId: string
  itemName: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (input: { reason: string; photos: ItpLibraryAttachment[] }) => void
  showToast: (message: string) => void
}

export function ItpFlagIssueModal({
  valveRowId,
  itemId,
  itemName,
  busy = false,
  onCancel,
  onConfirm,
  showToast,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<ItpLibraryAttachment[]>([])
  const [uploading, setUploading] = useState(false)

  const addPhotos = async (fileList: FileList | null) => {
    if (!fileList?.length || uploading || busy) return
    const remaining = MAX_FLAG_PHOTOS - photos.length
    if (remaining <= 0) {
      showToast(`You can attach up to ${MAX_FLAG_PHOTOS} photos`)
      return
    }
    setUploading(true)
    try {
      const next = [...photos]
      for (const file of Array.from(fileList).slice(0, remaining)) {
        const { attachment, error } = await uploadItpFlagPhoto(valveRowId, itemId, file)
        if (error || !attachment) {
          showToast(error ?? 'Upload failed')
          break
        }
        next.push(attachment)
      }
      setPhotos(next)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  const submit = () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      showToast('Enter the reason this item is flagged')
      return
    }
    onConfirm({ reason: trimmed, photos })
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card itp-flag-modal"
        role="dialog"
        aria-labelledby="itp-flag-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h2 id="itp-flag-title">Flag ITP item</h2>
            <p className="modal-meta">{itemName}</p>
          </div>
          <button type="button" className="modal-window-toggle" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <p className="placeholder-copy resources-hint">
          Quality Team will be notified. Describe the problem and attach up to {MAX_FLAG_PHOTOS} photos.
        </p>

        <label className="itp-flag-reason">
          Reason for flag
          <textarea
            rows={3}
            value={reason}
            placeholder="What is wrong / why this needs QC attention…"
            disabled={busy || uploading}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>

        <div className="itp-flag-photos">
          <div className="itp-flag-photos-hdr">
            <span>
              Photos ({photos.length}/{MAX_FLAG_PHOTOS})
            </span>
            <div className="itp-flag-photo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="itp-library-attachments-file-input"
                disabled={busy || uploading || photos.length >= MAX_FLAG_PHOTOS}
                onChange={(e) => void addPhotos(e.target.files)}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="itp-library-attachments-file-input"
                disabled={busy || uploading || photos.length >= MAX_FLAG_PHOTOS}
                onChange={(e) => void addPhotos(e.target.files)}
              />
              <button
                type="button"
                className="button-secondary"
                disabled={busy || uploading || photos.length >= MAX_FLAG_PHOTOS}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Add photos'}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || uploading || photos.length >= MAX_FLAG_PHOTOS}
                onClick={() => cameraRef.current?.click()}
              >
                Take photo
              </button>
            </div>
          </div>
          {photos.length === 0 ? (
            <p className="placeholder-copy">No photos yet (optional, up to {MAX_FLAG_PHOTOS}).</p>
          ) : (
            <div className="itp-flag-photo-grid">
              {photos.map((photo) => (
                <div key={photo.id} className="itp-flag-photo-card">
                  <img src={photo.url} alt={photo.fileName} />
                  <button
                    type="button"
                    className="link-button link-button-danger"
                    disabled={busy || uploading}
                    onClick={() => removePhoto(photo.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-details-actions">
          <button type="button" className="button-primary" disabled={busy || uploading} onClick={submit}>
            {busy ? 'Flagging…' : 'Flag & notify Quality Team'}
          </button>
          <button type="button" className="button-secondary" disabled={busy || uploading} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
