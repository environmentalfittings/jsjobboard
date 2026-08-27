import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  appendItpLineToTraveler,
  ITP_TRAVELER_SECTION_OPTIONS,
  suggestTravelerSectionFromShopArea,
} from '../lib/itpTravelerBridge'
import type { ItpLibraryItemSel, ItpTravelerNoteSection } from '../types/itpLibraryPlan'

type Props = {
  valveIdText: string
  itemName: string
  shopArea?: string
  sel: ItpLibraryItemSel
  busy?: boolean
  onCancel: () => void
  onSaved: (next: Pick<ItpLibraryItemSel, 'addToTraveler' | 'travelerEntry'>) => void
  onCleared: () => void
  showToast: (message: string) => void
}

export function ItpAddToTravelerModal({
  valveIdText,
  itemName,
  shopArea,
  sel,
  busy = false,
  onCancel,
  onSaved,
  onCleared,
  showToast,
}: Props) {
  const existing = sel.travelerEntry
  const [section, setSection] = useState<ItpTravelerNoteSection>(
    existing?.section ?? suggestTravelerSectionFromShopArea(shopArea),
  )
  const [notes, setNotes] = useState(existing?.notes || sel.notes || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSection(existing?.section ?? suggestTravelerSectionFromShopArea(shopArea))
    setNotes(existing?.notes || sel.notes || '')
  }, [existing?.section, existing?.notes, sel.notes, shopArea])

  const submit = async () => {
    if (busy || saving) return
    const trimmed = notes.trim()
    if (!trimmed) {
      showToast('Enter what should go on the traveler')
      return
    }
    if (!valveIdText.trim()) {
      showToast('This job needs a valve ID before it can write to the traveler')
      return
    }
    setSaving(true)
    try {
      const result = await appendItpLineToTraveler({
        valveIdText,
        section,
        itemName,
        notes: trimmed,
        previousBlock: existing?.block,
      })
      onSaved({
        addToTraveler: true,
        travelerEntry: {
          section,
          notes: trimmed,
          savedAt: result.savedAt,
          block: result.block,
        },
      })
      showToast('Saved to shop traveler')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save to traveler')
    } finally {
      setSaving(false)
    }
  }

  const clearLink = () => {
    if (busy || saving) return
    if (!window.confirm('Remove the traveler link from this ITP line? (Traveler notes already saved are kept.)')) {
      return
    }
    onCleared()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card itp-add-traveler-modal"
        role="dialog"
        aria-labelledby="itp-add-traveler-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h3 id="itp-add-traveler-title">Add to Traveler</h3>
            <p className="modal-subtitle">
              Capture traveler detail for <strong>{itemName}</strong> without duplicating it as ITP checklist work.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="itp-add-traveler-body">
          <label className="itp-add-traveler-field">
            <span>Traveler section</span>
            <select
              value={section}
              disabled={saving || busy}
              onChange={(e) => setSection(e.target.value as ItpTravelerNoteSection)}
            >
              {ITP_TRAVELER_SECTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="itp-add-traveler-field">
            <span>What to record on the traveler</span>
            <textarea
              rows={6}
              value={notes}
              disabled={saving || busy}
              placeholder="Findings, dimensions, parts notes, weld details…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {existing?.savedAt ? (
            <p className="itp-add-traveler-meta">
              Last saved {new Date(existing.savedAt).toLocaleString()}. Saving again updates that traveler note.
            </p>
          ) : (
            <p className="itp-add-traveler-meta">
              Saves into the shop traveler for this valve. Open{' '}
              {valveIdText.trim() ? (
                <Link to={`/traveler/${encodeURIComponent(valveIdText.trim())}`} target="_blank" rel="noreferrer">
                  Traveler
                </Link>
              ) : (
                'Traveler'
              )}{' '}
              anytime to review the full form.
            </p>
          )}
        </div>

        <div className="modal-actions itp-add-traveler-actions">
          {sel.addToTraveler ? (
            <button type="button" className="button-secondary" disabled={saving || busy} onClick={clearLink}>
              Remove link
            </button>
          ) : (
            <span />
          )}
          <div className="itp-add-traveler-actions-right">
            <button type="button" className="button-secondary" disabled={saving || busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="button-primary" disabled={saving || busy} onClick={() => void submit()}>
              {saving ? 'Saving…' : existing?.savedAt ? 'Update traveler' : 'Save to traveler'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
