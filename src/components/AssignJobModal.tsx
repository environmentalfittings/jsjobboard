import { useState } from 'react'
import type { Technician, Valve } from '../types'

interface AssignJobModalProps {
  job: Valve
  assignableTechs: Technician[]
  onClose: () => void
  onConfirm: (job: Valve, techId: number, notes: string) => void | Promise<void>
}

export function AssignJobModal({ job, assignableTechs, onClose, onConfirm }: AssignJobModalProps) {
  const [techId, setTechId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-card-wide">
        <h3>Assign {job.valve_id}</h3>
        <label className="modal-label">
          Assign to
          <select className="modal-status-select" value={techId} onChange={(e) => setTechId(e.target.value)} disabled={saving}>
            <option value="">Select technician…</option>
            {assignableTechs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="modal-label">
          Notes for technician
          <textarea className="modal-textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
        </label>
        <div className="technician-modal-footer">
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!techId || saving}
            onClick={async () => {
              const parsed = Number.parseInt(techId, 10)
              if (!Number.isFinite(parsed)) return
              setSaving(true)
              await onConfirm(job, parsed, notes)
              setSaving(false)
            }}
          >
            {saving ? 'Assigning…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
