import type { DueDateChangeRecord } from '../types'
import { supabase } from './supabase'

export async function recordDueDateChange(input: {
  valveRowId: number
  valveId: string
  previousDueDate: string | null
  newDueDate: string | null
  reason: string
  changedByName?: string | null
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('due_date_changes').insert({
    valve_row_id: input.valveRowId,
    valve_id: input.valveId,
    previous_due_date: input.previousDueDate,
    new_due_date: input.newDueDate,
    reason: input.reason.trim(),
    changed_by_name: input.changedByName?.trim() || null,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function fetchDueDateChanges(
  startDate: string,
  endDate: string,
): Promise<{ data: DueDateChangeRecord[]; error: Error | null }> {
  // Use date-only bounds so the selected calendar days are fully included regardless of timezone.
  const { data, error } = await supabase
    .from('due_date_changes')
    .select('id,valve_row_id,valve_id,previous_due_date,new_due_date,reason,changed_by_name,changed_at')
    .gte('changed_at', `${startDate}T00:00:00`)
    .lte('changed_at', `${endDate}T23:59:59.999`)
    .order('changed_at', { ascending: false })

  if (error) return { data: [], error: new Error(error.message) }
  return { data: (data ?? []) as DueDateChangeRecord[], error: null }
}

export async function countDueDateChanges(): Promise<number> {
  const { count, error } = await supabase
    .from('due_date_changes')
    .select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

export async function resolveChangedByName(fallback = 'Unknown'): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return fallback
  return (
    (user.user_metadata?.name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email ||
    fallback
  )
}
