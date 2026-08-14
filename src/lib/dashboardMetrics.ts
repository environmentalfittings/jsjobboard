import { isOnHoldForMetrics } from './onTimeDelivery'
import type { Valve } from '../types'
import { metricsCompletionDateForValve, displayJobStatus, isClosedWorkOrder, isCompletedForMetrics } from './jobDisplayStatus'
import { STATUS_ORDER } from '../constants/statuses'

/** KPI cards — matches Excel Dashboard sheet on the Valve Status workbook. */
export function calcDashboardKpis(valves: Valve[]) {
  const inProcess = valves.filter((v) => v.order_type === 'In-Process Order').length
  const onHold = valves.filter((v) => isOnHoldForMetrics(v)).length
  const waitingOnArrival = valves.filter((v) => v.order_type === 'Waiting on Arrival').length
  const onOrder = inProcess + onHold + waitingOnArrival
  return { inProcess, onHold, waitingOnArrival, onOrder }
}

/** Active jobs by finish cell (In-Process Order only). */
export function calcActiveJobsByCell(valves: Valve[], limit = 20) {
  const counts = new Map<string, number>()
  valves.forEach((v) => {
    if (v.order_type !== 'In-Process Order') return
    if (!v.cell) return
    counts.set(v.cell, (counts.get(v.cell) ?? 0) + 1)
  })

  // Always surface these cells on the dashboard even when count is 0.
  for (const cell of ['Actuation', 'Field Service']) {
    if (!counts.has(cell)) counts.set(cell, 0)
  }

  return [...counts.entries()]
    .map(([cell, count]) => ({ cell, count }))
    .sort((a, b) => b.count - a.count || a.cell.localeCompare(b.cell))
    .slice(0, limit)
}

/** Shop status counts for open work orders (excludes closed Completed order type). */
export function calcActiveStatusBreakdown(valves: Valve[]) {
  const counts = new Map<string, number>()
  // Always include configured shop statuses (e.g. Grinding) even at zero so new
  // statuses stay visible on the dashboard / priority drill-in.
  for (const status of STATUS_ORDER) {
    if (status === 'Completed') continue
    counts.set(status, 0)
  }

  valves.forEach((v) => {
    if (isClosedWorkOrder(v)) return
    const status = displayJobStatus(v)
    if (status === 'Completed') return
    counts.set(status, (counts.get(status) ?? 0) + 1)
  })

  const orderIndex = new Map<string, number>(STATUS_ORDER.map((status, index) => [status, index]))
  const rows = [...counts.entries()]
    .map(([status, count]) => ({
      status,
      label: status === 'Warehouse RTS' ? 'Ready to Ship' : status,
      count,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      const orderA = orderIndex.get(a.status) ?? 999
      const orderB = orderIndex.get(b.status) ?? 999
      if (orderA !== orderB) return orderA - orderB
      return a.label.localeCompare(b.label)
    })
  return { rows, maxCount: Math.max(1, ...rows.map((row) => row.count)) }
}

export function calcCompletedMetrics(valves: Valve[], now = new Date()) {
  const month = now.getMonth()
  const year = now.getFullYear()
  const lastYear = year - 1
  const lastDayOfSameMonthLastYear = new Date(lastYear, month + 1, 0).getDate()
  const samePeriodEndLastYear = new Date(
    lastYear,
    month,
    Math.min(now.getDate(), lastDayOfSameMonthLastYear),
    23,
    59,
    59,
    999,
  )
  const lastYearStart = new Date(lastYear, 0, 1)

  let monthCount = 0
  let yearCount = 0
  let lastYearCount = 0
  let lastYearSamePeriodCount = 0
  let missingCloseDateCount = 0

  valves.forEach((v) => {
    if (!isCompletedForMetrics(v)) return
    const closed = metricsCompletionDateForValve(v, now)
    if (!closed) {
      missingCloseDateCount += 1
      return
    }
    if (closed.getFullYear() === year) {
      yearCount += 1
      if (closed.getMonth() === month) monthCount += 1
    } else if (closed.getFullYear() === lastYear) {
      lastYearCount += 1
      if (closed >= lastYearStart && closed <= samePeriodEndLastYear) {
        lastYearSamePeriodCount += 1
      }
    }
  })

  const samePeriodLabel = `Jan 1–${now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} ${lastYear}`

  return { monthCount, yearCount, lastYearCount, lastYearSamePeriodCount, samePeriodLabel, missingCloseDateCount }
}

export type CompletedMonthBar = {
  key: string
  label: string
  count: number
  priorYearCount: number
  priorYearLabel: string
  isCurrentMonth: boolean
  delta: number
}

/** Closed jobs grouped by `date_closed` month (last N months, oldest → newest). */
export function calcCompletedMonthlyBars(valves: Valve[], now = new Date(), monthCount = 12) {
  const counts = new Map<string, number>()
  valves.forEach((v) => {
    if (!isCompletedForMetrics(v)) return
    const closed = metricsCompletionDateForValve(v, now)
    if (!closed) return
    const key = `${closed.getFullYear()}-${String(closed.getMonth() + 1).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const bars: CompletedMonthBar[] = []
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    const priorYearDate = new Date(monthDate.getFullYear() - 1, monthDate.getMonth(), 1)
    const priorYearKey = `${priorYearDate.getFullYear()}-${String(priorYearDate.getMonth() + 1).padStart(2, '0')}`
    const count = counts.get(key) ?? 0
    const priorYearCount = counts.get(priorYearKey) ?? 0
    bars.push({
      key,
      label: monthDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      count,
      priorYearCount,
      priorYearLabel: priorYearDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      isCurrentMonth: key === currentKey,
      delta: count - priorYearCount,
    })
  }

  const maxCount = bars.reduce((max, bar) => Math.max(max, bar.count, bar.priorYearCount), 0)
  return { bars, maxCount: maxCount || 1 }
}
