import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ToastNotification'

type TestingQCSectionProps = {
  travelerId: string
  valveId: string
  onComplete: () => void
}

type StageKey = 'testing' | 'qa' | 'shipping' | 'final'

type TestingQcRow = {
  id: string
  traveler_id: string
  valve_id: string
  testing_notes: string | null
  testing_tech_initials: string | null
  testing_completed_at: string | null
  qa_test_area_notes: string | null
  qa_test_area_tech_initials: string | null
  qa_test_area_completed_at: string | null
  shipping_notes: string | null
  shipping_tech_initials: string | null
  shipping_completed_at: string | null
  final_inspection_notes: string | null
  final_inspection_tech_initials: string | null
  final_inspection_completed_at: string | null
  is_complete: boolean
}

type StageState = {
  notes: string
  initials: string
  completedAt: string | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function TestingQCSection({ travelerId, valveId, onComplete }: TestingQCSectionProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [savingStage, setSavingStage] = useState<StageKey | null>(null)
  const [rowId, setRowId] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const [testing, setTesting] = useState<StageState>({ notes: '', initials: '', completedAt: null })
  const [qa, setQa] = useState<StageState>({ notes: '', initials: '', completedAt: null })
  const [shipping, setShipping] = useState<StageState>({ notes: '', initials: '', completedAt: null })
  const [finalInspection, setFinalInspection] = useState<StageState>({ notes: '', initials: '', completedAt: null })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('traveler_testing_qc')
        .select(
          'id,traveler_id,valve_id,testing_notes,testing_tech_initials,testing_completed_at,qa_test_area_notes,qa_test_area_tech_initials,qa_test_area_completed_at,shipping_notes,shipping_tech_initials,shipping_completed_at,final_inspection_notes,final_inspection_tech_initials,final_inspection_completed_at,is_complete',
        )
        .eq('traveler_id', travelerId)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        showToast(`Could not load Testing & QC: ${error.message}`)
        setLoading(false)
        return
      }

      if (data) {
        const row = data as TestingQcRow
        setRowId(row.id)
        setIsComplete(Boolean(row.is_complete))
        setTesting({
          notes: row.testing_notes ?? '',
          initials: row.testing_tech_initials ?? '',
          completedAt: row.testing_completed_at ?? null,
        })
        setQa({
          notes: row.qa_test_area_notes ?? '',
          initials: row.qa_test_area_tech_initials ?? '',
          completedAt: row.qa_test_area_completed_at ?? null,
        })
        setShipping({
          notes: row.shipping_notes ?? '',
          initials: row.shipping_tech_initials ?? '',
          completedAt: row.shipping_completed_at ?? null,
        })
        setFinalInspection({
          notes: row.final_inspection_notes ?? '',
          initials: row.final_inspection_tech_initials ?? '',
          completedAt: row.final_inspection_completed_at ?? null,
        })
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [travelerId, showToast])

  const locked = useMemo(() => {
    return {
      testing: false,
      qa: !testing.completedAt,
      shipping: !qa.completedAt,
      final: !shipping.completedAt,
    }
  }, [testing.completedAt, qa.completedAt, shipping.completedAt])

  const persistRow = async (patch: Partial<TestingQcRow>) => {
    const basePayload = {
      traveler_id: travelerId,
      valve_id: valveId,
      testing_notes: testing.notes.trim() || null,
      testing_tech_initials: testing.initials.trim() || null,
      testing_completed_at: testing.completedAt,
      qa_test_area_notes: qa.notes.trim() || null,
      qa_test_area_tech_initials: qa.initials.trim() || null,
      qa_test_area_completed_at: qa.completedAt,
      shipping_notes: shipping.notes.trim() || null,
      shipping_tech_initials: shipping.initials.trim() || null,
      shipping_completed_at: shipping.completedAt,
      final_inspection_notes: finalInspection.notes.trim() || null,
      final_inspection_tech_initials: finalInspection.initials.trim() || null,
      final_inspection_completed_at: finalInspection.completedAt,
      is_complete: isComplete,
      ...patch,
    }

    const result = await supabase
      .from('traveler_testing_qc')
      .upsert(
        {
          id: rowId ?? crypto.randomUUID(),
          ...basePayload,
        },
        { onConflict: 'id' },
      )
      .select('id')
      .single()

    if (result.error) throw result.error
    const data = result.data as { id: string }
    setRowId(data.id)
  }

  const signOff = async (stage: StageKey) => {
    if (loading || savingStage) return
    if (stage === 'qa' && locked.qa) return
    if (stage === 'shipping' && locked.shipping) return
    if (stage === 'final' && locked.final) return

    let stageData: StageState
    let nextPatch: Partial<TestingQcRow> = {}
    const now = new Date().toISOString()

    if (stage === 'testing') {
      stageData = testing
      if (testing.completedAt) return
      if (!testing.initials.trim()) {
        showToast('Testing initials are required.')
        return
      }
      const initials = testing.initials.trim().slice(0, 6).toUpperCase()
      setTesting((prev) => ({ ...prev, initials, completedAt: now }))
      nextPatch = {
        testing_notes: testing.notes.trim() || null,
        testing_tech_initials: initials,
        testing_completed_at: now,
      }
    } else if (stage === 'qa') {
      stageData = qa
      if (qa.completedAt) return
      if (!qa.initials.trim()) {
        showToast('QA Test Area initials are required.')
        return
      }
      const initials = qa.initials.trim().slice(0, 6).toUpperCase()
      setQa((prev) => ({ ...prev, initials, completedAt: now }))
      nextPatch = {
        qa_test_area_notes: qa.notes.trim() || null,
        qa_test_area_tech_initials: initials,
        qa_test_area_completed_at: now,
      }
    } else if (stage === 'shipping') {
      stageData = shipping
      if (shipping.completedAt) return
      if (!shipping.initials.trim()) {
        showToast('Shipping initials are required.')
        return
      }
      const initials = shipping.initials.trim().slice(0, 6).toUpperCase()
      setShipping((prev) => ({ ...prev, initials, completedAt: now }))
      nextPatch = {
        shipping_notes: shipping.notes.trim() || null,
        shipping_tech_initials: initials,
        shipping_completed_at: now,
      }
    } else {
      stageData = finalInspection
      if (finalInspection.completedAt) return
      if (!finalInspection.initials.trim()) {
        showToast('Final Inspection initials are required.')
        return
      }
      const initials = finalInspection.initials.trim().slice(0, 6).toUpperCase()
      setFinalInspection((prev) => ({ ...prev, initials, completedAt: now }))
      setIsComplete(true)
      nextPatch = {
        final_inspection_notes: finalInspection.notes.trim() || null,
        final_inspection_tech_initials: initials,
        final_inspection_completed_at: now,
        is_complete: true,
      }
    }

    setSavingStage(stage)
    try {
      await persistRow(nextPatch)
      if (stage === 'final') {
        const { error: travelerErr } = await supabase.from('travelers').update({ is_complete: true }).eq('id', travelerId)
        if (travelerErr) throw travelerErr
        showToast('Traveler complete')
        onComplete()
      } else {
        showToast('Sign-off saved')
      }
    } catch (error) {
      // Rollback optimistic state for stage completion markers.
      if (stage === 'testing') setTesting((prev) => ({ ...prev, completedAt: stageData.completedAt }))
      if (stage === 'qa') setQa((prev) => ({ ...prev, completedAt: stageData.completedAt }))
      if (stage === 'shipping') setShipping((prev) => ({ ...prev, completedAt: stageData.completedAt }))
      if (stage === 'final') {
        setFinalInspection((prev) => ({ ...prev, completedAt: stageData.completedAt }))
        setIsComplete(false)
      }
      showToast(error instanceof Error ? error.message : 'Could not save sign-off')
    } finally {
      setSavingStage(null)
    }
  }

  if (loading) return <p className="status-breakdown-note">Loading Testing &amp; Quality Checklist...</p>

  return (
    <section className="traveler-basic-section">
      {isComplete ? <div className="traveler-complete-banner">TRAVELER COMPLETE</div> : null}

      <article className={`traveler-signoff-card ${testing.completedAt ? 'traveler-signoff-card--complete' : ''}`}>
        <header className="traveler-signoff-head">
          <h4>Testing</h4>
          {testing.completedAt ? <span className="traveler-signoff-done">✅ {testing.initials} · {formatDateTime(testing.completedAt)}</span> : null}
        </header>
        <label className="traveler-textarea-label">
          Notes
          <textarea
            className="new-job-textarea"
            value={testing.notes}
            onChange={(e) => setTesting((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={Boolean(testing.completedAt) || Boolean(savingStage)}
          />
        </label>
        <div className="traveler-basic-submit-row">
          <label className="traveler-tech-initials">
            Tech Initials
            <input
              value={testing.initials}
              maxLength={6}
              onChange={(e) => setTesting((prev) => ({ ...prev, initials: e.target.value.toUpperCase() }))}
              disabled={Boolean(testing.completedAt) || Boolean(savingStage)}
            />
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void signOff('testing')}
            disabled={Boolean(testing.completedAt) || Boolean(savingStage)}
          >
            {savingStage === 'testing' ? 'Signing...' : 'Sign off — Testing'}
          </button>
        </div>
      </article>

      <article className={`traveler-signoff-card ${qa.completedAt ? 'traveler-signoff-card--complete' : ''}`}>
        <header className="traveler-signoff-head">
          <h4>Quality Assurance (Test Area)</h4>
          {qa.completedAt ? <span className="traveler-signoff-done">✅ {qa.initials} · {formatDateTime(qa.completedAt)}</span> : null}
        </header>
        {locked.qa && !qa.completedAt ? <p className="traveler-signoff-lock">🔒 Complete the previous step first</p> : null}
        <label className="traveler-textarea-label">
          Notes
          <textarea
            className="new-job-textarea"
            value={qa.notes}
            onChange={(e) => setQa((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={locked.qa || Boolean(qa.completedAt) || Boolean(savingStage)}
          />
        </label>
        <div className="traveler-basic-submit-row">
          <label className="traveler-tech-initials">
            Tech Initials
            <input
              value={qa.initials}
              maxLength={6}
              onChange={(e) => setQa((prev) => ({ ...prev, initials: e.target.value.toUpperCase() }))}
              disabled={locked.qa || Boolean(qa.completedAt) || Boolean(savingStage)}
            />
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void signOff('qa')}
            disabled={locked.qa || Boolean(qa.completedAt) || Boolean(savingStage)}
          >
            {savingStage === 'qa' ? 'Signing...' : 'Sign off — QA Test Area'}
          </button>
        </div>
      </article>

      <article className={`traveler-signoff-card ${shipping.completedAt ? 'traveler-signoff-card--complete' : ''}`}>
        <header className="traveler-signoff-head">
          <h4>Shipping Area</h4>
          {shipping.completedAt ? <span className="traveler-signoff-done">✅ {shipping.initials} · {formatDateTime(shipping.completedAt)}</span> : null}
        </header>
        {locked.shipping && !shipping.completedAt ? <p className="traveler-signoff-lock">🔒 Complete the previous step first</p> : null}
        <label className="traveler-textarea-label">
          Notes
          <textarea
            className="new-job-textarea"
            value={shipping.notes}
            onChange={(e) => setShipping((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={locked.shipping || Boolean(shipping.completedAt) || Boolean(savingStage)}
          />
        </label>
        <div className="traveler-basic-submit-row">
          <label className="traveler-tech-initials">
            Tech Initials
            <input
              value={shipping.initials}
              maxLength={6}
              onChange={(e) => setShipping((prev) => ({ ...prev, initials: e.target.value.toUpperCase() }))}
              disabled={locked.shipping || Boolean(shipping.completedAt) || Boolean(savingStage)}
            />
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void signOff('shipping')}
            disabled={locked.shipping || Boolean(shipping.completedAt) || Boolean(savingStage)}
          >
            {savingStage === 'shipping' ? 'Signing...' : 'Sign off — Shipping'}
          </button>
        </div>
      </article>

      <article className={`traveler-signoff-card ${finalInspection.completedAt ? 'traveler-signoff-card--complete' : ''}`}>
        <header className="traveler-signoff-head">
          <h4>Final Inspection</h4>
          {finalInspection.completedAt ? (
            <span className="traveler-signoff-done">
              ✅ {finalInspection.initials} · {formatDateTime(finalInspection.completedAt)}
            </span>
          ) : null}
        </header>
        {locked.final && !finalInspection.completedAt ? <p className="traveler-signoff-lock">🔒 Complete the previous step first</p> : null}
        <label className="traveler-textarea-label">
          Notes
          <textarea
            className="new-job-textarea"
            value={finalInspection.notes}
            onChange={(e) => setFinalInspection((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={locked.final || Boolean(finalInspection.completedAt) || Boolean(savingStage)}
          />
        </label>
        <div className="traveler-basic-submit-row">
          <label className="traveler-tech-initials">
            Tech Initials
            <input
              value={finalInspection.initials}
              maxLength={6}
              onChange={(e) => setFinalInspection((prev) => ({ ...prev, initials: e.target.value.toUpperCase() }))}
              disabled={locked.final || Boolean(finalInspection.completedAt) || Boolean(savingStage)}
            />
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void signOff('final')}
            disabled={locked.final || Boolean(finalInspection.completedAt) || Boolean(savingStage)}
          >
            {savingStage === 'final' ? 'Signing...' : 'Sign off — Final Inspection'}
          </button>
        </div>
      </article>
    </section>
  )
}
