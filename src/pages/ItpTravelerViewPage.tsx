import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ItpClearFlagModal } from '../components/ItpClearFlagModal'
import { ItpFlagIssueModal } from '../components/ItpFlagIssueModal'
import { ItpTravelerReportPanel } from '../components/ItpTravelerReportPanel'
import { ItpTravelerStepModal } from '../components/ItpTravelerStepModal'
import { JobNeededPartModal } from '../components/JobNeededPartModal'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useJobNeededParts } from '../hooks/useJobNeededParts'
import { can, hasAdminAccess, permissionDeniedReason } from '../lib/roles'
import { loadItpLibraryPlan, saveItpLibraryPlan } from '../lib/itpLibraryStorage'
import { applyTravelerStepUnlocks } from '../lib/itpMeasUnlocks'
import { buildItpTravelerReport, findTravelerReportItem } from '../lib/itpTravelerReport'
import { toggleItemExecDone } from '../lib/itpItemRequirements'
import { raiseItpItemFlag } from '../lib/itpFlagIssue'
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
  type ItpLibraryAttachment,
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
  const [flaggingItem, setFlaggingItem] = useState<{ id: string; name: string } | null>(null)
  const [clearingItem, setClearingItem] = useState<{ id: string; name: string } | null>(null)
  const [flagBusy, setFlagBusy] = useState(false)
  const notesSaveTimer = useRef<number | null>(null)
  const parts = useJobNeededParts(valve?.id ?? Number.parseInt(id ?? '', 10))

  const isShopAdmin = hasAdminAccess(role)
  const canFlagIssues = can(role, 'flagItpItem')
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
      const nextPlan = applyTravelerStepUnlocks(plan, openItemId, next)
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

  const toggleFlag = (itemId: string, itemName: string) => {
    if (!canFlagIssues) {
      showToast(permissionDeniedReason('flagItpItem'))
      return
    }
    const current = plan?.exec[itemId] ?? emptyItemExec()
    if (current.flagged) {
      setClearingItem({ id: itemId, name: itemName })
      return
    }
    setFlaggingItem({ id: itemId, name: itemName })
  }

  const confirmClearFlag = async (reason: string) => {
    if (!valve || !plan || !clearingItem) return
    if (!canFlagIssues) {
      showToast(permissionDeniedReason('flagItpItem'))
      return
    }
    if (!user?.id) {
      showToast('Sign in required to remove a flag')
      return
    }
    const itemId = clearingItem.id
    const now = new Date().toISOString()
    const current = plan.exec[itemId] ?? emptyItemExec()
    const nextPlan: ItpLibraryPlanPayload = {
      ...plan,
      exec: {
        ...plan.exec,
        [itemId]: {
          ...current,
          flagged: false,
          flagReason: '',
          flagPhotos: [],
          flaggedAt: null,
          flaggedByUserId: null,
          flaggedByName: null,
          flagOwnerEmployeeId: null,
          flagOwnerUserId: null,
          flagOwnerName: null,
          flagResolution: '',
          flagResolvedAt: null,
          flagResolvedByUserId: null,
          flagResolvedByName: null,
          flagClearReason: reason.trim(),
          flagClearedAt: now,
          flagClearedByUserId: user.id,
          flagClearedByName: username || 'Technician',
        },
      },
    }
    setFlagBusy(true)
    try {
      const saved = await saveItpLibraryPlan(valve, nextPlan)
      setPlan(saved.plan)
      setClearingItem(null)
      showToast('Flag removed')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove flag')
    } finally {
      setFlagBusy(false)
    }
  }

  const confirmFlagIssue = async (input: { reason: string; photos: ItpLibraryAttachment[] }) => {
    if (!valve || !plan || !flaggingItem) return
    if (!canFlagIssues) {
      showToast(permissionDeniedReason('flagItpItem'))
      return
    }
    if (!user?.id) {
      showToast('Sign in required to flag an item and notify Quality Team')
      return
    }
    const itemId = flaggingItem.id
    const itemName = flaggingItem.name
    const current = plan.exec[itemId] ?? emptyItemExec()
    const actor = { userId: user.id, name: username || 'Technician' }
    setFlagBusy(true)
    try {
      const { toast } = await raiseItpItemFlag({
        currentExec: current,
        reason: input.reason,
        photos: input.photos,
        actor,
        itemName,
        valveRowId: valve.id,
        valveId: valve.valve_id,
        customer: valve.customer,
        save: async (nextExec) => {
          const nextPlan: ItpLibraryPlanPayload = {
            ...plan,
            exec: { ...plan.exec, [itemId]: nextExec },
          }
          const saved = await saveItpLibraryPlan(valve, nextPlan)
          setPlan(saved.plan)
        },
      })
      setFlaggingItem(null)
      showToast(toast)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to flag item')
    } finally {
      setFlagBusy(false)
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
        valveRowId={valve.id}
        neededParts={parts.rows}
        onNeedPart={(itemId) => {
          const row = findTravelerReportItem(report.sections, itemId)
          parts.setNeedPartItem({ id: itemId, name: row?.name ?? itemId })
        }}
        onOpenStep={(itemId) => setOpenItemId(itemId)}
        onToggleDone={(itemId) => void toggleDone(itemId)}
        onPatchNotes={patchNotes}
        onToggleFlag={toggleFlag}
        canFlag={canFlagIssues}
        flagBusy={flagBusy}
        flagPermissionHint={permissionDeniedReason('flagItpItem')}
      />

      {openItem ? (
        <ItpTravelerStepModal
          item={openItem}
          sel={getSel(plan, openItem.id) ?? emptyItemSel()}
          exec={getExec(plan, openItem.id) ?? emptyItemExec()}
          plan={plan}
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

      {flaggingItem ? (
        <ItpFlagIssueModal
          valveRowId={valve.id}
          itemId={flaggingItem.id}
          itemName={flaggingItem.name}
          busy={flagBusy}
          onCancel={() => {
            if (!flagBusy) setFlaggingItem(null)
          }}
          onConfirm={(input) => void confirmFlagIssue(input)}
          showToast={showToast}
        />
      ) : null}

      {clearingItem ? (
        <ItpClearFlagModal
          itemName={clearingItem.name}
          busy={flagBusy}
          onCancel={() => {
            if (!flagBusy) setClearingItem(null)
          }}
          onConfirm={(reason) => void confirmClearFlag(reason)}
          showToast={showToast}
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
