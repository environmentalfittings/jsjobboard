import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EmployeeInitialsInput } from '../EmployeeInitialsInput'
import { useToast } from '../ToastNotification'

type WeldingSectionProps = {
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

export function WeldingSection({ travelerId, valveId, onComplete }: WeldingSectionProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rowId, setRowId] = useState<string | null>(null)
  const [isNa, setIsNa] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [locked, setLocked] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [techInitials, setTechInitials] = useState('')
  const [weldProcedure, setWeldProcedure] = useState('')
  const [welderId, setWelderId] = useState('')
  const [preheatTemp, setPreheatTemp] = useState('')
  const [postheatTemp, setPostheatTemp] = useState('')
  const [fillerMaterial, setFillerMaterial] = useState('')
  const [inspectionResult, setInspectionResult] = useState('')
  const [notes, setNotes] = useState('')

  const persist = async (next: { is_na: boolean; is_complete: boolean; submitted_at: string | null; tech_initials: string | null }) => {
    const payload = {
      traveler_id: travelerId,
      valve_id: valveId,
      is_na: next.is_na,
      is_complete: next.is_complete,
      submitted_at: next.submitted_at,
      tech_initials: next.tech_initials,
      weld_procedure: next.is_na ? null : weldProcedure.trim() || null,
      welder_id: next.is_na ? null : welderId.trim() || null,
      preheat_temp: next.is_na ? null : preheatTemp.trim() || null,
      postheat_temp: next.is_na ? null : postheatTemp.trim() || null,
      filler_material: next.is_na ? null : fillerMaterial.trim() || null,
      inspection_result: next.is_na ? null : inspectionResult.trim() || null,
      notes: next.is_na ? null : notes.trim() || null,
    }
    const result = await supabase
      .from('traveler_welding')
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
        .from('traveler_welding')
        .select(
          'id,is_na,is_complete,submitted_at,tech_initials,weld_procedure,welder_id,preheat_temp,postheat_temp,filler_material,inspection_result,notes',
        )
        .eq('traveler_id', travelerId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        showToast(`Could not load Welding: ${error.message}`)
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
        setWeldProcedure((data.weld_procedure as string | null) ?? '')
        setWelderId((data.welder_id as string | null) ?? '')
        setPreheatTemp((data.preheat_temp as string | null) ?? '')
        setPostheatTemp((data.postheat_temp as string | null) ?? '')
        setFillerMaterial((data.filler_material as string | null) ?? '')
        setInspectionResult((data.inspection_result as string | null) ?? '')
        setNotes((data.notes as string | null) ?? '')
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
      showToast('Welding marked N/A and complete')
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
      showToast('Welding submitted')
      onComplete()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not submit Welding')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="status-breakdown-note">Loading Welding...</p>

  return (
    <section className="traveler-basic-section">
      {isComplete ? (
        <div className="traveler-basic-complete-banner">
          <span aria-hidden>✅</span>
          <span>
            Welding submitted
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
          <h4 className="traveler-basic-subtitle">Welding</h4>
          <label className="traveler-na-toggle">
            <input type="checkbox" checked={isNa} onChange={(e) => void handleNaToggle(e.target.checked)} disabled={locked || saving} /> N/A
          </label>
        </div>

        {isNa ? null : (
          <div className="traveler-spec-grid">
            <label>
              Weld Procedure
              <input value={weldProcedure} onChange={(e) => setWeldProcedure(e.target.value)} disabled={locked || saving} />
            </label>
            <label>
              Welder ID / Certification
              <input value={welderId} onChange={(e) => setWelderId(e.target.value)} disabled={locked || saving} />
            </label>
            <label>
              Preheat Temp
              <input value={preheatTemp} onChange={(e) => setPreheatTemp(e.target.value)} disabled={locked || saving} />
            </label>
            <label>
              Post-heat Temp
              <input value={postheatTemp} onChange={(e) => setPostheatTemp(e.target.value)} disabled={locked || saving} />
            </label>
            <label>
              Filler Material
              <input value={fillerMaterial} onChange={(e) => setFillerMaterial(e.target.value)} disabled={locked || saving} />
            </label>
            <label>
              Inspection Result
              <input value={inspectionResult} onChange={(e) => setInspectionResult(e.target.value)} disabled={locked || saving} />
            </label>
            <label className="new-job-span-full">
              Notes
              <textarea className="new-job-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked || saving} />
            </label>
          </div>
        )}
      </div>

      <div className="traveler-basic-card traveler-basic-submit-row">
        <EmployeeInitialsInput value={techInitials} onChange={setTechInitials} disabled={locked || saving} />
        <button type="button" className="button-primary" onClick={() => void submit()} disabled={locked || saving}>
          {saving ? 'Submitting...' : 'Submit Welding'}
        </button>
      </div>
    </section>
  )
}
