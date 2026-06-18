import type { Valve } from '../types'
import { completionDateForValve, displayJobStatus, isClosedWorkOrder } from './jobDisplayStatus'

/** KPI cards — matches Excel Dashboard sheet on the Valve Status workbook. */
export function calcDashboardKpis(valves: Valve[]) {
  const inProcess = valves.filter((v) => v.order_type === 'In-Process Order').length
  const onHold = valves.filter((v) => v.order_type === 'On-Hold').length
  const waitingOnArrival = valves.filter((v) => v.order_type === 'Waiting on Arrival').length
  const onOrder = inProcess + onHold + waitingOnArrival
  return { inProcess, onHold, waitingOnArrival, onOrder }
}

/** Active jobs by finish cell (In-Process Order only). */
export function calcActiveJobsByCell(valves: Valve[], limit = 6) {
  const counts = new Map<string, number>()
  valves.forEach((v) => {
    if (v.order_type !== 'In-Process Order') return
    if (!v.cell) return
    counts.set(v.cell, (counts.get(v.cell) ?? 0) + 1)
  })
  return [...counts.entries()]
    .map(([cell, count]) => ({ cell, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** Shop status counts for open work orders (excludes closed Completed order type). */
export function calcActiveStatusBreakdown(valves: Valve[]) {
  const counts = new Map<string, number>()
  valves.forEach((v) => {
    if (isClosedWorkOrder(v)) return
    const status = displayJobStatus(v)
    if (status === 'Completed') return
    counts.set(status, (counts.get(status) ?? 0) + 1)
  })
  const rows = [...counts.entries()]
    .map(([status, count]) => ({
      status,
      label: status === 'Warehouse RTS' ? 'Ready to Ship' : status,
      count,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return { rows, maxCount: rows[0]?.count ?? 1 }
}

export function calcCompletedMetrics(valves: Valve[], now = new Date()) {
  const month = now.getMonth()
  const year = now.getFullYear()
  const lastYear = year - 1

  let monthCount = 0
  let yearCount = 0
  let lastYearCount = 0

  valves.forEach((v) => {
    if (!isClosedWorkOrder(v)) return
    const closed = completionDateForValve(v)
    if (!closed) return
    if (closed.getFullYear() === year) {
      yearCount += 1
      if (closed.getMonth() === month) monthCount += 1
    } else if (closed.getFullYear() === lastYear) {
      lastYearCount += 1
    }
  })

  return { monthCount, yearCount, lastYearCount }
}

export type CompletedMonthBar = {
  key: string
  label: string
  count: number
  isCurrentMonth: boolean
}

/** Closed jobs grouped by `date_closed` month (last N months, oldest → newest). */
export function calcCompletedMonthlyBars(valves: Valve[], now = new Date(), monthCount = 12) {
  const counts = new Map<string, number>()
  valves.forEach((v) => {
    if (!isClosedWorkOrder(v)) return
    const closed = completionDateForValve(v)
    if (!closed) return
    const key = `${closed.getFullYear()}-${String(closed.getMonth() + 1).padStart(2, '0')}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const bars: CompletedMonthBar[] = []
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
    bars.push({
      key,
      label: monthDate.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      count: counts.get(key) ?? 0,
      isCurrentMonth: key === currentKey,
    })
  }

  const maxCount = bars.reduce((max, bar) => Math.max(max, bar.count), 0)
  return { bars, maxCount: maxCount || 1 }
}
