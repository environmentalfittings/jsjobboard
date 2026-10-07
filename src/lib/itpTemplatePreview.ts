import { ITP_LIBRARY, type ItpLibraryJobType } from '../constants/itpLibrary'
import type { ItpMasterCatalogItem } from './itpMasterCatalog'
import { applyScopeToPlan, type ItpLibraryTemplateScope } from './itpLibraryTemplates'
import type { JobCardNameplateSource } from './itpTravelerNameplate'
import type { JobNeededPart, JobNeededPartDraft } from './jobNeededParts'
import {
  emptyItemSel,
  emptyQcReview,
  ITP_LIBRARY_PLAN_SCHEMA_VERSION,
  isItpLibraryPlanPayload,
  type ItpLibraryCustomItem,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'

export const ITP_TEMPLATE_PREVIEW_STORAGE_KEY = 'jsjb-itp-template-preview-v1'
export const ITP_TEMPLATE_PREVIEW_PATH = '/itp-template-preview'
/** Fake traveler number used only in template preview. Parts stay on this preview, not shop purchasing. */
export const ITP_PREVIEW_TRAVELER_ID = 'PREVIEW-0001'

export type ItpTemplatePreviewPayload = {
  plan: ItpLibraryPlanPayload
  jobCard: JobCardNameplateSource
  openedAt: string
  neededParts?: JobNeededPart[]
}

const LIBRARY_ITEM_IDS = (() => {
  const ids = new Set<string>()
  for (const section of ITP_LIBRARY) {
    for (const item of section.items) ids.add(item.id)
  }
  return ids
})()

export function sampleJobCardForPreview(valveType: string): JobCardNameplateSource {
  const dueDate = new Date().toISOString().slice(0, 10)
  return {
    valve_id: ITP_PREVIEW_TRAVELER_ID,
    valve_type: valveType || 'Preview',
    customer: 'Sample Customer',
    size: '6"',
    pressure_class: '300',
    body_material: 'WCB',
    material_spec: 'WCB',
    drawing_po_number: 'PO-PREVIEW',
    due_date: dueDate,
    manufacturer: 'Sample Manufacturer',
    netsuite_po_number: 'PO-PREVIEW',
    end_connection: 'RF',
    figure_number: '',
    trim: '',
  }
}

function extraCustomFromCatalog(
  scope: ItpLibraryTemplateScope,
  catalogItems: ItpMasterCatalogItem[],
): ItpLibraryCustomItem[] {
  const existing = new Set(scope.custom.map((row) => row.id))
  const extra: ItpLibraryCustomItem[] = []
  for (const item of catalogItems) {
    const sel = scope.sel[item.id]
    if (!sel?.included) continue
    if (LIBRARY_ITEM_IDS.has(item.id) || existing.has(item.id)) continue
    extra.push({ id: item.id, secId: item.secId, name: item.name })
    existing.add(item.id)
  }
  return extra
}

export function buildTemplatePreviewPlan(options: {
  jobType: ItpLibraryJobType
  valveType: string
  templateName: string
  scope: ItpLibraryTemplateScope
  catalogItems: ItpMasterCatalogItem[]
}): ItpTemplatePreviewPayload {
  const valveType = options.valveType.trim() || 'Preview'
  const templateName = options.templateName.trim() || 'Untitled'
  const jobCard = sampleJobCardForPreview(valveType)
  const scope: ItpLibraryTemplateScope = {
    ...options.scope,
    custom: [...options.scope.custom, ...extraCustomFromCatalog(options.scope, options.catalogItems)],
  }
  const empty: ItpLibraryPlanPayload = {
    v: ITP_LIBRARY_PLAN_SCHEMA_VERSION,
    kind: 'library_plan',
    valveSnapshot: {
      valveId: jobCard.valve_id,
      customer: jobCard.customer,
      size: jobCard.size,
      pressureClass: jobCard.pressure_class ?? null,
      valveType,
      jobType: options.jobType,
      cell: null,
      material: jobCard.body_material ?? jobCard.material_spec ?? null,
      description: `${templateName} preview`,
      dueDate: jobCard.due_date,
    },
    jobType: options.jobType,
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
    scopeTemplateName: templateName,
  }
  const plan = applyScopeToPlan(empty, scope, { replaceIncludes: true })
  const sel = { ...plan.sel }
  for (const item of options.catalogItems) {
    const current = sel[item.id] ?? emptyItemSel()
    if (!current.included) continue
    const requirePicture = current.requirePicture || Boolean(item.requirePicture)
    const measFields =
      current.measFields.length > 0
        ? current.measFields
        : item.measFields && item.measFields.length > 0
          ? item.measFields.map((field) => ({ ...field }))
          : current.measFields
    sel[item.id] = {
      ...current,
      requirePicture,
      pictureLabel: current.pictureLabel.trim() || String(item.pictureLabel ?? '').trim(),
      minPhotos: Math.max(1, current.minPhotos || item.minPhotos || 1),
      maxPhotos: Math.max(1, current.maxPhotos || item.maxPhotos || 4),
      shopArea: current.shopArea.trim() || String(item.area ?? '').trim() || current.shopArea,
      measFields,
      requireNameplate: current.requireNameplate || Boolean(item.requireNameplate),
      addToTraveler: current.addToTraveler || requirePicture || measFields.length > 0,
      resourceDocs: current.resourceDocs ?? [],
    }
  }
  return {
    plan: { ...plan, sel },
    jobCard,
    openedAt: new Date().toISOString(),
    neededParts: [],
  }
}

export function previewJobNeededPartFromDraft(
  draft: JobNeededPartDraft,
  requestedByName: string,
  existing?: JobNeededPart,
): JobNeededPart {
  const now = new Date().toISOString()
  const qty = Math.max(1, Math.floor(Number(draft.quantity) || 1))
  return {
    id: existing?.id || crypto.randomUUID(),
    valveRowId: 0,
    itpItemId: String(draft.itpItemId ?? '').trim(),
    itpItemName: String(draft.itpItemName ?? '').trim(),
    partName: draft.partName.trim(),
    partNumber: draft.partNumber.trim(),
    quantity: qty,
    supplier: draft.supplier.trim(),
    status: existing?.status ?? 'needed',
    poNumber: existing?.poNumber ?? '',
    orderedDate: existing?.orderedDate ?? null,
    expectedDate: existing?.expectedDate ?? null,
    receivedDate: existing?.receivedDate ?? null,
    notes: draft.notes.trim(),
    requestedByName: requestedByName.trim() || existing?.requestedByName || 'Preview',
    requestedByUserId: existing?.requestedByUserId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function coercePreviewNeededParts(value: unknown): JobNeededPart[] {
  if (!Array.isArray(value)) return []
  const rows: JobNeededPart[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Partial<JobNeededPart>
    if (typeof row.id !== 'string' || typeof row.partName !== 'string' || !row.partName.trim()) continue
    rows.push({
      id: row.id,
      valveRowId: 0,
      itpItemId: String(row.itpItemId ?? ''),
      itpItemName: String(row.itpItemName ?? ''),
      partName: row.partName.trim(),
      partNumber: String(row.partNumber ?? ''),
      quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)),
      supplier: String(row.supplier ?? ''),
      status: row.status === 'ordered' || row.status === 'received' || row.status === 'cancelled' ? row.status : 'needed',
      poNumber: String(row.poNumber ?? ''),
      orderedDate: row.orderedDate ?? null,
      expectedDate: row.expectedDate ?? null,
      receivedDate: row.receivedDate ?? null,
      notes: String(row.notes ?? ''),
      requestedByName: String(row.requestedByName ?? 'Preview'),
      requestedByUserId: row.requestedByUserId ?? null,
      createdAt: String(row.createdAt ?? ''),
      updatedAt: String(row.updatedAt ?? ''),
    })
  }
  return rows
}

export function writeTemplatePreviewPayload(payload: ItpTemplatePreviewPayload) {
  window.localStorage.setItem(ITP_TEMPLATE_PREVIEW_STORAGE_KEY, JSON.stringify(payload))
}

export function readTemplatePreviewPayload(): ItpTemplatePreviewPayload | null {
  try {
    const raw = window.localStorage.getItem(ITP_TEMPLATE_PREVIEW_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ItpTemplatePreviewPayload>
    if (!parsed?.plan || !isItpLibraryPlanPayload(parsed.plan) || !parsed.jobCard) return null
    const jobCard = {
      ...parsed.jobCard,
      valve_id: parsed.jobCard.valve_id?.trim() || ITP_PREVIEW_TRAVELER_ID,
    }
    if (jobCard.valve_id === 'PREVIEW') jobCard.valve_id = ITP_PREVIEW_TRAVELER_ID
    const plan = parsed.plan
    if (!plan.valveSnapshot.valveId || plan.valveSnapshot.valveId === 'PREVIEW') {
      plan.valveSnapshot = { ...plan.valveSnapshot, valveId: ITP_PREVIEW_TRAVELER_ID }
    }
    return {
      plan,
      jobCard,
      openedAt: String(parsed.openedAt ?? ''),
      neededParts: coercePreviewNeededParts(parsed.neededParts),
    }
  } catch {
    return null
  }
}
