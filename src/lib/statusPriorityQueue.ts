import {
  getPriorityDepartment,
  PRIORITY_DEPARTMENTS,
  statusesForDepartments,
  type PriorityDepartment,
  type PriorityDepartmentId,
} from '../constants/priorityDepartments'
import { compareValveIdSequential } from './valveWorkOrderSearch'
import { displayJobStatus, isActiveShopWork } from './jobDisplayStatus'
import { supabase } from './supabase'
import type { Valve } from '../types'

export type PriorityScopeKind = 'status' | 'cell' | 'department'

export type PriorityScope = {
  kind: PriorityScopeKind
  key: string
}

export type HandoutAssignment = {
  valve_id: string
  assigned_technician_ids: number[]
  handout_notes: string
}

export function parsePriorityScopeKind(value: string | null | undefined): PriorityScopeKind {
  if (value === 'cell') return 'cell'
  if (value === 'department') return 'department'
  return 'status'
}

export function isPriorityFilterActive(value: string | null | undefined): boolean {
  const trimmed = value?.trim()
  return Boolean(trimmed && trimmed.toLowerCase() !== 'all')
}

export function scopeLabel(scope: PriorityScope): string {
  if (scope.kind === 'cell') return `Finish cell: ${scope.key}`
  if (scope.kind === 'department') return handoutScopeLabel(scope.key)
  return scope.key
}

export function handoutScopeLabel(scopeKey: string): string {
  const { departmentIds, cells } = parseHandoutScopeKey(scopeKey)
  const deptLabels = departmentIds.length
    ? departmentIds.map((id) => getPriorityDepartment(id)?.label ?? id).join(' + ')
    : 'All departments'
  if (!cells.length) return deptLabels || scopeKey
  return `${deptLabels} · ${cells.join(', ')}`
}

/** Encode multi department (+ optional cells) into one queue scope key. */
export function buildHandoutScopeKey(
  departmentIds: readonly string[],
  cells: readonly string[] = [],
): PriorityScope {
  const depts = [
    ...new Set(
      departmentIds
        .map((id) => getPriorityDepartment(id)?.id)
        .filter((id): id is PriorityDepartmentId => Boolean(id)),
    ),
  ].sort()
  const cellKeys = [...new Set(cells.map((c) => c.trim()).filter(Boolean))].sort()
  const deptKey = depts.length ? depts.join('+') : 'all'
  const key = cellKeys.length ? `${deptKey}::${cellKeys.join('+')}` : deptKey
  return { kind: 'department', key }
}

export function parseHandoutScopeKey(key: string): {
  departmentIds: PriorityDepartmentId[]
  cells: string[]
} {
  const trimmed = key.trim()
  if (!trimmed || trimmed === 'all') return { departmentIds: [], cells: [] }
  const sep = trimmed.indexOf('::')
  const deptPart = sep >= 0 ? trimmed.slice(0, sep) : trimmed
  const cellPart = sep >= 0 ? trimmed.slice(sep + 2) : ''
  if (deptPart === 'all') {
    return {
      departmentIds: [],
      cells: cellPart
        .split('+')
        .map((c) => c.trim())
        .filter(Boolean),
    }
  }
  const departmentIds = deptPart
    .split('+')
    .map((p) => getPriorityDepartment(p.trim())?.id)
    .filter((id): id is PriorityDepartmentId => Boolean(id))
  const cells = cellPart
    .split('+')
    .map((c) => c.trim())
    .filter(Boolean)
  return {
    departmentIds,
    cells,
  }
}

export function departmentOrderScope(departmentId: string, cell?: string | null): PriorityScope {
  return buildHandoutScopeKey([departmentId], isPriorityFilterActive(cell) ? [cell!.trim()] : [])
}

export function departmentFiltersLabel(departmentId: string, cell?: string | null): string {
  return scopeLabel(departmentOrderScope(departmentId, cell))
}

/** Status used for department handout membership (closed WO → Completed, not leftover phase). */
export function handoutStatusForValve(valve: Valve): string {
  if (valve.order_type === 'Completed' || valve.status === 'Completed') return 'Completed'
  if (valve.status === 'Junked') return 'Junked'
  if (valve.status === 'Replaced') return 'Replaced'
  return displayJobStatus(valve)
}

export function valvesForHandoutFilters(
  valves: Valve[],
  departmentIds: readonly string[],
  cells: readonly string[] = [],
): Valve[] {
  const statusSet = new Set(statusesForDepartments(departmentIds))
  if (!statusSet.size) return []
  const cellSet = cells.length ? new Set(cells.map((c) => c.trim()).filter(Boolean)) : null

  return valves.filter((v) => {
    if (!statusSet.has(handoutStatusForValve(v))) return false
    if (cellSet && !cellSet.has((v.cell ?? '').trim())) return false
    return true
  })
}

export function valvesInDepartment(
  valves: Valve[],
  department: PriorityDepartment | string,
  cell?: string | null,
): Valve[] {
  const dept = typeof department === 'string' ? getPriorityDepartment(department) : department
  if (!dept) return []
  return valvesForHandoutFilters(valves, [dept.id], isPriorityFilterActive(cell) ? [cell!.trim()] : [])
}

export function finishCellsForDepartments(valves: Valve[], departmentIds: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const v of valvesForHandoutFilters(valves, departmentIds, [])) {
    const cell = (v.cell ?? '').trim() || 'Unassigned'
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cell]) => cell)
}

export function finishCellsInDepartment(valves: Valve[], departmentId: string): string[] {
  return finishCellsForDepartments(valves, [departmentId])
}

export function valvesForPriorityScope(valves: Valve[], scope: PriorityScope): Valve[] {
  if (scope.kind === 'department') {
    const parsed = parseHandoutScopeKey(scope.key)
    return valvesForHandoutFilters(valves, parsed.departmentIds, parsed.cells)
  }
  if (scope.kind === 'cell') {
    return valves.filter(
      (v) =>
        isActiveShopWork(v) &&
        v.order_type === 'In-Process Order' &&
        (v.cell ?? '').trim() === scope.key.trim(),
    )
  }
  return valves.filter((v) => isActiveShopWork(v) && displayJobStatus(v) === scope.key.trim())
}

export function valvesMatchingPriorityFilters(
  valves: Valve[],
  filters: { status?: string | null; cell?: string | null },
): Valve[] {
  const statusActive = isPriorityFilterActive(filters.status)
  const cellActive = isPriorityFilterActive(filters.cell)
  return valves.filter((v) => {
    if (!isActiveShopWork(v)) return false
    if (statusActive && displayJobStatus(v) !== filters.status!.trim()) return false
    if (cellActive) {
      if ((v.cell ?? '').trim() !== filters.cell!.trim()) return false
      if (!statusActive && v.order_type !== 'In-Process Order') return false
    }
    return statusActive || cellActive
  })
}

export function priorityOrderScope(filters: {
  status?: string | null
  cell?: string | null
}): PriorityScope | null {
  if (isPriorityFilterActive(filters.status)) return { kind: 'status', key: filters.status!.trim() }
  if (isPriorityFilterActive(filters.cell)) return { kind: 'cell', key: filters.cell!.trim() }
  return null
}

export function priorityFiltersLabel(filters: { status?: string | null; cell?: string | null }): string {
  const parts: string[] = []
  if (isPriorityFilterActive(filters.status)) parts.push(filters.status!.trim())
  if (isPriorityFilterActive(filters.cell)) parts.push(`Finish cell: ${filters.cell!.trim()}`)
  return parts.length ? parts.join(' · ') : 'All departments'
}

export function valvesInShopStatus(valves: Valve[], shopStatus: string): Valve[] {
  return valvesMatchingPriorityFilters(valves, { status: shopStatus, cell: 'all' })
}

export function valvesInFinishCell(valves: Valve[], cell: string): Valve[] {
  return valvesMatchingPriorityFilters(valves, { status: 'all', cell })
}

export async function loadHandoutAssignments(scope: PriorityScope): Promise<HandoutAssignment[]> {
  const key = scope.key.trim()
  if (!key) return []
  const { data, error } = await supabase
    .from('status_priority_queue')
    .select('valve_id,sort_order,assigned_technician_id,assigned_technician_ids,handout_notes')
    .eq('scope_kind', scope.kind)
    .eq('scope_key', key)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return data.map(
    (row: {
      valve_id: string
      assigned_technician_id: number | null
      assigned_technician_ids: number[] | null
      handout_notes: string | null
    }) => {
      const fromArray = Array.isArray(row.assigned_technician_ids)
        ? row.assigned_technician_ids.filter((id) => typeof id === 'number')
        : []
      const legacy =
        row.assigned_technician_id != null && !fromArray.includes(row.assigned_technician_id)
          ? [row.assigned_technician_id]
          : []
      return {
        valve_id: row.valve_id,
        assigned_technician_ids: [...fromArray, ...legacy],
        handout_notes: row.handout_notes ?? '',
      }
    },
  )
}

export async function loadPriorityScopeOrder(scope: PriorityScope): Promise<string[]> {
  const rows = await loadHandoutAssignments(scope)
  return rows.map((row) => row.valve_id)
}

export async function loadStatusPriorityOrder(shopStatus: string): Promise<string[]> {
  return loadPriorityScopeOrder({ kind: 'status', key: shopStatus })
}

export function mergePriorityScopeOrder(savedOrder: string[], valvesInScope: Valve[]): string[] {
  const inScopeIds = new Set(valvesInScope.map((v) => v.valve_id))
  const ranked = savedOrder.filter((id) => inScopeIds.has(id))
  const rankedSet = new Set(ranked)
  const unranked = valvesInScope
    .map((v) => v.valve_id)
    .filter((id) => !rankedSet.has(id))
    .sort(compareValveIdSequential)
  return [...ranked, ...unranked]
}

export function mergeHandoutAssignments(
  saved: HandoutAssignment[],
  valvesInScope: Valve[],
): HandoutAssignment[] {
  const byId = new Map(saved.map((row) => [row.valve_id, row]))
  const orderedIds = mergePriorityScopeOrder(
    saved.map((row) => row.valve_id),
    valvesInScope,
  )
  return orderedIds.map((valve_id) => {
    const existing = byId.get(valve_id)
    return {
      valve_id,
      assigned_technician_ids: existing?.assigned_technician_ids ?? [],
      handout_notes: existing?.handout_notes ?? '',
    }
  })
}

export function mergeStatusPriorityOrder(savedOrder: string[], valvesInStatus: Valve[]): string[] {
  return mergePriorityScopeOrder(savedOrder, valvesInStatus)
}

export function orderValvesByPriorityScope(valves: Valve[], orderedIds: string[]): Valve[] {
  const byId = new Map(valves.map((v) => [v.valve_id, v]))
  const seen = new Set<string>()
  const ordered: Valve[] = []
  for (const id of orderedIds) {
    const valve = byId.get(id)
    if (!valve || seen.has(id)) continue
    ordered.push(valve)
    seen.add(id)
  }
  const rest = valves
    .filter((v) => !seen.has(v.valve_id))
    .slice()
    .sort((a, b) => compareValveIdSequential(a.valve_id, b.valve_id))
  return [...ordered, ...rest]
}

export function orderValvesByStatusPriority(valves: Valve[], orderedIds: string[]): Valve[] {
  return orderValvesByPriorityScope(valves, orderedIds)
}

export async function saveHandoutAssignments(
  scope: PriorityScope,
  rows: HandoutAssignment[],
): Promise<{ error: string | null }> {
  const key = scope.key.trim()
  if (!key) return { error: 'Department is required.' }

  const { error: deleteError } = await supabase
    .from('status_priority_queue')
    .delete()
    .eq('scope_kind', scope.kind)
    .eq('scope_key', key)
  if (deleteError) return { error: deleteError.message }

  if (!rows.length) return { error: null }

  const payload = rows.map((row, sort_order) => ({
    scope_kind: scope.kind,
    scope_key: key,
    valve_id: row.valve_id,
    sort_order,
    assigned_technician_id: row.assigned_technician_ids[0] ?? null,
    assigned_technician_ids: row.assigned_technician_ids,
    handout_notes: row.handout_notes.trim() || null,
    updated_at: new Date().toISOString(),
  }))

  const { error: insertError } = await supabase.from('status_priority_queue').insert(payload)
  if (insertError) return { error: insertError.message }
  return { error: null }
}

export async function savePriorityScopeOrder(
  scope: PriorityScope,
  orderedValveIds: string[],
): Promise<{ error: string | null }> {
  const existing = await loadHandoutAssignments(scope)
  const byId = new Map(existing.map((row) => [row.valve_id, row]))
  const rows = orderedValveIds.map((valve_id) => ({
    valve_id,
    assigned_technician_ids: byId.get(valve_id)?.assigned_technician_ids ?? [],
    handout_notes: byId.get(valve_id)?.handout_notes ?? '',
  }))
  return saveHandoutAssignments(scope, rows)
}

export async function saveStatusPriorityOrder(
  shopStatus: string,
  orderedValveIds: string[],
): Promise<{ error: string | null }> {
  return savePriorityScopeOrder({ kind: 'status', key: shopStatus }, orderedValveIds)
}

export async function prunePriorityScopeQueue(
  scope: PriorityScope,
  valvesInScope: Valve[],
): Promise<string[]> {
  const saved = await loadHandoutAssignments(scope)
  const merged = mergeHandoutAssignments(saved, valvesInScope)
  const keep = new Set(merged.map((row) => row.valve_id))
  const stale = saved.map((row) => row.valve_id).filter((id) => !keep.has(id))
  if (stale.length) {
    await supabase
      .from('status_priority_queue')
      .delete()
      .eq('scope_kind', scope.kind)
      .eq('scope_key', scope.key.trim())
      .in('valve_id', stale)
  }
  return merged.map((row) => row.valve_id)
}

export async function pruneStatusPriorityQueue(
  shopStatus: string,
  valvesInStatus: Valve[],
): Promise<string[]> {
  return prunePriorityScopeQueue({ kind: 'status', key: shopStatus }, valvesInStatus)
}

export function departmentIdForShopStatus(status: string): PriorityDepartmentId | null {
  const label = status.trim()
  for (const dept of PRIORITY_DEPARTMENTS) {
    if (dept.statuses.includes(label)) return dept.id
  }
  return null
}
