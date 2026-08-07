import { useEffect, useState } from 'react'
import type { Valve } from '../types'

interface DueDateChangeModalProps {
  valve: Valve
  onCancel: () => void
  onSave: (nextDueDate: string | null, reason: string) => void | Promise<void>
  isSaving?: boolean
  title?: string
  introExtra?: string
  reasonPlaceholder?: string
  defaultReason?: string
  newDateLabel?: string
}

function toInputDate(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().slice(0, 10)
}

export function DueDateChangeModal({
  valve,
  onCancel,
  onSave,
  isSaving = false,
  title = 'Change due date',
  introExtra,
  reasonPlaceholder = 'Explain why the due date is being moved…',
  defaultReason = '',
  newDateLabel = 'New due date',
}: DueDateChangeModalProps) {
  const [dueDate, setDueDate] = useState(() => toInputDate(valve.due_date))
  const [reason, setReason] = useState(defaultReason)

  useEffect(() => {
    setDueDate(toInputDate(valve.due_date))
    setReason(defaultReason)
  }, [valve.id, valve.due_date, defaultReason])

  const previousLabel = toInputDate(valve.due_date) || 'None'
  const nextLabel = dueDate.trim() || 'None'
  const dateChanged = previousLabel !== nextLabel
  const canSave = dateChanged && reason.trim().length > 0 && !isSaving

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal-card due-date-change-modal" role="dialog" aria-labelledby="due-date-change-title">
        <div className="technician-modal-head">
          <h3 id="due-date-change-title">{title}</h3>
          <button type="button" className="modal-close-x" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <p className="due-date-change-intro">
          Job <strong>{valve.valve_id}</strong>
          {valve.customer ? ` · ${valve.customer}` : ''}
        </p>
        {introExtra ? <p className="due-date-change-intro due-date-change-intro-extra">{introExtra}</p> : null}
        <div className="due-date-change-form">
          <label>
            Current due date
            <input type="text" value={previousLabel} readOnly disabled />
          </label>
          <label>
            {newDateLabel}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isSaving}
            />
          </label>
          <label>
            Reason for change <span className="due-date-change-required">(required)</span>
            <textarea
              className="due-date-change-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              disabled={isSaving}
            />
          </label>
        </div>
        {!dateChanged ? <p className="due-date-change-hint">Pick a different date to continue.</p> : null}
        <div className="new-job-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!canSave}
            onClick={() => void onSave(dueDate.trim() || null, reason.trim())}
          >
            {isSaving ? 'Saving…' : `Save · ${nextLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
