import { useEffect, useState } from 'react'
import { useToast } from './ToastNotification'
import { createCopiedJob } from '../lib/copyJob'
import { suggestNextValveIdOnOrder } from '../lib/valveIdCopy'
import type { Valve } from '../types'

interface CopyJobModalProps {
  source: Valve
  onCancel: () => void
  onCreated: (newValveId: string) => void
}

type SameOrderChoice = 'unset' | 'yes' | 'no'

export function CopyJobModal({ source, onCancel, onCreated }: CopyJobModalProps) {
  const { showToast } = useToast()
  const [sameOrder, setSameOrder] = useState<SameOrderChoice>('unset')
  const [valveId, setValveId] = useState('')
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSameOrder('unset')
    setValveId('')
    setLoadingSuggestion(false)
    setSaving(false)
  }, [source.id])

  const chooseSameOrder = async (choice: 'yes' | 'no') => {
    setSameOrder(choice)
    if (choice === 'no') {
      setValveId('')
      return
    }

    setLoadingSuggestion(true)
    try {
      const suggested = await suggestNextValveIdOnOrder(source.valve_id)
      setValveId(suggested)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not suggest next Valve ID')
      setSameOrder('no')
      setValveId('')
    } finally {
      setLoadingSuggestion(false)
    }
  }

  const submit = async () => {
    const id = valveId.trim()
    if (!id) {
      showToast('Valve ID is required')
      return
    }

    setSaving(true)
    const { error } = await createCopiedJob(source, id)
    setSaving(false)

    if (error) {
      showToast(error)
      return
    }

    showToast(`Job copied: ${id}`)
    onCreated(id)
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel()
      }}
    >
      <div className="modal-card copy-job-modal" role="dialog" aria-labelledby="copy-job-title">
        <div className="technician-modal-head">
          <h3 id="copy-job-title">Copy job card</h3>
          <button type="button" className="modal-close-x" onClick={onCancel} disabled={saving} aria-label="Close">
            ×
          </button>
        </div>

        <p className="copy-job-intro">
          Copying <strong>{source.valve_id}</strong>
          {source.customer ? ` · ${source.customer}` : ''}. All job details will be copied to a new card with a fresh
          status.
        </p>

        <div className="copy-job-question">
          <p className="copy-job-question-label">Is this added onto the same order?</p>
          <div className="copy-job-choice-row">
            <button
              type="button"
              className={`button-secondary copy-job-choice-btn${sameOrder === 'yes' ? ' copy-job-choice-btn--active' : ''}`}
              onClick={() => void chooseSameOrder('yes')}
              disabled={saving || loadingSuggestion}
            >
              Yes — next valve on order
            </button>
            <button
              type="button"
              className={`button-secondary copy-job-choice-btn${sameOrder === 'no' ? ' copy-job-choice-btn--active' : ''}`}
              onClick={() => void chooseSameOrder('no')}
              disabled={saving || loadingSuggestion}
            >
              No — different order
            </button>
          </div>
          {sameOrder === 'yes' ? (
            <p className="copy-job-hint">
              The dash number will advance automatically (for example, {source.valve_id} → next available suffix).
            </p>
          ) : sameOrder === 'no' ? (
            <p className="copy-job-hint">Enter the Valve ID for the new job.</p>
          ) : null}
        </div>

        {sameOrder !== 'unset' ? (
          <label className="copy-job-field">
            <span>
              Valve ID <span className="required-mark">*</span>
            </span>
            <input
              type="text"
              value={valveId}
              onChange={(e) => setValveId(e.target.value)}
              placeholder={sameOrder === 'yes' ? 'Loading next ID…' : 'e.g. 488518-6'}
              disabled={saving || loadingSuggestion}
              autoFocus
            />
          </label>
        ) : null}

        <div className="copy-job-actions">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => void submit()}
            disabled={saving || loadingSuggestion || sameOrder === 'unset' || !valveId.trim()}
          >
            {saving ? 'Creating…' : 'Create copied job'}
          </button>
        </div>
      </div>
    </div>
  )
}
