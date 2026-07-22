import type { Valve } from '../types'
import { DONE_STATUSES, TERMINAL_STATUSES } from '../constants/statuses'

const ACTIVE_ORDER_TYPES = new Set(['In-Process Order', 'On-Hold', 'Waiting on Arrival'])

/**
 * Shop-facing status label.
 * `order_type === Completed` only wins when the shop status is also done —
 * otherwise many still-in-shop jobs were hidden as "Completed".
 */
export function displayJobStatus(valve: Valve | null | undefined): string {
  if (!valve) return '-'
  if (valve.order_type === 'Completed' && DONE_STATUSES.has(valve.status)) return 'Completed'
  if (valve.order_type === 'On-Hold') return 'On Hold'
  if (valve.order_type === 'Waiting on Arrival') return 'Waiting on Arrival'
  return valve.status
}

export function isActiveOrderType(orderType: string | null | undefined): boolean {
  return Boolean(orderType && ACTIVE_ORDER_TYPES.has(orderType))
}

/** True when the job is actually finished (not just order_type stamped Completed while still in shop). */
export function isClosedWorkOrder(valve: Valve): boolean {
  if (TERMINAL_STATUSES.has(valve.status)) return true
  if (valve.order_type === 'Completed' && DONE_STATUSES.has(valve.status)) return true
  return false
}

/** Still on the board as open work (includes mis-tagged Completed + active shop status). */
export function isActiveShopWork(valve: Valve): boolean {
  if (TERMINAL_STATUSES.has(valve.status)) return false
  if (isClosedWorkOrder(valve)) return false
  if (isActiveOrderType(valve.order_type)) return true
  // order_type left as Completed while shop status is still active
  if (valve.order_type === 'Completed' && !DONE_STATUSES.has(valve.status)) return true
  return false
}

/** Completed work that actually reached a done shop status (excludes bulk-repair data artifacts). */
export function isCompletedForMetrics(valve: Valve): boolean {
  return valve.order_type === 'Completed' && DONE_STATUSES.has(valve.status)
}

export function parseCalendarDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function completionDateForValve(valve: Valve): Date | null {
  return parseCalendarDate(valve.date_closed)
}
