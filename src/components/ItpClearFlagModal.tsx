import { useState } from 'react'

export type ClearFlagChoice = 'accident' | 'other'

type Props = {
  itemName: string
  busy?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
  showToast: (message: string) => void
}

export function ItpClearFlagModal({
  itemName,
  busy = false,
  onCancel,
  onConfirm,
  showToast,
}: Props) {
  const [choice, setChoice] = useState<ClearFlagChoice | null>(null)
  const [otherReason, setOtherReason] = useState('')

  const submit = () => {
    if (choice === 'accident') {
      onConfirm('Hit by accident')
      return
    }
    if (choice === 'other') {
      const trimmed = otherReason.trim()
      if (!trimmed) {
        showToast('Enter a reason for removing the flag')
        return
      }
      onConfirm(trimmed)
      return
    }
    showToast('Select why you are removing this flag')
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="modal-card itp-flag-modal"
        role="dialog"
        aria-labelledby="itp-clear-flag-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h3 id="itp-clear-flag-title">Remove flag</h3>
            <p className="modal-subtitle">{itemName}</p>
          </div>
          <button type="button" className="modal-close-x" onClick={onCancel} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        <p className="placeholder-copy" style={{ marginTop: 0 }}>
          Select why this flag is being removed.
        </p>

        <div className="itp-clear-flag-options">
          <label className="itp-clear-flag-option">
            <input
              type="radio"
              name="itp-clear-flag-choice"
              checked={choice === 'accident'}
              disabled={busy}
              onChange={() => setChoice('accident')}
            />
            <span>Hit by accident</span>
          </label>
          <label className="itp-clear-flag-option">
            <input
              type="radio"
              name="itp-clear-flag-choice"
              checked={choice === 'other'}
              disabled={busy}
              onChange={() => setChoice('other')}
            />
            <span>Other</span>
          </label>
        </div>

        {choice === 'other' ? (
          <>
            <label className="modal-label" htmlFor="itp-clear-flag-other">
              Reason (required)
            </label>
            <textarea
              id="itp-clear-flag-other"
              className="modal-textarea"
              rows={3}
              value={otherReason}
              disabled={busy}
              placeholder="Why is this flag being removed?"
              onChange={(e) => setOtherReason(e.target.value)}
              autoFocus
            />
          </>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button-primary" disabled={busy || !choice} onClick={submit}>
            {busy ? 'Saving…' : 'Remove flag'}
          </button>
        </div>
      </div>
    </div>
  )
}
