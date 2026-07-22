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

export const ITP_LIBRARY_PLAN_SCHEMA_VERSION = 4 as const

export type ItpLibraryItemSel = {
  included: boolean
  holdPoint: boolean
  beforeMeas: boolean
  afterMeas: boolean
  measVerify: boolean
  subReqs: string[]
  /** Free-form notes for this ITP line (scope + checklist). */
  notes: string
}

export type ItpLibraryItemExec = {
  done: boolean
  flagged: boolean
  notes: string
  beforeVal: string
  afterVal: string
  verifyVal: string
  subDone: Record<string, boolean>
}

export type ItpLibraryCustomItem = {
  id: string
  secId: ItpLibrarySectionId
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

export type ItpLibraryPlanPayload = {
  v: typeof ITP_LIBRARY_PLAN_SCHEMA_VERSION
  kind: 'library_plan'
  valveSnapshot: ItpLibraryValveSnapshot
  jobType: ItpLibraryJobType
  valveType: string
  sel: Record<string, ItpLibraryItemSel>
  custom: ItpLibraryCustomItem[]
  exec: Record<string, ItpLibraryItemExec>
  inspector: string
  inspDate: string
  qcMgr: string
  qcDate: string
  notes: string
  updatedAt: string
}

export function isItpLibraryPlanPayload(value: unknown): value is ItpLibraryPlanPayload {
  if (!value || typeof value !== 'object') return false
  const o = value as Partial<ItpLibraryPlanPayload>
  return o.v === ITP_LIBRARY_PLAN_SCHEMA_VERSION && o.kind === 'library_plan'
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
    subDone: {},
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
  secId: ItpLibrarySectionId
  secTitle: string
  custom: boolean
  sel: ItpLibraryItemSel
}

export function allScopeItems(plan: ItpLibraryPlanPayload): ItpLibraryScopeItem[] {
  const out: ItpLibraryScopeItem[] = []
  for (const section of ITP_LIBRARY) {
    for (const item of section.items) {
      if (!isItemIncluded(plan, item.id)) continue
      out.push({
        id: item.id,
        name: item.name,
        ref: item.ref,
        secId: section.id,
        secTitle: section.title,
        custom: false,
        sel: getSel(plan, item.id),
      })
    }
    for (const custom of plan.custom.filter((c) => c.secId === section.id)) {
      if (!isItemIncluded(plan, custom.id)) continue
      out.push({
        id: custom.id,
        name: custom.name,
        ref: 'Custom',
        secId: section.id,
        secTitle: section.title,
        custom: true,
        sel: getSel(plan, custom.id),
      })
    }
  }
  return out
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
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ItpLibraryItemSel>
  return {
    included: Boolean(o.included),
    holdPoint: Boolean(o.holdPoint),
    beforeMeas: Boolean(o.beforeMeas),
    afterMeas: Boolean(o.afterMeas),
    measVerify: Boolean(o.measVerify),
    subReqs: Array.isArray(o.subReqs) ? o.subReqs.map((s) => String(s)) : [],
    notes: String(o.notes ?? fallbackNotes ?? ''),
  }
}

function normalizeExec(raw: unknown): ItpLibraryItemExec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ItpLibraryItemExec> & {
    subDone?: Record<string, unknown>
  }
  const subDone: Record<string, boolean> = {}
  if (o.subDone && typeof o.subDone === 'object') {
    for (const [k, v] of Object.entries(o.subDone)) {
      subDone[k] = Boolean(v)
    }
  }
  return {
    done: Boolean(o.done),
    flagged: Boolean(o.flagged),
    notes: String(o.notes ?? ''),
    beforeVal: String(o.beforeVal ?? ''),
    afterVal: String(o.afterVal ?? ''),
    verifyVal: String(o.verifyVal ?? ''),
    subDone,
  }
}

export function normalizeItpLibraryPlan(raw: unknown, valve: Valve): ItpLibraryPlanPayload {
  if (isItpLibraryPlanPayload(raw)) {
    const exec: Record<string, ItpLibraryItemExec> = {}
    for (const [id, value] of Object.entries(raw.exec ?? {})) {
      exec[id] = normalizeExec(value)
    }
    const sel: Record<string, ItpLibraryItemSel> = {}
    for (const [id, value] of Object.entries(raw.sel ?? {})) {
      // Prefer sel.notes; fall back to legacy exec.notes from earlier saves.
      sel[id] = normalizeSel(value, exec[id]?.notes ?? '')
    }
    const custom = Array.isArray(raw.custom)
      ? raw.custom
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            id: String((c as ItpLibraryCustomItem).id),
            secId: (c as ItpLibraryCustomItem).secId,
            name: String((c as ItpLibraryCustomItem).name ?? ''),
          }))
          .filter((c) => c.id && c.name && ITP_LIBRARY.some((s) => s.id === c.secId))
      : []

    return {
      v: ITP_LIBRARY_PLAN_SCHEMA_VERSION,
      kind: 'library_plan',
      valveSnapshot: valveToLibrarySnapshot(valve),
      jobType: raw.jobType || mapShopJobTypeToLibrary(valve.job_type),
      valveType: raw.valveType || resolveLibraryValveType(valve.valve_type, valve.bowl_type),
      sel,
      custom,
      exec,
      inspector: String(raw.inspector ?? ''),
      inspDate: String(raw.inspDate ?? ''),
      qcMgr: String(raw.qcMgr ?? ''),
      qcDate: String(raw.qcDate ?? ''),
      notes: String(raw.notes ?? ''),
      updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    }
  }
  return createEmptyItpLibraryPlan(valve)
}
