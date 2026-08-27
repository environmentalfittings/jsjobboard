import { ITP_LIBRARY } from '../constants/itpLibrary'
import {
  defaultProcessSections,
  normalizeProcessSections,
  resolveLibrarySectionId,
  type ItpProcessSectionDef,
} from '../constants/itpProcessSections'
import {
  defaultShopAreas,
  normalizeShopAreaValue,
  normalizeShopAreas,
  type ItpShopArea,
  type ItpShopAreaDef,
} from '../constants/itpShopAreas'
import {
  ITP_LIBRARY_DEFAULT_TEMPLATE_NAME,
  ITP_LIBRARY_MASTER_JOB,
  ITP_LIBRARY_MASTER_VALVE,
  loadItpLibraryTemplate,
  saveItpLibraryTemplate,
  type ItpLibraryTemplateScope,
} from './itpLibraryTemplates'
import type { ItpItemRequirementDefaults } from './itpItemRequirements'
import { DEFAULT_ITP_MEAS_FIELDS, normalizeMeasFields, type ItpMeasFieldDef } from '../types/itpMeasFields'

export type ItpMasterCatalogItem = {
  id: string
  name: string
  ref: string
  secId: string
  area: ItpShopArea
  sortOrder: number
  builtIn: boolean
  defaultSubReqs?: string[]
  requirePicture?: boolean
  pictureLabel?: string
  minPhotos?: number
  requireMeasurement?: boolean
  measFields?: ItpMeasFieldDef[]
  holdPoint?: boolean
  blockNext?: boolean
}

/** Built-in requirement defaults that used to be template/hardcoded UI only. */
const BUILTIN_REQUIREMENT_DEFAULTS: Record<string, ItpItemRequirementDefaults> = {
  // Body / bonnet — measurements + hold point (section 3)
  i1: {
    holdPoint: true,
    requireMeasurement: true,
    measFields: DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f })),
  },
  // Fastener Record — sub-reqs come from defaultSubReqs; hold often used with QA
  d4: {
    holdPoint: true,
  },
}

export function requirementDefaultsFromCatalogItem(
  item: ItpMasterCatalogItem,
): ItpItemRequirementDefaults {
  return {
    requirePicture: item.requirePicture,
    pictureLabel: item.pictureLabel,
    minPhotos: item.minPhotos,
    requireMeasurement: item.requireMeasurement,
    measFields: item.measFields,
    holdPoint: item.holdPoint,
    blockNext: item.blockNext,
  }
}

/** Map ITP process sections to a default shop station (job-card status name). */
export function defaultAreaForSection(secId: string): ItpShopArea {
  switch (secId) {
    case 'receipt':
    case 'disassembly':
      return 'Teardown'
    case 'inspection':
    case 'ndt':
    case 'final':
      return 'Testing'
    case 'repair':
      return 'Machine 1'
    case 'assembly':
    case 'hfservice':
    case 'controlvlv':
      return 'Assembly'
    case 'actuatorsec':
      return 'Actuation'
    case 'reliefsafety':
      return 'PRV Teardown'
    case 'testing':
      return 'Testing'
    case 'slabgate':
    case 'wedgeplug':
    case 'mfgsec':
      return 'Machine 1'
    default:
      return 'Teardown'
  }
}

function looksLikeWelding(name: string, ref: string): boolean {
  const text = `${name} ${ref}`.toLowerCase()
  return /\bweld|\boverlay|\bhardsurfac|\bstellite|\bbuttering/.test(text)
}

function looksLikePainting(name: string, ref: string): boolean {
  const text = `${name} ${ref}`.toLowerCase()
  return /\bpaint|\bcoat|\bprimer|\bfinish coat/.test(text)
}

function applyBuiltinRequirementDefaults(item: ItpMasterCatalogItem): ItpMasterCatalogItem {
  const extras = BUILTIN_REQUIREMENT_DEFAULTS[item.id]
  if (!extras) return item
  return {
    ...item,
    holdPoint: item.holdPoint ?? extras.holdPoint,
    blockNext: item.blockNext ?? extras.blockNext,
    requirePicture: item.requirePicture ?? extras.requirePicture,
    pictureLabel: item.pictureLabel ?? extras.pictureLabel,
    minPhotos: item.minPhotos ?? extras.minPhotos,
    requireMeasurement: item.requireMeasurement ?? extras.requireMeasurement,
    measFields:
      item.measFields && item.measFields.length > 0
        ? item.measFields
        : extras.measFields?.map((f) => ({ ...f })),
  }
}

export function builtinRequirementDefaults(itemId: string): ItpItemRequirementDefaults | null {
  return BUILTIN_REQUIREMENT_DEFAULTS[itemId] ?? null
}

export function seedMasterCatalogFromLibrary(): ItpMasterCatalogItem[] {
  const items: ItpMasterCatalogItem[] = []
  let sortOrder = 0
  for (const section of ITP_LIBRARY) {
    const secId = resolveLibrarySectionId(section.id)
    for (const item of section.items) {
      let area = defaultAreaForSection(secId)
      if (looksLikeWelding(item.name, item.ref)) area = 'Welding'
      if (looksLikePainting(item.name, item.ref)) area = 'Painting'
      items.push(
        applyBuiltinRequirementDefaults({
          id: item.id,
          name: item.name,
          ref: item.ref,
          secId,
          area,
          sortOrder: sortOrder++,
          builtIn: true,
          defaultSubReqs: item.defaultSubReqs ? [...item.defaultSubReqs] : undefined,
        }),
      )
    }
  }
  return items
}

function normalizeCatalogItem(raw: unknown, fallbackOrder: number): ItpMasterCatalogItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<ItpMasterCatalogItem>
  const id = String(row.id ?? '').trim()
  const name = String(row.name ?? '').trim()
  const secId = resolveLibrarySectionId(String(row.secId ?? '').trim())
  if (!id || !name || !secId) return null
  const areaRaw = String(row.area ?? '').trim()
  const area = normalizeShopAreaValue(areaRaw) || defaultAreaForSection(secId)
  const minPhotosRaw = Number(row.minPhotos)
  const measFields = normalizeMeasFields(row.measFields)
  const base: ItpMasterCatalogItem = {
    id,
    name,
    ref: String(row.ref ?? '').trim() || 'Custom',
    secId,
    area,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : fallbackOrder,
    builtIn: Boolean(row.builtIn),
    defaultSubReqs: Array.isArray(row.defaultSubReqs)
      ? row.defaultSubReqs.map((s) => String(s))
      : undefined,
    requirePicture: row.requirePicture != null ? Boolean(row.requirePicture) : undefined,
    pictureLabel: row.pictureLabel != null ? String(row.pictureLabel) : undefined,
    minPhotos:
      row.minPhotos != null && Number.isFinite(minPhotosRaw) && minPhotosRaw > 0
        ? Math.floor(minPhotosRaw)
        : undefined,
    requireMeasurement: row.requireMeasurement != null ? Boolean(row.requireMeasurement) : undefined,
    measFields: measFields.length > 0 ? measFields : undefined,
    holdPoint: row.holdPoint != null ? Boolean(row.holdPoint) : undefined,
    blockNext: row.blockNext != null ? Boolean(row.blockNext) : undefined,
  }
  return applyBuiltinRequirementDefaults(base)
}

export function normalizeMasterCatalog(raw: unknown): ItpMasterCatalogItem[] {
  if (!Array.isArray(raw)) return seedMasterCatalogFromLibrary()
  const items: ItpMasterCatalogItem[] = []
  raw.forEach((row, index) => {
    const parsed = normalizeCatalogItem(row, index)
    if (parsed) items.push(parsed)
  })
  if (items.length === 0) return seedMasterCatalogFromLibrary()
  return items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((item, index) => ({ ...item, sortOrder: index }))
}

/** Merge saved catalog with any newly added built-in library items. */
export function mergeCatalogWithLibrary(saved: ItpMasterCatalogItem[]): ItpMasterCatalogItem[] {
  const byId = new Map(saved.map((item) => [item.id, item]))
  const seeded = seedMasterCatalogFromLibrary()
  let nextOrder = saved.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
  for (const builtIn of seeded) {
    const existing = byId.get(builtIn.id)
    if (!existing) {
      byId.set(builtIn.id, { ...builtIn, sortOrder: nextOrder++ })
    } else if (existing.builtIn) {
      byId.set(builtIn.id, applyBuiltinRequirementDefaults({
        ...existing,
        defaultSubReqs: existing.defaultSubReqs?.length
          ? existing.defaultSubReqs
          : builtIn.defaultSubReqs,
      }))
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((item, index) => ({ ...item, sortOrder: index }))
}

export function reindexCatalog(items: ItpMasterCatalogItem[]): ItpMasterCatalogItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }))
}

function moveCatalogItemInGroup(
  items: ItpMasterCatalogItem[],
  itemId: string,
  direction: -1 | 1,
  groupOf: (item: ItpMasterCatalogItem) => string,
): ItpMasterCatalogItem[] {
  const sorted = items.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const current = sorted.find((item) => item.id === itemId)
  if (!current) return items
  const groupKey = groupOf(current)
  const groupItems = sorted.filter((item) => groupOf(item) === groupKey)
  const indexInGroup = groupItems.findIndex((item) => item.id === itemId)
  const swapWith = groupItems[indexInGroup + direction]
  if (!swapWith) return items
  const orderA = current.sortOrder
  const orderB = swapWith.sortOrder
  return sorted.map((item) => {
    if (item.id === current.id) return { ...item, sortOrder: orderB }
    if (item.id === swapWith.id) return { ...item, sortOrder: orderA }
    return item
  })
}

export function moveCatalogItemInArea(
  items: ItpMasterCatalogItem[],
  itemId: string,
  direction: -1 | 1,
): ItpMasterCatalogItem[] {
  return moveCatalogItemInGroup(items, itemId, direction, (item) => item.area)
}

export function moveCatalogItemInSection(
  items: ItpMasterCatalogItem[],
  itemId: string,
  direction: -1 | 1,
): ItpMasterCatalogItem[] {
  return moveCatalogItemInGroup(items, itemId, direction, (item) => item.secId)
}

type MasterScope = ItpLibraryTemplateScope & {
  catalog?: unknown
  areas?: unknown
  processSections?: unknown
}

export type ItpMasterCatalogState = {
  items: ItpMasterCatalogItem[]
  areas: ItpShopAreaDef[]
  processSections: ItpProcessSectionDef[]
}

export function emptyMasterCatalogState(): ItpMasterCatalogState {
  const items = seedMasterCatalogFromLibrary()
  return {
    items,
    areas: normalizeShopAreas(undefined, items.map((item) => item.area)),
    processSections: defaultProcessSections(),
  }
}

function catalogStateFromScope(scope: MasterScope | null | undefined): ItpMasterCatalogState {
  if (!scope) return emptyMasterCatalogState()
  let items: ItpMasterCatalogItem[]
  if (Array.isArray(scope.catalog) && scope.catalog.length > 0) {
    items = mergeCatalogWithLibrary(normalizeMasterCatalog(scope.catalog))
  } else {
    const seeded = seedMasterCatalogFromLibrary()
    let order = seeded.length
    const extras = (scope.custom ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      ref: 'Custom',
      secId: c.secId,
      area: defaultAreaForSection(c.secId),
      sortOrder: order++,
      builtIn: false,
    }))
    items = mergeCatalogWithLibrary([...seeded, ...extras])
  }
  return {
    items,
    areas: normalizeShopAreas(
      scope.areas,
      items.map((item) => item.area),
    ),
    processSections: normalizeProcessSections(
      scope.processSections,
      items.map((item) => item.secId),
    ),
  }
}

export async function loadItpMasterCatalog(): Promise<ItpMasterCatalogState> {
  try {
    const row = await loadItpLibraryTemplate(
      ITP_LIBRARY_MASTER_JOB,
      ITP_LIBRARY_MASTER_VALVE,
      ITP_LIBRARY_DEFAULT_TEMPLATE_NAME,
    )
    if (!row) return emptyMasterCatalogState()
    return catalogStateFromScope(row.scope as MasterScope)
  } catch {
    return emptyMasterCatalogState()
  }
}

export async function saveItpMasterCatalog(
  items: ItpMasterCatalogItem[],
  areas?: ItpShopAreaDef[],
  processSections?: ItpProcessSectionDef[],
): Promise<void> {
  const catalog = reindexCatalog(items)
  const custom = catalog
    .filter((item) => !item.builtIn)
    .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
  const nextAreas = normalizeShopAreas(
    areas && areas.length > 0 ? areas : defaultShopAreas(),
    catalog.map((item) => item.area),
  )
  const nextProcessSections = normalizeProcessSections(
    processSections && processSections.length > 0 ? processSections : defaultProcessSections(),
    catalog.map((item) => item.secId),
  )
  await saveItpLibraryTemplate(
    ITP_LIBRARY_MASTER_JOB,
    ITP_LIBRARY_MASTER_VALVE,
    {
      sel: {},
      custom,
      catalog,
      areas: nextAreas,
      processSections: nextProcessSections,
    } as ItpLibraryTemplateScope & {
      catalog: ItpMasterCatalogItem[]
      areas: ItpShopAreaDef[]
      processSections: ItpProcessSectionDef[]
    },
    { name: ITP_LIBRARY_DEFAULT_TEMPLATE_NAME, isDefault: false },
  )
}
