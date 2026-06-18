import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ToastNotification'

type OtherPartsSectionProps = {
  travelerId: string
  valveId: string
  onComplete: () => void
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function OtherPartsSection({ travelerId, valveId, onComplete }: OtherPartsSectionProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rowId, setRowId] = useState<string | null>(null)
  const [isNa, setIsNa] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [locked, setLocked] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [techInitials, setTechInitials] = useState('')
  const [partsNotes, setPartsNotes] = useState('')

  const persist = async (next: { is_na: boolean; is_complete: boolean; submitted_at: string | null; tech_initials: string | null }) => {
    const payload = {
      traveler_id: travelerId,
      valve_id: valveId,
      is_na: next.is_na,
      is_complete: next.is_complete,
      submitted_at: next.submitted_at,
      tech_initials: next.tech_initials,
      parts_notes: next.is_na ? null : partsNotes.trim() || null,
    }
    const result = await supabase
      .from('traveler_other_parts')
      .upsert(
        {
          id: rowId ?? crypto.randomUUID(),
          ...payload,
        },
        { onConflict: 'id' },
      )
      .select('id,submitted_at')
      .single()
    if (result.error) throw result.error
    const data = result.data as { id: string; submitted_at: string | null }
    setRowId(data.id)
    setSubmittedAt(data.submitted_at ?? null)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('traveler_other_parts')
        .select('id,is_na,is_complete,submitted_at,tech_initials,parts_notes')
        .eq('traveler_id', travelerId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        showToast(`Could not load Other Parts Required: ${error.message}`)
        setLoading(false)
        return
      }
      if (data) {
        setRowId(data.id as string)
        setIsNa(Boolean(data.is_na))
        setIsComplete(Boolean(data.is_complete))
        setLocked(Boolean(data.is_complete))
        setSubmittedAt((data.submitted_at as string | null) ?? null)
        setTechInitials((data.tech_initials as string | null) ?? '')
        setPartsNotes((data.parts_notes as string | null) ?? '')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [travelerId, showToast])

  const handleNaToggle = async (checked: boolean) => {
    setIsNa(checked)
    if (!checked || locked) return
    setSaving(true)
    try {
      const submitted = new Date().toISOString()
      await persist({ is_na: true, is_complete: true, submitted_at: submitted, tech_initials: null })
      setIsComplete(true)
      setLocked(true)
      showToast('Other Parts Required marked N/A and complete')
      onComplete()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save N/A')
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (!isNa && !techInitials.trim()) {
      showToast('Tech initials are required before submit.')
      return
    }
    setSaving(true)
    try {
      const submitted = new Date().toISOString()
      const initials = isNa ? null : techInitials.trim().slice(0, 6).toUpperCase()
      await persist({ is_na: isNa, is_complete: true, submitted_at: submitted, tech_initials: initials })
      setTechInitials(initials ?? '')
      setIsComplete(true)
      setLocked(true)
      showToast('Other Parts Required submitted')
      onComplete()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not submit Other Parts Required')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="status-breakdown-note">Loading Other Parts Required...</p>

  return (
    <section className="traveler-basic-section">
      {isComplete ? (
        <div className="traveler-basic-complete-banner">
          <span aria-hidden>✅</span>
          <span>
            Other Parts Required submitted
            {techInitials ? ` by ${techInitials}` : ''}
            {submittedAt ? ` on ${formatDateLabel(submittedAt)}` : ''}
          </span>
          <button type="button" className="button-secondary" onClick={() => setLocked((p) => !p)}>
            {locked ? 'Edit' : 'Lock'}
          </button>
        </div>
      ) : null}

      <div className="traveler-basic-card">
        <div className="traveler-section-head-row">
          <h4 className="traveler-basic-subtitle">Other Parts Required</h4>
          <label className="traveler-na-toggle">
            <input type="checkbox" checked={isNa} onChange={(e) => void handleNaToggle(e.target.checked)} disabled={locked || saving} /> N/A
          </label>
        </div>
        {isNa ? null : (
          <label className="traveler-textarea-label">
            Other Parts Required Notes
            <textarea className="new-job-textarea" value={partsNotes} onChange={(e) => setPartsNotes(e.target.value)} disabled={locked || saving} />
          </label>
        )}
      </div>

      <div className="traveler-basic-card traveler-basic-submit-row">
        <label className="traveler-tech-initials">
          Tech Initials
          <input value={techInitials} maxLength={6} onChange={(e) => setTechInitials(e.target.value.toUpperCase())} disabled={locked || saving} />
        </label>
        <button type="button" className="button-primary" onClick={() => void submit()} disabled={locked || saving}>
          {saving ? 'Submitting...' : 'Submit Other Parts Required'}
        </button>
      </div>
    </section>
  )
}
