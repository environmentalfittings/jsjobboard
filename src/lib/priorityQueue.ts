import { TERMINAL_STATUSES, WAITING_STATUSES } from '../constants/statuses'
import { compareValveIdSequential } from './valveWorkOrderSearch'
import type { Valve } from '../types'
import { supabase } from './supabase'

/** Matches Excel active in-process shop work (not closed, not waiting/on hold). */
export function isEligiblePriorityValve(valve: Valve | undefined): valve is Valve {
  if (!valve) return false
  if (valve.order_type !== 'In-Process Order') return false
  if (TERMINAL_STATUSES.has(valve.status)) return false
  if (valve.status === 'Warehouse RTS') return false
  if (WAITING_STATUSES.has(valve.status)) return false
  return true
}

export function prunePriorityValveIds(valveIds: string[], valves: Valve[]): string[] {
  const byValveId = new Map(valves.map((v) => [v.valve_id, v]))
  return valveIds.filter((id) => isEligiblePriorityValve(byValveId.get(id)))
}

/** Drop closed / on-hold queue rows so the dashboard matches live shop work. */
export async function syncPriorityQueueWithValves(valves: Valve[]): Promise<string[]> {
  const { data, error } = await supabase.from('priority_queue').select('valve_id,created_at').order('created_at')
  if (error || !data) return []

  const ordered = data.map((row: { valve_id: string }) => row.valve_id)
  const eligible = prunePriorityValveIds(ordered, valves)
  const stale = ordered.filter((id) => !eligible.includes(id))

  if (stale.length > 0) {
    await supabase.from('priority_queue').delete().in('valve_id', stale)
  }

  return eligible
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
