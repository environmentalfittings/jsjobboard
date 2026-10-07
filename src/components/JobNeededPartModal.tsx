import { useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { emptyJobNeededPartDraft, type JobNeededPartDraft } from '../lib/jobNeededParts'

type Props = {
  stepName: string
  saving?: boolean
  onClose: () => void
  onSave: (draft: JobNeededPartDraft) => Promise<boolean>
}

export function JobNeededPartModal({ stepName, saving = false, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<JobNeededPartDraft>(() => emptyJobNeededPartDraft())

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const ok = await onSave(draft)
    if (ok) onClose()
  }

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="needed-part-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <form className="modal-card needed-part-modal" onSubmit={(e) => void submit(e)}>
        <header className="itp-traveler-step-hdr">
          <div>
            <p className="itp-traveler-step-kicker">Needs parts</p>
            <h2 id="needed-part-title">Add a required part</h2>
            <p className="itp-traveler-step-ref">{stepName}</p>
          </div>
          <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </header>
        <div className="needed-part-modal-body">
          <label>
            Part name
            <input
              value={draft.partName}
              onChange={(e) => setDraft((prev) => ({ ...prev, partName: e.target.value }))}
              placeholder="e.g. Stem packing set"
              autoFocus
              required
            />
          </label>
          <div className="needed-part-modal-row">
            <label>
              Part number
              <input
                value={draft.partNumber}
                onChange={(e) => setDraft((prev) => ({ ...prev, partNumber: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label>
              Qty
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) => setDraft((prev) => ({ ...prev, quantity: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </label>
          </div>
          <label>
            Supplier / OEM
            <input
              value={draft.supplier}
              onChange={(e) => setDraft((prev) => ({ ...prev, supplier: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label>
            Notes
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Size, material, why it is needed…"
              rows={3}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={saving || !draft.partName.trim()}>
            {saving ? 'Saving…' : 'Add to needs parts'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
