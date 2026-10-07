import { useEffect, useMemo, useState } from 'react'
import { ItpTravelerReportPanel } from '../components/ItpTravelerReportPanel'
import { ItpTravelerStepModal } from '../components/ItpTravelerStepModal'
import { JobNeededPartModal } from '../components/JobNeededPartModal'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { hasAdminAccess } from '../lib/roles'
import { buildItpTravelerReport, findTravelerReportItem } from '../lib/itpTravelerReport'
import {
  ITP_PREVIEW_TRAVELER_ID,
  previewJobNeededPartFromDraft,
  readTemplatePreviewPayload,
  writeTemplatePreviewPayload,
  type ItpTemplatePreviewPayload,
} from '../lib/itpTemplatePreview'
import { toggleItemExecDone } from '../lib/itpItemRequirements'
import type { JobNeededPartDraft } from '../lib/jobNeededParts'
import {
  emptyItemExec,
  emptyItemSel,
  getExec,
  getSel,
  type ItpLibraryItemExec,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import type { JobCardNameplateSource } from '../lib/itpTravelerNameplate'

type NeedPartStep = { id: string; name: string }

export function ItpTemplatePreviewPage() {
  const { showToast } = useToast()
  const { user, username, role } = useAuth()
  const [payload, setPayload] = useState(() => readTemplatePreviewPayload())
  const [openItemId, setOpenItemId] = useState<string | null>(null)
  const [needPartItem, setNeedPartItem] = useState<NeedPartStep | null>(null)

  useEffect(() => {
    document.title = `ITP preview ${ITP_PREVIEW_TRAVELER_ID} — JS Valve Job Board`
  }, [])

  useEffect(() => {
    const refresh = () => {
      const next = readTemplatePreviewPayload()
      setPayload(next)
      setOpenItemId(null)
      setNeedPartItem(null)
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const persist = (next: ItpTemplatePreviewPayload) => {
    writeTemplatePreviewPayload(next)
    setPayload(next)
  }

  const plan = payload?.plan ?? null
  const jobCard = payload?.jobCard ?? null
  const neededParts = payload?.neededParts ?? []
  const report = useMemo(() => (plan ? buildItpTravelerReport(plan) : null), [plan])

  const openItem = useMemo(() => {
    if (!report || !openItemId) return null
    for (const section of report.sections) {
      const found = section.items.find((item) => item.id === openItemId)
      if (found) return found
    }
    return null
  }, [report, openItemId])

  const saveStep = async (next: { sel: ItpLibraryItemSel; exec: ItpLibraryItemExec }) => {
    if (!payload || !plan || !openItemId) return
    const nextPlan: ItpLibraryPlanPayload = {
      ...plan,
      sel: { ...plan.sel, [openItemId]: next.sel },
      exec: { ...plan.exec, [openItemId]: next.exec },
    }
    persist({ ...payload, plan: nextPlan })
    setOpenItemId(null)
    showToast(`Saved on preview traveler ${ITP_PREVIEW_TRAVELER_ID} — not a shop job`)
  }

  const addPreviewPart = async (draft: JobNeededPartDraft): Promise<boolean> => {
    if (!payload) return false
    if (!draft.partName.trim()) {
      showToast('Enter a part name')
      return false
    }
    const row = previewJobNeededPartFromDraft(
      {
        ...draft,
        itpItemId: draft.itpItemId || needPartItem?.id || openItem?.id,
        itpItemName: draft.itpItemName || needPartItem?.name || openItem?.name,
      },
      username?.trim() || user?.email || 'Preview',
    )
    persist({ ...payload, neededParts: [...neededParts, row] })
    showToast(`Added on preview traveler ${ITP_PREVIEW_TRAVELER_ID}`)
    return true
  }

  const upsertPreviewPart = async (draft: JobNeededPartDraft): Promise<boolean> => {
    if (!payload) return false
    if (!draft.partName.trim()) {
      showToast('Enter a part name')
      return false
    }
    const itemId = String(draft.itpItemId ?? '').trim()
    const existing = itemId ? neededParts.find((row) => row.itpItemId === itemId) : undefined
    const row = previewJobNeededPartFromDraft(
      draft,
      username?.trim() || user?.email || 'Preview',
      existing,
    )
    const without = existing ? neededParts.filter((part) => part.id !== existing.id) : neededParts
    persist({ ...payload, neededParts: [...without, row] })
    showToast(`Saved on preview traveler ${ITP_PREVIEW_TRAVELER_ID}`)
    return true
  }

  const removePreviewPart = (id: string) => {
    if (!payload) return
    persist({ ...payload, neededParts: neededParts.filter((row) => row.id !== id) })
  }

  const canSignOffHold = hasAdminAccess(role)
  const signerName = username?.trim() || user?.email || 'QC'

  const toggleDone = (itemId: string) => {
    if (!payload || !plan || !report) return
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
      signerName,
      signerUserId: user?.id ?? null,
    })
    if (next.error) {
      showToast(next.error)
      if (row?.hasTravelerRequirement) setOpenItemId(itemId)
      return
    }
    persist({
      ...payload,
      plan: { ...plan, exec: { ...plan.exec, [itemId]: next.exec } },
    })
  }

  if (!payload || !plan || !jobCard || !report) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">
            No ITP preview is loaded. Open Preview ITP from the template builder.
          </p>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={() => window.close()}>
              Close window
            </button>
          </div>
        </section>
      </section>
    )
  }

  const snap = plan.valveSnapshot
  const travelerId = snap.valveId || jobCard.valve_id || ITP_PREVIEW_TRAVELER_ID

  return (
    <>
      <ItpTravelerReportPanel
        previewMode
        meta={{
          valveId: travelerId,
          customer: snap.customer,
          valveType: plan.valveType || snap.valveType,
          size: snap.size,
          pressureClass: snap.pressureClass,
          jobType: snap.jobType,
          cell: snap.cell,
          material: snap.material,
          description: snap.description,
          dueDate: snap.dueDate,
          status: 'Preview',
          poNumber: jobCard.drawing_po_number ?? null,
          manufacturer: jobCard.manufacturer ?? null,
          templateName: plan.scopeTemplateName,
        }}
        backToItpHref=""
        shopFormHref={null}
        sections={report.sections}
        stats={report.stats}
        neededParts={neededParts}
        onOpenStep={(itemId) => setOpenItemId(itemId)}
        onToggleDone={toggleDone}
        onNeedPart={(itemId) => {
          const row = findTravelerReportItem(report.sections, itemId)
          setNeedPartItem({ id: itemId, name: row?.name ?? itemId })
        }}
        onPatchNotes={(itemId, notes) => {
          persist({
            ...payload,
            plan: {
              ...plan,
              exec: {
                ...plan.exec,
                [itemId]: { ...(getExec(plan, itemId) ?? emptyItemExec()), notes },
              },
            },
          })
        }}
      />

      {openItem ? (
        <ItpTravelerStepModal
          item={openItem}
          sel={getSel(plan, openItem.id) ?? emptyItemSel()}
          exec={getExec(plan, openItem.id) ?? emptyItemExec()}
          valveRowId={0}
          jobCard={jobCard as JobCardNameplateSource}
          previewMode
          canSignOffHold={canSignOffHold}
          signerName={signerName}
          signerUserId={user?.id ?? null}
          saving={false}
          neededParts={neededParts}
          onNeedPart={() => setNeedPartItem({ id: openItem.id, name: openItem.name })}
          onSaveNeededPart={addPreviewPart}
          onUpsertNeededPart={upsertPreviewPart}
          onRemoveNeededPart={removePreviewPart}
          onClose={() => setOpenItemId(null)}
          onSave={saveStep}
        />
      ) : null}

      {needPartItem ? (
        <JobNeededPartModal
          stepName={needPartItem.name}
          onClose={() => setNeedPartItem(null)}
          onSave={addPreviewPart}
        />
      ) : null}
    </>
  )
}
