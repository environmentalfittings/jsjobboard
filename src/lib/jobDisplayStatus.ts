import type { Valve } from '../types'
import { DONE_STATUSES } from '../constants/statuses'

const ACTIVE_ORDER_TYPES = new Set(['In-Process Order', 'On-Hold', 'Waiting on Arrival'])

/** Shop-facing status label (order type wins over legacy shop status on closed rows). */
export function displayJobStatus(valve: Valve | null | undefined): string {
  if (!valve) return '-'
  if (valve.order_type === 'Completed') return 'Completed'
  if (valve.order_type === 'On-Hold') return 'On Hold'
  if (valve.order_type === 'Waiting on Arrival') return 'Waiting on Arrival'
  return valve.status
}

export function isActiveOrderType(orderType: string | null | undefined): boolean {
  return Boolean(orderType && ACTIVE_ORDER_TYPES.has(orderType))
}

export function isClosedWorkOrder(valve: Valve): boolean {
  return valve.order_type === 'Completed'
}

/** Completed work that actually reached a done shop status (excludes bulk-repair data artifacts). */
export function isCompletedForMetrics(valve: Valve): boolean {
  return isClosedWorkOrder(valve) && DONE_STATUSES.has(valve.status)
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
