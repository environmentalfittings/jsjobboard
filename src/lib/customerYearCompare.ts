export type ClosedJobCustomerRow = {
  id: number
  valve_id: string
  customer: string | null
  size?: string | null
  date_closed: string | null
  organization_id?: string | null
  status?: string | null
  order_type?: string | null
}

/** How rows are rolled up in Customer jobs by year. */
export type CustomerYearGroupBy = 'customer' | 'size' | 'customer_size'

export type CustomerYearCompareRow = {
  key: string
  /** Primary label for charts / single-column views. */
  label: string
  customer: string
  /** Normalized size label; empty string when grouping by customer only. */
  size: string
  /** Other job-card spellings rolled into this row. */
  mergedFrom: string[]
  yearCounts: number[]
  thisYearYtd: number
  lastYearYtd: number
  inShop: number
  delta: number
  deltaPct: number | null
  totalInWindow: number
}

/** Normalize job-card size text for grouping (strips inch marks, collapses blanks). */
export function normalizeValveSizeLabel(raw: string | null | undefined): string {
  const text = String(raw ?? '')
    .trim()
    .replace(/["'″′]/g, '')
    .replace(/\s+/g, ' ')
  if (!text || text === '-' || text === '—' || /^n\/?a$/i.test(text)) return 'Unspecified'
  return text
}

export type CustomerYearCompareTotals = {
  yearCounts: number[]
  thisYearYtd: number
  lastYearYtd: number
  inShop: number
  delta: number
  deltaPct: number | null
  customers: number
}

/** Finished work for year columns: Completed (or leftover shop status with order type Completed). Not Junked/Replaced, not still on the board. */
export function isFinishedJobForYearCompare(row: Pick<ClosedJobCustomerRow, 'status' | 'order_type' | 'date_closed'>): boolean {
  const status = String(row.status ?? '').trim()
  if (status === 'Junked' || status === 'Replaced') return false
  if (status === 'Completed' || row.order_type === 'Completed') return true
  return row.status == null && row.order_type == null && Boolean(closedDay(row.date_closed))
}

/** Open job-board work: in process, waiting, Warehouse RTS, etc. */
export function isOpenShopJobForYearCompare(row: Pick<ClosedJobCustomerRow, 'status' | 'order_type'>): boolean {
  const status = String(row.status ?? '').trim()
  if (status === 'Completed' || status === 'Junked' || status === 'Replaced') return false
  if (row.order_type === 'Completed') return false
  const order = String(row.order_type ?? '').trim()
  if (order === 'In-Process Order' || order === 'On-Hold' || order === 'Waiting on Arrival') return true
  if (!order && status && status !== 'Warehouse RTS') return true
  return false
}

function closedDay(dateClosed: string | null | undefined): string | null {
  const day = String(dateClosed ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

const LEGAL_SUFFIX = /\b(?:inc|incorporated|llc|ltd|limited|co|company|corp|corporation)\.?$/i
const SITE_SUFFIX = /\b(?:refinery|refineries|plant|terminal|station)\.?$/i
const FILLER_SUFFIX =
  /\b(?:solutions|services|integrated|holdings|group|generating|generation|power|energy)\.?$/i
const STATE_SUFFIX =
  /\b(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\.?$/i

function collapseNameTokens(value: string): string {
  return value
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTrailingPattern(value: string, pattern: RegExp): string {
  let next = value
  for (let i = 0; i < 4; i += 1) {
    const stripped = next.replace(pattern, '').replace(/\s+/g, ' ').trim()
    if (stripped === next) break
    next = stripped
  }
  return next
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i]
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[n] ?? Math.max(a.length, b.length)
}

function compactGroupKey(key: string): string {
  return key.replace(/ /g, '')
}

function numberSignature(key: string): string {
  return (key.match(/\b\d+\b/g) ?? []).join(',')
}

export function keysShouldMerge(a: string, b: string): boolean {
  if (a === b) return true
  if (compactGroupKey(a) === compactGroupKey(b)) return true
  if (numberSignature(a) !== numberSignature(b)) return false
  return levenshtein(a, b) <= 1
}

/** Collapse near-duplicate group keys (typos) to one representative. */
export function clusterCustomerGroupKeys(keys: string[]): Map<string, string> {
  const unique = [...new Set(keys.filter(Boolean))]
  const parent = new Map(unique.map((key) => [key, key]))
  const find = (key: string): string => {
    const next = parent.get(key) ?? key
    if (next !== key) {
      const root = find(next)
      parent.set(key, root)
      return root
    }
    return key
  }
  const union = (left: string, right: string) => {
    const a = find(left)
    const b = find(right)
    if (a === b) return
    const keep = a.length <= b.length ? a : b
    parent.set(keep === a ? b : a, keep)
  }
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (keysShouldMerge(unique[i], unique[j])) union(unique[i], unique[j])
    }
  }
  return new Map(unique.map((key) => [key, find(key)]))
}

/**
 * Group similar job-card customer spellings: punctuation, Inc/LLC, trailing
 * Refinery/Plant, P66 vs Phillips 66, OKC vs Oklahoma City, and one-letter typos.
 */
export function customerGroupKey(customer: string | null | undefined): string {
  let text = String(customer ?? '').trim().toLowerCase()
  if (!text) return 'unassigned'
  text = text.replace(/\([^)]*\)/g, ' ')
  text = collapseNameTokens(text)
  text = text.replace(/\bphillips?\s*66\b/g, 'p66')
  text = text.replace(/\bp\s+66\b/g, 'p66')
  text = text.replace(/\bokc\b/g, 'oklahoma city')
  text = text.replace(/\bwfec\b/g, 'western farmers')
  text = text.replace(/\bwestern farmers electric\b/g, 'western farmers')
  text = text.replace(/\bstattion\b/g, 'station')
  text = text.replace(/\bpipeine\b/g, 'pipeline')
  text = text.replace(/\boolohgah\b/g, 'oologah')
  text = text.replace(/\bharford\b/g, 'hartford')
  text = text.replace(/\bmoreland\b/g, 'mooreland')
  text = text.replace(/\bvales sales\b/g, 'valve sales')
  text = text.replace(/\bvarleo\b/g, 'valero')
  text = stripTrailingPattern(text, LEGAL_SUFFIX)
  text = stripTrailingPattern(text, SITE_SUFFIX)
  text = stripTrailingPattern(text, FILLER_SUFFIX)
  text = stripTrailingPattern(text, STATE_SUFFIX)
  return text || 'unassigned'
}

export function customerNameKey(customer: string | null | undefined): string {
  return customerGroupKey(customer)
}

export function pickCustomerDisplayName(
  variants: Map<string, number> | Record<string, number>,
  canonicalNames: string[] = [],
): string {
  const counts =
    variants instanceof Map ? variants : new Map(Object.entries(variants).map(([name, count]) => [name, count]))
  const names = [...counts.keys()].filter((name) => name.trim())
  if (names.length === 0) return 'Unassigned'

  const variantKeys = new Set(names.map((name) => customerGroupKey(name)))
  const canonical = canonicalNames.find((name) => {
    const key = customerGroupKey(name)
    return variantKeys.has(key) || [...variantKeys].some((variant) => keysShouldMerge(variant, key))
  })
  if (canonical?.trim()) return canonical.trim()

  names.sort((a, b) => {
    const countDiff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    if (countDiff) return countDiff
    const paren = Number(/[()]/.test(a)) - Number(/[()]/.test(b))
    if (paren) return paren
    return b.length - a.length || a.localeCompare(b)
  })
  return names[0] ?? 'Unassigned'
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
    canonicalNames?: string[]
    openRows?: ClosedJobCustomerRow[]
    groupBy?: CustomerYearGroupBy
  },
): CustomerYearCompareRow[] {
  const groupBy = options.groupBy ?? 'customer'
  const lastYear = options.thisYear - 1
  const thisYearEnd = sameCalendarDayInYear(options.asOf, options.thisYear)
  const lastYearEnd = sameCalendarDayInYear(options.asOf, lastYear)
  const yearIndex = new Map(options.years.map((year, index) => [year, index]))
  const canonicalNames = options.canonicalNames ?? []

  type Acc = {
    yearCounts: number[]
    thisYearYtd: number
    lastYearYtd: number
    inShop: number
    variants: Map<string, number>
    sizeLabel: string
    customerKey: string
  }
  const byGroup = new Map<string, Acc>()

  const ensure = (key: string, sizeLabel: string, customerKey: string): Acc => {
    const existing = byGroup.get(key)
    if (existing) return existing
    const created: Acc = {
      yearCounts: options.years.map(() => 0),
      thisYearYtd: 0,
      lastYearYtd: 0,
      inShop: 0,
      variants: new Map(),
      sizeLabel,
      customerKey,
    }
    byGroup.set(key, created)
    return created
  }

  const tagged: Array<{
    day: string
    year: number
    label: string
    customerKey: string
    sizeLabel: string
  }> = []
  for (const row of rows) {
    if (!isFinishedJobForYearCompare(row)) continue
    const day = closedDay(row.date_closed)
    if (!day) continue
    const year = Number(day.slice(0, 4))
    if (!Number.isFinite(year)) continue
    const label = String(row.customer ?? '').trim() || 'Unassigned'
    tagged.push({
      day,
      year,
      label,
      customerKey: customerGroupKey(label),
      sizeLabel: normalizeValveSizeLabel(row.size),
    })
  }

  const taggedOpen: Array<{ label: string; customerKey: string; sizeLabel: string }> = []
  for (const row of options.openRows ?? []) {
    if (!isOpenShopJobForYearCompare(row)) continue
    const label = String(row.customer ?? '').trim() || 'Unassigned'
    taggedOpen.push({
      label,
      customerKey: customerGroupKey(label),
      sizeLabel: normalizeValveSizeLabel(row.size),
    })
  }

  const clusters = clusterCustomerGroupKeys([
    ...tagged.map((item) => item.customerKey),
    ...taggedOpen.map((item) => item.customerKey),
  ])

  const resolveGroupKey = (customerKey: string, sizeLabel: string) => {
    const clustered = clusters.get(customerKey) ?? customerKey
    if (groupBy === 'size') return `size:${sizeLabel.toLowerCase()}`
    if (groupBy === 'customer_size') return `customer_size:${clustered}|${sizeLabel.toLowerCase()}`
    return clustered
  }

  for (const item of tagged) {
    const customerKey = clusters.get(item.customerKey) ?? item.customerKey
    const key = resolveGroupKey(item.customerKey, item.sizeLabel)
    const acc = ensure(key, item.sizeLabel, customerKey)
    acc.variants.set(item.label, (acc.variants.get(item.label) ?? 0) + 1)
    const idx = yearIndex.get(item.year)
    if (idx != null) acc.yearCounts[idx] += 1
    if (item.year === options.thisYear && item.day <= thisYearEnd) acc.thisYearYtd += 1
    if (item.year === lastYear && item.day <= lastYearEnd) acc.lastYearYtd += 1
  }

  for (const item of taggedOpen) {
    const customerKey = clusters.get(item.customerKey) ?? item.customerKey
    const key = resolveGroupKey(item.customerKey, item.sizeLabel)
    const acc = ensure(key, item.sizeLabel, customerKey)
    acc.variants.set(item.label, (acc.variants.get(item.label) ?? 0) + 1)
    acc.inShop += 1
  }

  return [...byGroup.entries()]
    .map(([key, acc]) => {
      const delta = acc.thisYearYtd - acc.lastYearYtd
      const totalInWindow = acc.yearCounts.reduce((sum, count) => sum + count, 0) + acc.thisYearYtd
      const mergedFrom = [...acc.variants.keys()].sort((a, b) => a.localeCompare(b))
      const customer =
        groupBy === 'size' ? 'All customers' : pickCustomerDisplayName(acc.variants, canonicalNames)
      const size = groupBy === 'customer' ? '' : acc.sizeLabel
      const label =
        groupBy === 'size'
          ? acc.sizeLabel
          : groupBy === 'customer_size'
            ? `${customer} · ${acc.sizeLabel}`
            : customer
      return {
        key,
        label,
        customer,
        size,
        mergedFrom,
        yearCounts: acc.yearCounts,
        thisYearYtd: acc.thisYearYtd,
        lastYearYtd: acc.lastYearYtd,
        inShop: acc.inShop,
        delta,
        deltaPct: acc.lastYearYtd > 0 ? (delta / acc.lastYearYtd) * 100 : null,
        totalInWindow,
      }
    })
    .filter((row) => row.totalInWindow > 0 || row.lastYearYtd > 0 || row.inShop > 0)
    .sort(
      (a, b) =>
        b.thisYearYtd - a.thisYearYtd ||
        b.inShop - a.inShop ||
        b.totalInWindow - a.totalInWindow ||
        a.label.localeCompare(b.label),
    )
}

export function sumCustomerYearCompare(rows: CustomerYearCompareRow[], yearCount: number): CustomerYearCompareTotals {
  const yearCounts = Array.from({ length: yearCount }, () => 0)
  let thisYearYtd = 0
  let lastYearYtd = 0
  let inShop = 0
  for (const row of rows) {
    row.yearCounts.forEach((count, index) => {
      yearCounts[index] = (yearCounts[index] ?? 0) + count
    })
    thisYearYtd += row.thisYearYtd
    lastYearYtd += row.lastYearYtd
    inShop += row.inShop
  }
  const delta = thisYearYtd - lastYearYtd
  return {
    yearCounts,
    thisYearYtd,
    lastYearYtd,
    inShop,
    delta,
    deltaPct: lastYearYtd > 0 ? (delta / lastYearYtd) * 100 : null,
    customers: rows.length,
  }
}

export type CustomerYearSort = 'this_year' | 'in_shop' | 'gain' | 'drop' | 'name' | 'name_desc'

export function sortCustomerYearRows(
  rows: CustomerYearCompareRow[],
  sort: CustomerYearSort,
): CustomerYearCompareRow[] {
  const copy = [...rows]
  if (sort === 'name') return copy.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  if (sort === 'name_desc') {
    return copy.sort((a, b) => b.label.localeCompare(a.label, undefined, { sensitivity: 'base' }))
  }
  if (sort === 'in_shop') {
    return copy.sort((a, b) => b.inShop - a.inShop || b.thisYearYtd - a.thisYearYtd || a.label.localeCompare(b.label))
  }
  if (sort === 'gain') return copy.sort((a, b) => b.delta - a.delta || b.thisYearYtd - a.thisYearYtd || a.label.localeCompare(b.label))
  if (sort === 'drop') return copy.sort((a, b) => a.delta - b.delta || b.lastYearYtd - a.lastYearYtd || a.label.localeCompare(b.label))
  return copy.sort(
    (a, b) =>
      b.thisYearYtd - a.thisYearYtd ||
      b.inShop - a.inShop ||
      b.totalInWindow - a.totalInWindow ||
      a.label.localeCompare(b.label),
  )
}
