import { compareValveIdSequential } from './valveWorkOrderSearch'
import { displayJobStatus, isActiveShopWork } from './jobDisplayStatus'
import { supabase } from './supabase'
import type { Valve } from '../types'

export type PriorityScopeKind = 'status' | 'cell'

export type PriorityScope = {
  kind: PriorityScopeKind
  key: string
}

export function parsePriorityScopeKind(value: string | null | undefined): PriorityScopeKind {
  return value === 'cell' ? 'cell' : 'status'
}

export function scopeLabel(scope: PriorityScope): string {
  return scope.kind === 'cell' ? `Finish cell: ${scope.key}` : scope.key
}

/** Active open valves under a dashboard status label. */
export function valvesInShopStatus(valves: Valve[], shopStatus: string): Valve[] {
  const status = shopStatus.trim()
  if (!status) return []
  return valves.filter((v) => isActiveShopWork(v) && displayJobStatus(v) === status)
}

/** Active in-process valves in a finish cell (matches dashboard work-cell bars). */
export function valvesInFinishCell(valves: Valve[], cell: string): Valve[] {
  const key = cell.trim()
  if (!key) return []
  return valves.filter(
    (v) => isActiveShopWork(v) && v.order_type === 'In-Process Order' && (v.cell ?? '').trim() === key,
  )
}

export function valvesForPriorityScope(valves: Valve[], scope: PriorityScope): Valve[] {
  if (scope.kind === 'cell') return valvesInFinishCell(valves, scope.key)
  return valvesInShopStatus(valves, scope.key)
}

export async function loadPriorityScopeOrder(scope: PriorityScope): Promise<string[]> {
  const key = scope.key.trim()
  if (!key) return []
  const { data, error } = await supabase
    .from('status_priority_queue')
    .select('valve_id,sort_order')
    .eq('scope_kind', scope.kind)
    .eq('scope_key', key)
    .order('sort_order', { ascending: true })
  if (error || !data) return []
  return data.map((row: { valve_id: string }) => row.valve_id)
}

/** @deprecated Prefer loadPriorityScopeOrder */
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

/** @deprecated Prefer mergePriorityScopeOrder */
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

/** @deprecated Prefer orderValvesByPriorityScope */
export function orderValvesByStatusPriority(valves: Valve[], orderedIds: string[]): Valve[] {
  return orderValvesByPriorityScope(valves, orderedIds)
}

export async function savePriorityScopeOrder(
  scope: PriorityScope,
  orderedValveIds: string[],
): Promise<{ error: string | null }> {
  const key = scope.key.trim()
  if (!key) return { error: 'Department is required.' }

  const { error: deleteError } = await supabase
    .from('status_priority_queue')
    .delete()
    .eq('scope_kind', scope.kind)
    .eq('scope_key', key)
  if (deleteError) return { error: deleteError.message }

  if (!orderedValveIds.length) return { error: null }

  const rows = orderedValveIds.map((valve_id, sort_order) => ({
    scope_kind: scope.kind,
    scope_key: key,
    valve_id,
    sort_order,
    updated_at: new Date().toISOString(),
  }))

  const { error: insertError } = await supabase.from('status_priority_queue').insert(rows)
  if (insertError) return { error: insertError.message }
  return { error: null }
}

/** @deprecated Prefer savePriorityScopeOrder */
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
  const saved = await loadPriorityScopeOrder(scope)
  const merged = mergePriorityScopeOrder(saved, valvesInScope)
  const keep = new Set(merged)
  const stale = saved.filter((id) => !keep.has(id))
  if (stale.length) {
    await supabase
      .from('status_priority_queue')
      .delete()
      .eq('scope_kind', scope.kind)
      .eq('scope_key', scope.key.trim())
      .in('valve_id', stale)
  }
  return merged
}

/** @deprecated Prefer prunePriorityScopeQueue */
export async function pruneStatusPriorityQueue(
  shopStatus: string,
  valvesInStatus: Valve[],
): Promise<string[]> {
  return prunePriorityScopeQueue({ kind: 'status', key: shopStatus }, valvesInStatus)
}
