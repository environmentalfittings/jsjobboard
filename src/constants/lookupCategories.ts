import {
  API_TRIMS,
  BODY_MATERIALS,
  END_CONNECTIONS,
  FILLER_CLASSIFICATIONS,
  FILLER_SIZES,
  FINISH_CELLS,
  ORDER_TYPES,
  PIPE_SCHEDULES,
  PRESSURE_CLASSES,
  TEST_MEDIA,
  TEST_PROCEDURE_REQUIREMENTS,
  TEST_TYPES,
  VALVE_SIZES,
  VALVE_TYPES,
} from './jobLookups'

export type JobLookupCategory =
  | 'test_type'
  | 'test_media'
  | 'test_procedure'
  | 'valve_size'
  | 'valve_type'
  | 'finish_cell'
  | 'order_type'
  | 'pressure_class'
  | 'body_material'
  | 'api_trim'
  | 'manufacturer'
  | 'vendor'
  | 'inventory_part_type'
  | 'filler_classification'
  | 'filler_size'
  | 'end_connection'
  | 'pipe_schedule'

/** Admin-managed lists for ITP traveler dropdowns (Repair needed, Seat repair, …). */
export const ITP_TRAVELER_LIST_PREFIX = 'itp_traveler:'
export const ITP_TRAVELER_LIST_REGISTRY = '__itp_traveler_lists__'
export const REPAIR_NEEDED_LIST_KEY = 'repair_needed'
export const REPAIR_NEEDED_LIST_LABEL = 'Repair needed'
export const REPAIR_NEEDED_LOOKUP_CATEGORY = `${ITP_TRAVELER_LIST_PREFIX}${REPAIR_NEEDED_LIST_KEY}` as const
export const REPAIR_NEEDED_LIST_FALLBACK = ['Acceptable', 'Restrip and redo with stainless'] as const

export type ItpTravelerListCategory = `${typeof ITP_TRAVELER_LIST_PREFIX}${string}`
export type LookupCategory = JobLookupCategory | ItpTravelerListCategory

export const INVENTORY_PART_TYPES = ['Plug', 'Kit', 'Ball', 'Bellows', 'Sleeve'] as const

export const LOOKUP_CATEGORY_DEFS: readonly {
  key: JobLookupCategory
  label: string
  fallback: readonly string[]
}[] = [
  { key: 'test_type', label: 'Test type', fallback: TEST_TYPES },
  { key: 'test_media', label: 'Test media', fallback: TEST_MEDIA },
  { key: 'test_procedure', label: 'Test requirements', fallback: TEST_PROCEDURE_REQUIREMENTS },
  { key: 'valve_size', label: 'Size', fallback: VALVE_SIZES },
  { key: 'valve_type', label: 'Valve type', fallback: VALVE_TYPES },
  { key: 'pressure_class', label: 'Pressure class', fallback: PRESSURE_CLASSES },
  { key: 'body_material', label: 'Body material', fallback: BODY_MATERIALS },
  { key: 'api_trim', label: 'API trim', fallback: API_TRIMS },
  { key: 'finish_cell', label: 'Finish cell', fallback: FINISH_CELLS },
  { key: 'order_type', label: 'Order type', fallback: ORDER_TYPES },
  { key: 'manufacturer', label: 'Manufacturer', fallback: [] },
  { key: 'vendor', label: 'Vendor', fallback: [] },
  { key: 'inventory_part_type', label: 'Inventory part type', fallback: INVENTORY_PART_TYPES },
  { key: 'filler_classification', label: 'Filler classification', fallback: FILLER_CLASSIFICATIONS },
  { key: 'filler_size', label: 'Filler size', fallback: FILLER_SIZES },
  { key: 'end_connection', label: 'Outlet / end connection', fallback: END_CONNECTIONS },
  { key: 'pipe_schedule', label: 'Pipe schedule', fallback: PIPE_SCHEDULES },
]

const LOOKUP_CATEGORY_KEYS = new Set<string>(LOOKUP_CATEGORY_DEFS.map((row) => row.key))

export function isJobLookupCategory(raw: unknown): raw is JobLookupCategory {
  return typeof raw === 'string' && LOOKUP_CATEGORY_KEYS.has(raw)
}

export function isItpTravelerListCategory(raw: unknown): raw is ItpTravelerListCategory {
  return (
    typeof raw === 'string' &&
    raw.startsWith(ITP_TRAVELER_LIST_PREFIX) &&
    raw.length > ITP_TRAVELER_LIST_PREFIX.length
  )
}

export function isLookupCategory(raw: unknown): raw is LookupCategory {
  return isJobLookupCategory(raw) || isItpTravelerListCategory(raw)
}

export function itpTravelerListCategory(listKey: string): ItpTravelerListCategory {
  const key = String(listKey ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return `${ITP_TRAVELER_LIST_PREFIX}${key || 'list'}`
}

export function itpTravelerListKeyFromCategory(category: string): string {
  return isItpTravelerListCategory(category)
    ? category.slice(ITP_TRAVELER_LIST_PREFIX.length)
    : String(category ?? '').trim()
}

export function slugifyItpTravelerListKey(label: string): string {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'list'
}

export function humanizeItpTravelerListKey(category: string): string {
  const key = itpTravelerListKeyFromCategory(category)
  return key.replace(/_/g, ' ').replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
}

export type ItpTravelerListDef = {
  key: string
  label: string
  category: ItpTravelerListCategory
}

export const DEFAULT_ITP_TRAVELER_LISTS: readonly ItpTravelerListDef[] = [
  {
    key: REPAIR_NEEDED_LIST_KEY,
    label: REPAIR_NEEDED_LIST_LABEL,
    category: REPAIR_NEEDED_LOOKUP_CATEGORY,
  },
]

export function formatItpTravelerRegistryValue(key: string, label: string): string {
  return `${key}::${label}`
}

export function parseItpTravelerRegistryValue(raw: string): { key: string; label: string } | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const idx = text.indexOf('::')
  if (idx <= 0) {
    const key = slugifyItpTravelerListKey(text)
    return { key, label: text }
  }
  const key = slugifyItpTravelerListKey(text.slice(0, idx))
  const label = text.slice(idx + 2).trim() || humanizeItpTravelerListKey(key)
  return key ? { key, label } : null
}
