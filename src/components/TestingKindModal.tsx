import { useEffect, useState } from 'react'
import {
  defaultShopTestKind,
  shopTestKindLabel,
  type ShopTestKind,
} from '../lib/testKind'
import type { Valve } from '../types'

interface TestingKindModalProps {
  valve: Valve
  onCancel: () => void
  onConfirm: (kind: ShopTestKind) => void | Promise<void>
  isSaving?: boolean
}

export function TestingKindModal({
  valve,
  onCancel,
  onConfirm,
  isSaving = false,
}: TestingKindModalProps) {
  const [kind, setKind] = useState<ShopTestKind>(() => defaultShopTestKind(valve))

  useEffect(() => {
    setKind(defaultShopTestKind(valve))
  }, [valve.id, valve.date_pre_tested])

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSaving) onCancel()
      }}
    >
      <div className="modal-card due-date-change-modal" role="dialog" aria-labelledby="testing-kind-title">
        <div className="technician-modal-head">
          <h3 id="testing-kind-title">Pre-test or final test?</h3>
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
          {valve.customer ? ` · ${valve.customer}` : ''} is moving to <strong>Testing</strong>. Choose which
          badge to stamp on the board.
        </p>
        <div className="testing-kind-options" role="radiogroup" aria-label="Test kind">
          {(['pre', 'final'] as const).map((option) => (
            <label key={option} className={`testing-kind-option${kind === option ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="testing-kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                disabled={isSaving}
              />
              <span>
                <strong>{shopTestKindLabel(option)}</strong>
                <span className="testing-kind-option-hint">
                  {option === 'pre'
                    ? 'As-received / pretest — shows Pre-tested'
                    : 'After repair / final shop test — shows Final tested'}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="new-job-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={isSaving}
            onClick={() => void onConfirm(kind)}
          >
            {isSaving ? 'Saving…' : `Continue with ${shopTestKindLabel(kind).toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
