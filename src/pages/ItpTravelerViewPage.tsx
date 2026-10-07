import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ItpTravelerReportPanel } from '../components/ItpTravelerReportPanel'
import { ItpTravelerStepModal } from '../components/ItpTravelerStepModal'
import { JobNeededPartModal } from '../components/JobNeededPartModal'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useJobNeededParts } from '../hooks/useJobNeededParts'
import { hasAdminAccess } from '../lib/roles'
import { loadItpLibraryPlan, saveItpLibraryPlan } from '../lib/itpLibraryStorage'
import { buildItpTravelerReport, findTravelerReportItem } from '../lib/itpTravelerReport'
import { toggleItemExecDone } from '../lib/itpItemRequirements'
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
  const notesSaveTimer = useRef<number | null>(null)
  const parts = useJobNeededParts(valve?.id ?? Number.parseInt(id ?? '', 10))

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

  const toggleDone = async (itemId: string) => {
    if (!valve || !plan || !report || saving) return
    const row = findTravelerReportItem(report.sections, itemId)
    const sel = getSel(plan, itemId) ?? emptyItemSel()
    const exec = getExec(plan, itemId) ?? emptyItemExec()
    if (row?.hasTravelerRequirement && !row.requirementsMet && !exec.done && !exec.holdPending) {
      showToast('Fill the traveler requirement before checking this item')
      setOpenItemId(itemId)
      return
    }
    const next = toggleItemExecDone(sel, exec, {
      canSignOffHold,
      signerName: username?.trim() || user?.email || 'QC',
      signerUserId: user?.id ?? null,
    })
    if (next.error) {
      showToast(next.error)
      if (row?.hasTravelerRequirement) setOpenItemId(itemId)
      return
    }
    setSaving(true)
    try {
      const nextPlan: ItpLibraryPlanPayload = {
        ...plan,
        exec: { ...plan.exec, [itemId]: next.exec },
      }
      const result = await saveItpLibraryPlan(valve, nextPlan)
      setPlan(result.plan)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update step')
    } finally {
      setSaving(false)
    }
  }

  const patchNotes = (itemId: string, notes: string) => {
    if (!valve || !plan) return
    const nextPlan: ItpLibraryPlanPayload = {
      ...plan,
      exec: {
        ...plan.exec,
        [itemId]: { ...(getExec(plan, itemId) ?? emptyItemExec()), notes },
      },
    }
    setPlan(nextPlan)
    if (notesSaveTimer.current) window.clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = window.setTimeout(() => {
      void saveItpLibraryPlan(valve, nextPlan)
        .then((result) => setPlan(result.plan))
        .catch((err) => showToast(err instanceof Error ? err.message : 'Could not save notes'))
    }, 500)
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
        valveRowId={valve.id}
        neededParts={parts.rows}
        onNeedPart={(itemId) => {
          const row = findTravelerReportItem(report.sections, itemId)
          parts.setNeedPartItem({ id: itemId, name: row?.name ?? itemId })
        }}
        onOpenStep={(itemId) => setOpenItemId(itemId)}
        onToggleDone={(itemId) => void toggleDone(itemId)}
        onPatchNotes={patchNotes}
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
          neededParts={parts.rows}
          onNeedPart={() => parts.setNeedPartItem({ id: openItem.id, name: openItem.name })}
          onSaveNeededPart={parts.addPart}
          onUpsertNeededPart={parts.upsertPart}
          onRemoveNeededPart={(partId) => void parts.removePart(partId)}
          onClose={() => setOpenItemId(null)}
          onSave={saveStep}
        />
      ) : null}

      {parts.needPartItem ? (
        <JobNeededPartModal
          stepName={parts.needPartItem.name}
          saving={parts.saving}
          onClose={() => parts.setNeedPartItem(null)}
          onSave={parts.addPart}
        />
      ) : null}
    </>
  )
}
