import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ItpEditorModal } from '../components/ItpEditorModal'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { Valve } from '../types'

/** Detailed inspection checklist (former ITP editor) — now part of the Traveler workflow. */
export function TravelerInspectionPage() {
  const navigate = useNavigate()
  const { valveId } = useParams<{ valveId: string }>()
  const [loading, setLoading] = useState(true)
  const [valve, setValve] = useState<Valve | null>(null)

  useEffect(() => {
    const normalized = decodeURIComponent(valveId ?? '').trim()
    if (!normalized) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('valves')
        .select(VALVE_LIST_SELECT)
        .eq('valve_id', normalized)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setValve(null)
      } else {
        setValve(data as Valve)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [valveId])

  const close = () => {
    const normalized = decodeURIComponent(valveId ?? '').trim()
    navigate(`/traveler/${encodeURIComponent(normalized)}`, { replace: true })
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <p className="placeholder-copy">Loading inspection checklist…</p>
      </section>
    )
  }

  if (!valve) {
    return (
      <section className="dashboard-page">
        <p className="placeholder-copy">Job not found for this traveler.</p>
        <Link to="/job-board" className="button-secondary">
          Back to board
        </Link>
      </section>
    )
  }

  return (
    <>
      <div className="traveler-inspection-banner">
        <p>
          <strong>Traveler inspection</strong> — detailed checklist for {valve.valve_id}. For the process-plan ITP
          (step checkboxes), use{' '}
          <Link to={`/itp/${valve.id}`}>Open ITP</Link>.
        </p>
      </div>
      <ItpEditorModal valve={valve} onClose={close} />
    </>
  )
}
