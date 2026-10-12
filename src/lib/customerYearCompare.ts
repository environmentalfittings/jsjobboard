export type ClosedJobCustomerRow = {
  id: number
  valve_id: string
  customer: string | null
  date_closed: string | null
  organization_id?: string | null
}

export type CustomerYearCompareRow = {
  key: string
  customer: string
  yearCounts: number[]
  thisYearYtd: number
  lastYearYtd: number
  delta: number
  deltaPct: number | null
  totalInWindow: number
}

export type CustomerYearCompareTotals = {
  yearCounts: number[]
  thisYearYtd: number
  lastYearYtd: number
  delta: number
  deltaPct: number | null
  customers: number
}

function closedDay(dateClosed: string | null | undefined): string | null {
  const day = String(dateClosed ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

export function customerNameKey(customer: string | null | undefined): string {
  const trimmed = String(customer ?? '').trim()
  return trimmed || 'Unassigned'
}

/** Same month/day in `year`, clamped to that month’s last day. */
export function sameCalendarDayInYear(asOf: Date, year: number): string {
  const month = asOf.getMonth()
  const day = asOf.getDate()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const clamped = Math.min(day, lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

export function priorFullYears(thisYear: number, priorCount: number): number[] {
  const count = Math.max(1, Math.min(6, Math.floor(priorCount)))
  const years: number[] = []
  for (let year = thisYear - count; year < thisYear; year += 1) years.push(year)
  return years
}

export function formatCustomerJobDelta(row: Pick<CustomerYearCompareRow, 'delta' | 'deltaPct' | 'lastYearYtd' | 'thisYearYtd'>): {
  text: string
  tone: 'up' | 'down' | 'flat' | 'na'
} {
  if (row.lastYearYtd === 0 && row.thisYearYtd === 0) return { text: '—', tone: 'na' }
  if (row.lastYearYtd === 0 && row.thisYearYtd > 0) return { text: 'New', tone: 'up' }
  if (row.thisYearYtd === 0 && row.lastYearYtd > 0) {
    return { text: `−${row.lastYearYtd}`, tone: 'down' }
  }
  const sign = row.delta > 0 ? '+' : row.delta < 0 ? '' : ''
  const pct =
    row.deltaPct == null ? '' : ` (${row.delta > 0 ? '+' : ''}${Math.round(row.deltaPct)}%)`
  if (row.delta === 0) return { text: '0', tone: 'flat' }
  return {
    text: `${sign}${row.delta}${pct}`,
    tone: row.delta > 0 ? 'up' : 'down',
  }
}

export function aggregateCustomerYearCompare(
  rows: ClosedJobCustomerRow[],
  options: {
    years: number[]
    thisYear: number
    asOf: Date
  },
): CustomerYearCompareRow[] {
  const lastYear = options.thisYear - 1
  const thisYearEnd = sameCalendarDayInYear(options.asOf, options.thisYear)
  const lastYearEnd = sameCalendarDayInYear(options.asOf, lastYear)
  const yearIndex = new Map(options.years.map((year, index) => [year, index]))

  type Acc = {
    yearCounts: number[]
    thisYearYtd: number
    lastYearYtd: number
  }
  const byCustomer = new Map<string, Acc>()

  const ensure = (key: string): Acc => {
    const existing = byCustomer.get(key)
    if (existing) return existing
    const created: Acc = {
      yearCounts: options.years.map(() => 0),
      thisYearYtd: 0,
      lastYearYtd: 0,
    }
    byCustomer.set(key, created)
    return created
  }

  for (const row of rows) {
    const day = closedDay(row.date_closed)
    if (!day) continue
    const year = Number(day.slice(0, 4))
    if (!Number.isFinite(year)) continue
    const acc = ensure(customerNameKey(row.customer))
    const idx = yearIndex.get(year)
    if (idx != null) acc.yearCounts[idx] += 1
    if (year === options.thisYear && day <= thisYearEnd) acc.thisYearYtd += 1
    if (year === lastYear && day <= lastYearEnd) acc.lastYearYtd += 1
  }

  return [...byCustomer.entries()]
    .map(([key, acc]) => {
      const delta = acc.thisYearYtd - acc.lastYearYtd
      const totalInWindow = acc.yearCounts.reduce((sum, count) => sum + count, 0) + acc.thisYearYtd
      return {
        key,
        customer: key,
        yearCounts: acc.yearCounts,
        thisYearYtd: acc.thisYearYtd,
        lastYearYtd: acc.lastYearYtd,
        delta,
        deltaPct: acc.lastYearYtd > 0 ? (delta / acc.lastYearYtd) * 100 : null,
        totalInWindow,
      }
    })
    .filter((row) => row.totalInWindow > 0 || row.lastYearYtd > 0)
    .sort((a, b) => b.thisYearYtd - a.thisYearYtd || b.totalInWindow - a.totalInWindow || a.customer.localeCompare(b.customer))
}

export function sumCustomerYearCompare(rows: CustomerYearCompareRow[], yearCount: number): CustomerYearCompareTotals {
  const yearCounts = Array.from({ length: yearCount }, () => 0)
  let thisYearYtd = 0
  let lastYearYtd = 0
  for (const row of rows) {
    row.yearCounts.forEach((count, index) => {
      yearCounts[index] = (yearCounts[index] ?? 0) + count
    })
    thisYearYtd += row.thisYearYtd
    lastYearYtd += row.lastYearYtd
  }
  const delta = thisYearYtd - lastYearYtd
  return {
    yearCounts,
    thisYearYtd,
    lastYearYtd,
    delta,
    deltaPct: lastYearYtd > 0 ? (delta / lastYearYtd) * 100 : null,
    customers: rows.length,
  }
}

export type CustomerYearSort = 'this_year' | 'gain' | 'drop' | 'name'

export function sortCustomerYearRows(
  rows: CustomerYearCompareRow[],
  sort: CustomerYearSort,
): CustomerYearCompareRow[] {
  const copy = [...rows]
  if (sort === 'name') return copy.sort((a, b) => a.customer.localeCompare(b.customer))
  if (sort === 'gain') return copy.sort((a, b) => b.delta - a.delta || b.thisYearYtd - a.thisYearYtd || a.customer.localeCompare(b.customer))
  if (sort === 'drop') return copy.sort((a, b) => a.delta - b.delta || b.lastYearYtd - a.lastYearYtd || a.customer.localeCompare(b.customer))
  return copy.sort(
    (a, b) => b.thisYearYtd - a.thisYearYtd || b.totalInWindow - a.totalInWindow || a.customer.localeCompare(b.customer),
  )
}
