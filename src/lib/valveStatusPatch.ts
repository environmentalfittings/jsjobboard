import { DONE_STATUSES } from '../constants/statuses'
import type { Valve } from '../types'

type ValveStatusContext = Pick<Valve, 'order_type' | 'status'>

function orderTypeForReopenedStatus(nextStatus: string): string {
  if (nextStatus === 'On Hold') return 'On-Hold'
  if (nextStatus === 'Not Arrived') return 'Waiting on Arrival'
  return 'In-Process Order'
}

/** Fields to update when changing a valve's shop status. */
export function valveStatusPatch(nextStatus: string, current?: ValveStatusContext): Partial<Valve> {
  const today = new Date().toISOString().slice(0, 10)
  const patch: Partial<Valve> = { status: nextStatus }

  if (DONE_STATUSES.has(nextStatus)) {
    patch.date_closed = today
    if (nextStatus === 'Completed') patch.order_type = 'Completed'
    return patch
  }

  const previousStatus = current?.status ?? ''
  if (DONE_STATUSES.has(previousStatus)) {
    patch.date_closed = null
  }
  if (current?.order_type === 'Completed') {
    patch.order_type = orderTypeForReopenedStatus(nextStatus)
  }

  return patch
}
