import type { ItpTravelerListDef, LookupCategory } from '../constants/lookupCategories'
import {
  DEFAULT_ITP_TRAVELER_LISTS,
  ITP_TRAVELER_LIST_REGISTRY,
  LOOKUP_CATEGORY_DEFS,
  REPAIR_NEEDED_LIST_FALLBACK,
  REPAIR_NEEDED_LIST_LEGACY,
  REPAIR_NEEDED_LOOKUP_CATEGORY,
  formatItpTravelerRegistryValue,
  isLookupCategory,
  itpTravelerListCategory,
  parseItpTravelerRegistryValue,
} from '../constants/lookupCategories'
import { PRIORITY_API_TRIMS } from '../constants/jobLookups'
import { supabase } from './supabase'

function pinValuesFirst(values: string[], pinned: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const pin of pinned) {
    const match = values.find((value) => value.toLowerCase() === pin.toLowerCase())
    out.push(match ?? pin)
    seen.add(pin.toLowerCase())
  }
  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export type LookupValueRow = {
  id: number
  category: string
  value: string
  sort_order: number
}

const travelerListLabelByCategory = new Map<string, string>()

export function cachedItpTravelerListLabel(category: string | undefined): string | undefined {
  if (!category) return undefined
  return travelerListLabelByCategory.get(category)
}

function rememberTravelerListLabel(def: ItpTravelerListDef) {
  travelerListLabelByCategory.set(def.category, def.label)
}

export function travelerListDefsFromRows(rows: LookupValueRow[]): ItpTravelerListDef[] {
  const fromRegistry: ItpTravelerListDef[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.category !== ITP_TRAVELER_LIST_REGISTRY) continue
    const parsed = parseItpTravelerRegistryValue(row.value)
    if (!parsed || seen.has(parsed.key)) continue
    seen.add(parsed.key)
    const def = {
      key: parsed.key,
      label: parsed.label,
      category: itpTravelerListCategory(parsed.key),
    }
    rememberTravelerListLabel(def)
    fromRegistry.push(def)
  }
  const defs = [...fromRegistry]
  for (const fallback of DEFAULT_ITP_TRAVELER_LISTS) {
    if (seen.has(fallback.key)) continue
    rememberTravelerListLabel(fallback)
    defs.push({ ...fallback })
  }
  return defs
}

/** Values per category, ordered for dropdowns. Uses DB when rows exist, else spreadsheet fallbacks. */
export async function loadLookupOptionsMap(): Promise<Record<LookupCategory, string[]>> {
  const base = Object.fromEntries(
    LOOKUP_CATEGORY_DEFS.map((d) => [d.key, [...d.fallback]]),
  ) as Record<LookupCategory, string[]>
  base[REPAIR_NEEDED_LOOKUP_CATEGORY] = [...REPAIR_NEEDED_LIST_FALLBACK]

  const { data, error } = await supabase
    .from('lookup_values')
    .select('id,category,value,sort_order')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error || !data?.length) {
    for (const def of DEFAULT_ITP_TRAVELER_LISTS) rememberTravelerListLabel(def)
    return base
  }

  let rows = data as LookupValueRow[]
  if (await syncRepairNeededListOptions(rows)) {
    const { data: again } = await supabase
      .from('lookup_values')
      .select('id,category,value,sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    if (again?.length) rows = again as LookupValueRow[]
  }
  const travelerDefs = travelerListDefsFromRows(rows)
  const byCat = new Map<string, string[]>()
  for (const d of LOOKUP_CATEGORY_DEFS) byCat.set(d.key, [])
  for (const def of travelerDefs) byCat.set(def.category, [])

  for (const row of rows) {
    if (!isLookupCategory(row.category) || !byCat.has(row.category)) continue
    byCat.get(row.category)!.push(row.value)
  }

  const out = { ...base }
  for (const d of LOOKUP_CATEGORY_DEFS) {
    const fromDb = byCat.get(d.key) ?? []
    const fromFallback = base[d.key] ?? []
    if (fromDb.length === 0) {
      out[d.key] = fromFallback
      continue
    }
    const seen = new Set<string>()
    const merged: string[] = []
    for (const v of fromDb) {
      if (!seen.has(v)) {
        seen.add(v)
        merged.push(v)
      }
    }
    for (const v of fromFallback) {
      if (!seen.has(v)) {
        seen.add(v)
        merged.push(v)
      }
    }
    out[d.key] = d.key === 'api_trim' ? pinValuesFirst(merged, PRIORITY_API_TRIMS) : merged
  }
  for (const def of travelerDefs) {
    const fromDb = byCat.get(def.category) ?? []
    if (fromDb.length > 0) {
      out[def.category] = fromDb
      continue
    }
    out[def.category] =
      def.category === REPAIR_NEEDED_LOOKUP_CATEGORY ? [...REPAIR_NEEDED_LIST_FALLBACK] : []
  }
  return out
}

export async function loadItpTravelerListDefs(): Promise<ItpTravelerListDef[]> {
  const { data, error } = await supabase
    .from('lookup_values')
    .select('id,category,value,sort_order')
    .eq('category', ITP_TRAVELER_LIST_REGISTRY)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) return DEFAULT_ITP_TRAVELER_LISTS.map((row) => ({ ...row }))
  return travelerListDefsFromRows((data ?? []) as LookupValueRow[])
}

export async function seedItpTravelerListsIfEmpty(): Promise<boolean> {
  const { data, error } = await supabase
    .from('lookup_values')
    .select('id,category,value,sort_order')
    .in('category', [ITP_TRAVELER_LIST_REGISTRY, REPAIR_NEEDED_LOOKUP_CATEGORY])
  if (error) return false
  const rows = (data ?? []) as LookupValueRow[]
  const defs = travelerListDefsFromRows(rows)
  const inserts: { category: string; value: string; sort_order: number }[] = []
  if (!rows.some((row) => row.category === ITP_TRAVELER_LIST_REGISTRY)) {
    inserts.push({
      category: ITP_TRAVELER_LIST_REGISTRY,
      value: formatItpTravelerRegistryValue(
        DEFAULT_ITP_TRAVELER_LISTS[0].key,
        DEFAULT_ITP_TRAVELER_LISTS[0].label,
      ),
      sort_order: 0,
    })
  }
  const repairSynced = await syncRepairNeededListOptions(rows)
  if (inserts.length === 0) {
    for (const def of defs) rememberTravelerListLabel(def)
    return repairSynced
  }
  const { error: insertError } = await supabase.from('lookup_values').insert(inserts)
  return !insertError || repairSynced
}

const REPAIR_NEEDED_LEGACY_KEYS = new Set(
  REPAIR_NEEDED_LIST_LEGACY.map((value) => value.trim().toLowerCase()),
)

function optionKey(value: string): string {
  return value.trim().toLowerCase()
}

/** Replace the old Acceptable / Restrip defaults with Repair Needed, Accepted, Polish and Remeasure, Other. */
export async function syncRepairNeededListOptions(existingRows?: LookupValueRow[]): Promise<boolean> {
  let current = (existingRows ?? []).filter((row) => row.category === REPAIR_NEEDED_LOOKUP_CATEGORY)
  if (!existingRows) {
    const { data, error } = await supabase
      .from('lookup_values')
      .select('id,category,value,sort_order')
      .eq('category', REPAIR_NEEDED_LOOKUP_CATEGORY)
      .order('sort_order', { ascending: true })
    if (error) return false
    current = (data ?? []) as LookupValueRow[]
  }

  const byKey = new Map<string, LookupValueRow>()
  for (const row of current) {
    const key = optionKey(row.value)
    if (!key || byKey.has(key)) continue
    byKey.set(key, row)
  }

  const toDeleteIds = current
    .filter((row) => REPAIR_NEEDED_LEGACY_KEYS.has(optionKey(row.value)))
    .map((row) => row.id)
  const missing = REPAIR_NEEDED_LIST_FALLBACK.filter((value) => !byKey.has(optionKey(value)))
  const orderUpdates: { id: number; sort_order: number }[] = []
  REPAIR_NEEDED_LIST_FALLBACK.forEach((value, sort_order) => {
    const row = byKey.get(optionKey(value))
    if (row && Number(row.sort_order) !== sort_order) {
      orderUpdates.push({ id: row.id, sort_order })
    }
  })

  if (toDeleteIds.length === 0 && missing.length === 0 && orderUpdates.length === 0) return false

  if (toDeleteIds.length > 0) {
    const { error } = await supabase.from('lookup_values').delete().in('id', toDeleteIds)
    if (error) return false
  }
  if (missing.length > 0) {
    const { error } = await supabase.from('lookup_values').insert(
      missing.map((value) => ({
        category: REPAIR_NEEDED_LOOKUP_CATEGORY,
        value,
        sort_order: REPAIR_NEEDED_LIST_FALLBACK.indexOf(value),
      })),
    )
    if (error) return false
  }
  for (const row of orderUpdates) {
    const { error } = await supabase.from('lookup_values').update({ sort_order: row.sort_order }).eq('id', row.id)
    if (error) return false
  }
  return true
}

/** Insert a Manage-lists value. Returns the saved value (trimmed). */
export async function addLookupValue(category: LookupCategory, rawValue: string): Promise<string> {
  const value = rawValue.trim()
  if (!value) throw new Error('Enter a value')

  const { data: existing, error: existingError } = await supabase
    .from('lookup_values')
    .select('id,value,sort_order')
    .eq('category', category)
    .order('sort_order', { ascending: false })
    .limit(200)

  if (existingError) throw existingError

  const match = (existing ?? []).find((row) => String(row.value).trim().toLowerCase() === value.toLowerCase())
  if (match) return String(match.value)

  const maxOrder = (existing ?? []).reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), -1)
  const { error } = await supabase.from('lookup_values').insert({
    category,
    value,
    sort_order: maxOrder + 1,
  })
  if (error) {
    if (error.code === '23505' || /duplicate/i.test(error.message)) return value
    throw error
  }
  return value
}

/** Insert fallback options when a Job field list has never been saved (e.g. Outlet / end connection). */
export async function seedLookupCategoryIfEmpty(category: LookupCategory): Promise<boolean> {
  if (category === REPAIR_NEEDED_LOOKUP_CATEGORY) {
    return seedItpTravelerListsIfEmpty()
  }
  const def = LOOKUP_CATEGORY_DEFS.find((row) => row.key === category)
  if (!def || def.fallback.length === 0) return false
  const { data, error } = await supabase
    .from('lookup_values')
    .select('id')
    .eq('category', category)
    .limit(1)
  if (error || (data && data.length > 0)) return false
  const { error: insertError } = await supabase.from('lookup_values').insert(
    def.fallback.map((value, sort_order) => ({ category, value, sort_order })),
  )
  return !insertError
}
