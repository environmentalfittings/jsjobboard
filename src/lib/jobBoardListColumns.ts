import { normalizeJobSubStatus } from '../constants/jobSubStatuses'
import {
  compareValveIdSequential,
  valveMatchesWorkOrderFilter,
  valveMatchesWorkOrderQuery,
} from './valveWorkOrderSearch'
import type { Valve } from '../types'

export type ListColumnKey =
  | 'valve_id'
  | 'customer'
  | 'cell'
  | 'size'
  | 'turnaround'
  | 'status'
  | 'sub_status'
  | 'technician'
  | 'due_date'
  | 'description'
  | 'notes'

export type ColumnFilterState = {
  query: string
  selected: string
}

export type ListSortState = {
  column: ListColumnKey | 'default'
  direction: 'asc' | 'desc'
}

export type ListColumnContext = {
  technicianLabelForValve: (valve: Valve) => string
}

export const LIST_FILTER_COLUMNS: { key: ListColumnKey; label: string }[] = [
  { key: 'valve_id', label: 'Valve ID' },
  { key: 'customer', label: 'Customer' },
  { key: 'cell', label: 'Cell' },
  { key: 'size', label: 'Size' },
  { key: 'turnaround', label: 'Turnaround' },
  { key: 'status', label: 'Status' },
  { key: 'sub_status', label: 'Sub-status' },
  { key: 'technician', label: 'Techs' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
]

export function emptyColumnFilters(): Record<ListColumnKey, ColumnFilterState> {
  return {
    valve_id: { query: '', selected: '' },
    customer: { query: '', selected: '' },
    cell: { query: '', selected: '' },
    size: { query: '', selected: '' },
    turnaround: { query: '', selected: '' },
    status: { query: '', selected: '' },
    sub_status: { query: '', selected: '' },
    technician: { query: '', selected: '' },
    due_date: { query: '', selected: '' },
    description: { query: '', selected: '' },
    notes: { query: '', selected: '' },
  }
}

export function getColumnValue(valve: Valve, column: ListColumnKey, context: ListColumnContext): string {
  switch (column) {
    case 'valve_id':
      return valve.valve_id
    case 'customer':
      return valve.customer ?? ''
    case 'cell':
      return valve.cell ?? ''
    case 'size':
      return valve.size ?? ''
    case 'turnaround':
      return valve.is_turnaround ? 'Yes' : 'No'
    case 'status':
      return valve.status
    case 'sub_status':
      return normalizeJobSubStatus(valve.sub_status)
    case 'technician':
      return context.technicianLabelForValve(valve)
    case 'due_date':
      return valve.due_date ?? ''
    case 'description':
      return valve.description ?? ''
    case 'notes':
      return valve.notes ?? ''
  }
}

export type ColumnSuggestion = {
  value: string
  hint?: string
}

export function suggestColumnValues(
  valves: Valve[],
  column: ListColumnKey,
  query: string,
  context: ListColumnContext,
  limit = 12,
): ColumnSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  if (column === 'valve_id') {
    return valves
      .filter((valve) => valveMatchesWorkOrderQuery(valve, query))
      .sort((a, b) => compareValveIdSequential(a.valve_id, b.valve_id))
      .slice(0, limit)
      .map((valve) => ({
        value: valve.valve_id,
        hint: valve.customer ?? undefined,
      }))
  }

  const seen = new Set<string>()
  const results: ColumnSuggestion[] = []
  for (const valve of valves) {
    const value = getColumnValue(valve, column, context).trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (!key.includes(q) || seen.has(key)) continue
    seen.add(key)
    results.push({
      value,
      hint: column === 'customer' ? valve.valve_id : undefined,
    })
    if (results.length >= limit) break
  }

  return results.sort((a, b) =>
    a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

export function matchesColumnFilter(
  valve: Valve,
  column: ListColumnKey,
  filter: ColumnFilterState,
  context: ListColumnContext,
): boolean {
  if (column === 'valve_id') {
    return valveMatchesWorkOrderFilter(valve, filter.query, filter.selected)
  }

  const value = getColumnValue(valve, column, context)
  if (filter.selected) return value === filter.selected

  const q = filter.query.trim().toLowerCase()
  if (!q) return true
  return value.toLowerCase().includes(q)
}

export function valveMatchesAllColumnFilters(
  valve: Valve,
  filters: Record<ListColumnKey, ColumnFilterState>,
  context: ListColumnContext,
): boolean {
  return LIST_FILTER_COLUMNS.every(({ key }) => matchesColumnFilter(valve, key, filters[key], context))
}

export function compareValvesByListColumn(
  a: Valve,
  b: Valve,
  sort: ListSortState,
  context: ListColumnContext,
  fallback: (left: Valve, right: Valve) => number,
): number {
  if (sort.column === 'default') return fallback(a, b)

  const mult = sort.direction === 'asc' ? 1 : -1
  let cmp = 0

  switch (sort.column) {
    case 'valve_id':
      cmp = compareValveIdSequential(a.valve_id, b.valve_id)
      break
    case 'due_date': {
      const ad = a.due_date ?? ''
      const bd = b.due_date ?? ''
      if (!ad && !bd) cmp = 0
      else if (!ad) cmp = 1
      else if (!bd) cmp = -1
      else cmp = ad.localeCompare(bd)
      break
    }
    case 'turnaround':
      cmp = Number(Boolean(a.is_turnaround)) - Number(Boolean(b.is_turnaround))
      break
    case 'size': {
      const as = Number.parseFloat(a.size ?? '')
      const bs = Number.parseFloat(b.size ?? '')
      if (Number.isFinite(as) && Number.isFinite(bs)) cmp = as - bs
      else cmp = (a.size ?? '').localeCompare(b.size ?? '', undefined, { numeric: true })
      break
    }
    default:
      cmp = getColumnValue(a, sort.column, context).localeCompare(
        getColumnValue(b, sort.column, context),
        undefined,
        { numeric: true, sensitivity: 'base' },
      )
  }

  return cmp * mult || fallback(a, b)
}
