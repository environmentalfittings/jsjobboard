import { useEffect, useState } from 'react'
import type { Valve } from '../types'
import {
  commentsRequiredForReason,
  DUE_DATE_CHANGE_REASON_CODES,
  otherTextRequiredForReason,
  validateDueDateChangeDetails,
  type DueDateChangeReasonCode,
  type DueDateChangeSavePayload,
} from '../lib/dueDateChangeReasons'

interface DueDateChangeModalProps {
  valve: Valve
  onCancel: () => void
  onSave: (payload: DueDateChangeSavePayload) => void | Promise<void>
  isSaving?: boolean
  title?: string
  introExtra?: string
  commentsPlaceholder?: string
  /** Prefill reason dropdown when resuming from OTD pause, etc. */
  defaultReasonCode?: DueDateChangeReasonCode | ''
  /** Prefill the new-date field when the job card already chose a date. */
  initialNewDueDate?: string | null
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
  commentsPlaceholder = 'Explain why this valve is late / why the due date is moving…',
  defaultReasonCode = '',
  initialNewDueDate,
  newDateLabel = 'New due date',
}: DueDateChangeModalProps) {
  const [dueDate, setDueDate] = useState(() => toInputDate(initialNewDueDate ?? valve.due_date))
  const [reasonCode, setReasonCode] = useState<DueDateChangeReasonCode | ''>(defaultReasonCode)
  const [otherText, setOtherText] = useState('')
  const [comments, setComments] = useState('')
  const [customerNotified, setCustomerNotified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDueDate(toInputDate(initialNewDueDate ?? valve.due_date))
    setReasonCode(defaultReasonCode)
    setOtherText('')
    setComments('')
    setCustomerNotified(false)
    setError(null)
  }, [valve.id, valve.due_date, defaultReasonCode, initialNewDueDate])

  const previousLabel = toInputDate(valve.due_date) || 'None'
  const nextLabel = dueDate.trim() || 'None'
  const dateChanged = previousLabel !== nextLabel
  const needComments = commentsRequiredForReason(reasonCode)
  const needOther = otherTextRequiredForReason(reasonCode)

  const trySave = () => {
    if (!dateChanged) {
      setError('Pick a different date to continue.')
      return
    }
    const details = {
      reasonCode: reasonCode as DueDateChangeReasonCode,
      otherText,
      comments,
      customerNotified,
    }
    const validation = validateDueDateChangeDetails(details)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    void onSave({
      nextDueDate: dueDate.trim() || null,
      ...details,
    })
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel()
      }}
    >
      <div className="modal-card due-date-change-modal" role="dialog" aria-labelledby="due-date-change-title">
        <div className="technician-modal-head">
          <h3 id="due-date-change-title">{title}</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={onCancel}
            aria-label="Close"
            disabled={isSaving}
          >
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
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as DueDateChangeReasonCode | '')}
              disabled={isSaving}
            >
              <option value="">Select a reason…</option>
              {DUE_DATE_CHANGE_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          {needOther ? (
            <label>
              What is Other? <span className="due-date-change-required">(required)</span>
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Describe the Other reason…"
                disabled={isSaving}
              />
            </label>
          ) : null}
          <label>
            Comments
            {needComments ? (
              <span className="due-date-change-required"> (required)</span>
            ) : (
              <span className="job-muted"> (optional)</span>
            )}
            <textarea
              className="due-date-change-reason"
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={commentsPlaceholder}
              disabled={isSaving}
            />
          </label>
          <label className="due-date-change-notify">
            <input
              type="checkbox"
              checked={customerNotified}
              onChange={(e) => setCustomerNotified(e.target.checked)}
              disabled={isSaving}
            />
            <span>
              Customer has been notified of this due date change{' '}
              <span className="due-date-change-required">(required)</span>
            </span>
          </label>
        </div>
        {!dateChanged ? <p className="due-date-change-hint">Pick a different date to continue.</p> : null}
        {error ? (
          <p className="due-date-change-hint" role="alert" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        ) : null}
        <div className="new-job-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!dateChanged || isSaving}
            onClick={trySave}
          >
            {isSaving ? 'Saving…' : `Save · ${nextLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
