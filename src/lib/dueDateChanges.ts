import type { DueDateChangeRecord } from '../types'
import {
  formatDueDateChangeReason,
  type DueDateChangeDetails,
  type DueDateCustomerResponse,
} from './dueDateChangeReasons'
import { supabase } from './supabase'

const DUE_DATE_CHANGE_SELECT =
  'id,valve_row_id,valve_id,previous_due_date,new_due_date,reason,reason_code,other_text,comments,changed_by_name,changed_at,customer_notification_at,customer_response,customer_response_comment,customer_response_at,customer_response_by_name'

export async function recordDueDateChange(input: {
  valveRowId: number
  valveId: string
  previousDueDate: string | null
  newDueDate: string | null
  reason?: string
  details?: DueDateChangeDetails
  changedByName?: string | null
}): Promise<{ error: Error | null }> {
  const details = input.details
  const reason = details
    ? formatDueDateChangeReason(details.reasonCode, details.otherText, details.comments)
    : (input.reason ?? '').trim()

  if (!reason) {
    return { error: new Error('Reason is required') }
  }

  const notifiedAt = details?.customerNotified ? new Date().toISOString() : null

  const row: Record<string, unknown> = {
    valve_row_id: input.valveRowId,
    valve_id: input.valveId,
    previous_due_date: input.previousDueDate,
    new_due_date: input.newDueDate,
    reason,
    changed_by_name: input.changedByName?.trim() || null,
    customer_notification_at: notifiedAt,
  }

  if (details) {
    row.reason_code = details.reasonCode
    row.other_text = details.otherText.trim() || null
    row.comments = details.comments.trim() || null
  }

  const { error } = await supabase.from('due_date_changes').insert(row)
  if (error) {
    // Older DBs without the customer columns — fall back to legacy insert.
    if (/reason_code|other_text|comments|customer_notification/i.test(error.message)) {
      const legacy = await supabase.from('due_date_changes').insert({
        valve_row_id: input.valveRowId,
        valve_id: input.valveId,
        previous_due_date: input.previousDueDate,
        new_due_date: input.newDueDate,
        reason,
        changed_by_name: input.changedByName?.trim() || null,
      })
      if (legacy.error) return { error: new Error(legacy.error.message) }
      return { error: null }
    }
    return { error: new Error(error.message) }
  }
  return { error: null }
}

export async function fetchDueDateChanges(
  startDate: string,
  endDate: string,
): Promise<{ data: DueDateChangeRecord[]; error: Error | null }> {
  // Use date-only bounds so the selected calendar days are fully included regardless of timezone.
  const { data, error } = await supabase
    .from('due_date_changes')
    .select(DUE_DATE_CHANGE_SELECT)
    .gte('changed_at', `${startDate}T00:00:00`)
    .lte('changed_at', `${endDate}T23:59:59.999`)
    .order('changed_at', { ascending: false })

  if (error) {
    if (/reason_code|customer_notification|column/i.test(error.message)) {
      const legacy = await supabase
        .from('due_date_changes')
        .select('id,valve_row_id,valve_id,previous_due_date,new_due_date,reason,changed_by_name,changed_at')
        .gte('changed_at', `${startDate}T00:00:00`)
        .lte('changed_at', `${endDate}T23:59:59.999`)
        .order('changed_at', { ascending: false })
      if (legacy.error) return { data: [], error: new Error(legacy.error.message) }
      return { data: (legacy.data ?? []) as DueDateChangeRecord[], error: null }
    }
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data ?? []) as DueDateChangeRecord[], error: null }
}

/** Due date moves still waiting on customer Approved / Cancelled / Other. */
export async function fetchPendingCustomerDueDateChanges(): Promise<{
  data: DueDateChangeRecord[]
  error: Error | null
}> {
  const { data, error } = await supabase
    .from('due_date_changes')
    .select(DUE_DATE_CHANGE_SELECT)
    .is('customer_response', null)
    .order('changed_at', { ascending: false })
    .limit(200)

  if (error) {
    if (/customer_response|reason_code|column|schema cache/i.test(error.message)) {
      return {
        data: [],
        error: new Error(
          'Run supabase/migration-due-date-changes-customer.sql in Supabase for the customer notification queue.',
        ),
      }
    }
    return { data: [], error: new Error(error.message) }
  }
  return { data: (data ?? []) as DueDateChangeRecord[], error: null }
}

export async function recordDueDateCustomerResponse(input: {
  id: number
  response: DueDateCustomerResponse
  comment: string
  respondedByName?: string | null
}): Promise<{ error: string | null }> {
  const comment = input.comment.trim()
  if (!comment) return { error: 'Enter a comment for the customer response' }

  const { error } = await supabase
    .from('due_date_changes')
    .update({
      customer_response: input.response,
      customer_response_comment: comment,
      customer_response_at: new Date().toISOString(),
      customer_response_by_name: input.respondedByName?.trim() || null,
    })
    .eq('id', input.id)
    .is('customer_response', null)

  if (error) return { error: error.message }
  return { error: null }
}

export async function countDueDateChanges(): Promise<number> {
  const { count, error } = await supabase
    .from('due_date_changes')
    .select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

/** All logged valve row ids — used to company-scope the all-time total. */
export async function fetchDueDateChangeValveRowIds(): Promise<{ valve_row_id: number }[]> {
  const { data, error } = await supabase.from('due_date_changes').select('valve_row_id')
  if (error || !data) return []
  return data.filter((row): row is { valve_row_id: number } => typeof row.valve_row_id === 'number')
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
