import type { Valve } from '../types'

/** Fields to update when changing a valve's shop status. */
export function valveStatusPatch(nextStatus: string): Partial<Valve> {
  const today = new Date().toISOString().slice(0, 10)
  const patch: Partial<Valve> = { status: nextStatus }
  if (nextStatus === 'Testing') patch.date_tested = today
  if (nextStatus === 'Completed' || nextStatus === 'Warehouse RTS') {
    patch.date_closed = today
    if (nextStatus === 'Completed') patch.order_type = 'Completed'
  }
  return patch
}
