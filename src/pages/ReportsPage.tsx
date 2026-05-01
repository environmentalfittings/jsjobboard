import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { JOB_TYPES, normalizeJobType } from '../constants/jobTypes'
import { TERMINAL_STATUSES } from '../constants/statuses'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { TestLogEntry, Valve } from '../types'

type TurnaroundReportFilter = 'all' | 'turnaround' | 'not_turnaround'

interface OtdRow {
  valve_id: string
  date_closed: string
  due_date: string | null
  on_time: boolean
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

function isTurnaroundValve(v: Valve): boolean {
  return v.is_turnaround === true
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getCurrentWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setDate(now.getDate() + diffToMonday)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: toInputDate(start), end: toInputDate(end) }
}

export function ReportsPage() {
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const defaultRange = useMemo(() => getCurrentWeekRange(), [])
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
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

  const loadOtdData = async (year: number) => {
    setOtdLoading(true)
    const { start, end } = getYearRange(year)
    const { data, error } = await supabase
      .from('valves')
      .select('valve_id,date_closed,due_date')
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
    const parsed: OtdRow[] = ((data ?? []) as { valve_id: string; date_closed: string; due_date: string | null }[]).map(
      (r) => ({
        valve_id: r.valve_id,
        date_closed: r.date_closed,
        due_date: r.due_date ?? null,
        on_time: r.due_date ? r.date_closed <= r.due_date : false,
      }),
    )
    setOtdRows(parsed)
  }

  useEffect(() => {
    void loadOtdData(otdYear)
  }, [otdYear])

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
      'Turnaround',
      'Status',
      'Date Closed',
      'Description',
      'Notes',
    ]
    const lines = rows.map((row) =>
      [
        row.valve_id,
        normalizeJobType(row.job_type),
        row.customer ?? '',
        row.cell ?? '',
        row.size ?? '',
        isTurnaroundValve(row) ? 'Yes' : 'No',
        row.status,
        row.date_closed ?? '',
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
    a.download = `completed-jobs-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
    setTestLogLoading(false)
    if (error) {
      showToast(`Test log report failed: ${error.message}`)
      setTestLogRows([])
      return
    }
    setTestLogRows((data as TestLogEntry[]) ?? [])
  }

  const exportTestLogCsv = () => {
    const header = ['Date', 'Valve ID', 'Test Type', 'Pass/Fail', 'Tester', 'Action Taken']
    const lines = testLogRows.map((row) =>
      [row.tested_on, row.valve_id, row.test_type ?? '', row.pass_fail ?? '', row.tester ?? '', row.action_taken ?? '']
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

      <section className="dashboard-panel">
        <h3>On-time delivery</h3>
        <p className="placeholder-copy">
          Percentage of completed jobs closed on or before their due date. Jobs with no due date are excluded from percentage calculations.
        </p>
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

      <section className="dashboard-panel">
        <h3>Completed jobs report</h3>
        <p className="placeholder-copy">
          Filter by close date. Use turnaround filter for customer update packages or to exclude turnarounds.
        </p>
        <div className="report-filters">
          <label>
            Start date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
                <th>Turnaround</th>
                <th>Status</th>
                <th>Date closed</th>
                <th>Description</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.valve_id}</td>
                  <td>{normalizeJobType(row.job_type)}</td>
                  <td>{row.customer ?? '-'}</td>
                  <td>{row.cell ?? '-'}</td>
                  <td>{row.size ?? '-'}</td>
                  <td>{isTurnaroundValve(row) ? 'Yes' : 'No'}</td>
                  <td>{row.status}</td>
                  <td>{row.date_closed ?? '-'}</td>
                  <td className="table-cell-clamp">{row.description ?? '-'}</td>
                  <td className="table-cell-clamp">{row.notes ?? '-'}</td>
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
                <th>Test Type</th>
                <th>Pass/Fail</th>
                <th>Tester</th>
                <th>Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {testLogRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.tested_on}</td>
                  <td>{row.valve_id}</td>
                  <td>{row.test_type ?? '-'}</td>
                  <td>{row.pass_fail ?? '-'}</td>
                  <td>{row.tester ?? '-'}</td>
                  <td className="table-cell-clamp">{row.action_taken ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
