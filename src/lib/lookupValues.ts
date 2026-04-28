import type { LookupCategory } from '../constants/lookupCategories'
import { LOOKUP_CATEGORY_DEFS } from '../constants/lookupCategories'
import { supabase } from './supabase'

export type LookupValueRow = {
  id: number
  category: string
  value: string
  sort_order: number
}

/** Values per category, ordered for dropdowns. Uses DB when rows exist, else spreadsheet fallbacks. */
export async function loadLookupOptionsMap(): Promise<Record<LookupCategory, string[]>> {
  const base = Object.fromEntries(
    LOOKUP_CATEGORY_DEFS.map((d) => [d.key, [...d.fallback]]),
  ) as Record<LookupCategory, string[]>

  const { data, error } = await supabase
    .from('lookup_values')
    .select('id,category,value,sort_order')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })

  if (error || !data?.length) return base

  const byCat = new Map<LookupCategory, string[]>()
  for (const d of LOOKUP_CATEGORY_DEFS) {
    byCat.set(d.key, [])
  }

  for (const row of data as LookupValueRow[]) {
    const cat = row.category as LookupCategory
    if (!byCat.has(cat)) continue
    byCat.get(cat)!.push(row.value)
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
    out[d.key] = merged
  }
  return out
}
