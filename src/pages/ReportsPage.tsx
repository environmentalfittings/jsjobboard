import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DailyPriorityWorksheet } from '../components/DailyPriorityWorksheet'
import { FinishCellBadge } from '../components/FinishCellBadge'
import { useToast } from '../components/ToastNotification'
import { JOB_TYPES, normalizeJobType } from '../constants/jobTypes'
import { TERMINAL_STATUSES } from '../constants/statuses'
import { downloadCompletedJobsReportPdf } from '../lib/completedJobsReportPdf'
import { supabase } from '../lib/supabase'
import { countDueDateChanges, fetchDueDateChanges } from '../lib/dueDateChanges'
import { markReworkDispositionNa } from '../lib/qualityIncrs'
import { countStatusReworkLog, fetchStatusReworkLog } from '../lib/statusReworkLog'
import { isExcludedFromOnTimeDelivery, OTD_EXCLUDED_CUSTOMER_LABEL, OTD_PAUSE_STATUS_LABEL } from '../lib/onTimeDelivery'
import { printOnTimeDeliveryReport } from '../lib/onTimeDeliveryPrint'
import {
  aggregateTopCounts,
  customerKey,
  filterJobsByCustomer,
  filterJobsByValveType,
  isValveRepairJob,
  printTopCountsChart,
  valveTypeKey,
} from '../lib/topJobsAggregation'
import { fetchValveDescriptionsByIds } from '../lib/testLogValveLookup'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { DueDateChangeRecord, StatusReworkRecord, TestLogEntry, Valve } from '../types'

type TurnaroundReportFilter = 'all' | 'turnaround' | 'not_turnaround'

interface OtdRow {
  valve_id: string
  date_closed: string
  due_date: string | null
  on_time: boolean
}

interface LateValveRow {
  id: number
  valve_id: string
  customer: string | null
  status: string | null
  cell: string | null
  valve_type: string | null
  job_type: string | null
  due_date: string
  date_closed: string
  /** First time the job entered Warehouse RTS (from change log), YYYY-MM-DD. */
  warehouseRtsDate: string | null
  daysLate: number
}

interface OtdSummary {
  total: number
  onTime: number
  late: number
  noDueDate: number
  pct: number
}

function calcOtdSummary(rows: OtdRow[]): OtdSummary {
  const withDue = rows.filter((r) => r.due_date)
  const onTime = withDue.filter((r) => r.on_time).length
  return {
    total: withDue.length,
    onTime,
    late: withDue.length - onTime,
    noDueDate: rows.length - withDue.length,
    pct: withDue.length > 0 ? (onTime / withDue.length) * 100 : 0,
  }
}

/** Whole calendar days late (closed after due). */
function daysLateBetween(dueDate: string, dateClosed: string): number {
  const due = new Date(`${dueDate.slice(0, 10)}T12:00:00`)
  const closed = new Date(`${dateClosed.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(due.getTime()) || Number.isNaN(closed.getTime())) return 0
  return Math.max(0, Math.round((closed.getTime() - due.getTime()) / 86_400_000))
}

function toLocalDateFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const trimmed = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return toLocalInputDate(parsed)
}

/**
 * Earliest date each valve row entered Warehouse RTS (from valve_change_log).
 * Falls back empty when no history exists (e.g. imported closes).
 */
async function fetchWarehouseRtsDatesByValveId(
  valveRowIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (valveRowIds.length === 0) return map

  const chunkSize = 200
  for (let i = 0; i < valveRowIds.length; i += chunkSize) {
    const chunk = valveRowIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('valve_change_log')
      .select('valve_id,changed_at,old_row,new_row')
      .in('valve_id', chunk)
      .eq('action', 'update')
      .filter('new_row->>status', 'eq', 'Warehouse RTS')
      .order('changed_at', { ascending: true })
      .limit(8000)
    if (error) {
      // Non-fatal — report still works without RTS dates.
      console.warn('Could not load Warehouse RTS dates from change log', error.message)
      continue
    }
    for (const raw of data ?? []) {
      const rowId = Number((raw as { valve_id?: unknown }).valve_id)
      if (!Number.isFinite(rowId) || map.has(rowId)) continue
      const oldStatus =
        typeof (raw as { old_row?: { status?: unknown } }).old_row?.status === 'string'
          ? String((raw as { old_row: { status: string } }).old_row.status).trim()
          : ''
      if (oldStatus === 'Warehouse RTS') continue
      const date = toLocalDateFromIso((raw as { changed_at?: string }).changed_at)
      if (date) map.set(rowId, date)
    }
  }
  return map
}

function getYearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

/** Local calendar YYYY-MM-DD (avoids UTC day shift from toISOString). */
function toLocalInputDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfLocalDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function getCurrentWeekRange() {
  const now = startOfLocalDay(new Date())
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setDate(now.getDate() + diffToMonday)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: toLocalInputDate(start), end: toLocalInputDate(end) }
}

type CompletedDatePreset =
  | 'custom'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'last_90_days'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year_to_date'
  | 'last_year_to_date'
  | 'this_year'
  | 'last_year'

const COMPLETED_DATE_PRESETS: { value: CompletedDatePreset; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'this_year_to_date', label: 'This year to date' },
  { value: 'last_year_to_date', label: 'Last year to date' },
  { value: 'this_year', label: 'This year (full)' },
  { value: 'last_year', label: 'Last year (full)' },
  { value: 'custom', label: 'Custom dates' },
]

function getCompletedDatePresetRange(preset: Exclude<CompletedDatePreset, 'custom'>, now = new Date()) {
  const today = startOfLocalDay(now)
  const y = today.getFullYear()
  const m = today.getMonth()

  if (preset === 'this_week') return getCurrentWeekRange()

  if (preset === 'last_week') {
    const thisWeek = getCurrentWeekRange()
    const start = new Date(`${thisWeek.start}T12:00:00`)
    start.setDate(start.getDate() - 7)
    const end = new Date(`${thisWeek.end}T12:00:00`)
    end.setDate(end.getDate() - 7)
    return { start: toLocalInputDate(start), end: toLocalInputDate(end) }
  }

  if (preset === 'this_month') {
    return {
      start: toLocalInputDate(new Date(y, m, 1)),
      end: toLocalInputDate(today),
    }
  }

  if (preset === 'last_month') {
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0)
    return { start: toLocalInputDate(start), end: toLocalInputDate(end) }
  }

  if (preset === 'last_30_days') {
    const start = new Date(today)
    start.setDate(start.getDate() - 29)
    return { start: toLocalInputDate(start), end: toLocalInputDate(today) }
  }

  if (preset === 'last_90_days') {
    const start = new Date(today)
    start.setDate(start.getDate() - 89)
    return { start: toLocalInputDate(start), end: toLocalInputDate(today) }
  }

  if (preset === 'this_quarter') {
    const qStartMonth = Math.floor(m / 3) * 3
    return {
      start: toLocalInputDate(new Date(y, qStartMonth, 1)),
      end: toLocalInputDate(today),
    }
  }

  if (preset === 'last_quarter') {
    const qStartMonth = Math.floor(m / 3) * 3 - 3
    const start = new Date(y, qStartMonth, 1)
    const end = new Date(y, qStartMonth + 3, 0)
    return { start: toLocalInputDate(start), end: toLocalInputDate(end) }
  }

  if (preset === 'this_year_to_date') {
    return { start: `${y}-01-01`, end: toLocalInputDate(today) }
  }

  if (preset === 'last_year_to_date') {
    const end = new Date(y - 1, m, today.getDate())
    // Clamp if last year lacked this calendar day (e.g. Feb 29).
    if (end.getMonth() !== m) end.setDate(0)
    return { start: `${y - 1}-01-01`, end: toLocalInputDate(end) }
  }

  if (preset === 'this_year') {
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  }

  // last_year
  return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
}

export function ReportsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const defaultRange = useMemo(() => getCurrentWeekRange(), [])
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [completedDatePreset, setCompletedDatePreset] = useState<CompletedDatePreset>('this_week')
  const [rows, setRows] = useState<Valve[]>([])
  const [loading, setLoading] = useState(false)
  const [completedTurnaroundFilter, setCompletedTurnaroundFilter] = useState<TurnaroundReportFilter>('all')
  const [completedJobTypeFilter, setCompletedJobTypeFilter] = useState<string>('all')
  const [activeTurnaroundRows, setActiveTurnaroundRows] = useState<Valve[]>([])
  const [activeTurnaroundLoading, setActiveTurnaroundLoading] = useState(false)
  const [activeJobTypeFilter, setActiveJobTypeFilter] = useState<string>('all')
  const visibleActiveTurnaroundRows = useMemo(() => {
    return activeTurnaroundRows.filter((v) =>
      activeJobTypeFilter === 'all' ? true : normalizeJobType(v.job_type) === activeJobTypeFilter,
    )
  }, [activeTurnaroundRows, activeJobTypeFilter])

  const [testLogStartDate, setTestLogStartDate] = useState(defaultRange.start)
  const [testLogEndDate, setTestLogEndDate] = useState(defaultRange.end)
  const [testLogRows, setTestLogRows] = useState<TestLogEntry[]>([])
  const [testLogDescriptions, setTestLogDescriptions] = useState<Record<string, string>>({})
  const [testLogLoading, setTestLogLoading] = useState(false)
  const [activeByCellRows, setActiveByCellRows] = useState<Valve[]>([])
  const [activeByCellLoading, setActiveByCellLoading] = useState(false)
  const [activeByCellFilter, setActiveByCellFilter] = useState(searchParams.get('cell') ?? 'all')

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth()
  const [otdRows, setOtdRows] = useState<OtdRow[]>([])
  const [otdLoading, setOtdLoading] = useState(false)
  const [otdYear, setOtdYear] = useState(currentYear)
  const [otdMonth, setOtdMonth] = useState(currentMonth)

  const defaultLateRange = useMemo(() => getCompletedDatePresetRange('this_month'), [])
  const [latePreset, setLatePreset] = useState<CompletedDatePreset>('this_month')
  const [lateStartDate, setLateStartDate] = useState(defaultLateRange.start)
  const [lateEndDate, setLateEndDate] = useState(defaultLateRange.end)
  const [lateRows, setLateRows] = useState<LateValveRow[]>([])
  const [lateLoading, setLateLoading] = useState(false)

  const defaultTopRange = useMemo(() => getCompletedDatePresetRange('this_year_to_date'), [])
  const [topPreset, setTopPreset] = useState<CompletedDatePreset>('this_year_to_date')
  const [topStartDate, setTopStartDate] = useState(defaultTopRange.start)
  const [topEndDate, setTopEndDate] = useState(defaultTopRange.end)
  const [topRows, setTopRows] = useState<Valve[]>([])
  const [topLoading, setTopLoading] = useState(false)
  const [selectedTopCustomer, setSelectedTopCustomer] = useState<string | null>(null)
  const [selectedTopValveType, setSelectedTopValveType] = useState<string | null>(null)
  const topJobsDetailRef = useRef<HTMLDivElement | null>(null)

  const [dueDateStart, setDueDateStart] = useState(defaultRange.start)
  const [dueDateEnd, setDueDateEnd] = useState(defaultRange.end)
  const [dueDateChangeRows, setDueDateChangeRows] = useState<DueDateChangeRecord[]>([])
  const [dueDateChangeLoading, setDueDateChangeLoading] = useState(false)
  const [dueDateChangeTotalLogged, setDueDateChangeTotalLogged] = useState<number | null>(null)

  const [reworkStart, setReworkStart] = useState(defaultRange.start)
  const [reworkEnd, setReworkEnd] = useState(defaultRange.end)
  const [reworkRows, setReworkRows] = useState<StatusReworkRecord[]>([])
  const [reworkLoading, setReworkLoading] = useState(false)
  const [reworkTotalLogged, setReworkTotalLogged] = useState<number | null>(null)
  const [reworkActionId, setReworkActionId] = useState<number | null>(null)

  const loadOtdData = async (year: number) => {
    setOtdLoading(true)
    const { start, end } = getYearRange(year)
    const { data, error } = await supabase
      .from('valves')
      .select('valve_id,date_closed,due_date,status,order_type,customer')
      .in('status', ['Completed', 'Warehouse RTS'])
      .gte('date_closed', start)
      .lte('date_closed', end)
      .order('date_closed', { ascending: true })
      .limit(5000)
    setOtdLoading(false)
    if (error) {
      showToast(`Could not load OTD data: ${error.message}`)
      return
    }
    const parsed: OtdRow[] = (
      (data ?? []) as {
        valve_id: string
        date_closed: string
        due_date: string | null
        status: string | null
        order_type: string | null
        customer: string | null
      }[]
    )
      .filter((r) => !isExcludedFromOnTimeDelivery(r))
      .map((r) => ({
        valve_id: r.valve_id,
        date_closed: r.date_closed,
        due_date: r.due_date ?? null,
        on_time: r.due_date ? r.date_closed <= r.due_date : false,
      }))
    setOtdRows(parsed)
  }

  const loadDueDateChanges = async () => {
    if (!dueDateStart || !dueDateEnd) return
    setDueDateChangeLoading(true)
    const [{ data, error }, totalLogged] = await Promise.all([
      fetchDueDateChanges(dueDateStart, dueDateEnd),
      countDueDateChanges(),
    ])
    setDueDateChangeLoading(false)
    setDueDateChangeTotalLogged(totalLogged)
    if (error) {
      showToast(`Could not load due date changes: ${error.message}`)
      setDueDateChangeRows([])
      return
    }
    setDueDateChangeRows(data)
  }

  const exportDueDateChangesCsv = () => {
    const header = ['Changed at', 'Valve ID', 'Previous due date', 'New due date', 'Reason', 'Changed by']
    const lines = dueDateChangeRows.map((row) =>
      [
        row.changed_at,
        row.valve_id,
        row.previous_due_date ?? '',
        row.new_due_date ?? '',
        row.reason,
        row.changed_by_name ?? '',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `due-date-changes-${dueDateStart}-to-${dueDateEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadReworkLog = async () => {
    if (!reworkStart || !reworkEnd) return
    setReworkLoading(true)
    const [{ data, error }, totalLogged] = await Promise.all([
      fetchStatusReworkLog(reworkStart, reworkEnd),
      countStatusReworkLog(),
    ])
    setReworkLoading(false)
    setReworkTotalLogged(totalLogged)
    if (error) {
      showToast(`Could not load rework log: ${error.message}`)
      setReworkRows([])
      return
    }
    setReworkRows(data)
  }

  const exportReworkCsv = () => {
    const header = ['Changed at', 'Valve ID', 'From status', 'To status', 'Reason', 'Changed by', 'QA disposition', 'INCR id']
    const lines = reworkRows.map((row) =>
      [
        row.changed_at,
        row.valve_id,
        row.previous_status,
        row.new_status,
        row.reason,
        row.changed_by_name ?? '',
        row.qa_disposition ?? '',
        row.incr_id == null ? '' : String(row.incr_id),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rework-moves-${reworkStart}-to-${reworkEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const markReworkNa = async (row: StatusReworkRecord) => {
    if (row.qa_disposition === 'na') {
      showToast('Already marked N/A')
      return
    }
    if (row.qa_disposition === 'incr') {
      showToast('This rework already has an INCR')
      return
    }
    setReworkActionId(row.id)
    const { error } = await markReworkDispositionNa(row.id)
    setReworkActionId(null)
    if (error) {
      showToast(error)
      return
    }
    setReworkRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, qa_disposition: 'na', incr_id: null } : r)),
    )
    showToast(`Marked ${row.valve_id} as N/A — acknowledged`)
  }

  const openReworkIncr = (row: StatusReworkRecord) => {
    if (row.qa_disposition === 'incr' && row.incr_id) {
      navigate(`/quality-team/incrs/${row.incr_id}`)
      return
    }
    navigate(`/quality-team/incrs/new?reworkId=${row.id}`)
  }

  useEffect(() => {
    void loadOtdData(otdYear)
  }, [otdYear])

  const applyLateDatePreset = (preset: CompletedDatePreset) => {
    setLatePreset(preset)
    if (preset === 'custom') return
    const range = getCompletedDatePresetRange(preset)
    setLateStartDate(range.start)
    setLateEndDate(range.end)
  }

  const loadLateValvesReport = async () => {
    if (!lateStartDate || !lateEndDate) return
    setLateLoading(true)
    const { data, error } = await supabase
      .from('valves')
      .select('id,valve_id,customer,status,order_type,cell,valve_type,job_type,due_date,date_closed')
      .in('status', ['Completed', 'Warehouse RTS'])
      .gte('date_closed', lateStartDate)
      .lte('date_closed', lateEndDate)
      .not('due_date', 'is', null)
      .order('date_closed', { ascending: false })
      .order('valve_id', { ascending: true })
      .limit(8000)
    if (error) {
      setLateLoading(false)
      showToast(`Could not load late valves: ${error.message}`)
      setLateRows([])
      return
    }
    const candidates = (
      (data ?? []) as {
        id: number
        valve_id: string
        customer: string | null
        status: string | null
        order_type: string | null
        cell: string | null
        valve_type: string | null
        job_type: string | null
        due_date: string | null
        date_closed: string | null
      }[]
    )
      .filter((r) => !isExcludedFromOnTimeDelivery(r))
      .filter((r) => {
        const due = (r.due_date ?? '').trim().slice(0, 10)
        const closed = (r.date_closed ?? '').trim().slice(0, 10)
        return Boolean(due && closed && closed > due)
      })

    const rtsDates = await fetchWarehouseRtsDatesByValveId(candidates.map((r) => r.id))

    const parsed: LateValveRow[] = candidates
      .map((r) => {
        const due = (r.due_date ?? '').trim().slice(0, 10)
        const closed = (r.date_closed ?? '').trim().slice(0, 10)
        const fromLog = rtsDates.get(r.id) ?? null
        // Still sitting in Warehouse RTS — date_closed was set when they entered RTS.
        const warehouseRtsDate =
          fromLog ?? (r.status === 'Warehouse RTS' ? closed : null)
        return {
          id: r.id,
          valve_id: r.valve_id,
          customer: r.customer,
          status: r.status,
          cell: r.cell,
          valve_type: r.valve_type,
          job_type: r.job_type,
          due_date: due,
          date_closed: closed,
          warehouseRtsDate,
          daysLate: daysLateBetween(due, closed),
        }
      })
      .sort((a, b) => b.daysLate - a.daysLate || b.date_closed.localeCompare(a.date_closed) || a.valve_id.localeCompare(b.valve_id))
    setLateRows(parsed)
    setLateLoading(false)
  }

  const exportLateValvesCsv = () => {
    const header = [
      'WO #',
      'Customer',
      'Status',
      'Cell',
      'Valve type',
      'Job type',
      'Due date',
      'Warehouse RTS date',
      'Date closed',
      'Days late',
    ]
    const lines = lateRows.map((row) =>
      [
        row.valve_id,
        row.customer ?? '',
        row.status ?? '',
        row.cell ?? '',
        row.valve_type ?? '',
        row.job_type ?? '',
        row.due_date,
        row.warehouseRtsDate ?? '',
        row.date_closed,
        String(row.daysLate),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `late-valves-${lateStartDate}-to-${lateEndDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    void loadLateValvesReport()
    // Initial load for this month late valves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lateAvgDays = useMemo(() => {
    if (lateRows.length === 0) return null
    return lateRows.reduce((sum, row) => sum + row.daysLate, 0) / lateRows.length
  }, [lateRows])

  const otdYearSummary = useMemo(() => calcOtdSummary(otdRows), [otdRows])

  const otdMonthSummary = useMemo(() => {
    const { start, end } = getMonthRange(otdYear, otdMonth)
    return calcOtdSummary(otdRows.filter((r) => r.date_closed >= start && r.date_closed <= end))
  }, [otdRows, otdYear, otdMonth])

  const otdByMonth = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const { start, end } = getMonthRange(otdYear, m)
      const monthRows = otdRows.filter((r) => r.date_closed >= start && r.date_closed <= end)
      return { month: m, label: MONTH_NAMES[m], ...calcOtdSummary(monthRows) }
    })
  }, [otdRows, otdYear])

  const otdCompareStats = useMemo(() => {
    const monthsWithData = otdByMonth.filter((row) => row.total > 0)
    const monthlyAveragePct =
      monthsWithData.length > 0
        ? monthsWithData.reduce((sum, row) => sum + row.pct, 0) / monthsWithData.length
        : null

    const current = otdByMonth[otdMonth]
    const previous = otdMonth > 0 ? otdByMonth[otdMonth - 1] : null
    let vsLastMonth: {
      label: string
      detail: string
      tone: 'up' | 'down' | 'flat' | 'na'
    } = { label: '—', detail: 'No prior month in this year', tone: 'na' }

    if (current && current.total > 0 && previous && previous.total > 0) {
      const delta = current.pct - previous.pct
      if (Math.abs(delta) < 0.05) {
        vsLastMonth = {
          label: 'Even with last month',
          detail: `${previous.label} was ${previous.pct.toFixed(1)}%`,
          tone: 'flat',
        }
      } else if (delta > 0) {
        vsLastMonth = {
          label: `Better than ${previous.label}`,
          detail: `+${delta.toFixed(1)} pts vs ${previous.pct.toFixed(1)}%`,
          tone: 'up',
        }
      } else {
        vsLastMonth = {
          label: `Worse than ${previous.label}`,
          detail: `${delta.toFixed(1)} pts vs ${previous.pct.toFixed(1)}%`,
          tone: 'down',
        }
      }
    } else if (current && current.total > 0 && otdMonth === 0) {
      vsLastMonth = {
        label: '—',
        detail: 'No prior month loaded for this year',
        tone: 'na',
      }
    } else if (!current || current.total <= 0) {
      vsLastMonth = {
        label: '—',
        detail: `No ${MONTH_NAMES[otdMonth]} jobs with due dates`,
        tone: 'na',
      }
    }

    let yearVsAverage: {
      label: string
      detail: string
      tone: 'up' | 'down' | 'flat' | 'na'
    } = { label: '—', detail: 'Need monthly data', tone: 'na' }

    if (otdYearSummary.total > 0 && monthlyAveragePct != null) {
      const delta = otdYearSummary.pct - monthlyAveragePct
      if (Math.abs(delta) < 0.05) {
        yearVsAverage = {
          label: 'Even with monthly average',
          detail: `Year ${otdYearSummary.pct.toFixed(1)}% ≈ avg ${monthlyAveragePct.toFixed(1)}%`,
          tone: 'flat',
        }
      } else if (delta > 0) {
        yearVsAverage = {
          label: 'Better than monthly average',
          detail: `Year ${otdYearSummary.pct.toFixed(1)}% is +${delta.toFixed(1)} pts vs avg`,
          tone: 'up',
        }
      } else {
        yearVsAverage = {
          label: 'Worse than monthly average',
          detail: `Year ${otdYearSummary.pct.toFixed(1)}% is ${delta.toFixed(1)} pts vs avg`,
          tone: 'down',
        }
      }
    }

    return {
      monthlyAveragePct,
      monthsInAverage: monthsWithData.length,
      vsLastMonth,
      yearVsAverage,
    }
  }, [otdByMonth, otdMonth, otdYearSummary])

  const topCustomerRows = useMemo(() => aggregateTopCounts(topRows, customerKey, 10), [topRows])
  const topRepairRows = useMemo(() => {
    const repairs = topRows.filter(isValveRepairJob)
    return aggregateTopCounts(repairs, valveTypeKey, 10)
  }, [topRows])
  const topRepairTotal = useMemo(() => topRows.filter(isValveRepairJob).length, [topRows])
  const selectedCustomerJobs = useMemo(
    () => (selectedTopCustomer ? filterJobsByCustomer(topRows, selectedTopCustomer) : []),
    [selectedTopCustomer, topRows],
  )
  const selectedValveTypeJobs = useMemo(() => {
    if (!selectedTopValveType) return []
    return filterJobsByValveType(topRows.filter(isValveRepairJob), selectedTopValveType)
  }, [selectedTopValveType, topRows])

  useEffect(() => {
    if (!selectedTopCustomer && !selectedTopValveType) return
    topJobsDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedTopCustomer, selectedTopValveType])

  const applyTopDatePreset = (preset: CompletedDatePreset) => {
    setTopPreset(preset)
    if (preset === 'custom') return
    const range = getCompletedDatePresetRange(preset)
    setTopStartDate(range.start)
    setTopEndDate(range.end)
  }

  const loadTopJobsReport = async () => {
    if (!topStartDate || !topEndDate) return
    setTopLoading(true)
    const { data, error } = await supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .eq('status', 'Completed')
      .gte('date_closed', topStartDate)
      .lte('date_closed', topEndDate)
      .order('date_closed', { ascending: false })
      .order('valve_id', { ascending: true })
      .limit(8000)
    setTopLoading(false)
    if (error) {
      showToast(`Could not load top customers / valve types: ${error.message}`)
      setTopRows([])
      return
    }
    setTopRows((data as Valve[]) ?? [])
    setSelectedTopCustomer(null)
    setSelectedTopValveType(null)
  }

  useEffect(() => {
    void loadTopJobsReport()
    // Initial load for YTD top customers / repairs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyCompletedDatePreset = (preset: CompletedDatePreset) => {
    setCompletedDatePreset(preset)
    if (preset === 'custom') return
    const range = getCompletedDatePresetRange(preset)
    setStartDate(range.start)
    setEndDate(range.end)
  }

  const onCompletedStartDateChange = (value: string) => {
    setCompletedDatePreset('custom')
    setStartDate(value)
  }

  const onCompletedEndDateChange = (value: string) => {
    setCompletedDatePreset('custom')
    setEndDate(value)
  }

  const runReport = async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    let query = supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .eq('status', 'Completed')
      .gte('date_closed', startDate)
      .lte('date_closed', endDate)
    if (completedTurnaroundFilter === 'turnaround') {
      query = query.eq('is_turnaround', true)
    } else if (completedTurnaroundFilter === 'not_turnaround') {
      query = query.or('is_turnaround.is.null,is_turnaround.eq.false')
    }
    if (completedJobTypeFilter !== 'all') {
      query = query.eq('job_type', completedJobTypeFilter)
    }
    const { data, error } = await query
      .order('date_closed', { ascending: false })
      .order('valve_id', { ascending: true })
    if (error) {
      showToast(`Report failed: ${error.message}`)
      setRows([])
    } else {
      setRows((data as Valve[]) ?? [])
    }
    setLoading(false)
  }

  const loadActiveTurnarounds = async () => {
    setActiveTurnaroundLoading(true)
    const { data, error } = await supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .eq('is_turnaround', true)
      .order('customer', { ascending: true })
      .order('valve_id', { ascending: true })
      .limit(800)
    setActiveTurnaroundLoading(false)
    if (error) {
      showToast(`Could not load turnarounds: ${error.message}`)
      setActiveTurnaroundRows([])
      return
    }
    const list = (data as Valve[]) ?? []
    setActiveTurnaroundRows(list.filter((v) => !TERMINAL_STATUSES.has(v.status)))
  }

  const exportCsv = () => {
    const header = [
      'Job ID',
      'Job Type',
      'Customer',
      'Cell',
      'Size',
      'Pressure',
      'Valve Type',
      'Date Closed',
      'Description',
    ]
    const lines = rows.map((row) =>
      [
        row.valve_id,
        normalizeJobType(row.job_type),
        row.customer ?? '',
        row.cell ?? '',
        row.size ?? '',
        row.pressure_class ?? '',
        row.valve_type ?? '',
        row.date_closed ?? '',
        row.description ?? '',
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `completed-jobs-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    if (!rows.length || !startDate || !endDate) return
    const turnaroundFilterLabel =
      completedTurnaroundFilter === 'turnaround'
        ? 'Turnarounds only'
        : completedTurnaroundFilter === 'not_turnaround'
          ? 'Exclude turnarounds'
          : 'All'
    downloadCompletedJobsReportPdf(rows, {
      startDate,
      endDate,
      turnaroundFilterLabel,
      jobTypeFilterLabel: completedJobTypeFilter === 'all' ? 'All' : completedJobTypeFilter,
    })
  }

  const exportActiveTurnaroundCsv = () => {
    const header = ['Job ID', 'Job Type', 'Customer', 'Cell', 'Size', 'Status', 'Due Date', 'Description', 'Notes']
    const lines = visibleActiveTurnaroundRows.map((row) =>
      [
        row.valve_id,
        normalizeJobType(row.job_type),
        row.customer ?? '',
        row.cell ?? '',
        row.size ?? '',
        row.status,
        row.due_date ?? '',
        row.description ?? '',
        row.notes ?? '',
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `active-turnarounds-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadActiveByCell = async () => {
    setActiveByCellLoading(true)
    const { data, error } = await supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .order('cell', { ascending: true })
      .order('valve_id', { ascending: true })
      .limit(1200)
    setActiveByCellLoading(false)
    if (error) {
      showToast(`Could not load active-by-cell report: ${error.message}`)
      setActiveByCellRows([])
      return
    }
    const list = (data as Valve[]) ?? []
    setActiveByCellRows(list.filter((v) => !TERMINAL_STATUSES.has(v.status) && Boolean(v.cell)))
  }

  const activeByCellOptions = useMemo(
    () =>
      [...new Set(activeByCellRows.map((v) => v.cell).filter((c): c is string => Boolean(c && c.trim())))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [activeByCellRows],
  )

  const visibleActiveByCellRows = useMemo(
    () => activeByCellRows.filter((v) => (activeByCellFilter === 'all' ? true : (v.cell ?? '') === activeByCellFilter)),
    [activeByCellRows, activeByCellFilter],
  )

  const exportActiveByCellCsv = () => {
    const header = ['Job ID', 'Customer', 'Cell', 'Status', 'Due Date', 'Description', 'Notes']
    const lines = visibleActiveByCellRows.map((row) =>
      [row.valve_id, row.customer ?? '', row.cell ?? '', row.status, row.due_date ?? '', row.description ?? '', row.notes ?? '']
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `active-valves-by-cell-${activeByCellFilter === 'all' ? 'all-cells' : activeByCellFilter}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const testLogDescriptionFor = (valveId: string) =>
    testLogDescriptions[String(valveId ?? '').trim().toUpperCase()] ?? ''

  const runTestLogReport = async () => {
    if (!testLogStartDate || !testLogEndDate) return
    setTestLogLoading(true)
    const { data, error } = await supabase
      .from('test_logs')
      .select('id,tested_on,valve_id,tester,pass_fail,valve_type,test_type,action_taken,worked,size,pressure,manufacturer,created_at')
      .gte('tested_on', testLogStartDate)
      .lte('tested_on', testLogEndDate)
      .order('tested_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      setTestLogLoading(false)
      showToast(`Test log report failed: ${error.message}`)
      setTestLogRows([])
      setTestLogDescriptions({})
      return
    }
    const rows = (data as TestLogEntry[]) ?? []
    const descriptions = await fetchValveDescriptionsByIds(rows.map((row) => row.valve_id))
    setTestLogRows(rows)
    setTestLogDescriptions(descriptions)
    setTestLogLoading(false)
  }

  const exportTestLogCsv = () => {
    const header = ['Date', 'Valve ID', 'Description', 'Test Type', 'Pass/Fail', 'Tester', 'Action Taken']
    const lines = testLogRows.map((row) =>
      [
        row.tested_on,
        row.valve_id,
        testLogDescriptionFor(row.valve_id),
        row.test_type ?? '',
        row.pass_fail ?? '',
        row.tester ?? '',
        row.action_taken ?? '',
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `test-log-summary-${testLogStartDate}-to-${testLogEndDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const testLogSummary = useMemo(() => {
    const total = testLogRows.length
    const passCount = testLogRows.filter((r) => (r.pass_fail ?? '').trim().toUpperCase().includes('PASS')).length
    const failCount = testLogRows.filter((r) => (r.pass_fail ?? '').trim().toUpperCase().includes('FAIL')).length
    const passRate = total > 0 ? (passCount / total) * 100 : 0
    return { total, passCount, failCount, passRate }
  }, [testLogRows])

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Reports</h2>
      </div>

      <section className="dashboard-panel" id="on-time-delivery">
        <div className="training-list-toolbar" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0 }}>On-time delivery</h3>
            <p className="placeholder-copy" style={{ marginTop: '0.35rem' }}>
              Percentage of completed jobs closed on or before their due date. Jobs with no due date are excluded from
              percentage calculations. {OTD_PAUSE_STATUS_LABEL} do not count against on-time delivery. Moving a job out
              of those statuses requires a new due date before it counts again. {OTD_EXCLUDED_CUSTOMER_LABEL} jobs are
              also excluded (internal / house work).
            </p>
          </div>
        </div>
        <div className="report-filters">
          <label>
            Year
            <select value={otdYear} onChange={(e) => setOtdYear(Number(e.target.value))}>
              {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Month (detail)
            <select value={otdMonth} onChange={(e) => setOtdMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button-primary" onClick={() => void loadOtdData(otdYear)} disabled={otdLoading}>
            {otdLoading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={otdLoading || otdRows.length === 0}
            onClick={() => {
              void (async () => {
                const { error } = await printOnTimeDeliveryReport({
                  year: otdYear,
                  monthLabel: MONTH_NAMES[otdMonth],
                  yearSummary: otdYearSummary,
                  monthSummary: otdMonthSummary,
                  byMonth: otdByMonth,
                })
                if (error) showToast(error)
                else showToast(`Downloaded on-time delivery PDF for ${otdYear}`)
              })()
            }}
          >
            Export PDF
          </button>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>Year {otdYear} — On-time %</span>
            <strong className={otdYearSummary.pct >= 90 ? 'text-green' : otdYearSummary.pct >= 75 ? 'text-yellow' : 'text-red'}>
              {otdYearSummary.total > 0 ? `${otdYearSummary.pct.toFixed(1)}%` : '—'}
            </strong>
          </div>
          <div className="report-summary-item">
            <span>Year jobs w/ due date</span>
            <strong>{otdYearSummary.total}</strong>
          </div>
          <div className="report-summary-item">
            <span>Year on-time</span>
            <strong>{otdYearSummary.onTime}</strong>
          </div>
          <div className="report-summary-item">
            <span>Year late</span>
            <strong>{otdYearSummary.late}</strong>
          </div>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>{MONTH_NAMES[otdMonth]} {otdYear} — On-time %</span>
            <strong className={otdMonthSummary.pct >= 90 ? 'text-green' : otdMonthSummary.pct >= 75 ? 'text-yellow' : 'text-red'}>
              {otdMonthSummary.total > 0 ? `${otdMonthSummary.pct.toFixed(1)}%` : '—'}
            </strong>
          </div>
          <div className="report-summary-item">
            <span>Month jobs w/ due date</span>
            <strong>{otdMonthSummary.total}</strong>
          </div>
          <div className="report-summary-item">
            <span>Month on-time</span>
            <strong>{otdMonthSummary.onTime}</strong>
          </div>
          <div className="report-summary-item">
            <span>Month late</span>
            <strong>{otdMonthSummary.late}</strong>
          </div>
        </div>

        <div className="report-summary-bar otd-compare-bar">
          <div className="report-summary-item">
            <span>Vs last month</span>
            <strong className={`otd-compare-tone otd-compare-tone--${otdCompareStats.vsLastMonth.tone}`}>
              {otdCompareStats.vsLastMonth.label}
            </strong>
            <em className="otd-compare-detail">{otdCompareStats.vsLastMonth.detail}</em>
          </div>
          <div className="report-summary-item">
            <span>Monthly average on-time %</span>
            <strong>
              {otdCompareStats.monthlyAveragePct != null
                ? `${otdCompareStats.monthlyAveragePct.toFixed(1)}%`
                : '—'}
            </strong>
            <em className="otd-compare-detail">
              {otdCompareStats.monthsInAverage > 0
                ? `Average of ${otdCompareStats.monthsInAverage} month${otdCompareStats.monthsInAverage === 1 ? '' : 's'} with data`
                : 'No months with due-date jobs yet'}
            </em>
          </div>
          <div className="report-summary-item">
            <span>Year vs monthly average</span>
            <strong className={`otd-compare-tone otd-compare-tone--${otdCompareStats.yearVsAverage.tone}`}>
              {otdCompareStats.yearVsAverage.label}
            </strong>
            <em className="otd-compare-detail">{otdCompareStats.yearVsAverage.detail}</em>
          </div>
        </div>

        <div
          className="otd-chart"
          role="img"
          aria-label={`Monthly on-time delivery percentage for ${otdYear}`}
        >
          <div className="otd-chart-head">
            <h4 className="otd-chart-title">Monthly on-time %</h4>
            <div className="otd-chart-legend" aria-hidden="true">
              <span><i className="otd-swatch otd-swatch--good" /> ≥ 90%</span>
              <span><i className="otd-swatch otd-swatch--mid" /> 75–89%</span>
              <span><i className="otd-swatch otd-swatch--low" /> &lt; 75%</span>
            </div>
          </div>
          <div className="otd-chart-plot">
            {[100, 75, 50, 25, 0].map((tick) => (
              <div key={tick} className="otd-chart-gridline" style={{ bottom: `${tick}%` }}>
                <span>{tick}%</span>
              </div>
            ))}
            <div className="otd-chart-bars">
              {otdByMonth.map((row) => {
                const height = row.total > 0 ? Math.max(3, row.pct) : 0
                const tone =
                  row.total <= 0 ? 'empty' : row.pct >= 90 ? 'good' : row.pct >= 75 ? 'mid' : 'low'
                return (
                  <div
                    key={row.month}
                    className={`otd-chart-col${row.month === otdMonth ? ' is-selected' : ''}`}
                    title={
                      row.total > 0
                        ? `${row.label}: ${row.pct.toFixed(1)}% (${row.onTime} on-time / ${row.late} late)`
                        : `${row.label}: no jobs with due date`
                    }
                  >
                    <div className="otd-chart-bar-wrap">
                      <div className={`otd-chart-bar otd-chart-bar--${tone}`} style={{ height: `${height}%` }}>
                        {row.total > 0 && height >= 18 ? <span>{row.pct.toFixed(0)}%</span> : null}
                      </div>
                    </div>
                    <div className="otd-chart-xlabel">{row.label.slice(0, 3)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Jobs w/ due date</th>
                <th>On-time</th>
                <th>Late</th>
                <th>No due date</th>
                <th>On-time %</th>
              </tr>
            </thead>
            <tbody>
              {otdByMonth.map((row) => (
                <tr key={row.month}>
                  <td>{row.label}</td>
                  <td>{row.total}</td>
                  <td>{row.onTime}</td>
                  <td>{row.late}</td>
                  <td>{row.noDueDate}</td>
                  <td>
                    {row.total > 0 ? (
                      <span className={row.pct >= 90 ? 'text-green' : row.pct >= 75 ? 'text-yellow' : 'text-red'}>
                        {row.pct.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel" id="late-valves">
        <h3>Late valves</h3>
        <p className="placeholder-copy">
          Completed / Warehouse RTS jobs closed after their due date in the selected period. Same rules as on-time
          delivery ({OTD_PAUSE_STATUS_LABEL}; {OTD_EXCLUDED_CUSTOMER_LABEL} excluded). Warehouse RTS date comes from the
          status change log when available. Open a card to review the job.
        </p>
        <div className="report-filters">
          <label>
            Date range
            <select value={latePreset} onChange={(e) => applyLateDatePreset(e.target.value as CompletedDatePreset)}>
              {COMPLETED_DATE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              value={lateStartDate}
              onChange={(e) => {
                setLatePreset('custom')
                setLateStartDate(e.target.value)
              }}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={lateEndDate}
              onChange={(e) => {
                setLatePreset('custom')
                setLateEndDate(e.target.value)
              }}
            />
          </label>
          <button type="button" className="button-primary" disabled={lateLoading} onClick={() => void loadLateValvesReport()}>
            {lateLoading ? 'Loading…' : 'Refresh'}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={lateLoading || lateRows.length === 0}
            onClick={exportLateValvesCsv}
          >
            Export CSV
          </button>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>Late jobs in range</span>
            <strong className={lateRows.length > 0 ? 'text-red' : undefined}>{lateRows.length}</strong>
          </div>
          <div className="report-summary-item">
            <span>Avg days late</span>
            <strong>{lateAvgDays != null ? lateAvgDays.toFixed(1) : '—'}</strong>
          </div>
          <div className="report-summary-item">
            <span>Most days late</span>
            <strong>{lateRows[0] ? lateRows[0].daysLate : '—'}</strong>
          </div>
          <div className="report-summary-item">
            <span>Period</span>
            <strong>
              {lateStartDate} → {lateEndDate}
            </strong>
          </div>
        </div>

        {lateLoading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : lateRows.length === 0 ? (
          <p className="placeholder-copy">No late valves in this date range.</p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>WO #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Cell</th>
                  <th>Valve type</th>
                  <th>Due date</th>
                  <th>Warehouse RTS</th>
                  <th>Date closed</th>
                  <th>Days late</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lateRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.valve_id}</td>
                    <td>{row.customer ?? '—'}</td>
                    <td>{row.status ?? '—'}</td>
                    <td>{row.cell ?? '—'}</td>
                    <td>{row.valve_type ?? '—'}</td>
                    <td>{row.due_date}</td>
                    <td>{row.warehouseRtsDate ?? '—'}</td>
                    <td>{row.date_closed}</td>
                    <td>
                      <span className="text-red">{row.daysLate}</span>
                    </td>
                    <td className="report-table-action">
                      <Link className="button-secondary report-table-open-link" to={`/job-board?open=${row.id}`}>
                        Open card
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel" id="top-customers-valve-types">
        <h3>Top customers &amp; repairs by valve type</h3>
        <p className="placeholder-copy">
          Rank completed jobs in the date range. <strong>Click any bar</strong> (customer or valve type, including
          Unknown type) to list those jobs below — then open a card or Print / PDF. Valve-type chart counts{' '}
          <strong>Valve Repair</strong> jobs only.
        </p>
        <div className="report-filters">
          <label>
            Date range
            <select value={topPreset} onChange={(e) => applyTopDatePreset(e.target.value as CompletedDatePreset)}>
              {COMPLETED_DATE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              value={topStartDate}
              onChange={(e) => {
                setTopPreset('custom')
                setTopStartDate(e.target.value)
              }}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={topEndDate}
              onChange={(e) => {
                setTopPreset('custom')
                setTopEndDate(e.target.value)
              }}
            />
          </label>
          <button type="button" className="button-primary" disabled={topLoading} onClick={() => void loadTopJobsReport()}>
            {topLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>Completed jobs in range</span>
            <strong>{topRows.length}</strong>
          </div>
          <div className="report-summary-item">
            <span>Valve repairs in range</span>
            <strong>{topRepairTotal}</strong>
          </div>
          <div className="report-summary-item">
            <span>Distinct customers</span>
            <strong>{new Set(topRows.map(customerKey)).size}</strong>
          </div>
          <div className="report-summary-item">
            <span>Repair valve types</span>
            <strong>{new Set(topRows.filter(isValveRepairJob).map(valveTypeKey)).size}</strong>
          </div>
        </div>

        <div className="top-jobs-charts">
          <div className="top-jobs-chart-panel">
            <div className="top-jobs-chart-head">
              <h4>Top customers</h4>
              <button
                type="button"
                className="button-secondary"
                disabled={topCustomerRows.length === 0}
                onClick={() => {
                  const { error } = printTopCountsChart({
                    title: 'Top customers',
                    subtitle: `Completed jobs ${topStartDate} to ${topEndDate}`,
                    rows: topCustomerRows,
                    totalJobs: topRows.length,
                  })
                  if (error) showToast(error)
                }}
              >
                Print chart
              </button>
            </div>
            {topCustomerRows.length === 0 ? (
              <p className="placeholder-copy">No completed jobs in this range.</p>
            ) : (
              <div className="top-jobs-bars" role="img" aria-label="Top customers by completed job count">
                {topCustomerRows.map((row) => {
                  const max = topCustomerRows[0]?.count || 1
                  const width = Math.max(4, (row.count / max) * 100)
                  const selected = selectedTopCustomer === row.key
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`top-jobs-bar-row${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedTopCustomer(row.key)
                        setSelectedTopValveType(null)
                      }}
                      title={`${row.label}: ${row.count} jobs (${row.pct.toFixed(1)}%)`}
                    >
                      <span className="top-jobs-bar-label">{row.label}</span>
                      <span className="top-jobs-bar-track">
                        <span className="top-jobs-bar-fill" style={{ width: `${width}%` }} />
                      </span>
                      <span className="top-jobs-bar-count">{row.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="top-jobs-chart-panel">
            <div className="top-jobs-chart-head">
              <h4>Top repairs by valve type</h4>
              <button
                type="button"
                className="button-secondary"
                disabled={topRepairRows.length === 0}
                onClick={() => {
                  const { error } = printTopCountsChart({
                    title: 'Top repairs by valve type',
                    subtitle: `Valve Repair jobs ${topStartDate} to ${topEndDate}`,
                    rows: topRepairRows,
                    totalJobs: topRepairTotal,
                    valueLabel: 'Repairs',
                  })
                  if (error) showToast(error)
                }}
              >
                Print chart
              </button>
            </div>
            {topRepairRows.length === 0 ? (
              <p className="placeholder-copy">No valve repair jobs in this range.</p>
            ) : (
              <div className="top-jobs-bars" role="img" aria-label="Top valve types by repair count">
                {topRepairRows.map((row) => {
                  const max = topRepairRows[0]?.count || 1
                  const width = Math.max(4, (row.count / max) * 100)
                  const selected = selectedTopValveType === row.key
                  return (
                    <button
                      key={row.key}
                      type="button"
                      className={`top-jobs-bar-row${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedTopValveType(row.key)
                        setSelectedTopCustomer(null)
                      }}
                      title={`${row.label}: ${row.count} repairs (${row.pct.toFixed(1)}%)`}
                    >
                      <span className="top-jobs-bar-label">{row.label}</span>
                      <span className="top-jobs-bar-track">
                        <span className="top-jobs-bar-fill top-jobs-bar-fill--accent" style={{ width: `${width}%` }} />
                      </span>
                      <span className="top-jobs-bar-count">{row.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {selectedTopCustomer ? (
          <div className="top-jobs-detail" ref={topJobsDetailRef}>
            <div className="training-list-toolbar">
              <h4 style={{ margin: 0 }}>
                Jobs for {selectedTopCustomer}{' '}
                <span className="status-breakdown-note">({selectedCustomerJobs.length})</span>
              </h4>
              <div className="training-inline-add">
                <button
                  type="button"
                  className="button-primary"
                  disabled={selectedCustomerJobs.length === 0}
                  onClick={() => {
                    downloadCompletedJobsReportPdf(selectedCustomerJobs, {
                      startDate: topStartDate,
                      endDate: topEndDate,
                      turnaroundFilterLabel: 'All',
                      jobTypeFilterLabel: 'All',
                      reportTitle: `Completed jobs — ${selectedTopCustomer}`,
                      fileNameStem: `completed-jobs-${selectedTopCustomer}`,
                    })
                  }}
                >
                  Print / PDF jobs
                </button>
                <button type="button" className="button-secondary" onClick={() => setSelectedTopCustomer(null)}>
                  Clear
                </button>
              </div>
            </div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Job type</th>
                    <th>Valve type</th>
                    <th>Cell</th>
                    <th>Date closed</th>
                    <th>Description</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {selectedCustomerJobs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.valve_id}</td>
                      <td>{normalizeJobType(row.job_type)}</td>
                      <td>{row.valve_type ?? '—'}</td>
                      <td>{row.cell ?? '—'}</td>
                      <td>{row.date_closed ?? '—'}</td>
                      <td className="table-cell-clamp">{row.description ?? '—'}</td>
                      <td className="report-table-action">
                        <Link className="button-secondary report-table-open-link" to={`/job-board?open=${row.id}`}>
                          Open card
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {selectedTopValveType ? (
          <div className="top-jobs-detail" ref={topJobsDetailRef}>
            <div className="training-list-toolbar">
              <h4 style={{ margin: 0 }}>
                Valve Repair — {selectedTopValveType}{' '}
                <span className="status-breakdown-note">({selectedValveTypeJobs.length})</span>
              </h4>
              <div className="training-inline-add">
                <button
                  type="button"
                  className="button-primary"
                  disabled={selectedValveTypeJobs.length === 0}
                  onClick={() => {
                    downloadCompletedJobsReportPdf(selectedValveTypeJobs, {
                      startDate: topStartDate,
                      endDate: topEndDate,
                      turnaroundFilterLabel: 'All',
                      jobTypeFilterLabel: 'Valve Repair',
                      reportTitle: `Valve repairs — ${selectedTopValveType}`,
                      fileNameStem: `valve-repairs-${selectedTopValveType}`,
                    })
                  }}
                >
                  Print / PDF jobs
                </button>
                <button type="button" className="button-secondary" onClick={() => setSelectedTopValveType(null)}>
                  Clear
                </button>
              </div>
            </div>
            {selectedTopValveType === 'Unknown type' ? (
              <p className="placeholder-copy">
                These Valve Repair jobs have a blank or missing valve type on the job card.
              </p>
            ) : null}
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Customer</th>
                    <th>Valve type</th>
                    <th>Cell</th>
                    <th>Date closed</th>
                    <th>Description</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {selectedValveTypeJobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="job-muted">
                        No matching jobs in this date range.
                      </td>
                    </tr>
                  ) : (
                    selectedValveTypeJobs.map((row) => (
                      <tr key={row.id}>
                        <td>{row.valve_id}</td>
                        <td>{row.customer ?? '—'}</td>
                        <td>{row.valve_type?.trim() || '—'}</td>
                        <td>{row.cell ?? '—'}</td>
                        <td>{row.date_closed ?? '—'}</td>
                        <td className="table-cell-clamp">{row.description ?? '—'}</td>
                        <td className="report-table-action">
                          <Link className="button-secondary report-table-open-link" to={`/job-board?open=${row.id}`}>
                            Open card
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <DailyPriorityWorksheet />

      <section className="dashboard-panel">
        <h3>Completed jobs report</h3>
        <p className="placeholder-copy">
          Filter by close date. Pick a common date range, or set custom start/end dates. Use turnaround filter for
          customer update packages or to exclude turnarounds.
        </p>
        <div className="report-filters">
          <label>
            Date range
            <select
              value={completedDatePreset}
              onChange={(e) => applyCompletedDatePreset(e.target.value as CompletedDatePreset)}
            >
              {COMPLETED_DATE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={startDate} onChange={(e) => onCompletedStartDateChange(e.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(e) => onCompletedEndDateChange(e.target.value)} />
          </label>
          <label>
            Turnaround
            <select
              value={completedTurnaroundFilter}
              onChange={(e) => setCompletedTurnaroundFilter(e.target.value as TurnaroundReportFilter)}
            >
              <option value="all">All</option>
              <option value="turnaround">Turnarounds only</option>
              <option value="not_turnaround">Exclude turnarounds</option>
            </select>
          </label>
          <label>
            Job type
            <select value={completedJobTypeFilter} onChange={(e) => setCompletedJobTypeFilter(e.target.value)}>
              <option value="all">All</option>
              {JOB_TYPES.map((jt) => (
                <option key={jt} value={jt}>
                  {jt}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button-primary" onClick={runReport} disabled={loading}>
            {loading ? 'Generating...' : 'Generate report'}
          </button>
          <button type="button" className="button-secondary" onClick={exportCsv} disabled={!rows.length || loading}>
            Export CSV
          </button>
          <button type="button" className="button-secondary" onClick={exportPdf} disabled={!rows.length || loading}>
            Export PDF
          </button>
        </div>
        <p className="status-breakdown-note">Results: {rows.length} completed job(s)</p>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Job type</th>
                <th>Customer</th>
                <th>Cell</th>
                <th>Size</th>
                <th>Pressure</th>
                <th>Valve type</th>
                <th>Date closed</th>
                <th>Description</th>
                <th className="report-table-action-header" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.valve_id}</td>
                  <td>{normalizeJobType(row.job_type)}</td>
                  <td>{row.customer ?? '-'}</td>
                  <td>
                    <FinishCellBadge cell={row.cell} />
                  </td>
                  <td>{row.size ?? '-'}</td>
                  <td>{row.pressure_class ?? '-'}</td>
                  <td>{row.valve_type ?? '-'}</td>
                  <td>{row.date_closed ?? '-'}</td>
                  <td className="table-cell-clamp">{row.description ?? '-'}</td>
                  <td className="report-table-action">
                    <Link
                      className="button-secondary report-table-open-link"
                      to={`/job-board?open=${row.id}`}
                    >
                      Open card
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Active valves by cell</h3>
        <p className="placeholder-copy">Open valves grouped by work cell (excludes Completed / Junked / Replaced).</p>
        <div className="report-filters">
          <label>
            Cell
            <select value={activeByCellFilter} onChange={(e) => setActiveByCellFilter(e.target.value)}>
              <option value="all">All cells</option>
              {activeByCellOptions.map((cell) => (
                <option key={cell} value={cell}>
                  {cell}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button-primary" onClick={() => void loadActiveByCell()} disabled={activeByCellLoading}>
            {activeByCellLoading ? 'Loading…' : 'Load active valves by cell'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={exportActiveByCellCsv}
            disabled={!visibleActiveByCellRows.length || activeByCellLoading}
          >
            Export CSV
          </button>
        </div>
        <p className="status-breakdown-note">Results: {visibleActiveByCellRows.length} open valve(s)</p>
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Cell</th>
                <th>Status</th>
                <th>Due date</th>
                <th>Description</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleActiveByCellRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.valve_id}</td>
                  <td>{row.customer ?? '-'}</td>
                  <td>{row.cell ?? '-'}</td>
                  <td>{row.status}</td>
                  <td>{row.due_date ?? '-'}</td>
                  <td className="table-cell-clamp">{row.description ?? '-'}</td>
                  <td className="table-cell-clamp">{row.notes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Active turnaround jobs</h3>
        <p className="placeholder-copy">
          Open jobs flagged as turnaround (excludes Completed / Junked / Replaced). Use for customer status updates.
        </p>
        <div className="report-filters">
          <label>
            Job type
            <select value={activeJobTypeFilter} onChange={(e) => setActiveJobTypeFilter(e.target.value)}>
              <option value="all">All</option>
              {JOB_TYPES.map((jt) => (
                <option key={jt} value={jt}>
                  {jt}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void loadActiveTurnarounds()}
            disabled={activeTurnaroundLoading}
          >
            {activeTurnaroundLoading ? 'Loading…' : 'Load active turnarounds'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={exportActiveTurnaroundCsv}
            disabled={!visibleActiveTurnaroundRows.length || activeTurnaroundLoading}
          >
            Export CSV
          </button>
        </div>
        <p className="status-breakdown-note">Results: {visibleActiveTurnaroundRows.length} open turnaround job(s)</p>
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Job type</th>
                <th>Customer</th>
                <th>Cell</th>
                <th>Size</th>
                <th>Status</th>
                <th>Due date</th>
                <th>Description</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {visibleActiveTurnaroundRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.valve_id}</td>
                  <td>{normalizeJobType(row.job_type)}</td>
                  <td>{row.customer ?? '-'}</td>
                  <td>{row.cell ?? '-'}</td>
                  <td>{row.size ?? '-'}</td>
                  <td>{row.status}</td>
                  <td>{row.due_date ?? '-'}</td>
                  <td className="table-cell-clamp">{row.description ?? '-'}</td>
                  <td className="table-cell-clamp">{row.notes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Test log summary report</h3>
        <p className="placeholder-copy">Bench / hydro entries in date range. Use for pass/fail and tester activity snapshots.</p>
        <div className="report-filters">
          <label>
            Start date
            <input type="date" value={testLogStartDate} onChange={(e) => setTestLogStartDate(e.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={testLogEndDate} onChange={(e) => setTestLogEndDate(e.target.value)} />
          </label>
          <button type="button" className="button-primary" onClick={() => void runTestLogReport()} disabled={testLogLoading}>
            {testLogLoading ? 'Generating…' : 'Generate report'}
          </button>
          <button type="button" className="button-secondary" onClick={exportTestLogCsv} disabled={!testLogRows.length || testLogLoading}>
            Export CSV
          </button>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>Total entries</span>
            <strong>{testLogSummary.total}</strong>
          </div>
          <div className="report-summary-item">
            <span>PASS</span>
            <strong>{testLogSummary.passCount}</strong>
          </div>
          <div className="report-summary-item">
            <span>FAIL</span>
            <strong>{testLogSummary.failCount}</strong>
          </div>
          <div className="report-summary-item">
            <span>Pass rate</span>
            <strong>{testLogSummary.passRate.toFixed(1)}%</strong>
          </div>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Valve ID</th>
                <th>Description</th>
                <th>Test Type</th>
                <th>Pass/Fail</th>
                <th>Tester</th>
                <th>Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {testLogRows.map((row) => {
                const description = testLogDescriptionFor(row.valve_id)
                return (
                  <tr key={row.id}>
                    <td>{row.tested_on}</td>
                    <td>{row.valve_id}</td>
                    <td className="table-cell-clamp" title={description || undefined}>
                      {description || '—'}
                    </td>
                    <td>{row.test_type ?? '-'}</td>
                    <td>{row.pass_fail ?? '-'}</td>
                    <td>{row.tester ?? '-'}</td>
                    <td className="table-cell-clamp">{row.action_taken ?? '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Due date changes</h3>
        <p className="placeholder-copy">
          Logs due date moves from the job board (click the due date on a card, or change it on the job card and save).
          Only changes made <strong>after</strong> the due-date log table was set up in Supabase are recorded — older
          moves are not available.
        </p>
        <div className="report-filters">
          <label>
            From
            <input type="date" value={dueDateStart} onChange={(e) => setDueDateStart(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={dueDateEnd} onChange={(e) => setDueDateEnd(e.target.value)} />
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void loadDueDateChanges()}
            disabled={dueDateChangeLoading}
          >
            {dueDateChangeLoading ? 'Loading…' : 'Run report'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={exportDueDateChangesCsv}
            disabled={dueDateChangeRows.length === 0}
          >
            Export CSV
          </button>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>Changes in range</span>
            <strong>{dueDateChangeRows.length}</strong>
          </div>
          <div className="report-summary-item">
            <span>Total logged (all time)</span>
            <strong>{dueDateChangeTotalLogged == null ? '—' : dueDateChangeTotalLogged}</strong>
          </div>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Changed</th>
                <th>Valve ID</th>
                <th>Previous</th>
                <th>New</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {dueDateChangeRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="job-muted">
                    {dueDateChangeLoading
                      ? 'Loading…'
                      : dueDateChangeTotalLogged === 0
                        ? 'No due date changes have been logged yet. Change a due date on the job board (with a reason) after the Supabase table is set up, then run this report again.'
                        : 'No due date changes in this date range. Try widening From/To, or check Total logged (all time).'}
                  </td>
                </tr>
              ) : (
                dueDateChangeRows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.changed_at).toLocaleString()}</td>
                    <td>{row.valve_id}</td>
                    <td>{row.previous_due_date ?? '—'}</td>
                    <td>{row.new_due_date ?? '—'}</td>
                    <td className="table-cell-clamp">{row.reason}</td>
                    <td>{row.changed_by_name ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Rework / backward status moves</h3>
        <p className="placeholder-copy">
          Forward shop flow (editable in Manage Lists → Shop workflow): Pull → Teardown → Machine 1 → Welding →
          Machine 2 → Fitting → Assembly → Adaption → Actuation → Testing → Painting → Warehouse RTS → Completed.
          Cards may skip steps. When a card moves to an earlier stage, the technician must enter a rework reason. Only
          moves logged <strong>after</strong> the rework table is set up in Supabase appear here. Use <strong>NA</strong>{' '}
          to acknowledge no report is needed, or <strong>INCR</strong> to open an Internal Non-Conformance Report (stored
          under Quality Team).
        </p>
        <div className="report-filters">
          <label>
            From
            <input type="date" value={reworkStart} onChange={(e) => setReworkStart(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={reworkEnd} onChange={(e) => setReworkEnd(e.target.value)} />
          </label>
          <button
            type="button"
            className="button-primary"
            onClick={() => void loadReworkLog()}
            disabled={reworkLoading}
          >
            {reworkLoading ? 'Loading…' : 'Run report'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={exportReworkCsv}
            disabled={reworkRows.length === 0}
          >
            Export CSV
          </button>
        </div>

        <div className="report-summary-bar">
          <div className="report-summary-item">
            <span>Rework moves in range</span>
            <strong>{reworkRows.length}</strong>
          </div>
          <div className="report-summary-item">
            <span>Total logged (all time)</span>
            <strong>{reworkTotalLogged == null ? '—' : reworkTotalLogged}</strong>
          </div>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Changed</th>
                <th>Valve ID</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>By</th>
                <th>QA follow-up</th>
              </tr>
            </thead>
            <tbody>
              {reworkRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="job-muted">
                    {reworkLoading
                      ? 'Loading…'
                      : reworkTotalLogged === 0
                        ? 'No rework moves have been logged yet. Move a card backward on the job board (with a reason) after the Supabase table is set up, then run this report again.'
                        : 'No rework moves in this date range. Try widening From/To, or check Total logged (all time).'}
                  </td>
                </tr>
              ) : (
                reworkRows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.changed_at).toLocaleString()}</td>
                    <td>{row.valve_id}</td>
                    <td>{row.previous_status}</td>
                    <td>{row.new_status}</td>
                    <td className="table-cell-clamp">{row.reason}</td>
                    <td>{row.changed_by_name ?? '—'}</td>
                    <td className="rework-qa-actions">
                      {row.qa_disposition === 'na' ? (
                        <span className="rework-qa-badge rework-qa-badge--na">N/A</span>
                      ) : null}
                      {row.qa_disposition === 'incr' ? (
                        <button
                          type="button"
                          className="button-secondary rework-qa-btn"
                          onClick={() => openReworkIncr(row)}
                        >
                          Open INCR
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="button-secondary rework-qa-btn"
                            disabled={reworkActionId === row.id || row.qa_disposition === 'na'}
                            onClick={() => void markReworkNa(row)}
                          >
                            {reworkActionId === row.id ? '…' : 'NA'}
                          </button>
                          <button
                            type="button"
                            className="button-primary rework-qa-btn"
                            disabled={reworkActionId === row.id || row.qa_disposition === 'na'}
                            onClick={() => openReworkIncr(row)}
                          >
                            INCR
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
