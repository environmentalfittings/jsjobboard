import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ItpClearFlagModal } from './ItpClearFlagModal'
import { ItpFlagIssueModal } from './ItpFlagIssueModal'
import { ItpQcChangeNoteModal } from './ItpQcChangeNoteModal'
import { useToast } from './ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import {
  findLibraryItem,
  ITP_LIBRARY,
  ITP_LIBRARY_JOB_TYPE_COLORS,
  ITP_LIBRARY_JOB_TYPE_LABELS,
  type ItpLibraryJobType,
  type ItpLibrarySectionId,
} from '../constants/itpLibrary'
import {
  deleteItpLibraryAttachment,
  isItpLibraryAttachmentImage,
  isItpLibraryAttachmentPdf,
  uploadItpLibraryAttachment,
} from '../lib/itpLibraryAttachments'
import { loadItpLibraryPlan, saveItpLibraryPlan } from '../lib/itpLibraryStorage'
import { buildItpPageUrl, createItpQrDataUrl } from '../lib/itpQrCode'
import { notifyQualityTeamItpItemFlagged } from '../lib/messages'
import {
  canAcceptItp,
  canEditItpBuildScope,
  canReopenItp,
  diffItpScopeSummary,
  isQualityTeamFlagOwner,
  itpScopeFingerprint,
  loadCurrentUserQualityTeamLevel,
  qcReviewStatusLabel,
  resolveQualityTeamLevelFromEmployees,
} from '../lib/qualityTeam'
import { hasAdminAccess } from '../lib/roles'
import {
  normalizeQualityTeamLevel,
  qualityTeamLevelLabel,
  type QualityTeamLevel,
} from '../types/employees'
import {
  allScopeItems,
  applyLibraryTemplate,
  emptyItemExec,
  emptyItemSel,
  emptyQcReview,
  execStats,
  getExec,
  getSel,
  type ItpLibraryAttachment,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
  type ItpQcChangeLogEntry,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'

type ItpLibraryEditorProps = {
  valve: Valve
  onClose: () => void
  readOnly?: boolean
}

type AttrFlag = keyof Pick<ItpLibraryItemSel, 'holdPoint'>

function itemRequiresMeasurements(sel: ItpLibraryItemSel): boolean {
  return sel.beforeMeas || sel.afterMeas || sel.measVerify
}

function JobTypeBadge({ jobType }: { jobType: ItpLibraryJobType }) {
  const color = ITP_LIBRARY_JOB_TYPE_COLORS[jobType]
  return (
    <span className="itp-library-jt-badge" style={{ background: `${color}20`, color, borderColor: `${color}40` }}>
      {ITP_LIBRARY_JOB_TYPE_LABELS[jobType]}
    </span>
  )
}

export function ItpLibraryEditor({ valve, onClose, readOnly = false }: ItpLibraryEditorProps) {
  const { showToast } = useToast()
  const { user, username, role } = useAuth()
  const { employees } = useEmployees()
  const isShopAdmin = hasAdminAccess(role)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<ItpLibraryPlanPayload | null>(null)
  const [isPersisted, setIsPersisted] = useState(false)
  const [qualityTeamLevel, setQualityTeamLevel] = useState<QualityTeamLevel>('none')
  const [scopeMinimized, setScopeMinimized] = useState(false)
  const [hasLegacyInspection, setHasLegacyInspection] = useState(false)
  const [hasLegacyProcessPlan, setHasLegacyProcessPlan] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [flaggingItem, setFlaggingItem] = useState<{ id: string; name: string } | null>(null)
  const [clearingItem, setClearingItem] = useState<{ id: string; name: string } | null>(null)
  const [flagBusy, setFlagBusy] = useState(false)
  const [pendingScopeChange, setPendingScopeChange] = useState<{
    summary: string
    plan: ItpLibraryPlanPayload
  } | null>(null)
  const [pendingAcceptWithChanges, setPendingAcceptWithChanges] = useState<{
    summary: string
    plan: ItpLibraryPlanPayload
  } | null>(null)
  const scopeBaselineRef = useRef<string | null>(null)
  const lastSavedPlanRef = useRef<ItpLibraryPlanPayload | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({})
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const itpPageUrl = useMemo(() => buildItpPageUrl(valve.id), [valve.id])

  useEffect(() => {
    let cancelled = false
    void createItpQrDataUrl(itpPageUrl, 168)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [itpPageUrl])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const result = await loadItpLibraryPlan(valve)
        if (cancelled) return
        setPlan(result.plan)
        setIsPersisted(!result.isNew)
        scopeBaselineRef.current = itpScopeFingerprint(result.plan)
        lastSavedPlanRef.current = result.plan
        setScopeMinimized(
          result.plan.qcReview.status === 'accepted' ||
            result.plan.qcReview.status === 'pending_review',
        )
        setHasLegacyInspection(result.hasLegacyInspection)
        setHasLegacyProcessPlan(result.hasLegacyProcessPlan)
      } catch (error) {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : 'Failed to load ITP')
          setPlan(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [valve, showToast])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!user?.id) {
        setQualityTeamLevel('none')
        return
      }
      const fromRoster = resolveQualityTeamLevelFromEmployees(employees, {
        userId: user.id,
        username,
      })
      if (fromRoster !== 'none') {
        if (!cancelled) setQualityTeamLevel(fromRoster)
        return
      }
      const level = await loadCurrentUserQualityTeamLevel({
        userId: user.id,
        username,
      })
      if (cancelled) return
      setQualityTeamLevel(level)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, username, employees])

  const updatePlan = useCallback((updater: (prev: ItpLibraryPlanPayload) => ItpLibraryPlanPayload) => {
    setPlan((prev) => (prev ? updater(prev) : prev))
  }, [])

  const ensureSel = (prev: ItpLibraryPlanPayload, itemId: string): ItpLibraryItemSel =>
    prev.sel[itemId] ?? emptyItemSel()

  const scopeItems = useMemo(() => (plan ? allScopeItems(plan) : []), [plan])
  const stats = useMemo(() => (plan ? execStats(plan) : null), [plan])

  const canEditScope = Boolean(
    plan &&
      canEditItpBuildScope({
        readOnly,
        isPersisted,
        plan,
        qualityTeamLevel,
        isShopAdmin,
      }),
  )
  const canAccept = Boolean(
    plan &&
      canAcceptItp({
        readOnly,
        isPersisted,
        plan,
        qualityTeamLevel,
        isShopAdmin,
      }),
  )
  const canReopen = Boolean(
    plan &&
      canReopenItp({
        readOnly,
        isPersisted,
        plan,
        qualityTeamLevel,
        isShopAdmin,
      }),
  )
  const isQcScopeEditor = isQualityTeamFlagOwner(qualityTeamLevel) || isShopAdmin
  const isAccepted = plan?.qcReview.status === 'accepted'
  const acceptedByLevelForLog =
    qualityTeamLevel !== 'none' ? qualityTeamLevel : isShopAdmin ? 'admin' : qualityTeamLevel

  const persistPlan = async (
    nextPlan: ItpLibraryPlanPayload,
    options?: { notifyQc?: boolean; successToast?: string },
  ) => {
    const result = await saveItpLibraryPlan(valve, nextPlan, {
      notifyQc:
        options?.notifyQc && user?.id
          ? {
              senderUserId: user.id,
              senderName: username || 'JS Valve',
            }
          : undefined,
    })
    setPlan(result.plan)
    setIsPersisted(true)
    scopeBaselineRef.current = itpScopeFingerprint(result.plan)
    lastSavedPlanRef.current = result.plan
    if (
      result.generatedForReview ||
      result.plan.qcReview.status === 'pending_review' ||
      result.plan.qcReview.status === 'accepted'
    ) {
      setScopeMinimized(true)
    }
    if (options?.successToast) {
      showToast(options.successToast)
    } else if (result.generatedForReview) {
      showToast(
        result.notified > 0
          ? `ITP saved — Quality Team notified (${result.notified})`
          : 'ITP saved — Quality Team review requested',
      )
    } else {
      showToast('ITP saved')
    }
    return result
  }

  const handleSave = async () => {
    if (!plan || readOnly) return
    if (plan.qcReview.status === 'accepted' && !isQcScopeEditor) {
      showToast('Only Quality Team Admin, Manager, or Supervisor can change an accepted ITP')
      return
    }

    const baseline = scopeBaselineRef.current
    const scopeChanged =
      isPersisted &&
      isQcScopeEditor &&
      baseline != null &&
      itpScopeFingerprint(plan) !== baseline

    if (scopeChanged) {
      const lastSaved = lastSavedPlanRef.current
      const autoSummary = (lastSaved ? diffItpScopeSummary(lastSaved, plan) : null) || 'Updated Build Scope'
      setPendingScopeChange({ summary: autoSummary, plan })
      return
    }

    setSaving(true)
    try {
      await persistPlan(plan, { notifyQc: true })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save ITP')
    } finally {
      setSaving(false)
    }
  }

  const confirmScopeChangeSave = async (note: string) => {
    if (!pendingScopeChange || !user?.id) {
      if (!user?.id) showToast('Sign in required to record a scope change')
      return
    }
    const now = new Date().toISOString()
    const entry: ItpQcChangeLogEntry = {
      id: crypto.randomUUID(),
      at: now,
      byUserId: user.id,
      byName: username || 'Quality Team',
      byLevel: qualityTeamLevel,
      note: note.trim(),
      summary: pendingScopeChange.summary,
    }
    const qc = pendingScopeChange.plan.qcReview ?? emptyQcReview()
    const nextPlan: ItpLibraryPlanPayload = {
      ...pendingScopeChange.plan,
      qcReview: {
        ...qc,
        changeLog: [...(qc.changeLog ?? []), entry],
      },
    }
    setSaving(true)
    try {
      await persistPlan(nextPlan, { successToast: 'ITP saved — scope change recorded' })
      setPendingScopeChange(null)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save ITP')
    } finally {
      setSaving(false)
    }
  }

  const buildAcceptedPlan = (
    source: ItpLibraryPlanPayload,
    options: { note: string; summary: string; extraChangeEntries?: ItpQcChangeLogEntry[] },
  ): ItpLibraryPlanPayload => {
    const now = new Date().toISOString()
    const acceptedDate = now.slice(0, 10)
    const qc = source.qcReview ?? emptyQcReview()
    const acceptEntry: ItpQcChangeLogEntry = {
      id: crypto.randomUUID(),
      at: now,
      byUserId: user?.id ?? null,
      byName: username || 'Quality Team',
      byLevel: acceptedByLevelForLog,
      note: options.note,
      summary: options.summary,
    }
    return {
      ...source,
      qcMgr: username || source.qcMgr || 'Quality Team',
      qcDate: source.qcDate || acceptedDate,
      qcReview: {
        ...qc,
        status: 'accepted',
        generatedAt: qc.generatedAt ?? now,
        notifiedAt: qc.notifiedAt,
        acceptedAt: now,
        acceptedByUserId: user?.id ?? null,
        acceptedByName: username || 'Quality Team',
        acceptedByLevel: acceptedByLevelForLog,
        changeLog: [...(qc.changeLog ?? []), ...(options.extraChangeEntries ?? []), acceptEntry],
      },
    }
  }

  const acceptItp = async () => {
    if (!plan || !canAccept || !user?.id) {
      if (!user?.id) showToast('Sign in required to accept an ITP')
      return
    }
    if (
      !window.confirm(
        'Accept this ITP as-is? Build Scope will minimize. You can still revise later with a recorded change note.',
      )
    ) {
      return
    }
    setSaving(true)
    try {
      await persistPlan(buildAcceptedPlan(plan, { note: 'Accepted ITP', summary: 'Accepted' }), {
        successToast: 'ITP accepted',
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to accept ITP')
    } finally {
      setSaving(false)
    }
  }

  const startAcceptWithChanges = () => {
    if (!plan || !canAccept || !user?.id) {
      if (!user?.id) showToast('Sign in required to accept an ITP')
      return
    }
    setScopeMinimized(false)
    const lastSaved = lastSavedPlanRef.current
    const scopeSummary = lastSaved ? diffItpScopeSummary(lastSaved, plan) : null
    setPendingAcceptWithChanges({
      summary: scopeSummary || 'Accepted with changes',
      plan,
    })
  }

  const confirmAcceptWithChanges = async (note: string) => {
    if (!pendingAcceptWithChanges || !user?.id) return
    const now = new Date().toISOString()
    const changeEntry: ItpQcChangeLogEntry = {
      id: crypto.randomUUID(),
      at: now,
      byUserId: user.id,
      byName: username || 'Quality Team',
      byLevel: acceptedByLevelForLog,
      note: note.trim(),
      summary: pendingAcceptWithChanges.summary,
    }
    const acceptedPlan = buildAcceptedPlan(pendingAcceptWithChanges.plan, {
      note: `Accepted with changes: ${note.trim()}`,
      summary: 'Accepted with changes',
      extraChangeEntries: [changeEntry],
    })
    setSaving(true)
    try {
      await persistPlan(acceptedPlan, { successToast: 'ITP accepted with changes recorded' })
      setPendingAcceptWithChanges(null)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to accept ITP')
    } finally {
      setSaving(false)
    }
  }

  const reopenItp = async () => {
    if (!plan || !canReopen || !user?.id) {
      if (!user?.id) showToast('Sign in required to reopen an ITP')
      return
    }
    if (
      !window.confirm(
        'Reopen this ITP for changes? It will return to Pending review until it is accepted again.',
      )
    ) {
      return
    }
    const now = new Date().toISOString()
    const qc = plan.qcReview ?? emptyQcReview()
    const reopenEntry: ItpQcChangeLogEntry = {
      id: crypto.randomUUID(),
      at: now,
      byUserId: user.id,
      byName: username || 'Quality Team',
      byLevel: acceptedByLevelForLog,
      note: 'Reopened ITP for changes',
      summary: 'Reopened',
    }
    const reopenedPlan: ItpLibraryPlanPayload = {
      ...plan,
      qcReview: {
        ...qc,
        status: 'pending_review',
        acceptedAt: null,
        acceptedByUserId: null,
        acceptedByName: null,
        acceptedByLevel: null,
        changeLog: [...(qc.changeLog ?? []), reopenEntry],
      },
    }
    setSaving(true)
    try {
      await persistPlan(reopenedPlan, { successToast: 'ITP reopened — pending review' })
      setScopeMinimized(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to reopen ITP')
    } finally {
      setSaving(false)
    }
  }

  const toggleInclude = (itemId: string) => {
    if (!canEditScope) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      const included = !current.included
      let subReqs = current.subReqs
      if (included && subReqs.length === 0) {
        const found = findLibraryItem(itemId)
        if (found?.item.defaultSubReqs?.length) subReqs = [...found.item.defaultSubReqs]
      }
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...current, included, subReqs },
        },
      }
    })
  }

  const toggleAttr = (itemId: string, attr: AttrFlag) => {
    if (!canEditScope) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...current, [attr]: !current[attr] },
        },
      }
    })
  }

  const toggleRequiresMeasurements = (itemId: string) => {
    if (!canEditScope) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      const next = !itemRequiresMeasurements(current)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: {
            ...current,
            beforeMeas: next,
            afterMeas: next,
            measVerify: next,
          },
        },
      }
    })
  }

  const selectAllInSection = (secId: ItpLibrarySectionId, select: boolean) => {
    if (!canEditScope) return
    const section = ITP_LIBRARY.find((s) => s.id === secId)
    if (!section) return
    updatePlan((prev) => {
      const sel = { ...prev.sel }
      for (const item of section.items) {
        const current = sel[item.id] ?? emptyItemSel()
        let subReqs = current.subReqs
        if (select && subReqs.length === 0 && item.defaultSubReqs?.length) {
          subReqs = [...item.defaultSubReqs]
        }
        sel[item.id] = { ...current, included: select, subReqs }
      }
      for (const custom of prev.custom.filter((c) => c.secId === secId)) {
        const current = sel[custom.id] ?? emptyItemSel()
        sel[custom.id] = { ...current, included: select }
      }
      return { ...prev, sel }
    })
  }

  const deselectAllScope = () => {
    if (!canEditScope) return
    updatePlan((prev) => {
      const sel = { ...prev.sel }
      for (const section of ITP_LIBRARY) {
        for (const item of section.items) {
          const current = sel[item.id] ?? emptyItemSel()
          sel[item.id] = { ...current, included: false }
        }
      }
      for (const custom of prev.custom) {
        const current = sel[custom.id] ?? emptyItemSel()
        sel[custom.id] = { ...current, included: false }
      }
      return { ...prev, sel }
    })
  }

  const addAttachments = async (fileList: FileList | null) => {
    if (readOnly || !fileList?.length || attachmentBusy) return
    setAttachmentBusy(true)
    try {
      const uploaded: ItpLibraryAttachment[] = []
      for (const file of Array.from(fileList)) {
        const { attachment, error } = await uploadItpLibraryAttachment(valve.id, file)
        if (error || !attachment) {
          showToast(error ?? 'Upload failed')
          break
        }
        uploaded.push(attachment)
      }
      if (uploaded.length) {
        updatePlan((prev) => ({
          ...prev,
          attachments: [...(prev.attachments ?? []), ...uploaded],
        }))
        showToast(uploaded.length === 1 ? 'Attachment added — save ITP to keep it' : `${uploaded.length} attachments added — save ITP to keep them`)
      }
    } finally {
      setAttachmentBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const removeAttachment = async (attachment: ItpLibraryAttachment) => {
    if (readOnly || attachmentBusy) return
    if (!window.confirm(`Remove “${attachment.fileName}”?`)) return
    setAttachmentBusy(true)
    const { error } = await deleteItpLibraryAttachment(attachment)
    setAttachmentBusy(false)
    if (error) {
      showToast(error)
      return
    }
    updatePlan((prev) => ({
      ...prev,
      attachments: (prev.attachments ?? []).filter((row) => row.id !== attachment.id),
    }))
    showToast('Attachment removed — save ITP to keep the change')
  }

  const updateAttachmentCaption = (attachmentId: string, caption: string) => {
    if (readOnly) return
    updatePlan((prev) => ({
      ...prev,
      attachments: (prev.attachments ?? []).map((row) =>
        row.id === attachmentId ? { ...row, caption: caption.slice(0, 500) } : row,
      ),
    }))
  }

  const addCustomItem = (secId: ItpLibrarySectionId) => {
    if (!canEditScope) return
    const name = (customDrafts[secId] ?? '').trim()
    if (!name) return
    const id = `custom_${crypto.randomUUID()}`
    updatePlan((prev) => ({
      ...prev,
      custom: [...prev.custom, { id, secId, name }],
      sel: {
        ...prev.sel,
        [id]: { ...emptyItemSel(), included: true },
      },
    }))
    setCustomDrafts((prev) => ({ ...prev, [secId]: '' }))
  }

  const removeCustomItem = (itemId: string) => {
    if (!canEditScope) return
    updatePlan((prev) => {
      const sel = { ...prev.sel }
      const exec = { ...prev.exec }
      delete sel[itemId]
      delete exec[itemId]
      return {
        ...prev,
        custom: prev.custom.filter((c) => c.id !== itemId),
        sel,
        exec,
      }
    })
  }

  const removeFromScope = (itemId: string) => {
    if (!canEditScope) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: { ...prev.sel, [itemId]: { ...current, included: false } },
      }
    })
  }

  const addSubReq = (itemId: string) => {
    if (!canEditScope) return
    const text = (subReqDrafts[itemId] ?? '').trim()
    if (!text) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...current, subReqs: [...current.subReqs, text] },
        },
      }
    })
    setSubReqDrafts((prev) => ({ ...prev, [itemId]: '' }))
  }

  const removeSubReq = (itemId: string, index: number) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: {
            ...current,
            subReqs: current.subReqs.filter((_, i) => i !== index),
          },
        },
      }
    })
  }

  const toggleDone = (itemId: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: { ...current, done: !current.done },
        },
      }
    })
  }

  const toggleFlag = (itemId: string, itemName: string) => {
    if (readOnly) return
    const current = plan?.exec[itemId] ?? emptyItemExec()
    if (current.flagged) {
      setClearingItem({ id: itemId, name: itemName })
      return
    }
    setFlaggingItem({ id: itemId, name: itemName })
  }

  const confirmClearFlag = async (reason: string) => {
    if (!plan || !clearingItem) return
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
      setIsPersisted(true)
      setClearingItem(null)
      showToast('Flag removed')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove flag')
    } finally {
      setFlagBusy(false)
    }
  }

  const confirmFlagIssue = async (input: { reason: string; photos: ItpLibraryAttachment[] }) => {
    if (!plan || !flaggingItem) return
    if (!user?.id) {
      showToast('Sign in required to flag an item and notify Quality Team')
      return
    }
    const itemId = flaggingItem.id
    const itemName = flaggingItem.name
    const now = new Date().toISOString()
    const current = plan.exec[itemId] ?? emptyItemExec()
    const nextPlan: ItpLibraryPlanPayload = {
      ...plan,
      exec: {
        ...plan.exec,
        [itemId]: {
          ...current,
          flagged: true,
          flagReason: input.reason,
          flagPhotos: input.photos.slice(0, 3),
          flaggedAt: now,
          flaggedByUserId: user.id,
          flaggedByName: username || 'Technician',
          flagClearReason: '',
          flagClearedAt: null,
          flagClearedByUserId: null,
          flagClearedByName: null,
        },
      },
    }
    setFlagBusy(true)
    try {
      const saved = await saveItpLibraryPlan(valve, nextPlan)
      setPlan(saved.plan)
      setIsPersisted(true)
      setFlaggingItem(null)
      const { notified, error } = await notifyQualityTeamItpItemFlagged({
        valveRowId: valve.id,
        valveId: valve.valve_id,
        customer: valve.customer,
        itemName,
        flagReason: input.reason,
        photoCount: input.photos.length,
        senderUserId: user.id,
        senderName: username || 'Technician',
      })
      if (error) {
        showToast(`Item flagged, but notify failed: ${error}`)
      } else {
        showToast(
          notified > 0
            ? `Item flagged — Quality Team notified (${notified})`
            : 'Item flagged — no Quality Team logins to notify',
        )
      }
      window.dispatchEvent(new Event('jsjb-inbox-refresh'))
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to flag item')
    } finally {
      setFlagBusy(false)
    }
  }

  const setExecField = (itemId: string, field: 'beforeVal' | 'afterVal' | 'verifyVal', value: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: { ...current, [field]: value },
        },
      }
    })
  }

  const setItemNotes = (itemId: string, notes: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const sel = ensureSel(prev, itemId)
      const exec = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...sel, notes },
        },
        // Keep exec.notes in sync for older print/checklist paths.
        exec: {
          ...prev.exec,
          [itemId]: { ...exec, notes },
        },
      }
    })
  }

  const toggleSubDone = (itemId: string, index: number) => {
    if (readOnly) return
    const key = String(index)
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: {
            ...current,
            subDone: { ...current.subDone, [key]: !current.subDone[key] },
          },
        },
      }
    })
  }

  const reapplyTemplate = () => {
    if (!canEditScope || !plan) return
    if (!window.confirm('Re-apply the template for this job/valve type? Existing selections stay; template items will be included.')) {
      return
    }
    updatePlan((prev) => applyLibraryTemplate(prev))
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading ITP…</p>
        </section>
      </section>
    )
  }

  if (!plan || !stats) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Could not load ITP.</p>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </section>
      </section>
    )
  }

  const pctColor = stats.flagged > 0 ? 'var(--itp-lib-fail)' : stats.done === stats.total && stats.total > 0 ? 'var(--itp-lib-pass)' : 'var(--itp-lib-accent)'
  const overallLabel =
    stats.flagged > 0
      ? `⚑ ${stats.flagged} flagged`
      : stats.done === stats.total && stats.total > 0
        ? '✓ Complete'
        : `${stats.open} remaining`

  const snap = plan.valveSnapshot

  return (
    <section className="dashboard-page itp-library-page">
      <div className="itp-library-job-bar">
        <div className="itp-library-job-bar-main">
          <div className="itp-library-jb-title">
            <h2 className="dashboard-title">ITP — {snap.valveId}</h2>
            <JobTypeBadge jobType={plan.jobType} />
          </div>
          <p className="itp-library-jb-meta">
            {(snap.customer ?? '—') +
              ' · ' +
              (plan.valveType || snap.valveType || '—') +
              ' · ' +
              (snap.size || '—') +
              (snap.pressureClass ? ` / ${snap.pressureClass}` : '') +
              (snap.material ? ` · ${snap.material}` : '')}
          </p>
          <p className="itp-library-jb-note">
            Build scope on the left; the checklist on the right updates as you select items.{' '}
            <Link to={`/traveler/${encodeURIComponent(valve.valve_id)}/inspection`}>Traveler inspection</Link>
            {hasLegacyInspection ? ' · detailed inspection data on file' : null}
          </p>
          <p className={`itp-library-qc-status itp-library-qc-status--${plan.qcReview.status}`}>
            QC status: <strong>{qcReviewStatusLabel(plan.qcReview.status)}</strong>
            {plan.qcReview.generatedByName
              ? ` · generated by ${plan.qcReview.generatedByName}`
              : null}
            {plan.qcReview.acceptedByName
              ? ` · accepted by ${plan.qcReview.acceptedByName}`
              : isPersisted && plan.qcReview.status === 'pending_review'
                ? ' · waiting for Quality Team accept'
                : null}
          </p>
          {(plan.qcReview.changeLog?.length ?? 0) > 0 ? (
            <div className="itp-library-qc-changelog">
              <strong>QC change history</strong>
              <ul>
                {[...(plan.qcReview.changeLog ?? [])]
                  .slice()
                  .reverse()
                  .map((entry) => {
                    const when = (() => {
                      const d = new Date(entry.at)
                      return Number.isNaN(d.getTime()) ? entry.at : d.toLocaleString()
                    })()
                    const level = entry.byLevel
                      ? qualityTeamLevelLabel(normalizeQualityTeamLevel(entry.byLevel))
                      : null
                    return (
                      <li key={entry.id}>
                        <span className="itp-library-qc-changelog-meta">
                          {when} · {entry.byName}
                          {level ? ` (${level})` : ''}
                        </span>
                        <span className="itp-library-qc-changelog-summary">{entry.summary}</span>
                        {entry.note && entry.note !== entry.summary ? (
                          <span className="itp-library-qc-changelog-note">{entry.note}</span>
                        ) : null}
                      </li>
                    )
                  })}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="itp-library-job-bar-side">
          {qrDataUrl ? (
            <div className="itp-library-qr-block">
              <img className="itp-library-qr-img" src={qrDataUrl} alt={`QR code for ITP ${snap.valveId}`} />
              <div className="itp-library-qr-caption">
                <strong>Scan to open ITP</strong>
                <span className="itp-library-qr-url">{itpPageUrl}</span>
              </div>
            </div>
          ) : null}
          <div className="itp-library-jb-actions">
            <button type="button" className="button-secondary" onClick={() => window.print()}>
              Print ITP
            </button>
            {canEditScope ? (
              <button type="button" className="button-secondary" onClick={reapplyTemplate}>
                Re-apply template
              </button>
            ) : null}
            {canAccept ? (
              <>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={saving}
                  onClick={() => void acceptItp()}
                >
                  {saving ? 'Saving…' : 'Accept'}
                </button>
                <button
                  type="button"
                  className="button-primary"
                  disabled={saving}
                  onClick={startAcceptWithChanges}
                >
                  Accept with changes
                </button>
              </>
            ) : null}
            {canReopen ? (
              <button
                type="button"
                className="button-primary"
                disabled={saving}
                onClick={() => void reopenItp()}
              >
                {saving ? 'Saving…' : 'Reopen ITP'}
              </button>
            ) : null}
            {!readOnly && !isAccepted ? (
              <button type="button" className="button-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save ITP'}
              </button>
            ) : null}
            <button type="button" className="button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {hasLegacyProcessPlan ? (
        <div className="status-breakdown-note itp-library-legacy-banner" role="status">
          A previous overall-steps / parts process plan is still saved for this valve. This page uses the new library
          checklist. Use Traveler inspection for the detailed part checklist.
        </div>
      ) : null}

      {readOnly ? (
        <p className="placeholder-copy">View only — ask an Admin or Manager to edit this ITP.</p>
      ) : null}
      {!readOnly && isPersisted && !canEditScope && plan.qcReview.status !== 'accepted' ? (
        <p className="placeholder-copy resources-hint">
          Build Scope is locked for shop edits after the first save. A Quality Team Admin, Manager, or Supervisor
          (or shop Admin) can expand Build Scope, adjust items, or Accept the ITP.
        </p>
      ) : null}
      {!readOnly && plan.qcReview.status === 'accepted' ? (
        <p className="placeholder-copy resources-hint">
          This ITP was accepted by Quality Team. Use <strong>Reopen ITP</strong> if changes are needed; it will return
          to Pending review until accepted again.
        </p>
      ) : null}
      {!readOnly && isPersisted && canEditScope && plan.qcReview.status === 'pending_review' ? (
        <p className="placeholder-copy resources-hint">
          You can edit Build Scope and Accept this ITP. Scope changes are recorded in the QC change log.
        </p>
      ) : null}

      <div className={`itp-library-split${scopeMinimized ? ' is-scope-minimized' : ''}`}>
        <div className={`itp-library-panel itp-library-panel-left${scopeMinimized ? ' is-minimized' : ''}`}>
          <div className="itp-library-panel-hdr">
            <h3>Build Scope</h3>
            <div className="itp-library-ph-actions">
              <span className="itp-library-ph-count">{scopeItems.length} selected</span>
              {plan.qcReview.status === 'accepted' ||
              plan.qcReview.status === 'pending_review' ||
              scopeMinimized ? (
                <button
                  type="button"
                  className="itp-library-deselect-all"
                  onClick={() => setScopeMinimized((v) => !v)}
                >
                  {scopeMinimized ? 'Expand' : 'Minimize'}
                </button>
              ) : null}
              {canEditScope && scopeItems.length > 0 ? (
                <button type="button" className="itp-library-deselect-all" onClick={deselectAllScope}>
                  Deselect all
                </button>
              ) : null}
            </div>
          </div>
          {!scopeMinimized ? (
          <div className="itp-library-panel-body">
            {ITP_LIBRARY.map((section) => {
              const customInSec = plan.custom.filter((c) => c.secId === section.id)
              const selCount =
                section.items.filter((it) => getSel(plan, it.id).included).length +
                customInSec.filter((c) => getSel(plan, c.id).included).length
              const allSel = section.items.length > 0 && section.items.every((it) => getSel(plan, it.id).included)

              return (
                <div key={section.id} className="itp-library-lib-sec">
                  <div className="itp-library-lib-sec-hdr">
                    <h4>{section.title}</h4>
                    <div className="itp-library-lshr">
                      <span>
                        {selCount}/{section.items.length + customInSec.length}
                      </span>
                      {canEditScope ? (
                        <button
                          type="button"
                          className="itp-library-sel-all"
                          onClick={() => selectAllInSection(section.id, !allSel)}
                        >
                          {allSel ? 'Deselect All' : 'Select All'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {section.items.map((item) => {
                    const sel = getSel(plan, item.id)
                    return (
                      <div key={item.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                        <div
                          className="itp-library-lib-item-top"
                          onClick={() => toggleInclude(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleInclude(item.id)
                            }
                          }}
                          role="button"
                          tabIndex={canEditScope ? 0 : -1}
                        >
                          <div className="itp-library-cb-cell">
                            <span className="itp-library-cb" />
                          </div>
                          <div className="itp-library-lib-item-name">
                            <div className="itp-library-lin">{item.name}</div>
                            <div className="itp-library-lref">{item.ref}</div>
                          </div>
                        </div>
                        {sel.included ? (
                          <>
                            <div className="itp-library-attr-bar">
                              <button
                                type="button"
                                className={`itp-library-attr-toggle hp${sel.holdPoint ? ' on' : ''}`}
                                disabled={readOnly}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleAttr(item.id, 'holdPoint')
                                }}
                              >
                                Hold Point
                              </button>
                              <button
                                type="button"
                                className={`itp-library-attr-toggle meas${itemRequiresMeasurements(sel) ? ' on' : ''}`}
                                disabled={readOnly}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRequiresMeasurements(item.id)
                                }}
                              >
                                Requires Measurements
                              </button>
                            </div>
                            <div className="itp-library-sub-reqs-area">
                              <label className="itp-library-scope-notes">
                                Notes
                                <textarea
                                  rows={2}
                                  value={sel.notes}
                                  disabled={readOnly}
                                  placeholder="Add notes for this line…"
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setItemNotes(item.id, e.target.value)}
                                />
                              </label>
                              {sel.subReqs.map((sr, idx) => (
                                <div key={`${item.id}-sr-${idx}`} className="itp-library-sub-req-row">
                                  <span>• {sr}</span>
                                  {!readOnly ? (
                                    <button
                                      type="button"
                                      className="itp-library-sr-del"
                                      onClick={() => removeSubReq(item.id, idx)}
                                    >
                                      ✕
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                              {!readOnly ? (
                                <div className="itp-library-add-sr-row">
                                  <input
                                    className="itp-library-add-sr-inp"
                                    type="text"
                                    placeholder="+ Add sub-requirement…"
                                    value={subReqDrafts[item.id] ?? ''}
                                    onChange={(e) => setSubReqDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        addSubReq(item.id)
                                      }
                                    }}
                                  />
                                  <button type="button" className="itp-library-add-sr-btn" onClick={() => addSubReq(item.id)}>
                                    Add
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })}

                  {customInSec.map((custom) => {
                    const sel = getSel(plan, custom.id)
                    return (
                      <div key={custom.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                        <div
                          className="itp-library-lib-item-top"
                          onClick={() => toggleInclude(custom.id)}
                          role="button"
                          tabIndex={readOnly ? -1 : 0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleInclude(custom.id)
                            }
                          }}
                        >
                          <div className="itp-library-cb-cell">
                            <span className="itp-library-cb" />
                          </div>
                          <div className="itp-library-lib-item-name">
                            <div className="itp-library-lin">
                              {custom.name} <span className="itp-library-custom-tag">(custom)</span>
                            </div>
                            <div className="itp-library-lref">
                              Custom
                              {!readOnly ? (
                                <>
                                  {' · '}
                                  <button
                                    type="button"
                                    className="link-button-danger"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeCustomItem(custom.id)
                                    }}
                                  >
                                    remove
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {sel.included ? (
                          <div className="itp-library-sub-reqs-area">
                            <label className="itp-library-scope-notes">
                              Notes
                              <textarea
                                rows={2}
                                value={sel.notes}
                                disabled={readOnly}
                                placeholder="Add notes for this line…"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setItemNotes(custom.id, e.target.value)}
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  {canEditScope ? (
                    <div className="itp-library-add-row">
                      <input
                        className="itp-library-add-inp"
                        type="text"
                        placeholder="+ Add custom item…"
                        value={customDrafts[section.id] ?? ''}
                        onChange={(e) => setCustomDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addCustomItem(section.id)
                          }
                        }}
                      />
                      <button type="button" className="itp-library-add-btn" onClick={() => addCustomItem(section.id)}>
                        Add
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          ) : (
            <div className="itp-library-panel-body itp-library-panel-body--minimized">
              <p className="placeholder-copy">
                {plan.qcReview.status === 'accepted'
                  ? `Build Scope minimized after Quality Team accept (${scopeItems.length} items). Expand to review.`
                  : `Build Scope minimized while pending Quality Team review (${scopeItems.length} items). Expand to review or adjust.`}
              </p>
            </div>
          )}
        </div>

        <div className="itp-library-panel itp-library-panel-right">
          <div className="itp-library-panel-hdr">
            <h3>ITP Checklist</h3>
            <span className="itp-library-ph-count" style={{ color: pctColor }}>
              {stats.done}/{stats.total} · {stats.pct}%
            </span>
          </div>

          {scopeItems.length === 0 ? (
            <div className="itp-library-empty">
              <p>Check items on the left to build your ITP scope.</p>
            </div>
          ) : (
            <>
              <div className="itp-library-summary">
                <div className="itp-library-ss">
                  <div className="itp-library-sv">{stats.total}</div>
                  <div className="itp-library-sl">Items</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-pass">{stats.done}</div>
                  <div className="itp-library-sl">Done</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-fail">{stats.flagged}</div>
                  <div className="itp-library-sl">Flagged</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-hp">{stats.holdPts}</div>
                  <div className="itp-library-sl">Hold Pts</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-warn">{stats.open}</div>
                  <div className="itp-library-sl">Open</div>
                </div>
              </div>
              <div className="itp-library-pbar-strip">
                <div className="itp-library-pbar-fill" style={{ width: `${stats.pct}%`, background: pctColor }} />
              </div>

              <div className="itp-library-panel-body">
                <div className="itp-library-job-details">
                  <button type="button" className="itp-library-jd-hdr" onClick={() => setDetailsOpen((v) => !v)}>
                    {detailsOpen ? '▾' : '▸'} Job Details
                  </button>
                  {detailsOpen ? (
                    <div className="itp-library-jd-grid">
                      <div className="itp-library-jdf">
                        <label>Valve ID</label>
                        <input value={snap.valveId} readOnly />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Customer</label>
                        <input value={snap.customer ?? ''} readOnly />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Job Type</label>
                        <select
                          value={plan.jobType}
                          disabled={readOnly}
                          onChange={(e) =>
                            updatePlan((prev) => ({
                              ...prev,
                              jobType: e.target.value as ItpLibraryJobType,
                            }))
                          }
                        >
                          <option value="repair">Repair</option>
                          <option value="testonly">Test Only</option>
                          <option value="manufacturing">Manufacturing</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="itp-library-jdf">
                        <label>Valve Type</label>
                        <input
                          value={plan.valveType}
                          disabled={readOnly}
                          onChange={(e) => updatePlan((prev) => ({ ...prev, valveType: e.target.value }))}
                        />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Size / Class</label>
                        <input
                          value={[snap.size, snap.pressureClass].filter(Boolean).join(' / ')}
                          readOnly
                        />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Material</label>
                        <input value={snap.material ?? ''} readOnly />
                      </div>
                      <div className="itp-library-jdf s2">
                        <label>Plan notes</label>
                        <textarea
                          rows={2}
                          value={plan.notes}
                          disabled={readOnly}
                          onChange={(e) => updatePlan((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                {ITP_LIBRARY.map((section) => {
                  const items = scopeItems.filter((it) => it.secId === section.id)
                  if (!items.length) return null
                  const secDone = items.filter((it) => getExec(plan, it.id).done).length
                  const secFlag = items.filter((it) => getExec(plan, it.id).flagged).length

                  return (
                    <div key={section.id} className="itp-library-itp-sec">
                      <div className="itp-library-itp-sec-hdr">
                        <h4>{section.title}</h4>
                        <div className="itp-library-isp-wrap screen-only">
                          {secFlag > 0 ? <span className="itp-library-sec-flag">⚑{secFlag}</span> : null}
                          <span className="itp-library-isp">
                            {secDone}/{items.length}
                          </span>
                        </div>
                      </div>
                      {items.map((it) => {
                        const ex = getExec(plan, it.id)
                        const sel = it.sel
                        return (
                          <div key={it.id} className="itp-library-exec-item">
                            {sel.holdPoint ? (
                              <div className="itp-library-hp-divider">
                                QA/QC HOLD POINT — Inspector sign-off required before proceeding
                              </div>
                            ) : null}
                            <div
                              className={`itp-library-exec-row${ex.done ? ' done' : ''}${ex.flagged ? ' flagged' : ''}${sel.holdPoint ? ' hold-point' : ''}`}
                            >
                              <div className="itp-library-exec-top">
                                <button
                                  type="button"
                                  className="itp-library-exec-cb"
                                  disabled={readOnly}
                                  onClick={() => toggleDone(it.id)}
                                  aria-label={ex.done ? 'Mark incomplete' : 'Mark done'}
                                >
                                  <span className={`itp-library-cb${ex.done ? ' sel' : ''}`} />
                                </button>
                                <div className="itp-library-exec-body">
                                  <div className="itp-library-en">
                                    {it.name}{' '}
                                    {sel.holdPoint ? <span className="itp-library-hp-badge">HOLD POINT</span> : null}
                                    {itemRequiresMeasurements(sel) ? (
                                      <span className="itp-library-attr-badge meas">Measurements</span>
                                    ) : null}
                                  </div>
                                  <div className="itp-library-er">[{it.ref}]</div>
                                  {itemRequiresMeasurements(sel) ? (
                                    <div className="itp-library-meas-fields">
                                      <label className="itp-library-mf-wrap">
                                        Before Measurement
                                        <input
                                          type="text"
                                          value={ex.beforeVal}
                                          disabled={readOnly}
                                          placeholder="Value / units"
                                          onChange={(e) => setExecField(it.id, 'beforeVal', e.target.value)}
                                        />
                                        <span className="itp-library-print-field-line" aria-hidden="true">
                                          {ex.beforeVal || '\u00a0'}
                                        </span>
                                      </label>
                                      <label className="itp-library-mf-wrap">
                                        After Measurement
                                        <input
                                          type="text"
                                          value={ex.afterVal}
                                          disabled={readOnly}
                                          placeholder="Value / units"
                                          onChange={(e) => setExecField(it.id, 'afterVal', e.target.value)}
                                        />
                                        <span className="itp-library-print-field-line" aria-hidden="true">
                                          {ex.afterVal || '\u00a0'}
                                        </span>
                                      </label>
                                      <label className="itp-library-mf-wrap">
                                        Verification / Acceptance
                                        <input
                                          type="text"
                                          className="verify"
                                          value={ex.verifyVal}
                                          disabled={readOnly}
                                          placeholder="Spec / result"
                                          onChange={(e) => setExecField(it.id, 'verifyVal', e.target.value)}
                                        />
                                        <span className="itp-library-print-field-line" aria-hidden="true">
                                          {ex.verifyVal || '\u00a0'}
                                        </span>
                                      </label>
                                    </div>
                                  ) : null}
                                  <input
                                    className="itp-library-enote screen-only"
                                    type="text"
                                    value={sel.notes || ex.notes}
                                    disabled={readOnly}
                                    placeholder="Notes, observations…"
                                    onChange={(e) => setItemNotes(it.id, e.target.value)}
                                  />
                                  <div className="itp-library-print-notes" aria-hidden="true">
                                    <span className="itp-library-print-notes-label">Notes</span>
                                    <span className="itp-library-print-notes-line">{sel.notes || ex.notes || '\u00a0'}</span>
                                  </div>
                                  {!ex.flagged && ex.flagClearReason?.trim() ? (
                                    <p className="itp-library-flag-cleared-note">
                                      Flag removed
                                      {ex.flagClearedByName ? ` by ${ex.flagClearedByName}` : ''}:{' '}
                                      {ex.flagClearReason.trim()}
                                    </p>
                                  ) : null}
                                      {ex.flagged ? (
                                    <div className="itp-library-flag-detail">
                                      <div className="itp-library-flag-detail-reason">
                                        <strong>Flag reason:</strong> {ex.flagReason?.trim() || '—'}
                                        {ex.flaggedByName ? (
                                          <span className="itp-library-flag-by">
                                            {' '}
                                            · {ex.flaggedByName}
                                          </span>
                                        ) : null}
                                      </div>
                                      {ex.flagOwnerName ? (
                                        <div className="itp-library-flag-detail-reason">
                                          <strong>QC owner:</strong> {ex.flagOwnerName}
                                        </div>
                                      ) : null}
                                      {ex.flagResolution?.trim() ? (
                                        <div className="itp-library-flag-resolution">
                                          <strong>QC resolution:</strong> {ex.flagResolution.trim()}
                                          {ex.flagResolvedByName ? (
                                            <span className="itp-library-flag-by">
                                              {' '}
                                              · {ex.flagResolvedByName}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : null}
                                      {(ex.flagPhotos ?? []).length > 0 ? (
                                        <div className="itp-library-flag-photo-row">
                                          {ex.flagPhotos.map((photo) => (
                                            <a
                                              key={photo.id}
                                              href={photo.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="itp-library-flag-photo-thumb"
                                            >
                                              <img src={photo.url} alt={photo.fileName} />
                                            </a>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {sel.subReqs.length > 0 ? (
                                    <div className="itp-library-exec-subreqs">
                                      {sel.subReqs.map((sr, idx) => {
                                        const done = Boolean(ex.subDone[String(idx)])
                                        return (
                                          <div key={`${it.id}-exec-sr-${idx}`} className="itp-library-exec-sr-row">
                                            <button
                                              type="button"
                                              className={`itp-library-srcb${done ? ' on' : ''}`}
                                              disabled={readOnly}
                                              onClick={() => toggleSubDone(it.id, idx)}
                                              aria-label={done ? 'Uncheck sub-requirement' : 'Check sub-requirement'}
                                            >
                                              {done ? '✓' : ''}
                                            </button>
                                            <span className={done ? 'done-text' : ''}>• {sr}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="itp-library-exec-acts">
                                  <button
                                    type="button"
                                    className={`itp-library-flag-btn${ex.flagged ? ' on' : ''}`}
                                    disabled={readOnly}
                                    title="Flag issue"
                                    onClick={() => toggleFlag(it.id, it.name)}
                                  >
                                    ⚑
                                  </button>
                                  {!readOnly ? (
                                    <button
                                      type="button"
                                      className="itp-library-rm-btn"
                                      title="Remove from ITP"
                                      onClick={() => removeFromScope(it.id)}
                                    >
                                      ✕
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                <div className="itp-library-attachments">
                  <div className="itp-library-attachments-hdr">
                    <h4>Attachments</h4>
                    <span className="itp-library-attachments-count">
                      {(plan.attachments ?? []).length} file{(plan.attachments ?? []).length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="itp-library-attachments-hint screen-only">
                    Photos and PDFs for this ITP. Photos print with the ITP; PDFs open from the digital card.
                  </p>
                  {!readOnly ? (
                    <div className="itp-library-attachments-actions screen-only">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="itp-library-attachments-file-input"
                        accept="image/*,.pdf,application/pdf"
                        multiple
                        disabled={attachmentBusy}
                        onChange={(e) => void addAttachments(e.target.files)}
                      />
                      <input
                        ref={cameraInputRef}
                        type="file"
                        className="itp-library-attachments-file-input"
                        accept="image/*"
                        capture="environment"
                        disabled={attachmentBusy}
                        onChange={(e) => void addAttachments(e.target.files)}
                      />
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={attachmentBusy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {attachmentBusy ? 'Uploading…' : 'Add photo / PDF'}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={attachmentBusy}
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        Take photo
                      </button>
                    </div>
                  ) : null}

                  {(plan.attachments ?? []).length === 0 ? (
                    <p className="placeholder-copy screen-only">No attachments yet.</p>
                  ) : (
                    <div className="itp-library-attachments-grid">
                      {(plan.attachments ?? []).map((attachment) => {
                        const isImage = isItpLibraryAttachmentImage(attachment)
                        const isPdf = isItpLibraryAttachmentPdf(attachment)
                        return (
                          <div
                            key={attachment.id}
                            className={`itp-library-attachment-card${isImage ? ' is-image' : ''}${isPdf ? ' is-pdf screen-only' : ''}`}
                          >
                            {isImage ? (
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="itp-library-attachment-thumb-link"
                              >
                                <img
                                  src={attachment.url}
                                  alt={attachment.fileName}
                                  className="itp-library-attachment-thumb"
                                />
                              </a>
                            ) : (
                              <div className="itp-library-attachment-pdf-icon" aria-hidden="true">
                                PDF
                              </div>
                            )}
                            <div className="itp-library-attachment-meta">
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="itp-library-attachment-name"
                                title={attachment.fileName}
                              >
                                {attachment.fileName}
                              </a>
                              {!readOnly ? (
                                <label className="itp-library-attachment-caption-field screen-only">
                                  <span>What it’s for</span>
                                  <input
                                    type="text"
                                    value={attachment.caption ?? ''}
                                    placeholder="e.g. As-received body photo, customer drawing…"
                                    disabled={attachmentBusy}
                                    onChange={(e) => updateAttachmentCaption(attachment.id, e.target.value)}
                                  />
                                </label>
                              ) : null}
                              {attachment.caption?.trim() ? (
                                <p
                                  className={`itp-library-attachment-caption${!readOnly ? ' print-only' : ''}`}
                                >
                                  {attachment.caption.trim()}
                                </p>
                              ) : null}
                              {!readOnly ? (
                                <button
                                  type="button"
                                  className="link-button link-button-danger screen-only"
                                  disabled={attachmentBusy}
                                  onClick={() => void removeAttachment(attachment)}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {(plan.attachments ?? []).some(isItpLibraryAttachmentPdf) ? (
                    <p className="itp-library-attachments-print-note print-only">
                      PDF attachments are available on the digital ITP (not printed):{' '}
                      {(plan.attachments ?? [])
                        .filter(isItpLibraryAttachmentPdf)
                        .map((a) => (a.caption?.trim() ? `${a.caption.trim()} (${a.fileName})` : a.fileName))
                        .join('; ')}
                    </p>
                  ) : null}
                </div>

                <div className="itp-library-signoff">
                  <h4>QC Sign-Off</h4>
                  <div className="itp-library-so-grid">
                    <label className="itp-library-sof">
                      Inspector
                      <input
                        value={plan.inspector}
                        disabled={readOnly}
                        placeholder="Print name"
                        onChange={(e) => updatePlan((prev) => ({ ...prev, inspector: e.target.value }))}
                      />
                    </label>
                    <label className="itp-library-sof">
                      Inspection Date
                      <input
                        type="date"
                        value={plan.inspDate}
                        disabled={readOnly}
                        onChange={(e) => updatePlan((prev) => ({ ...prev, inspDate: e.target.value }))}
                      />
                    </label>
                    <label className="itp-library-sof">
                      QC Manager
                      <input
                        value={plan.qcMgr}
                        disabled={readOnly}
                        placeholder="Print name"
                        onChange={(e) => updatePlan((prev) => ({ ...prev, qcMgr: e.target.value }))}
                      />
                    </label>
                    <label className="itp-library-sof">
                      Review Date
                      <input
                        type="date"
                        value={plan.qcDate}
                        disabled={readOnly}
                        onChange={(e) => updatePlan((prev) => ({ ...prev, qcDate: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="itp-library-sig-rows">
                    <div>
                      <div className="itp-library-sig-label">Inspector Signature</div>
                      <div className="itp-library-sig-line" />
                    </div>
                    <div>
                      <div className="itp-library-sig-label">QC Manager Signature</div>
                      <div className="itp-library-sig-line" />
                    </div>
                  </div>
                  <div className="itp-library-signoff-foot">
                    Environmental Fittings · ITP library checklist
                    {' · '}
                    <strong>Overall:</strong>{' '}
                    <span style={{ color: pctColor, fontWeight: 700 }}>{overallLabel}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

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

      {pendingScopeChange ? (
        <ItpQcChangeNoteModal
          summary={pendingScopeChange.summary}
          busy={saving}
          onCancel={() => {
            if (!saving) setPendingScopeChange(null)
          }}
          onConfirm={(note) => void confirmScopeChangeSave(note)}
        />
      ) : null}

      {pendingAcceptWithChanges ? (
        <ItpQcChangeNoteModal
          title="Accept with changes"
          subtitle="Describe what changed. The ITP will be accepted and this note will be recorded in the QC change log."
          confirmLabel="Accept with note"
          summary={pendingAcceptWithChanges.summary}
          busy={saving}
          onCancel={() => {
            if (!saving) setPendingAcceptWithChanges(null)
          }}
          onConfirm={(note) => void confirmAcceptWithChanges(note)}
        />
      ) : null}
    </section>
  )
}
