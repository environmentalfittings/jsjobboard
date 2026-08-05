import { isActiveShopWork } from './jobDisplayStatus'
import { countsAgainstOnTimeDelivery, isOnHoldForMetrics } from './onTimeDelivery'
import type { Valve } from '../types'

function dueDateIso(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function localTodayDateString(now = new Date()): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function localTodayBounds(now = new Date()): { startIso: string; endIso: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function isValveOverdue(valve: Valve, todayIso = localTodayDateString()): boolean {
  const due = dueDateIso(valve.due_date)
  return Boolean(due && due < todayIso)
}

export type LateJobRow = {
  valve_id: string
  valveRowId: number
  customer: string | null
  status: string
  cell: string | null
  due_date: string
}

export function lateJobsInShop(valves: Valve[], todayIso = localTodayDateString()): LateJobRow[] {
  return valves
    .filter(
      (v) =>
        isActiveShopWork(v) &&
        countsAgainstOnTimeDelivery(v) &&
        isValveOverdue(v, todayIso),
    )
    .map((v) => ({
      valve_id: v.valve_id,
      valveRowId: v.id,
      customer: v.customer,
      status: v.status,
      cell: v.cell,
      due_date: dueDateIso(v.due_date) ?? '',
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.valve_id.localeCompare(b.valve_id))
}

/** Past-due open jobs that are on hold (excluded from lateJobsInShop / OTD). */
export function overdueOnHoldInShop(valves: Valve[], todayIso = localTodayDateString()): LateJobRow[] {
  return valves
    .filter((v) => isActiveShopWork(v) && isOnHoldForMetrics(v) && isValveOverdue(v, todayIso))
    .map((v) => ({
      valve_id: v.valve_id,
      valveRowId: v.id,
      customer: v.customer,
      status: v.status,
      cell: v.cell,
      due_date: dueDateIso(v.due_date) ?? '',
    }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.valve_id.localeCompare(b.valve_id))
}

export type StatusMoveRow = {
  valve_id: string
  customer: string | null
  fromStatus: string
  toStatus: string
  changedAt: string
  changedBy: string
}

export type MoverLeaderboardRow = {
  name: string
  moveCount: number
}

function statusFromJson(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return ''
  return typeof row.status === 'string' ? row.status.trim() : ''
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
  return typeof row.valve_id === 'string' ? row.valve_id.trim() : ''
}

export function parseStatusMovesFromChangeLog(
  rows: Array<{
    valve_row_id: string | null
    changed_at: string
    changed_by_email: string | null
    old_row: Record<string, unknown> | null
    new_row: Record<string, unknown> | null
  }>,
  valvesByWo: Map<string, Valve>,
): { moves: StatusMoveRow[]; leaderboard: MoverLeaderboardRow[] } {
  const moves: StatusMoveRow[] = []
  const counts = new Map<string, number>()

  for (const raw of rows) {
    const fromStatus = statusFromJson(raw.old_row)
    const toStatus = statusFromJson(raw.new_row)
    if (!fromStatus && !toStatus) continue
    if (fromStatus === toStatus) continue

    const wo = valveIdFromJson(raw.valve_row_id, raw.new_row ?? raw.old_row)
    if (!wo) continue
    const valve = valvesByWo.get(wo)
    const changedBy = (raw.changed_by_email ?? '').trim() || 'Unknown'
    counts.set(changedBy, (counts.get(changedBy) ?? 0) + 1)
    moves.push({
      valve_id: wo,
      customer: valve?.customer ?? customerFromJson(raw.new_row) ?? customerFromJson(raw.old_row),
      fromStatus: fromStatus || '—',
      toStatus: toStatus || '—',
      changedAt: raw.changed_at,
      changedBy,
    })
  }

  const leaderboard = [...counts.entries()]
    .map(([name, moveCount]) => ({ name, moveCount }))
    .sort((a, b) => b.moveCount - a.moveCount || a.name.localeCompare(b.name))

  return { moves, leaderboard }
}

/** Most recent status-enter time per WO from change log (for dwell in current status). */
export function latestStatusEnteredAtByWo(
  rows: Array<{
    valve_row_id: string | null
    changed_at: string
    old_row: Record<string, unknown> | null
    new_row: Record<string, unknown> | null
  }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of rows) {
    const fromStatus = statusFromJson(raw.old_row)
    const toStatus = statusFromJson(raw.new_row)
    if (fromStatus === toStatus) continue
    const wo = valveIdFromJson(raw.valve_row_id, raw.new_row ?? raw.old_row)
    if (!wo) continue
    const prev = map.get(wo)
    if (!prev || raw.changed_at > prev) map.set(wo, raw.changed_at)
  }
  return map
}

export function formatDurationSince(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return '—'
  const ms = Math.max(0, now.getTime() - then.getTime())
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days >= 2) return `${days}d`
  if (hours >= 24) return `${days}d ${hours % 24}h`
  if (hours >= 1) return `${hours}h`
  const mins = Math.floor(ms / (1000 * 60))
  return mins <= 1 ? '<1h' : `${mins}m`
}
