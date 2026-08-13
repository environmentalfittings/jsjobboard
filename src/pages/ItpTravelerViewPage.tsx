import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ItpTravelerReportPanel } from '../components/ItpTravelerReportPanel'
import { loadItpLibraryPlan } from '../lib/itpLibraryStorage'
import { buildItpTravelerReport } from '../lib/itpTravelerReport'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { Valve } from '../types'

export function ItpTravelerViewPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [valve, setValve] = useState<Valve | null>(null)
  const [report, setReport] = useState<ReturnType<typeof buildItpTravelerReport> | null>(null)
  const [snap, setSnap] = useState<{
    valveId: string
    customer: string | null
    valveType: string | null
    size: string | null
    pressureClass: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const valveRowId = Number.parseInt(id ?? '', 10)
      if (!Number.isFinite(valveRowId)) {
        if (!cancelled) {
          setError('Invalid job')
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const { data, error: valveError } = await supabase
          .from('valves')
          .select(VALVE_LIST_SELECT)
          .eq('id', valveRowId)
          .maybeSingle()
        if (cancelled) return
        if (valveError || !data) {
          setValve(null)
          setError('Job not found')
          setLoading(false)
          return
        }
        const nextValve = data as Valve
        const loaded = await loadItpLibraryPlan(nextValve)
        if (cancelled) return
        setValve(nextValve)
        setSnap({
          valveId: loaded.plan.valveSnapshot.valveId || nextValve.valve_id,
          customer: loaded.plan.valveSnapshot.customer ?? nextValve.customer,
          valveType: loaded.plan.valveType || loaded.plan.valveSnapshot.valveType || nextValve.valve_type,
          size: loaded.plan.valveSnapshot.size ?? nextValve.size,
          pressureClass:
            loaded.plan.valveSnapshot.pressureClass ?? nextValve.pressure_class ?? null,
        })
        setReport(buildItpTravelerReport(loaded.plan))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load traveler report')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const backHref = useMemo(() => `/itp/${encodeURIComponent(id ?? '')}`, [id])

  if (loading) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading traveler report…</p>
        </section>
      </section>
    )
  }

  if (error || !valve || !report || !snap) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">{error || 'Traveler report not available.'}</p>
          <div className="modal-actions">
            <Link to={backHref} className="button-secondary">
              ← Back to ITP
            </Link>
            <button type="button" className="button-secondary" onClick={() => navigate('/job-board')}>
              Job board
            </button>
          </div>
        </section>
      </section>
    )
  }

  return (
    <ItpTravelerReportPanel
      valveId={snap.valveId}
      customer={snap.customer}
      valveType={snap.valveType}
      size={snap.size}
      pressureClass={snap.pressureClass}
      backToItpHref={backHref}
      sections={report.sections}
      stats={report.stats}
    />
  )
}
