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
