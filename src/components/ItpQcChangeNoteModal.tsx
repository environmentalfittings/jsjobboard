import { useState } from 'react'

type Props = {
  summary: string
  title?: string
  subtitle?: string
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (note: string) => void
}

export function ItpQcChangeNoteModal({
  summary,
  title = 'Record scope change',
  subtitle = 'Quality Team changes to Build Scope are saved in the change log.',
  confirmLabel = 'Save with note',
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const [note, setNote] = useState('')

  const submit = () => {
    const trimmed = note.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="modal-card itp-qc-change-modal"
        role="dialog"
        aria-labelledby="itp-qc-change-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h3 id="itp-qc-change-title">{title}</h3>
            <p className="modal-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="modal-close-x" onClick={onCancel} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        <p className="itp-qc-change-summary">
          <strong>Summary:</strong> {summary}
        </p>

        <label className="modal-label" htmlFor="itp-qc-change-note">
          Change note (required)
        </label>
        <textarea
          id="itp-qc-change-note"
          className="modal-textarea"
          rows={4}
          value={note}
          disabled={busy}
          placeholder="Describe the changes…"
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />

        <div className="modal-actions">
          <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={busy || !note.trim()}
            onClick={submit}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
