type OtdEligibility = {
  status?: string | null
  order_type?: string | null
}

/**
 * Shop statuses that pause OTD / late-job pressure.
 * While in these statuses, jobs do not count against on-time delivery.
 * Leaving for an active status requires updating the due (delivery) date.
 */
export const OTD_PAUSE_STATUSES = [
  'Not Arrived',
  'On Hold',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Replaced',
  'Junked',
] as const

export type OtdPauseStatus = (typeof OTD_PAUSE_STATUSES)[number]

const OTD_PAUSE_STATUS_SET = new Set<string>(OTD_PAUSE_STATUSES)

export function isOtdPauseStatus(status: string | null | undefined): boolean {
  const trimmed = String(status ?? '').trim()
  if (!trimmed) return false
  if (OTD_PAUSE_STATUS_SET.has(trimmed)) return true
  if (/^not\s+(arrived|received)$/i.test(trimmed)) return true
  if (/^on[-\s]?hold$/i.test(trimmed)) return true
  return false
}

/**
 * Valves that should not count against on-time delivery
 * (Reports OTD, late-job KPIs, or overdue urgency).
 *
 * - Not Arrived / Waiting on Arrival — shop never received the valve
 * - On Hold / Waiting on Customer / Waiting on Salesman — paused work
 * - Replaced / Junked — terminal non-delivery outcomes
 */
export function isExcludedFromOnTimeDelivery(valve: OtdEligibility | null | undefined): boolean {
  if (!valve) return false
  const status = String(valve.status ?? '').trim()
  const orderType = String(valve.order_type ?? '').trim()
  if (isOtdPauseStatus(status)) return true
  if (orderType === 'Waiting on Arrival') return true
  if (isOnHoldForMetrics(valve)) return true
  return false
}

/** Shop status On Hold or order type On-Hold. */
export function isOnHoldForMetrics(valve: OtdEligibility | null | undefined): boolean {
  if (!valve) return false
  const status = String(valve.status ?? '').trim()
  const orderType = String(valve.order_type ?? '').trim()
  if (status === 'On Hold') return true
  if (/^on[-\s]?hold$/i.test(status)) return true
  if (orderType === 'On-Hold') return true
  return false
}

/** True when due-date lateness should count toward OTD / late-job metrics. */
export function countsAgainstOnTimeDelivery(valve: OtdEligibility | null | undefined): boolean {
  return !isExcludedFromOnTimeDelivery(valve)
}

/**
 * Leaving an OTD-pause status for an active (counting) status requires a new due date
 * before the job can count toward on-time delivery again.
 */
export function requiresDueDateUpdateWhenLeavingOtdPause(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): boolean {
  const from = String(fromStatus ?? '').trim()
  const to = String(toStatus ?? '').trim()
  if (!from || !to || from === to) return false
  if (!isOtdPauseStatus(from)) return false
  if (isOtdPauseStatus(to)) return false
  return true
}

export const OTD_PAUSE_STATUS_LABEL =
  'On Hold, Waiting on Customer, Waiting on Salesman, Replaced, Junked, and Not Arrived / Waiting on Arrival'
