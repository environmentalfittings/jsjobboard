import type { StatusReworkRecord } from '../types'
import { supabase } from './supabase'

export async function recordStatusRework(input: {
  valveRowId: number
  valveId: string
  previousStatus: string
  newStatus: string
  reason: string
  changedByName?: string | null
}): Promise<{ error: Error | null }> {
  const reason = input.reason.trim()
  if (!reason) return { error: new Error('A rework reason is required') }

  const { error } = await supabase.from('status_rework_log').insert({
    valve_row_id: input.valveRowId,
    valve_id: input.valveId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason,
    changed_by_name: input.changedByName?.trim() || null,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function fetchStatusReworkLog(
  startDate: string,
  endDate: string,
): Promise<{ data: StatusReworkRecord[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('status_rework_log')
    .select(
      'id,valve_row_id,valve_id,previous_status,new_status,reason,changed_by_name,changed_at,qa_disposition,incr_id',
    )
    .gte('changed_at', `${startDate}T00:00:00`)
    .lte('changed_at', `${endDate}T23:59:59.999`)
    .order('changed_at', { ascending: false })

  if (error) {
    // Older DBs before migration-quality-incrs.sql — fall back without disposition columns.
    if (/qa_disposition|incr_id|schema cache|column/i.test(error.message)) {
      const legacy = await supabase
        .from('status_rework_log')
        .select('id,valve_row_id,valve_id,previous_status,new_status,reason,changed_by_name,changed_at')
        .gte('changed_at', `${startDate}T00:00:00`)
        .lte('changed_at', `${endDate}T23:59:59.999`)
        .order('changed_at', { ascending: false })
      if (legacy.error) return { data: [], error: new Error(legacy.error.message) }
      return {
        data: ((legacy.data ?? []) as StatusReworkRecord[]).map((row) => ({
          ...row,
          qa_disposition: null,
          incr_id: null,
        })),
        error: null,
      }
    }
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data ?? []) as StatusReworkRecord[], error: null }
}

export async function countStatusReworkLog(): Promise<number> {
  const { count, error } = await supabase
    .from('status_rework_log')
    .select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}
