import { TERMINAL_STATUSES, WAITING_STATUSES } from '../constants/statuses'
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
