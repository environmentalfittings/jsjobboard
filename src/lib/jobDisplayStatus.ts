import type { Valve } from '../types'

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

export function completionDateForValve(valve: Valve): Date | null {
  const raw = valve.date_closed
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
