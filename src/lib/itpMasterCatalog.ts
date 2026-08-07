import {
  ITP_LIBRARY,
  type ItpLibrarySectionId,
} from '../constants/itpLibrary'
import { isItpShopArea, type ItpShopArea } from '../constants/itpShopAreas'
import {
  ITP_LIBRARY_MASTER_JOB,
  ITP_LIBRARY_MASTER_VALVE,
  loadItpLibraryTemplate,
  saveItpLibraryTemplate,
  type ItpLibraryTemplateScope,
} from './itpLibraryTemplates'

export type ItpMasterCatalogItem = {
  id: string
  name: string
  ref: string
  secId: ItpLibrarySectionId
  area: ItpShopArea
  sortOrder: number
  builtIn: boolean
  defaultSubReqs?: string[]
}

/** Map ITP library sections to a default shop area. */
export function defaultAreaForSection(secId: ItpLibrarySectionId): ItpShopArea {
  switch (secId) {
    case 'receipt':
    case 'disassembly':
      return 'teardown'
    case 'inspection':
    case 'ndt':
    case 'final':
      return 'qa_qc'
    case 'repair':
      return 'machine_shop'
    case 'assembly':
    case 'hfservice':
    case 'controlvlv':
      return 'assembly'
    case 'actuatorsec':
      return 'actuation'
    case 'reliefsafety':
      return 'prv'
    case 'testing':
      return 'testing'
    case 'slabgate':
    case 'wedgeplug':
    case 'mfgsec':
      return 'machine_shop'
    default:
      return 'teardown'
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

export function seedMasterCatalogFromLibrary(): ItpMasterCatalogItem[] {
  const items: ItpMasterCatalogItem[] = []
  let sortOrder = 0
  for (const section of ITP_LIBRARY) {
    for (const item of section.items) {
      let area = defaultAreaForSection(section.id)
      if (looksLikeWelding(item.name, item.ref)) area = 'welding'
      if (looksLikePainting(item.name, item.ref)) area = 'painting'
      items.push({
        id: item.id,
        name: item.name,
        ref: item.ref,
        secId: section.id,
        area,
        sortOrder: sortOrder++,
        builtIn: true,
        defaultSubReqs: item.defaultSubReqs ? [...item.defaultSubReqs] : undefined,
      })
    }
  }
  return items
}

function normalizeCatalogItem(raw: unknown, fallbackOrder: number): ItpMasterCatalogItem | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<ItpMasterCatalogItem>
  const id = String(row.id ?? '').trim()
  const name = String(row.name ?? '').trim()
  const secId = String(row.secId ?? '').trim() as ItpLibrarySectionId
  if (!id || !name || !secId) return null
  const areaRaw = String(row.area ?? '').trim()
  const area = isItpShopArea(areaRaw) ? areaRaw : defaultAreaForSection(secId)
  return {
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
  }
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
    if (!byId.has(builtIn.id)) {
      byId.set(builtIn.id, { ...builtIn, sortOrder: nextOrder++ })
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((item, index) => ({ ...item, sortOrder: index }))
}

export function reindexCatalog(items: ItpMasterCatalogItem[]): ItpMasterCatalogItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }))
}

export function moveCatalogItemInArea(
  items: ItpMasterCatalogItem[],
  itemId: string,
  direction: -1 | 1,
): ItpMasterCatalogItem[] {
  const sorted = items.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const current = sorted.find((item) => item.id === itemId)
  if (!current) return items
  const areaItems = sorted.filter((item) => item.area === current.area)
  const indexInArea = areaItems.findIndex((item) => item.id === itemId)
  const swapWith = areaItems[indexInArea + direction]
  if (!swapWith) return items
  const orderA = current.sortOrder
  const orderB = swapWith.sortOrder
  return sorted.map((item) => {
    if (item.id === current.id) return { ...item, sortOrder: orderB }
    if (item.id === swapWith.id) return { ...item, sortOrder: orderA }
    return item
  })
}

type MasterScope = ItpLibraryTemplateScope & { catalog?: unknown }

export async function loadItpMasterCatalog(): Promise<ItpMasterCatalogItem[]> {
  try {
    const row = await loadItpLibraryTemplate(ITP_LIBRARY_MASTER_JOB, ITP_LIBRARY_MASTER_VALVE)
    if (!row) return seedMasterCatalogFromLibrary()
    const scope = row.scope as MasterScope
    if (Array.isArray(scope.catalog) && scope.catalog.length > 0) {
      return mergeCatalogWithLibrary(normalizeMasterCatalog(scope.catalog))
    }
    // Legacy: only custom extras were stored — seed built-ins and append customs.
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
    return mergeCatalogWithLibrary([...seeded, ...extras])
  } catch {
    return seedMasterCatalogFromLibrary()
  }
}

export async function saveItpMasterCatalog(items: ItpMasterCatalogItem[]): Promise<void> {
  const catalog = reindexCatalog(items)
  const custom = catalog
    .filter((item) => !item.builtIn)
    .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
  await saveItpLibraryTemplate(ITP_LIBRARY_MASTER_JOB, ITP_LIBRARY_MASTER_VALVE, {
    sel: {},
    custom,
    catalog,
  } as ItpLibraryTemplateScope & { catalog: ItpMasterCatalogItem[] })
}
