const STORAGE_KEY = 'js-customer-inventory-monthly-report-cleared'

/** Calendar month key used for the dashboard reminder, e.g. "2026-08". */
export function inventoryMonthlyReportPeriodKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function currentInventoryMonthlyReportLabel(date = new Date()): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/**
 * Reminder becomes due on the 1st of each month and stays visible until cleared
 * for that month (so it is not missed if nobody opens the app on day 1).
 */
export function isInventoryMonthlyReportAlertVisible(date = new Date()): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== inventoryMonthlyReportPeriodKey(date)
  } catch {
    return true
  }
}

export function clearInventoryMonthlyReportAlert(date = new Date()): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, inventoryMonthlyReportPeriodKey(date))
  } catch {
    // Ignore quota / private-mode failures; alert may reappear this session.
  }
}
