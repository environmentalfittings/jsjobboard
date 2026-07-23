import { statusesForDepartments } from '../constants/priorityDepartments'
import { supabase } from './supabase'
import type { Valve } from '../types'

export type YesterdayClosedJob = {
  valve_id: string
  customer: string | null
  cell: string | null
  status: string | null
  date_closed: string
}

export type YesterdayStatusMove = {
  valve_id: string
  customer: string | null
  fromStatus: string
  toStatus: string
  changedAt: string
}

/** Local calendar date YYYY-MM-DD for yesterday. */
export function localYesterdayDateString(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Inclusive start / exclusive end ISO bounds for local yesterday. */
export function localYesterdayBounds(now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function statusFromJson(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return ''
  const status = row.status
  return typeof status === 'string' ? status.trim() : ''
}

function customerFromJson(row: Record<string, unknown> | null | undefined): string | null {
  if (!row || typeof row !== 'object') return null
  const customer = row.customer
  return typeof customer === 'string' && customer.trim() ? customer.trim() : null
}

function valveIdFromJson(
  valveRowId: string | null | undefined,
  row: Record<string, unknown> | null | undefined,
): string {
  if (valveRowId?.trim()) return valveRowId.trim()
  if (!row || typeof row !== 'object') return ''
  const id = row.valve_id
  return typeof id === 'string' ? id.trim() : ''
}

/**
 * Jobs closed yesterday whose closing status belongs to the selected departments.
 * Prefer matching `status` at close time; fall back to order_type Completed / Junked / Replaced.
 */
export function filterClosedYesterday(
  valves: Valve[],
  departmentIds: readonly string[],
  yesterdayDate = localYesterdayDateString(),
): YesterdayClosedJob[] {
  const statusSet = new Set(statusesForDepartments(departmentIds))
  if (!statusSet.size) return []

  return valves
    .filter((v) => {
      const closed = (v.date_closed ?? '').trim().slice(0, 10)
      if (closed !== yesterdayDate) return false
      const status = (v.status ?? '').trim()
      if (statusSet.has(status)) return true
      // Completed department often uses order_type while shop status may linger.
      if (statusSet.has('Completed') && (v.order_type === 'Completed' || status === 'Completed')) {
        return true
      }
      return false
    })
    .map((v) => ({
      valve_id: v.valve_id,
      customer: v.customer,
      cell: v.cell,
      status: v.status,
      date_closed: (v.date_closed ?? '').trim().slice(0, 10),
    }))
    .sort((a, b) => a.valve_id.localeCompare(b.valve_id))
}

type ChangeLogRow = {
  valve_id: number | null
  valve_row_id: string | null
  changed_at: string
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
}

/**
 * Status changes that happened yesterday where from or to status is in the selected departments.
 */
export async function loadYesterdayStatusMoves(
  departmentIds: readonly string[],
  valvesByWo: Map<string, Valve>,
  now = new Date(),
): Promise<{ moves: YesterdayStatusMove[]; error: string | null }> {
  const statusSet = new Set(statusesForDepartments(departmentIds))
  if (!statusSet.size) return { moves: [], error: null }

  const { startIso, endIso } = localYesterdayBounds(now)
  const { data, error } = await supabase
    .from('valve_change_log')
    .select('valve_id,valve_row_id,changed_at,old_row,new_row')
    .eq('action', 'update')
    .gte('changed_at', startIso)
    .lt('changed_at', endIso)
    .order('changed_at', { ascending: true })

  if (error) return { moves: [], error: error.message }

  const moves: YesterdayStatusMove[] = []
  for (const raw of (data ?? []) as ChangeLogRow[]) {
    const fromStatus = statusFromJson(raw.old_row)
    const toStatus = statusFromJson(raw.new_row)
    if (!fromStatus && !toStatus) continue
    if (fromStatus === toStatus) continue
    if (!statusSet.has(fromStatus) && !statusSet.has(toStatus)) continue

    const wo = valveIdFromJson(raw.valve_row_id, raw.new_row ?? raw.old_row)
    if (!wo) continue
    const valve = valvesByWo.get(wo)
    moves.push({
      valve_id: wo,
      customer: valve?.customer ?? customerFromJson(raw.new_row) ?? customerFromJson(raw.old_row),
      fromStatus: fromStatus || '—',
      toStatus: toStatus || '—',
      changedAt: raw.changed_at,
    })
  }

  return { moves, error: null }
}
