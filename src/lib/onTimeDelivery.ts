type OtdEligibility = {
  status?: string | null
  order_type?: string | null
}

/**
 * Valves that should not count against on-time delivery
 * (Reports OTD, late-job KPIs, or overdue urgency).
 *
 * - Not Arrived / Waiting on Arrival — shop never received the valve
 * - On Hold / On-Hold — paused work should not hurt OTD while held
 */
export function isExcludedFromOnTimeDelivery(valve: OtdEligibility | null | undefined): boolean {
  if (!valve) return false
  const status = String(valve.status ?? '').trim()
  const orderType = String(valve.order_type ?? '').trim()
  if (status === 'Not Arrived') return true
  if (/^not\s+(arrived|received)$/i.test(status)) return true
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
