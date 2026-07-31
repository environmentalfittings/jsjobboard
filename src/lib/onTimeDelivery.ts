type OtdEligibility = {
  status?: string | null
  order_type?: string | null
}

/**
 * Valves the shop never received yet should not count against on-time delivery
 * (Reports OTD, late-job KPIs, or overdue urgency).
 *
 * Shop status is "Not Arrived"; order type "Waiting on Arrival" is the same idea.
 */
export function isExcludedFromOnTimeDelivery(valve: OtdEligibility | null | undefined): boolean {
  if (!valve) return false
  const status = String(valve.status ?? '').trim()
  const orderType = String(valve.order_type ?? '').trim()
  if (status === 'Not Arrived') return true
  if (/^not\s+(arrived|received)$/i.test(status)) return true
  if (orderType === 'Waiting on Arrival') return true
  return false
}

/** True when due-date lateness should count toward OTD / late-job metrics. */
export function countsAgainstOnTimeDelivery(valve: OtdEligibility | null | undefined): boolean {
  return !isExcludedFromOnTimeDelivery(valve)
}
