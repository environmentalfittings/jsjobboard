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

async function enrichReworkRowsWithIncrs(rows: StatusReworkRecord[]): Promise<StatusReworkRecord[]> {
  const missingLinkIds = rows
    .filter((row) => row.qa_disposition !== 'na' && (row.qa_disposition !== 'incr' || row.incr_id == null))
    .map((row) => row.id)
  if (missingLinkIds.length === 0) return rows

  const { data, error } = await supabase
    .from('quality_incrs')
    .select('id,rework_log_id')
    .in('rework_log_id', missingLinkIds)
  if (error || !data?.length) return rows

  const incrByReworkId = new Map<number, number>()
  for (const raw of data) {
    const reworkId = Number((raw as { rework_log_id?: unknown }).rework_log_id)
    const incrId = Number((raw as { id?: unknown }).id)
    if (!Number.isFinite(reworkId) || !Number.isFinite(incrId)) continue
    if (!incrByReworkId.has(reworkId)) incrByReworkId.set(reworkId, incrId)
  }

  return rows.map((row) => {
    const incrId = incrByReworkId.get(row.id)
    if (!incrId) return row
    return {
      ...row,
      qa_disposition: 'incr',
      incr_id: incrId,
    }
  })
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
      const mapped = ((legacy.data ?? []) as StatusReworkRecord[]).map((row) => ({
        ...row,
        qa_disposition: null as StatusReworkRecord['qa_disposition'],
        incr_id: null as number | null,
      }))
      return { data: await enrichReworkRowsWithIncrs(mapped), error: null }
    }
    return { data: [], error: new Error(error.message) }
  }
  return {
    data: await enrichReworkRowsWithIncrs((data ?? []) as StatusReworkRecord[]),
    error: null,
  }
}

export async function countStatusReworkLog(): Promise<number> {
  const { count, error } = await supabase
    .from('status_rework_log')
    .select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

/** Count rework / backward moves for a local calendar day range (inclusive YYYY-MM-DD). */
export async function countStatusReworkLogInRange(
  startDate: string,
  endDate: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('status_rework_log')
    .select('id', { count: 'exact', head: true })
    .gte('changed_at', `${startDate}T00:00:00`)
    .lte('changed_at', `${endDate}T23:59:59.999`)
  if (error) return 0
  return count ?? 0
}

async function updateReworkQaDisposition(
  reworkLogId: number,
  patch: { qa_disposition: 'na' | 'incr' | null; incr_id: number | null },
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('status_rework_log')
    .update(patch)
    .eq('id', reworkLogId)
    .select('id,qa_disposition,incr_id')
    .maybeSingle()

  if (error) {
    if (/qa_disposition|incr_id|schema cache|column/i.test(error.message)) {
      return {
        error:
          'Run supabase/migration-status-rework-log-qa-update.sql in Supabase SQL Editor (adds QA columns + update permission).',
      }
    }
    if (/policy|permission|rls|row-level/i.test(error.message)) {
      return {
        error:
          'Cannot update rework QA follow-up. Run supabase/migration-status-rework-log-qa-update.sql in Supabase SQL Editor.',
      }
    }
    return { error: error.message }
  }

  if (!data) {
    return {
      error:
        'Rework QA follow-up did not save. Run supabase/migration-status-rework-log-qa-update.sql in Supabase SQL Editor (update permission).',
    }
  }

  return { error: null }
}

export async function markReworkDispositionNa(
  reworkLogId: number,
): Promise<{ error: string | null }> {
  return updateReworkQaDisposition(reworkLogId, { qa_disposition: 'na', incr_id: null })
}

/** Clear NA/INCR disposition so the row can be actioned again. */
export async function clearReworkQaDisposition(
  reworkLogId: number,
): Promise<{ error: string | null }> {
  return updateReworkQaDisposition(reworkLogId, { qa_disposition: null, incr_id: null })
}
