import type { Valve } from '../types'

export type ValveListSort =
  | 'default'
  | 'wo-asc'
  | 'wo-desc'
  | 'due-asc'
  | 'due-desc'
  | 'customer-asc'
  | 'customer-desc'

/** Case-insensitive substring match on job description. */
export function valveMatchesDescriptionSearch(valve: Valve, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  return (valve.description ?? '').toLowerCase().includes(q)
}

/** Strip common work-order prefixes for comparison (WO#, WO, R). */
export function normalizeWorkOrderToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^wo#?/i, '')
    .replace(/^r(?=\d)/i, '')
}

/** Pull WO-style references from free text (notes, descriptions). */
export function extractWorkOrderReferences(text: string): string[] {
  const refs = new Set<string>()
  for (const match of text.matchAll(/wo#?\s*([r]?\d[\d-]*)/gi)) {
    const token = normalizeWorkOrderToken(match[1] ?? '')
    if (token) refs.add(token)
  }
  for (const match of text.matchAll(/(?:^|\s)#(\d[\d-]*)/gi)) {
    const token = normalizeWorkOrderToken(match[1] ?? '')
    if (token) refs.add(token)
  }
  return [...refs]
}

export function compareValveIdSequential(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function tokenMatchesQuery(token: string, query: string): boolean {
  if (!token || !query) return false
  if (token.includes(query) || query.includes(token)) return true
  const tokenBase = token.split('-')[0] ?? token
  const queryBase = query.split('-')[0] ?? query
  if (queryBase.length >= 3 && tokenBase === queryBase) return true
  if (!query.includes('-') && token.startsWith(query)) return true
  return false
}

/** Prefix / contains match on valve ID and referenced WOs (for autocomplete). */
export function valveMatchesWorkOrderQuery(valve: Valve, rawQuery: string): boolean {
  const query = rawQuery.trim()
  if (!query) return true

  const queryLower = query.toLowerCase()
  const queryNorm = normalizeWorkOrderToken(query)

  if (valve.valve_id.toLowerCase().includes(queryLower)) return true

  const valveIdNorm = normalizeWorkOrderToken(valve.valve_id)
  if (valveIdNorm.startsWith(queryNorm) || valveIdNorm.includes(queryNorm)) return true

  const referenced = [
    ...extractWorkOrderReferences(valve.notes ?? ''),
    ...extractWorkOrderReferences(valve.description ?? ''),
  ]
  return referenced.some((ref) => ref.startsWith(queryNorm) || ref.includes(queryNorm))
}

/** Active filter: exact selection wins; otherwise match typed query. */
export function valveMatchesWorkOrderFilter(
  valve: Valve,
  query: string,
  selectedValveId: string,
): boolean {
  if (selectedValveId) return valve.valve_id === selectedValveId
  return valveMatchesWorkOrderQuery(valve, query)
}

export function suggestWorkOrders(valves: Valve[], query: string, limit = 15): Valve[] {
  const q = query.trim()
  if (!q) return []
  return valves
    .filter((valve) => valveMatchesWorkOrderQuery(valve, q))
    .sort((a, b) => compareValveIdSequential(a.valve_id, b.valve_id))
    .slice(0, limit)
}

export function compareValvesBySort(
  a: Valve,
  b: Valve,
  sort: ValveListSort,
  fallback: (left: Valve, right: Valve) => number = () => 0,
): number {
  switch (sort) {
    case 'wo-asc':
      return compareValveIdSequential(a.valve_id, b.valve_id)
    case 'wo-desc':
      return compareValveIdSequential(b.valve_id, a.valve_id)
    case 'due-asc': {
      const ad = a.due_date ?? ''
      const bd = b.due_date ?? ''
      if (!ad && !bd) return 0
      if (!ad) return 1
      if (!bd) return -1
      return ad.localeCompare(bd)
    }
    case 'due-desc': {
      const ad = a.due_date ?? ''
      const bd = b.due_date ?? ''
      if (!ad && !bd) return 0
      if (!ad) return 1
      if (!bd) return -1
      return bd.localeCompare(ad)
    }
    case 'customer-asc':
      return (a.customer ?? '').localeCompare(b.customer ?? '', undefined, { sensitivity: 'base' })
    case 'customer-desc':
      return (b.customer ?? '').localeCompare(a.customer ?? '', undefined, { sensitivity: 'base' })
    default:
      return fallback(a, b)
  }
}

/** @deprecated Use valveMatchesWorkOrderFilter for WO-specific filtering. */
export function valveMatchesSearch(valve: Valve, rawQuery: string): boolean {
  const query = rawQuery.trim()
  if (!query) return true

  const queryLower = query.toLowerCase()
  const queryNorm = normalizeWorkOrderToken(query)

  const textFields = [
    valve.valve_id,
    valve.customer,
    valve.description,
    valve.notes,
    valve.drawing_po_number,
    valve.cell,
  ]

  if (textFields.some((field) => (field ?? '').toLowerCase().includes(queryLower))) {
    return true
  }

  const valveIdNorm = normalizeWorkOrderToken(valve.valve_id)
  if (tokenMatchesQuery(valveIdNorm, queryNorm)) return true

  const referenced = [
    ...extractWorkOrderReferences(valve.notes ?? ''),
    ...extractWorkOrderReferences(valve.description ?? ''),
  ]
  if (referenced.some((ref) => tokenMatchesQuery(ref, queryNorm))) return true

  return false
}
