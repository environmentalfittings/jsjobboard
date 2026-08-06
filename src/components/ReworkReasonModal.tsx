import { useEffect, useState } from 'react'
import type { Valve } from '../types'

interface ReworkReasonModalProps {
  valve: Valve
  fromStatus: string
  toStatus: string
  onCancel: () => void
  onConfirm: (reason: string) => void | Promise<void>
  isSaving?: boolean
}

export function ReworkReasonModal({
  valve,
  fromStatus,
  toStatus,
  onCancel,
  onConfirm,
  isSaving = false,
}: ReworkReasonModalProps) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    setReason('')
  }, [valve.id, fromStatus, toStatus])

  const canSave = reason.trim().length > 0 && !isSaving

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel()
      }}
    >
      <div className="modal-card due-date-change-modal" role="dialog" aria-labelledby="rework-reason-title">
        <div className="technician-modal-head">
          <h3 id="rework-reason-title">Rework reason required</h3>
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
          {valve.customer ? ` · ${valve.customer}` : ''} is moving <strong>backward</strong> in the shop workflow.
          That means rework — please explain why.
        </p>
        <div className="due-date-change-form">
          <label>
            From
            <input type="text" value={fromStatus} readOnly disabled />
          </label>
          <label>
            To
            <input type="text" value={toStatus} readOnly disabled />
          </label>
          <label>
            Reason for rework <span className="due-date-change-required">(required)</span>
            <textarea
              className="due-date-change-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Failed hydro test — reseal seats and reassemble"
              disabled={isSaving}
              autoFocus
            />
          </label>
        </div>
        <div className="new-job-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!canSave}
            onClick={() => void onConfirm(reason.trim())}
          >
            {isSaving ? 'Saving…' : 'Save & move back'}
          </button>
        </div>
      </div>
    </div>
  )
}
