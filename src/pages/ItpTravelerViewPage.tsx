import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ItpTravelerReportPanel } from '../components/ItpTravelerReportPanel'
import { ItpTravelerStepModal } from '../components/ItpTravelerStepModal'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { hasAdminAccess } from '../lib/roles'
import { loadItpLibraryPlan, saveItpLibraryPlan } from '../lib/itpLibraryStorage'
import { buildItpTravelerReport } from '../lib/itpTravelerReport'
import {
  isQualityTeamFlagOwner,
  loadCurrentUserQualityTeamLevel,
} from '../lib/qualityTeam'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import {
  emptyItemExec,
  emptyItemSel,
  getExec,
  getSel,
  type ItpLibraryItemExec,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import type { QualityTeamLevel } from '../types/employees'
import type { Valve } from '../types'

export function ItpTravelerViewPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user, username, role } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [valve, setValve] = useState<Valve | null>(null)
  const [plan, setPlan] = useState<ItpLibraryPlanPayload | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [qualityTeamLevel, setQualityTeamLevel] = useState<QualityTeamLevel>('none')

  const isShopAdmin = hasAdminAccess(role)
  const canSignOffHold = isQualityTeamFlagOwner(qualityTeamLevel) || isShopAdmin

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const level = await loadCurrentUserQualityTeamLevel({
        userId: user?.id,
        username,
      })
      if (!cancelled) setQualityTeamLevel(level)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, username])

  const reload = useCallback(async () => {
    const valveRowId = Number.parseInt(id ?? '', 10)
    if (!Number.isFinite(valveRowId)) {
      setError('Invalid job')
      setLoading(false)
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
      if (valveError || !data) {
        setValve(null)
        setPlan(null)
        setError('Job not found')
        return
      }
      const nextValve = data as Valve
      const loaded = await loadItpLibraryPlan(nextValve)
      setValve(nextValve)
      setPlan(loaded.plan)
      if (loaded.isNew && loaded.appliedTemplateName) {
        showToast(`Loaded “${loaded.appliedTemplateName}” into traveler`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load traveler')
      setValve(null)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [id, showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const report = useMemo(() => (plan ? buildItpTravelerReport(plan) : null), [plan])

  const backHref = useMemo(() => `/itp/${encodeURIComponent(id ?? '')}`, [id])
  const shopFormHref = valve?.valve_id
    ? `/traveler/${encodeURIComponent(valve.valve_id)}`
    : null

  const openItem = useMemo(() => {
    if (!report || !openItemId) return null
    for (const section of report.sections) {
      const found = section.items.find((item) => item.id === openItemId)
      if (found) return found
    }
    return null
  }, [report, openItemId])

  const saveStep = async (next: { sel: ItpLibraryItemSel; exec: ItpLibraryItemExec }) => {
    if (!valve || !plan || !openItemId) return
    setSaving(true)
    try {
      const nextPlan: ItpLibraryPlanPayload = {
        ...plan,
        sel: {
          ...plan.sel,
          [openItemId]: next.sel,
        },
        exec: {
          ...plan.exec,
          [openItemId]: next.exec,
        },
      }
      const result = await saveItpLibraryPlan(valve, nextPlan)
      setPlan(result.plan)
      setOpenItemId(null)
      showToast('Step saved')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save step')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading traveler…</p>
        </section>
      </section>
    )
  }

  if (error || !valve || !plan || !report) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">{error || 'Traveler not available.'}</p>
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

  const snap = plan.valveSnapshot

  return (
    <>
      <ItpTravelerReportPanel
        meta={{
          valveId: snap.valveId || valve.valve_id,
          customer: snap.customer ?? valve.customer,
          valveType: plan.valveType || snap.valveType || valve.valve_type,
          size: snap.size ?? valve.size,
          pressureClass: snap.pressureClass ?? valve.pressure_class ?? null,
          jobType: snap.jobType ?? valve.job_type,
          cell: snap.cell ?? valve.cell,
          material: snap.material ?? valve.body_material ?? valve.material_spec,
          description: snap.description ?? valve.description,
          dueDate: snap.dueDate ?? valve.due_date,
          status: valve.status,
          poNumber: valve.drawing_po_number ?? null,
          templateName: plan.scopeTemplateName,
        }}
        backToItpHref={backHref}
        shopFormHref={shopFormHref}
        sections={report.sections}
        stats={report.stats}
        saving={saving}
        onOpenStep={(itemId) => setOpenItemId(itemId)}
      />

      {openItem ? (
        <ItpTravelerStepModal
          item={openItem}
          sel={getSel(plan, openItem.id) ?? emptyItemSel()}
          exec={getExec(plan, openItem.id) ?? emptyItemExec()}
          valveRowId={valve.id}
          jobCard={valve}
          canSignOffHold={canSignOffHold}
          signerName={username?.trim() || user?.email || 'QC'}
          signerUserId={user?.id ?? null}
          saving={saving}
          onClose={() => setOpenItemId(null)}
          onSave={saveStep}
        />
      ) : null}
    </>
  )
}
