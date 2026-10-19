/** Helpers for the Due this week / date-range due jobs report. */

export type DueJobReportRow = {
  id: number
  valve_id: string
  customer: string | null
  description: string | null
  due_date: string | null
  status?: string | null
  order_type?: string | null
  organization_id?: string | null
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Monday of the week containing `asOf` (local calendar). */
export function startOfWeekMonday(asOf: Date = new Date()): string {
  const date = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
  const day = date.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return formatYmd(date)
}

/** Sunday of the week that starts on `weekStart` (YYYY-MM-DD Monday). */
export function endOfWeekSunday(weekStart: string): string {
  const start = parseYmd(weekStart)
  if (!start) return weekStart
  start.setDate(start.getDate() + 6)
  return formatYmd(start)
}

export function currentWeekRange(asOf: Date = new Date()): { start: string; end: string } {
  const start = startOfWeekMonday(asOf)
  return { start, end: endOfWeekSunday(start) }
}

export function isOpenDueJob(row: Pick<DueJobReportRow, 'status' | 'order_type'>): boolean {
  const status = String(row.status ?? '').trim()
  if (status === 'Completed' || status === 'Junked' || status === 'Replaced') return false
  if (String(row.order_type ?? '').trim() === 'Completed') return false
  return true
}

export function sortDueJobRows(rows: DueJobReportRow[]): DueJobReportRow[] {
  return [...rows].sort((a, b) => {
    const due = String(a.due_date ?? '').localeCompare(String(b.due_date ?? ''))
    if (due !== 0) return due
    return String(a.valve_id ?? '').localeCompare(String(b.valve_id ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

export function formatDueDateLabel(value: string | null | undefined): string {
  const day = String(value ?? '').trim().slice(0, 10)
  const parsed = parseYmd(day)
  if (!parsed) return day || '—'
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
