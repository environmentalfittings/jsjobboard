import { TERMINAL_STATUSES } from '../constants/statuses'
import {
  blockSharedShopDeletes,
  SHARED_SHOP_DELETE_BLOCKED_MESSAGE,
} from './companyDataGuard'
import { compareValveIdSequential } from './valveWorkOrderSearch'
import type { Valve } from '../types'
import { supabase } from './supabase'

/** Shop statuses that cannot be on the daily priority list. */
const PRIORITY_BLOCKED_STATUSES = new Set([
  'Not Arrived',
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Outsourced',
])

/** Active in-process work that can be ranked on the priority list (includes On Hold). */
export function isEligiblePriorityValve(valve: Valve | undefined): valve is Valve {
  if (!valve) return false
  if (valve.order_type !== 'In-Process Order') return false
  if (TERMINAL_STATUSES.has(valve.status)) return false
  if (valve.status === 'Warehouse RTS') return false
  if (PRIORITY_BLOCKED_STATUSES.has(valve.status)) return false
  return true
}

export function prunePriorityValveIds(valveIds: string[], valves: Valve[]): string[] {
  const byValveId = new Map(valves.map((v) => [v.valve_id, v]))
  return valveIds.filter((id) => isEligiblePriorityValve(byValveId.get(id)))
}

/** Keep only queue ids that belong to the provided (often company-scoped) valves. */
export function filterPriorityIdsForValves(valveIds: readonly string[], valves: Valve[]): string[] {
  const allowed = new Set(valves.map((v) => v.valve_id))
  return valveIds.filter((id) => allowed.has(id))
}

/**
 * Drop closed / ineligible queue rows so the dashboard matches live shop work.
 *
 * Safety rules (learned the hard way against live Supabase):
 * - When `valves` is a company-scoped subset, missing IDs are NOT stale.
 * - Pass `pruneMissing: true` only with the full shop dataset.
 * - Local multi-company DEV never deletes from priority_queue (read-only sync)
 *   so switching to an empty VSI scope cannot wipe production JS priorities.
 */
export async function syncPriorityQueueWithValves(
  valves: Valve[],
  options?: { pruneMissing?: boolean },
): Promise<string[]> {
  const { data, error } = await supabase.from('priority_queue').select('valve_id,created_at').order('created_at')
  if (error || !data) return []

  const ordered = data.map((row: { valve_id: string }) => row.valve_id)
  const byValveId = new Map(valves.map((v) => [v.valve_id, v]))
  const protectJs = blockSharedShopDeletes()
  const pruneMissing = !protectJs && options?.pruneMissing === true

  const stale = protectJs
    ? []
    : ordered.filter((id) => {
        const valve = byValveId.get(id)
        if (valve) return !isEligiblePriorityValve(valve)
        return pruneMissing
      })

  if (stale.length > 0) {
    await supabase.from('priority_queue').delete().in('valve_id', stale)
  }

  return ordered.filter((id) => {
    const valve = byValveId.get(id)
    // Scoped / empty company views: omit rows we cannot resolve, but do not delete them.
    if (!valve) return false
    return isEligiblePriorityValve(valve)
  })
}

/** Lower rank sorts first; non-priority valves follow in valve-id order. */
export function compareValvesWithPriorityOrder(
  a: Valve,
  b: Valve,
  priorityQueueIds: readonly string[],
): number {
  const rank = new Map(priorityQueueIds.map((valveId, index) => [valveId, index]))
  const aRank = rank.get(a.valve_id)
  const bRank = rank.get(b.valve_id)
  if (aRank != null && bRank != null) return aRank - bRank
  if (aRank != null) return -1
  if (bRank != null) return 1
  return compareValveIdSequential(a.valve_id, b.valve_id)
}

export function reorderPriorityQueueIds(
  order: readonly string[],
  valveId: string,
  direction: 'top' | 'up' | 'down',
): string[] | null {
  const index = order.indexOf(valveId)
  if (index < 0) return null
  const next = [...order]

  if (direction === 'top') {
    if (index === 0) return null
    next.splice(index, 1)
    next.unshift(valveId)
    return next
  }

  if (direction === 'up') {
    if (index === 0) return null
    const prev = next[index - 1]
    next[index - 1] = next[index]
    next[index] = prev
    return next
  }

  if (index >= next.length - 1) return null
  const after = next[index + 1]
  next[index + 1] = next[index]
  next[index] = after
  return next
}

/**
 * Replace queue order in Supabase (uses created_at ordering).
 * Only deletes ids listed in `previousOrder` — rows outside that set are preserved.
 * Local multi-company demo blocks deletes entirely to protect live JS Valve data.
 */
export async function persistPriorityQueueOrder(
  previousOrder: readonly string[],
  nextOrder: readonly string[],
): Promise<{ error: string | null }> {
  if (blockSharedShopDeletes()) {
    return { error: SHARED_SHOP_DELETE_BLOCKED_MESSAGE }
  }

  const unique = Array.from(new Set(nextOrder))
  const previous = [...previousOrder]

  // Preserve any live queue rows that were not part of this edit set (other company / not loaded).
  const { data: existing, error: existingError } = await supabase
    .from('priority_queue')
    .select('valve_id')
    .order('created_at')
  if (existingError) return { error: existingError.message }

  const previousSet = new Set(previous)
  const preserved = (existing ?? [])
    .map((row: { valve_id: string }) => row.valve_id)
    .filter((id) => !previousSet.has(id))

  if (previous.length > 0) {
    const { error: deleteError } = await supabase.from('priority_queue').delete().in('valve_id', previous)
    if (deleteError) return { error: deleteError.message }
  }

  const merged = [...unique, ...preserved.filter((id) => !unique.includes(id))]
  if (merged.length > 0) {
    const baseTime = Date.now()
    const rows = merged.map((valveId, index) => ({
      valve_id: valveId,
      created_at: new Date(baseTime + index * 1000).toISOString(),
    }))
    const { error: insertError } = await supabase.from('priority_queue').insert(rows)
    if (insertError) return { error: insertError.message }
  }

  return { error: null }
}
