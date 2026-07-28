import type { Valve } from '../types'
import { DONE_STATUSES, TERMINAL_STATUSES } from '../constants/statuses'

const ACTIVE_ORDER_TYPES = new Set(['In-Process Order', 'On-Hold', 'Waiting on Arrival'])

/**
 * Shop-facing status label.
 * Order type Completed means the work order is closed — show Completed even if
 * shop status was left on an older phase in imported data.
 */
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

/** Closed / finished work orders — off the open board (still findable via search / Closed view). */
export function isClosedWorkOrder(valve: Valve): boolean {
  if (TERMINAL_STATUSES.has(valve.status)) return true
  if (valve.order_type === 'Completed') return true
  return false
}

/** Still on the board as open shop work. */
export function isActiveShopWork(valve: Valve): boolean {
  if (isClosedWorkOrder(valve)) return false
  if (isActiveOrderType(valve.order_type)) return true
  // Blank/legacy order type but still in an active shop phase (not RTS/Completed/etc.)
  if (valve.status && !DONE_STATUSES.has(valve.status)) return true
  return false
}

/** Completed work orders used for dashboard completion metrics. */
export function isCompletedForMetrics(valve: Valve): boolean {
  // Finished shop work only — not junked/replaced/RTS or rows left on an old shop phase.
  return valve.order_type === 'Completed' && valve.status === 'Completed'
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

/**
 * Completion month for dashboard KPIs/chart.
 * Uses the earlier of test and close dates so a bulk admin close stamp does not
 * inflate "completed this month" when the valve was tested/finished earlier.
 */
export function metricsCompletionDateForValve(valve: Valve, now = new Date()): Date | null {
  const tested = parseCalendarDate(valve.date_tested)
  const closed = parseCalendarDate(valve.date_closed)

  let candidate: Date | null = null
  if (tested && closed) {
    candidate = tested.getTime() <= closed.getTime() ? tested : closed
  } else {
    candidate = closed ?? tested
  }

  if (!candidate) return null

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  if (candidate > endOfToday) return null

  return candidate
}
