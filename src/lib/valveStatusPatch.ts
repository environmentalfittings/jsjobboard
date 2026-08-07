import { DONE_STATUSES } from '../constants/statuses'
import { isOtdPauseStatus } from './onTimeDelivery'
import type { Valve } from '../types'

type ValveStatusContext = Pick<Valve, 'status' | 'order_type' | 'date_closed'>

/** Fields to update when changing a valve's shop status. */
export function valveStatusPatch(
  nextStatus: string,
  previousValve?: ValveStatusContext | null,
): Partial<Valve> {
  const today = new Date().toISOString().slice(0, 10)
  const patch: Partial<Valve> = { status: nextStatus }

  if (nextStatus === 'Testing') {
    patch.date_tested = today
  }

  if (nextStatus === 'Completed' || nextStatus === 'Warehouse RTS') {
    patch.date_closed = today
    if (nextStatus === 'Completed') {
      patch.order_type = 'Completed'
    }
    return patch
  }

  // Keep Junked / Replaced sortable and visible in Done / closed lists.
  if (nextStatus === 'Junked' || nextStatus === 'Replaced') {
    patch.date_closed = today
    return patch
  }

  const previousStatus = previousValve?.status
  const movingFromDoneStatus =
    previousStatus != null && DONE_STATUSES.has(previousStatus) && !DONE_STATUSES.has(nextStatus)
  const reopeningCompletedOrder =
    previousValve?.order_type === 'Completed' &&
    !DONE_STATUSES.has(nextStatus) &&
    previousStatus != null &&
    previousStatus !== nextStatus

  if (movingFromDoneStatus || reopeningCompletedOrder) {
    patch.date_closed = null
    if (previousValve?.order_type === 'Completed') {
      patch.order_type = 'In-Process Order'
    }
  }

  // Leaving an OTD-pause status for active shop work — clear hold / waiting-arrival order types
  // so the job can count toward on-time delivery again after the due date is updated.
  if (
    previousStatus &&
    isOtdPauseStatus(previousStatus) &&
    !isOtdPauseStatus(nextStatus) &&
    (previousValve?.order_type === 'On-Hold' || previousValve?.order_type === 'Waiting on Arrival')
  ) {
    patch.order_type = 'In-Process Order'
  }

  return patch
}
