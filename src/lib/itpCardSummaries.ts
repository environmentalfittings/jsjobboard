import { supabase } from './supabase'
import { extractLibraryPlanFromItpData } from './valveItpStorage'
import { execStats, type ItpQcReviewStatus } from '../types/itpLibraryPlan'

export type ItpCardSummary = {
  valveRowId: number
  total: number
  done: number
  flagged: number
  open: number
  pct: number
  qcStatus: ItpQcReviewStatus
}

export type ItpCardBarTone = 'empty' | 'progress' | 'complete' | 'flagged' | 'review' | 'accepted'

function normalizeQcStatus(value: unknown): ItpQcReviewStatus {
  if (value === 'pending_review' || value === 'accepted' || value === 'draft') return value
  return 'draft'
}

function summaryFromRow(valveRowId: number, itpData: unknown): ItpCardSummary | null {
  const plan = extractLibraryPlanFromItpData(itpData)
  if (!plan) return null
  try {
    const stats = execStats({
      ...plan,
      sel: plan.sel ?? {},
      exec: plan.exec ?? {},
      custom: plan.custom ?? [],
    })
    return {
      valveRowId,
      total: stats.total,
      done: stats.done,
      flagged: stats.flagged,
      open: stats.open,
      pct: stats.pct,
      qcStatus: normalizeQcStatus(plan.qcReview?.status),
    }
  } catch {
    return null
  }
}

export function itpCardBarTone(summary: ItpCardSummary | null | undefined): ItpCardBarTone {
  if (!summary || summary.total === 0) return 'empty'
  if (summary.flagged > 0) return 'flagged'
  if (summary.qcStatus === 'accepted') return 'accepted'
  if (summary.qcStatus === 'pending_review') return 'review'
  if (summary.pct >= 100) return 'complete'
  return 'progress'
}

export function formatItpCardStatus(summary: ItpCardSummary | null | undefined): {
  pct: number
  label: string
  meta: string
  title: string
} {
  if (!summary) {
    return {
      pct: 0,
      label: 'ITP',
      meta: 'Not started',
      title: 'No Inspection & Test Plan yet',
    }
  }
  if (summary.total === 0) {
    return {
      pct: 0,
      label: 'ITP',
      meta: 'No scope',
      title: 'ITP exists but has no scope items',
    }
  }

  const counts = `${summary.done}/${summary.total}`
  if (summary.flagged > 0) {
    return {
      pct: summary.pct,
      label: `ITP ${summary.pct}%`,
      meta: `⚑ ${summary.flagged} flagged`,
      title: `ITP ${summary.pct}% complete · ${counts} items · ${summary.flagged} flagged`,
    }
  }
  if (summary.qcStatus === 'accepted') {
    return {
      pct: summary.pct,
      label: `ITP ${summary.pct}%`,
      meta: 'Accepted',
      title: `ITP accepted · ${counts} items complete`,
    }
  }
  if (summary.qcStatus === 'pending_review') {
    return {
      pct: summary.pct,
      label: `ITP ${summary.pct}%`,
      meta: 'Pending review',
      title: `ITP pending Quality Team review · ${counts} items`,
    }
  }
  if (summary.pct >= 100) {
    return {
      pct: 100,
      label: 'ITP 100%',
      meta: 'Complete',
      title: `ITP complete · ${counts} items`,
    }
  }
  return {
    pct: summary.pct,
    label: `ITP ${summary.pct}%`,
    meta: counts,
    title: `ITP ${summary.pct}% complete · ${counts} items`,
  }
}

/** Board-wide ITP completion keyed by valve_row_id. Silent if table missing. */
export async function loadItpCardSummaries(
  valveRowIds?: number[],
): Promise<Record<number, ItpCardSummary>> {
  const out: Record<number, ItpCardSummary> = {}
  const ids = [...new Set((valveRowIds ?? []).filter((id) => Number.isFinite(id)))]
  if (valveRowIds && ids.length === 0) return out

  const ingest = (rows: Array<{ valve_row_id: unknown; itp_data: unknown }> | null) => {
    for (const row of rows ?? []) {
      const valveRowId = Number(row.valve_row_id)
      if (!Number.isFinite(valveRowId)) continue
      const summary = summaryFromRow(valveRowId, row.itp_data)
      if (summary) out[valveRowId] = summary
    }
  }

  if (ids.length > 0) {
    const chunkSize = 150
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const { data, error } = await supabase
        .from('valve_itp')
        .select('valve_row_id,itp_data')
        .in('valve_row_id', chunk)
      if (error) return out
      ingest(data as Array<{ valve_row_id: unknown; itp_data: unknown }> | null)
    }
    return out
  }

  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('valve_itp')
      .select('valve_row_id,itp_data')
      .range(from, to)
    if (error) return out
    const batch = (data as Array<{ valve_row_id: unknown; itp_data: unknown }> | null) ?? []
    ingest(batch)
    if (batch.length < pageSize) break
  }
  return out
}
