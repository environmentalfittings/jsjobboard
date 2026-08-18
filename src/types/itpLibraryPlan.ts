import type { Valve } from '../types'
import {
  findLibraryItem,
  getTemplateKey,
  ITP_LIBRARY,
  ITP_LIBRARY_TEMPLATES,
  mapShopJobTypeToLibrary,
  resolveLibraryValveType,
  type ItpLibraryJobType,
  type ItpLibrarySectionId,
} from '../constants/itpLibrary'
import { processSectionTitle } from '../constants/itpProcessSections'
import { normalizeMeasFields, type ItpMeasFieldDef } from './itpMeasFields'

export const ITP_LIBRARY_PLAN_SCHEMA_VERSION = 8 as const

export type ItpLibraryItemSel = {
  included: boolean
  holdPoint: boolean
  beforeMeas: boolean
  afterMeas: boolean
  measVerify: boolean
  subReqs: string[]
  /** Free-form notes for this ITP line (scope + checklist). */
  notes: string
  /** Per-item photo requirement (from master catalog / builder). */
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  /** Configurable measurement / nameplate fields (empty = use legacy before/after/verify flags). */
  measFields: ItpMeasFieldDef[]
  /** When true, the next item in this section stays locked until this item is fully done. */
  blockNext: boolean
  /**
   * Optional ITP section override for this template/job scope.
   * Empty string = use the master/library default section.
   */
  sectionId: string
}

export type ItpLibraryItemExec = {
  done: boolean
  flagged: boolean
  notes: string
  beforeVal: string
  afterVal: string
  verifyVal: string
  /** Values keyed by meas field id (also mirrored into before/after/verify for legacy ids). */
  measValues: Record<string, string>
  /** Photos attached to satisfy a picture requirement on this line. */
  photos: ItpLibraryAttachment[]
  /** HOLD POINT clicked by tech — waiting for supervisor / QC sign-off. */
  holdPending: boolean
  holdSignedOffAt: string | null
  holdSignedOffByUserId: string | null
  holdSignedOffByName: string | null
  subDone: Record<string, boolean>
  /** Required when flagged — why the technician raised this issue. */
  flagReason: string
  /** Up to 3 photos documenting the flagged issue. */
  flagPhotos: ItpLibraryAttachment[]
  flaggedAt: string | null
  flaggedByUserId: string | null
  flaggedByName: string | null
  /** Quality Team member owning this flag ticket. */
  flagOwnerEmployeeId: string | null
  flagOwnerUserId: string | null
  flagOwnerName: string | null
  /** QC resolution — saved on the ITP and shown on the checklist line. */
  flagResolution: string
  flagResolvedAt: string | null
  flagResolvedByUserId: string | null
  flagResolvedByName: string | null
  /** Why the flag was removed (accident / typed other reason). */
  flagClearReason: string
  flagClearedAt: string | null
  flagClearedByUserId: string | null
  flagClearedByName: string | null
}

export type ItpLibraryCustomItem = {
  id: string
  secId: string
  name: string
}

export type ItpLibraryValveSnapshot = {
  valveId: string
  customer: string | null
  size: string | null
  pressureClass: string | null
  valveType: string | null
  jobType: string | null
  cell: string | null
  material: string | null
  description: string | null
  dueDate: string | null
}

export type ItpLibraryAttachment = {
  id: string
  fileName: string
  url: string
  storagePath: string
  contentType: string
  uploadedAt: string
  /** What this photo/PDF is for (shown on screen and when printing photos). */
  caption: string
}

export type ItpQcReviewStatus = 'draft' | 'pending_review' | 'accepted'

export type ItpQcChangeLogEntry = {
  id: string
  at: string
  byUserId: string | null
  byName: string
  byLevel: string | null
  note: string
  /** Short auto summary, e.g. "Added 2 items, removed 1, updated hold points". */
  summary: string
}

export type ItpQcReview = {
  status: ItpQcReviewStatus
  generatedAt: string | null
  generatedByUserId: string | null
  generatedByName: string | null
  notifiedAt: string | null
  acceptedAt: string | null
  acceptedByUserId: string | null
  acceptedByName: string | null
  acceptedByLevel: string | null
  changeLog: ItpQcChangeLogEntry[]
}

export type ItpLibraryPlanPayload = {
  v: typeof ITP_LIBRARY_PLAN_SCHEMA_VERSION
  kind: 'library_plan'
  valveSnapshot: ItpLibraryValveSnapshot
  jobType: ItpLibraryJobType
  valveType: string
  sel: Record<string, ItpLibraryItemSel>
  custom: ItpLibraryCustomItem[]
  exec: Record<string, ItpLibraryItemExec>
  attachments: ItpLibraryAttachment[]
  qcReview: ItpQcReview
  inspector: string
  inspDate: string
  qcMgr: string
  qcDate: string
  notes: string
  updatedAt: string
}

/** Accept current and prior library plan schema versions when loading. */
export function isItpLibraryPlanPayload(value: unknown): value is ItpLibraryPlanPayload {
  if (!value || typeof value !== 'object') return false
  const o = value as { v?: unknown; kind?: unknown }
  const version = typeof o.v === 'number' ? o.v : Number(o.v)
  if (o.kind !== 'library_plan' || !Number.isFinite(version)) return false
  // Accept current schema and prior versions (v8 added sectionId overrides).
  return version >= 4 && version <= ITP_LIBRARY_PLAN_SCHEMA_VERSION
}

export function emptyQcReview(): ItpQcReview {
  return {
    status: 'draft',
    generatedAt: null,
    generatedByUserId: null,
    generatedByName: null,
    notifiedAt: null,
    acceptedAt: null,
    acceptedByUserId: null,
    acceptedByName: null,
    acceptedByLevel: null,
    changeLog: [],
  }
}

export function emptyItemSel(): ItpLibraryItemSel {
  return {
    included: false,
    holdPoint: false,
    beforeMeas: false,
    afterMeas: false,
    measVerify: false,
    subReqs: [],
    notes: '',
    requirePicture: false,
    pictureLabel: '',
    minPhotos: 1,
    measFields: [],
    blockNext: false,
    sectionId: '',
  }
}

export function emptyItemExec(): ItpLibraryItemExec {
  return {
    done: false,
    flagged: false,
    notes: '',
    beforeVal: '',
    afterVal: '',
    verifyVal: '',
    measValues: {},
    photos: [],
    holdPending: false,
    holdSignedOffAt: null,
    holdSignedOffByUserId: null,
    holdSignedOffByName: null,
    subDone: {},
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
    flagClearReason: '',
    flagClearedAt: null,
    flagClearedByUserId: null,
    flagClearedByName: null,
  }
}

export function valveToLibrarySnapshot(valve: Valve): ItpLibraryValveSnapshot {
  return {
    valveId: valve.valve_id,
    customer: valve.customer,
    size: valve.size,
    pressureClass: valve.pressure_class ?? null,
    valveType: valve.valve_type,
    jobType: valve.job_type ?? null,
    cell: valve.cell,
    material: valve.body_material ?? valve.material_spec ?? null,
    description: valve.description,
    dueDate: valve.due_date,
  }
}

export function getSel(plan: ItpLibraryPlanPayload, itemId: string): ItpLibraryItemSel {
  return plan.sel[itemId] ?? emptyItemSel()
}

export function getExec(plan: ItpLibraryPlanPayload, itemId: string): ItpLibraryItemExec {
  return plan.exec[itemId] ?? emptyItemExec()
}

export function isItemIncluded(plan: ItpLibraryPlanPayload, itemId: string): boolean {
  return getSel(plan, itemId).included
}

export type ItpLibraryScopeItem = {
  id: string
  name: string
  ref: string
  secId: string
  secTitle: string
  custom: boolean
  sel: ItpLibraryItemSel
}

export function isItpLibrarySectionId(value: string): value is ItpLibrarySectionId {
  return ITP_LIBRARY.some((section) => section.id === value)
}

export function effectiveScopeSectionId(defaultSecId: string, sel: ItpLibraryItemSel): string {
  const override = String(sel.sectionId ?? '').trim()
  return override || defaultSecId
}

export function sectionTitleForId(secId: string): string {
  return processSectionTitle(secId)
}

export function allScopeItems(plan: ItpLibraryPlanPayload): ItpLibraryScopeItem[] {
  const out: ItpLibraryScopeItem[] = []
  const seen = new Set<string>()

  for (const section of ITP_LIBRARY) {
    for (const item of section.items) {
      if (!isItemIncluded(plan, item.id) || seen.has(item.id)) continue
      const sel = getSel(plan, item.id)
      const secId = effectiveScopeSectionId(section.id, sel)
      out.push({
        id: item.id,
        name: item.name,
        ref: item.ref,
        secId,
        secTitle: sectionTitleForId(secId),
        custom: false,
        sel,
      })
      seen.add(item.id)
    }
  }

  for (const custom of plan.custom) {
    if (!isItemIncluded(plan, custom.id) || seen.has(custom.id)) continue
    const sel = getSel(plan, custom.id)
    const defaultSec = String(custom.secId ?? '').trim() || 'receipt'
    const secId = effectiveScopeSectionId(defaultSec, sel)
    out.push({
      id: custom.id,
      name: custom.name,
      ref: 'Custom',
      secId,
      secTitle: sectionTitleForId(secId),
      custom: true,
      sel,
    })
    seen.add(custom.id)
  }

  const sectionOrder = new Map<string, number>(ITP_LIBRARY.map((section, index) => [section.id, index]))
  for (const item of out) {
    if (!sectionOrder.has(item.secId)) sectionOrder.set(item.secId, 1000 + sectionOrder.size)
  }
  const libraryIndex = new Map<string, number>()
  let libPos = 0
  for (const section of ITP_LIBRARY) {
    for (const item of section.items) {
      libraryIndex.set(item.id, libPos++)
    }
  }
  const customIndex = new Map(plan.custom.map((row, index) => [row.id, index]))
  return out.sort((a, b) => {
    const orderA = sectionOrder.get(a.secId) ?? 999
    const orderB = sectionOrder.get(b.secId) ?? 999
    if (orderA !== orderB) return orderA - orderB
    const libA = libraryIndex.get(a.id) ?? Number.POSITIVE_INFINITY
    const libB = libraryIndex.get(b.id) ?? Number.POSITIVE_INFINITY
    if (libA !== libB) return libA - libB
    return (customIndex.get(a.id) ?? 0) - (customIndex.get(b.id) ?? 0)
  })
}

export function execStats(plan: ItpLibraryPlanPayload) {
  const items = allScopeItems(plan)
  let done = 0
  let flagged = 0
  let holdPts = 0
  for (const item of items) {
    const ex = getExec(plan, item.id)
    if (ex.done) done += 1
    if (ex.flagged) flagged += 1
    if (item.sel.holdPoint) holdPts += 1
  }
  const total = items.length
  const pct = total ? Math.round((done / total) * 100) : 0
  return { total, done, flagged, open: total - done, holdPts, pct }
}

export function applyLibraryTemplate(plan: ItpLibraryPlanPayload): ItpLibraryPlanPayload {
  const key = getTemplateKey(plan.jobType, plan.valveType)
  const ids = ITP_LIBRARY_TEMPLATES[key] ?? []
  const sel = { ...plan.sel }
  for (const itemId of ids) {
    const prev = sel[itemId] ?? emptyItemSel()
    const found = findLibraryItem(itemId)
    const subReqs =
      prev.subReqs.length > 0 ? prev.subReqs : found?.item.defaultSubReqs ? [...found.item.defaultSubReqs] : []
    sel[itemId] = {
      ...prev,
      included: true,
      subReqs,
    }
  }
  return { ...plan, sel }
}

export function createEmptyItpLibraryPlan(valve: Valve): ItpLibraryPlanPayload {
  const jobType = mapShopJobTypeToLibrary(valve.job_type)
  const valveType = resolveLibraryValveType(valve.valve_type, valve.bowl_type)
  const plan: ItpLibraryPlanPayload = {
    v: ITP_LIBRARY_PLAN_SCHEMA_VERSION,
    kind: 'library_plan',
    valveSnapshot: valveToLibrarySnapshot(valve),
    jobType,
    valveType,
    sel: {},
    custom: [],
    exec: {},
    attachments: [],
    qcReview: emptyQcReview(),
    inspector: '',
    inspDate: '',
    qcMgr: '',
    qcDate: '',
    notes: '',
    updatedAt: new Date().toISOString(),
  }
  return applyLibraryTemplate(plan)
}

function normalizeSel(raw: unknown, fallbackNotes = ''): ItpLibraryItemSel {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ItpLibraryItemSel> & {
    minPhotos?: unknown
  }
  const minPhotosRaw = Number(o.minPhotos)
  return {
    included: Boolean(o.included),
    holdPoint: Boolean(o.holdPoint),
    beforeMeas: Boolean(o.beforeMeas),
    afterMeas: Boolean(o.afterMeas),
    measVerify: Boolean(o.measVerify),
    subReqs: Array.isArray(o.subReqs) ? o.subReqs.map((s) => String(s)) : [],
    notes: String(o.notes ?? fallbackNotes ?? ''),
    requirePicture: Boolean(o.requirePicture),
    pictureLabel: String(o.pictureLabel ?? '').trim(),
    minPhotos: Number.isFinite(minPhotosRaw) && minPhotosRaw > 0 ? Math.floor(minPhotosRaw) : 1,
    measFields: normalizeMeasFields(o.measFields),
    blockNext: Boolean(o.blockNext),
    sectionId: String(o.sectionId ?? '').trim(),
  }
}

function normalizeExec(raw: unknown): ItpLibraryItemExec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ItpLibraryItemExec> & {
    subDone?: Record<string, unknown>
    measValues?: Record<string, unknown>
  }
  const subDone: Record<string, boolean> = {}
  if (o.subDone && typeof o.subDone === 'object') {
    for (const [k, v] of Object.entries(o.subDone)) {
      subDone[k] = Boolean(v)
    }
  }
  const measValues: Record<string, string> = {}
  if (o.measValues && typeof o.measValues === 'object') {
    for (const [k, v] of Object.entries(o.measValues)) {
      measValues[k] = String(v ?? '')
    }
  }
  const beforeVal = String(o.beforeVal ?? '')
  const afterVal = String(o.afterVal ?? '')
  const verifyVal = String(o.verifyVal ?? '')
  if (beforeVal && measValues.before == null) measValues.before = beforeVal
  if (afterVal && measValues.after == null) measValues.after = afterVal
  if (verifyVal && measValues.verify == null) measValues.verify = verifyVal
  return {
    done: Boolean(o.done),
    flagged: Boolean(o.flagged),
    notes: String(o.notes ?? ''),
    beforeVal,
    afterVal,
    verifyVal,
    measValues,
    photos: normalizeAttachments((o as { photos?: unknown }).photos),
    holdPending: Boolean((o as { holdPending?: unknown }).holdPending),
    holdSignedOffAt: (o as { holdSignedOffAt?: unknown }).holdSignedOffAt
      ? String((o as { holdSignedOffAt?: unknown }).holdSignedOffAt)
      : null,
    holdSignedOffByUserId: (o as { holdSignedOffByUserId?: unknown }).holdSignedOffByUserId
      ? String((o as { holdSignedOffByUserId?: unknown }).holdSignedOffByUserId)
      : null,
    holdSignedOffByName: (o as { holdSignedOffByName?: unknown }).holdSignedOffByName
      ? String((o as { holdSignedOffByName?: unknown }).holdSignedOffByName)
      : null,
    subDone,
    flagReason: String((o as { flagReason?: unknown }).flagReason ?? ''),
    flagPhotos: normalizeAttachments((o as { flagPhotos?: unknown }).flagPhotos).slice(0, 3),
    flaggedAt: (o as { flaggedAt?: unknown }).flaggedAt
      ? String((o as { flaggedAt?: unknown }).flaggedAt)
      : null,
    flaggedByUserId: (o as { flaggedByUserId?: unknown }).flaggedByUserId
      ? String((o as { flaggedByUserId?: unknown }).flaggedByUserId)
      : null,
    flaggedByName: (o as { flaggedByName?: unknown }).flaggedByName
      ? String((o as { flaggedByName?: unknown }).flaggedByName)
      : null,
    flagOwnerEmployeeId: (o as { flagOwnerEmployeeId?: unknown }).flagOwnerEmployeeId
      ? String((o as { flagOwnerEmployeeId?: unknown }).flagOwnerEmployeeId)
      : null,
    flagOwnerUserId: (o as { flagOwnerUserId?: unknown }).flagOwnerUserId
      ? String((o as { flagOwnerUserId?: unknown }).flagOwnerUserId)
      : null,
    flagOwnerName: (o as { flagOwnerName?: unknown }).flagOwnerName
      ? String((o as { flagOwnerName?: unknown }).flagOwnerName)
      : null,
    flagResolution: String((o as { flagResolution?: unknown }).flagResolution ?? ''),
    flagResolvedAt: (o as { flagResolvedAt?: unknown }).flagResolvedAt
      ? String((o as { flagResolvedAt?: unknown }).flagResolvedAt)
      : null,
    flagResolvedByUserId: (o as { flagResolvedByUserId?: unknown }).flagResolvedByUserId
      ? String((o as { flagResolvedByUserId?: unknown }).flagResolvedByUserId)
      : null,
    flagResolvedByName: (o as { flagResolvedByName?: unknown }).flagResolvedByName
      ? String((o as { flagResolvedByName?: unknown }).flagResolvedByName)
      : null,
    flagClearReason: String((o as { flagClearReason?: unknown }).flagClearReason ?? ''),
    flagClearedAt: (o as { flagClearedAt?: unknown }).flagClearedAt
      ? String((o as { flagClearedAt?: unknown }).flagClearedAt)
      : null,
    flagClearedByUserId: (o as { flagClearedByUserId?: unknown }).flagClearedByUserId
      ? String((o as { flagClearedByUserId?: unknown }).flagClearedByUserId)
      : null,
    flagClearedByName: (o as { flagClearedByName?: unknown }).flagClearedByName
      ? String((o as { flagClearedByName?: unknown }).flagClearedByName)
      : null,
  }
}

function normalizeAttachment(raw: unknown): ItpLibraryAttachment | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<ItpLibraryAttachment>
  if (!o.id || !o.url || !o.storagePath) return null
  return {
    id: String(o.id),
    fileName: String(o.fileName ?? 'Attachment').slice(0, 500),
    url: String(o.url),
    storagePath: String(o.storagePath),
    contentType: String(o.contentType ?? 'application/octet-stream'),
    uploadedAt: String(o.uploadedAt ?? new Date().toISOString()),
    caption: String(o.caption ?? '').slice(0, 500),
  }
}

function normalizeAttachments(raw: unknown): ItpLibraryAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeAttachment).filter((row): row is ItpLibraryAttachment => row != null)
}

function normalizeChangeLogEntry(raw: unknown): ItpQcChangeLogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<ItpQcChangeLogEntry>
  const note = String(o.note ?? '').trim()
  const summary = String(o.summary ?? '').trim()
  if (!note && !summary) return null
  return {
    id: String(o.id ?? crypto.randomUUID()),
    at: String(o.at ?? new Date().toISOString()),
    byUserId: o.byUserId ? String(o.byUserId) : null,
    byName: String(o.byName ?? 'Quality Team').trim() || 'Quality Team',
    byLevel: o.byLevel ? String(o.byLevel) : null,
    note: note || summary,
    summary: summary || note,
  }
}

function normalizeChangeLog(raw: unknown): ItpQcChangeLogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(normalizeChangeLogEntry)
    .filter((row): row is ItpQcChangeLogEntry => row != null)
}

function normalizeQcReview(raw: unknown): ItpQcReview {
  const base = emptyQcReview()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<ItpQcReview> & { changeLog?: unknown }
  const statusRaw = String(o.status ?? '')
    .trim()
    .toLowerCase()
  const status: ItpQcReviewStatus =
    statusRaw === 'pending_review' || statusRaw === 'accepted' ? statusRaw : 'draft'
  return {
    status,
    generatedAt: o.generatedAt ? String(o.generatedAt) : null,
    generatedByUserId: o.generatedByUserId ? String(o.generatedByUserId) : null,
    generatedByName: o.generatedByName ? String(o.generatedByName) : null,
    notifiedAt: o.notifiedAt ? String(o.notifiedAt) : null,
    acceptedAt: o.acceptedAt ? String(o.acceptedAt) : null,
    acceptedByUserId: o.acceptedByUserId ? String(o.acceptedByUserId) : null,
    acceptedByName: o.acceptedByName ? String(o.acceptedByName) : null,
    acceptedByLevel: o.acceptedByLevel ? String(o.acceptedByLevel) : null,
    changeLog: normalizeChangeLog(o.changeLog),
  }
}

export function normalizeItpLibraryPlan(raw: unknown, valve: Valve): ItpLibraryPlanPayload {
  const candidate =
    raw && typeof raw === 'object' && (raw as { kind?: unknown }).kind === 'library_plan'
      ? (raw as Partial<ItpLibraryPlanPayload> & {
          sel?: Record<string, unknown>
          exec?: Record<string, unknown>
          custom?: unknown
          attachments?: unknown
          qcReview?: unknown
        })
      : null

  if (candidate || isItpLibraryPlanPayload(raw)) {
    const source = (candidate ?? raw) as Partial<ItpLibraryPlanPayload> & {
      sel?: Record<string, unknown>
      exec?: Record<string, unknown>
      custom?: unknown
      attachments?: unknown
      qcReview?: unknown
    }
    const exec: Record<string, ItpLibraryItemExec> = {}
    for (const [id, value] of Object.entries(source.exec ?? {})) {
      exec[id] = normalizeExec(value)
    }
    const sel: Record<string, ItpLibraryItemSel> = {}
    for (const [id, value] of Object.entries(source.sel ?? {})) {
      // Prefer sel.notes; fall back to legacy exec.notes from earlier saves.
      sel[id] = normalizeSel(value, exec[id]?.notes ?? '')
    }
    const custom = Array.isArray(source.custom)
      ? source.custom
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            id: String((c as ItpLibraryCustomItem).id),
            secId: String((c as ItpLibraryCustomItem).secId ?? '').trim() || 'receipt',
            name: String((c as ItpLibraryCustomItem).name ?? ''),
          }))
          .filter((c) => c.id && c.name)
      : []

    return {
      v: ITP_LIBRARY_PLAN_SCHEMA_VERSION,
      kind: 'library_plan',
      valveSnapshot: valveToLibrarySnapshot(valve),
      jobType: source.jobType || mapShopJobTypeToLibrary(valve.job_type),
      valveType: source.valveType || resolveLibraryValveType(valve.valve_type, valve.bowl_type),
      sel,
      custom,
      exec,
      attachments: normalizeAttachments(source.attachments),
      qcReview: normalizeQcReview(source.qcReview),
      inspector: String(source.inspector ?? ''),
      inspDate: String(source.inspDate ?? ''),
      qcMgr: String(source.qcMgr ?? ''),
      qcDate: String(source.qcDate ?? ''),
      notes: String(source.notes ?? ''),
      updatedAt: String(source.updatedAt ?? new Date().toISOString()),
    }
  }
  return createEmptyItpLibraryPlan(valve)
}
