import { Fragment, useEffect, useMemo, useState } from 'react'
import { TestLogColumnHeader } from '../components/testLog/TestLogColumnHeader'
import { TestLogEntryForm } from '../components/testLog/TestLogEntryForm'
import { TestLogReportsSection } from '../components/testLog/TestLogReportsSection'
import { useAuth } from '../contexts/AuthContext'
import { canWriteShop } from '../lib/roles'
import { normalizeValveId } from '../lib/valveId'
import { supabase } from '../lib/supabase'
import { testLogHasDetailsColumn, testLogSelectColumns } from '../lib/testLogSchema'
import { fetchValveDescriptionsByIds } from '../lib/testLogValveLookup'
import { formatTestProceduresSummary, parseTestLogTestingDetails, resolveTestMedia } from '../types/testLog'
import { formatCheckedStandardsSummary, formatTestPressuresSummary } from '../lib/testStandardParams'
import type { TestLogEntry } from '../types'

type SortColumn =
  | 'tested_on'
  | 'valve_id'
  | 'description'
  | 'size'
  | 'pressure'
  | 'test_type'
  | 'pass_fail'
  | 'tester'
  | 'action_taken'
  | 'saved_at'

const RECENT_TABLE_COL_COUNT = 10
type SortDirection = 'asc' | 'desc'

type TableColumnFilters = {
  test_type: string[]
  pass_fail: string[]
  tester: string[]
}

const EMPTY_TABLE_FILTERS: TableColumnFilters = {
  test_type: [],
  pass_fail: [],
  tester: [],
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? '')
    .trim()
    .localeCompare(String(b ?? '').trim(), undefined, { numeric: true, sensitivity: 'base' })
}

function uniqueSortedValues(rows: TestLogEntry[], getter: (row: TestLogEntry) => string | null | undefined) {
  const values = new Set<string>()
  for (const row of rows) {
    const value = String(getter(row) ?? '').trim()
    if (value) values.add(value)
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

const TEST_LOG_DETAILS_SQL = `alter table public.test_logs
  add column if not exists testing_details jsonb;`

function supabaseSqlEditorUrl() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const projectRef = url?.match(/^https:\/\/([^.]+)\.supabase\.co/i)?.[1]
  return projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : 'https://supabase.com/dashboard'
}

function todayIsoDate() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toIsoDate(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function monthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

function previousMonthRange(reference = new Date()) {
  return monthRange(new Date(reference.getFullYear(), reference.getMonth() - 1, 1))
}

function yearStartIso(reference = new Date()) {
  return `${reference.getFullYear()}-01-01`
}

function monthOverMonthChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return null
    return 100
  }
  return Math.round(((current - previous) / previous) * 100)
}

async function countTestLogsBetween(start: string, end: string) {
  const { count, error } = await supabase
    .from('test_logs')
    .select('id', { count: 'exact', head: true })
    .gte('tested_on', start)
    .lte('tested_on', end)
  if (error) return 0
  return count ?? 0
}

async function countUniqueValvesBetween(start: string, end: string) {
  const unique = new Set<string>()
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('test_logs')
      .select('valve_id')
      .gte('tested_on', start)
      .lte('tested_on', end)
      .range(from, from + pageSize - 1)
    if (error || !data?.length) break
    for (const row of data) {
      const valveId = String((row as { valve_id?: string }).valve_id ?? '').trim()
      if (valveId) unique.add(valveId.toUpperCase())
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return unique.size
}

function isPassResult(value: string | null | undefined) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  return v === 'pass' || v === 'passed' || v === 'p'
}

function isFailResult(value: string | null | undefined) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
  return v === 'fail' || v === 'failed' || v === 'f'
}

type MonthVolumeBucket = {
  key: string
  label: string
  priorKey: string
  priorYearLabel: string
  currentYearLabel: string
  priorCount: number
  currentCount: number
  changePct: number | null
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function yearShortLabel(date: Date) {
  return String(date.getFullYear()).slice(-2)
}

function buildEmptyLast12MonthComparisons(reference = new Date()): MonthVolumeBucket[] {
  const months: MonthVolumeBucket[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const current = new Date(reference.getFullYear(), reference.getMonth() - i, 1)
    const prior = new Date(current.getFullYear() - 1, current.getMonth(), 1)
    months.push({
      key: monthKey(current),
      label: current.toLocaleDateString(undefined, { month: 'short' }),
      priorKey: monthKey(prior),
      priorYearLabel: yearShortLabel(prior),
      currentYearLabel: yearShortLabel(current),
      priorCount: 0,
      currentCount: 0,
      changePct: null,
    })
  }
  return months
}

async function loadLast12MonthVolumes(reference = new Date()): Promise<MonthVolumeBucket[]> {
  const buckets = buildEmptyLast12MonthComparisons(reference)
  const counts = new Map<string, number>()
  for (const bucket of buckets) {
    counts.set(bucket.key, 0)
    counts.set(bucket.priorKey, 0)
  }

  const oldestPrior = new Date(reference.getFullYear() - 1, reference.getMonth() - 11, 1)
  const rangeStart = monthRange(oldestPrior).start
  const rangeEnd = monthRange(reference).end
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('test_logs')
      .select('tested_on')
      .gte('tested_on', rangeStart)
      .lte('tested_on', rangeEnd)
      .range(from, from + pageSize - 1)
    if (error || !data?.length) break
    for (const row of data) {
      const key = String((row as { tested_on?: string }).tested_on ?? '').slice(0, 7)
      if (!counts.has(key)) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    if (data.length < pageSize) break
    from += pageSize
  }

  return buckets.map((bucket) => {
    const priorCount = counts.get(bucket.priorKey) ?? 0
    const currentCount = counts.get(bucket.key) ?? 0
    return {
      ...bucket,
      priorCount,
      currentCount,
      changePct: monthOverMonthChange(currentCount, priorCount),
    }
  })
}

function formatSavedAt(row: TestLogEntry) {
  const details = parseTestLogTestingDetails(row.testing_details)
  const raw = details?.savedAt || row.created_at
  if (!raw) return '—'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)
  return date.toLocaleString()
}

function PassFailBadge({ value }: { value: string | null | undefined }) {
  if (isPassResult(value)) return <span className="test-log-result-badge test-log-result-pass">Pass</span>
  if (isFailResult(value)) return <span className="test-log-result-badge test-log-result-fail">Fail</span>
  return <span className="test-log-result-badge test-log-result-unknown">{value?.trim() || '—'}</span>
}

export function TestLogEntryPage() {
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const [rows, setRows] = useState<TestLogEntry[]>([])
  const [valveSearch, setValveSearch] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [searchOptions, setSearchOptions] = useState<string[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)
  const [editingEntry, setEditingEntry] = useState<TestLogEntry | null>(null)
  const [valveDescriptions, setValveDescriptions] = useState<Record<string, string>>({})
  const [detailsColumnReady, setDetailsColumnReady] = useState<boolean | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn>('tested_on')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [tableFilters, setTableFilters] = useState<TableColumnFilters>(EMPTY_TABLE_FILTERS)
  const [periodStats, setPeriodStats] = useState<{
    loading: boolean
    testsThisMonth: number
    testsPrevMonth: number
    valvesThisMonth: number
    valvesThisYear: number
    monthlyVolumes: MonthVolumeBucket[]
  }>({
    loading: true,
    testsThisMonth: 0,
    testsPrevMonth: 0,
    valvesThisMonth: 0,
    valvesThisYear: 0,
    monthlyVolumes: buildEmptyLast12MonthComparisons(),
  })

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'tested_on' ? 'desc' : 'asc')
  }

  const setTableFilter = (key: keyof TableColumnFilters, selected: string[]) => {
    setTableFilters((prev) => ({ ...prev, [key]: selected }))
  }

  const loadPeriodStats = async () => {
    setPeriodStats((prev) => ({ ...prev, loading: true }))
    const now = new Date()
    const thisMonth = monthRange(now)
    const prevMonth = previousMonthRange(now)
    const yearStart = yearStartIso(now)
    const yearEnd = todayIsoDate()

    const [testsThisMonth, testsPrevMonth, valvesThisMonth, valvesThisYear, monthlyVolumes] = await Promise.all([
      countTestLogsBetween(thisMonth.start, thisMonth.end),
      countTestLogsBetween(prevMonth.start, prevMonth.end),
      countUniqueValvesBetween(thisMonth.start, thisMonth.end),
      countUniqueValvesBetween(yearStart, yearEnd),
      loadLast12MonthVolumes(now),
    ])

    setPeriodStats({
      loading: false,
      testsThisMonth,
      testsPrevMonth,
      valvesThisMonth,
      valvesThisYear,
      monthlyVolumes,
    })
  }

  const loadRows = async (searchOverride?: string) => {
    setLoadingRows(true)
    const selectColumns = await testLogSelectColumns()
    let query = supabase
      .from('test_logs')
      .select(selectColumns)
      .order('tested_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

    const rawSearch = searchOverride !== undefined ? searchOverride : valveSearch
    const normalizedSearch = normalizeValveId(rawSearch)
    if (normalizedSearch) query = query.ilike('valve_id', `%${normalizedSearch}%`)
    if (filterStartDate) query = query.gte('tested_on', filterStartDate)
    if (filterEndDate) query = query.lte('tested_on', filterEndDate)

    const { data } = await query
    const nextRows = (data as unknown as TestLogEntry[]) ?? []
    setRows(nextRows)
    const descriptions = await fetchValveDescriptionsByIds(nextRows.map((row) => row.valve_id))
    setValveDescriptions(descriptions)
    setLoadingRows(false)
  }

  useEffect(() => {
    void testLogHasDetailsColumn().then(setDetailsColumnReady)
    void loadRows()
    void loadPeriodStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const run = async () => {
      const normalizedSearch = normalizeValveId(valveSearch)
      if (!normalizedSearch) {
        setSearchOptions([])
        return
      }
      const { data } = await supabase
        .from('test_logs')
        .select('valve_id')
        .ilike('valve_id', `%${normalizedSearch}%`)
        .limit(12)
      setSearchOptions(Array.from(new Set((data ?? []).map((row: { valve_id: string }) => row.valve_id))))
    }
    void run()
  }, [valveSearch])

  const filterOptions = useMemo(
    () => ({
      test_type: uniqueSortedValues(rows, (row) => row.test_type),
      pass_fail: uniqueSortedValues(rows, (row) => {
        if (isPassResult(row.pass_fail)) return 'Pass'
        if (isFailResult(row.pass_fail)) return 'Fail'
        return String(row.pass_fail ?? '').trim() || null
      }),
      tester: uniqueSortedValues(rows, (row) => row.tester),
    }),
    [rows],
  )

  const descriptionFor = (valveId: string) =>
    valveDescriptions[String(valveId ?? '').trim().toUpperCase()] ?? ''

  const displayRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (tableFilters.test_type.length > 0) {
        const value = String(row.test_type ?? '').trim()
        if (!tableFilters.test_type.includes(value)) return false
      }
      if (tableFilters.pass_fail.length > 0) {
        let normalized = String(row.pass_fail ?? '').trim()
        if (isPassResult(row.pass_fail)) normalized = 'Pass'
        else if (isFailResult(row.pass_fail)) normalized = 'Fail'
        if (!tableFilters.pass_fail.includes(normalized)) return false
      }
      if (tableFilters.tester.length > 0) {
        const value = String(row.tester ?? '').trim()
        if (!tableFilters.tester.includes(value)) return false
      }
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      switch (sortColumn) {
        case 'tested_on':
          result = compareText(a.tested_on, b.tested_on) || compareText(a.created_at, b.created_at)
          break
        case 'valve_id':
          result = compareText(a.valve_id, b.valve_id)
          break
        case 'description':
          result = compareText(descriptionFor(a.valve_id), descriptionFor(b.valve_id))
          break
        case 'size':
          result = compareText(a.size, b.size)
          break
        case 'pressure':
          result = compareText(a.pressure, b.pressure)
          break
        case 'test_type':
          result = compareText(a.test_type, b.test_type)
          break
        case 'pass_fail':
          result = compareText(a.pass_fail, b.pass_fail)
          break
        case 'tester':
          result = compareText(a.tester, b.tester)
          break
        case 'action_taken':
          result = compareText(a.action_taken, b.action_taken)
          break
        case 'saved_at':
          result = compareText(
            parseTestLogTestingDetails(a.testing_details)?.savedAt || a.created_at,
            parseTestLogTestingDetails(b.testing_details)?.savedAt || b.created_at,
          )
          break
      }
      return sortDirection === 'asc' ? result : -result
    })

    return sorted
  }, [rows, sortColumn, sortDirection, tableFilters, valveDescriptions])

  const activeTableFilterCount =
    tableFilters.test_type.length + tableFilters.pass_fail.length + tableFilters.tester.length

  const kpis = useMemo(() => {
    const today = todayIsoDate()
    let passCount = 0
    let failCount = 0
    let todayCount = 0
    for (const row of displayRows) {
      if (isPassResult(row.pass_fail)) passCount += 1
      if (isFailResult(row.pass_fail)) failCount += 1
      if (String(row.tested_on ?? '').slice(0, 10) === today) todayCount += 1
    }
    const judged = passCount + failCount
    const passRate = judged > 0 ? Math.round((passCount / judged) * 100) : null
    return {
      todayCount,
      passCount,
      failCount,
      passRate,
    }
  }, [displayRows])

  const monthChangePct = monthOverMonthChange(periodStats.testsThisMonth, periodStats.testsPrevMonth)
  const monthChangeLabel =
    monthChangePct == null
      ? 'No prior-month data'
      : monthChangePct === 0
        ? 'Flat vs last month'
        : `${monthChangePct > 0 ? '↑' : '↓'} ${Math.abs(monthChangePct)}% vs last month`

  const monthlyVolumes = periodStats.monthlyVolumes
  const maxMonthCount = useMemo(
    () => Math.max(1, ...monthlyVolumes.flatMap((month) => [month.priorCount, month.currentCount])),
    [monthlyVolumes],
  )

  return (
    <section className="dashboard-page test-log-page">
      <div className="dashboard-title-row">
        <div>
          <h2 className="dashboard-title">Test log</h2>
          <p className="test-log-page-subtitle">Shop testing activity — enter a valve, then review recent results.</p>
        </div>
      </div>

      {detailsColumnReady === false ? (
        <div className="status-breakdown-note test-log-schema-warning" role="status">
          <p>
            <strong>Database update required</strong> before saving full test log details. Open the{' '}
            <a href={supabaseSqlEditorUrl()} target="_blank" rel="noreferrer">
              Supabase SQL Editor
            </a>
            , paste this, and click <strong>Run</strong>:
          </p>
          <pre className="test-log-schema-sql">{TEST_LOG_DETAILS_SQL}</pre>
          <p>Then refresh this page — the warning should disappear.</p>
        </div>
      ) : null}

      <div className="dashboard-kpis test-log-kpis" aria-label="Test log summary">
        <div className="kpi-card">
          <div className="kpi-number blue">{loadingRows ? '…' : kpis.todayCount}</div>
          <div className="kpi-label">Tests today</div>
          <div className="kpi-sublabel">Based on current filters</div>
        </div>
        <div className="kpi-card">
          <div className={`kpi-number ${kpis.passRate == null ? 'slate' : kpis.passRate >= 90 ? 'green' : kpis.passRate >= 75 ? 'amber' : 'red'}`}>
            {loadingRows ? '…' : kpis.passRate == null ? '—' : `${kpis.passRate}%`}
          </div>
          <div className="kpi-label">Pass rate</div>
          <div className="kpi-sublabel">
            {kpis.passCount} pass · {kpis.failCount} fail
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-number slate">{periodStats.loading ? '…' : periodStats.testsThisMonth}</div>
          <div className="kpi-label">Tests this month</div>
          <div
            className={`kpi-sublabel${
              monthChangePct == null || monthChangePct === 0
                ? ''
                : monthChangePct > 0
                  ? ' kpi-trend-up'
                  : ' kpi-trend-down'
            }`}
          >
            {periodStats.loading ? 'Comparing to last month…' : monthChangeLabel}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-number amber">{periodStats.loading ? '…' : periodStats.valvesThisMonth}</div>
          <div className="kpi-label">Valves tested</div>
          <div className="kpi-sublabel">
            {periodStats.loading
              ? 'Loading month & year…'
              : `${periodStats.valvesThisMonth} this month · ${periodStats.valvesThisYear} this year`}
          </div>
        </div>
      </div>

      <div className="test-log-overview-grid">
        <section className="dashboard-panel test-log-chart-panel" aria-label="Year over year test volume for the last 12 months">
          <div className="test-log-recent-header">
            <h3>Last 12 months</h3>
            <p className="test-log-recent-meta">Same month, prior year vs current</p>
          </div>
          <div className="test-log-yoy-legend" aria-hidden="true">
            <span className="test-log-yoy-legend-item">
              <span className="test-log-yoy-swatch test-log-yoy-swatch-prior" /> Prior year
            </span>
            <span className="test-log-yoy-legend-item">
              <span className="test-log-yoy-swatch test-log-yoy-swatch-current" /> Current year
            </span>
          </div>
          <div
            className="test-log-bar-chart test-log-bar-chart-months"
            role="img"
            aria-label="Side-by-side bar chart comparing each of the last 12 months to the same month last year"
          >
            {monthlyVolumes.map((month) => {
              const changeTitle =
                month.changePct == null
                  ? `No ${month.label} '${month.priorYearLabel} data`
                  : month.changePct === 0
                    ? `Flat vs ${month.label} '${month.priorYearLabel}`
                    : `${month.changePct > 0 ? '↑' : '↓'} ${Math.abs(month.changePct)}% vs ${month.label} '${month.priorYearLabel}`
              const priorHeight = Math.max(
                month.priorCount > 0 ? 12 : 4,
                Math.round((month.priorCount / maxMonthCount) * 100),
              )
              const currentHeight = Math.max(
                month.currentCount > 0 ? 12 : 4,
                Math.round((month.currentCount / maxMonthCount) * 100),
              )
              return (
                <div key={month.key} className="test-log-bar-col test-log-bar-col-yoy">
                  <div className="test-log-bar-pair">
                    <div className="test-log-bar-track" title={`${month.label} '${month.priorYearLabel}: ${month.priorCount}`}>
                      <div
                        className={`test-log-bar-fill test-log-bar-fill-prior${month.priorCount > 0 ? '' : ' test-log-bar-fill-empty'}`}
                        style={{ height: `${priorHeight}%` }}
                      />
                    </div>
                    <div className="test-log-bar-track" title={`${month.label} '${month.currentYearLabel}: ${month.currentCount}`}>
                      <div
                        className={`test-log-bar-fill test-log-bar-fill-current${month.currentCount > 0 ? '' : ' test-log-bar-fill-empty'}`}
                        style={{ height: `${currentHeight}%` }}
                      />
                    </div>
                  </div>
                  <div className="test-log-bar-count-pair">
                    <span className="test-log-bar-count test-log-bar-count-prior">
                      {periodStats.loading ? '…' : month.priorCount}
                    </span>
                    <span className="test-log-bar-count test-log-bar-count-current">
                      {periodStats.loading ? '…' : month.currentCount}
                    </span>
                  </div>
                  <div
                    className={`test-log-bar-mom${
                      month.changePct == null || month.changePct === 0
                        ? ''
                        : month.changePct > 0
                          ? ' kpi-trend-up'
                          : ' kpi-trend-down'
                    }`}
                    title={changeTitle}
                  >
                    {periodStats.loading || month.changePct == null
                      ? '—'
                      : month.changePct === 0
                        ? '0%'
                        : `${month.changePct > 0 ? '↑' : '↓'}${Math.abs(month.changePct)}%`}
                  </div>
                  <div className="test-log-bar-label">{month.label}</div>
                  <div className="test-log-bar-year-pair">
                    '{month.priorYearLabel} · '{month.currentYearLabel}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="dashboard-panel test-log-split-panel" aria-label="Pass and fail split">
          <div className="test-log-recent-header">
            <h3>Results split</h3>
            <p className="test-log-recent-meta">Pass vs fail in current view</p>
          </div>
          <div className="test-log-split-bars">
            <div className="test-log-split-row">
              <span className="test-log-split-label">Pass</span>
              <div className="test-log-split-track">
                <div
                  className="test-log-split-fill test-log-split-fill-pass"
                  style={{
                    width: `${kpis.passCount + kpis.failCount > 0 ? Math.round((kpis.passCount / (kpis.passCount + kpis.failCount)) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="test-log-split-value">{kpis.passCount}</span>
            </div>
            <div className="test-log-split-row">
              <span className="test-log-split-label">Fail</span>
              <div className="test-log-split-track">
                <div
                  className="test-log-split-fill test-log-split-fill-fail"
                  style={{
                    width: `${kpis.passCount + kpis.failCount > 0 ? Math.round((kpis.failCount / (kpis.passCount + kpis.failCount)) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="test-log-split-value">{kpis.failCount}</span>
            </div>
          </div>
        </section>
      </div>

      {canWrite ? (
        <TestLogEntryForm
          detailsColumnReady={detailsColumnReady}
          editingEntry={editingEntry}
          onCancelEdit={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null)
            void loadRows()
            void loadPeriodStats()
          }}
        />
      ) : (
        <p className="placeholder-copy">View only — ask an Admin or Manager to enter or change test logs.</p>
      )}

      <section className="dashboard-panel test-log-recent-panel">
        <div className="test-log-recent-header">
          <h3>Recent test log entries</h3>
          <p className="test-log-recent-meta">Showing up to 300 rows · click a row for details</p>
        </div>
        <div className="report-filters test-log-recent-filters">
          <label className="test-log-recent-search">
            Search valve ID
            <input
              type="text"
              value={valveSearch}
              onChange={(e) => setValveSearch(e.target.value)}
              placeholder="Start typing valve ID"
              list="test-log-valve-options"
            />
            <datalist id="test-log-valve-options">
              {searchOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label>
            From date
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
          </label>
          <label>
            To date
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
          </label>
          <div className="test-log-recent-filter-actions">
            <button type="button" className="button-primary" onClick={() => void loadRows()} disabled={loadingRows}>
              {loadingRows ? 'Filtering…' : 'Apply filters'}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setValveSearch('')
                setFilterStartDate('')
                setFilterEndDate('')
                setTableFilters(EMPTY_TABLE_FILTERS)
                setSortColumn('tested_on')
                setSortDirection('desc')
                void loadRows('')
              }}
            >
              Clear
            </button>
          </div>
        </div>
        {activeTableFilterCount > 0 ? (
          <div className="test-log-column-filter-bar">
            <span>
              {activeTableFilterCount} column filter{activeTableFilterCount === 1 ? '' : 's'} active · {displayRows.length}{' '}
              row{displayRows.length === 1 ? '' : 's'} shown
            </span>
            <button type="button" className="button-secondary" onClick={() => setTableFilters(EMPTY_TABLE_FILTERS)}>
              Clear column filters
            </button>
          </div>
        ) : null}
        <div className="dashboard-table-wrap">
          <table className="dashboard-table test-log-recent-table">
            <thead>
              <tr>
                <th>
                  <TestLogColumnHeader
                    label="Date"
                    sortActive={sortColumn === 'tested_on'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('tested_on')}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Valve ID"
                    sortActive={sortColumn === 'valve_id'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('valve_id')}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Description"
                    sortActive={sortColumn === 'description'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('description')}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Size"
                    sortActive={sortColumn === 'size'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('size')}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Pressure"
                    sortActive={sortColumn === 'pressure'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('pressure')}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Test medium"
                    sortActive={sortColumn === 'test_type'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('test_type')}
                    filterOptions={filterOptions.test_type}
                    selectedFilters={tableFilters.test_type}
                    onFilterChange={(selected) => setTableFilter('test_type', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Pass/Fail"
                    sortActive={sortColumn === 'pass_fail'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('pass_fail')}
                    filterOptions={filterOptions.pass_fail}
                    selectedFilters={tableFilters.pass_fail}
                    onFilterChange={(selected) => setTableFilter('pass_fail', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Tester"
                    sortActive={sortColumn === 'tester'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('tester')}
                    filterOptions={filterOptions.tester}
                    selectedFilters={tableFilters.tester}
                    onFilterChange={(selected) => setTableFilter('tester', selected)}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Action"
                    sortActive={sortColumn === 'action_taken'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('action_taken')}
                  />
                </th>
                <th>
                  <TestLogColumnHeader
                    label="Saved"
                    sortActive={sortColumn === 'saved_at'}
                    sortDirection={sortDirection}
                    onSort={() => toggleSort('saved_at')}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && !loadingRows ? (
                <tr>
                  <td colSpan={RECENT_TABLE_COL_COUNT} className="test-log-empty-row">
                    No test log entries match these filters.
                  </td>
                </tr>
              ) : null}
              {displayRows.map((row) => {
                const isExpanded = expandedRowId === row.id
                const details = parseTestLogTestingDetails(row.testing_details)
                const description = descriptionFor(row.valve_id)
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`test-log-row${isExpanded ? ' test-log-row-expanded' : ''}`}
                      onClick={() => setExpandedRowId((prev) => (prev === row.id ? null : row.id))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedRowId((prev) => (prev === row.id ? null : row.id))
                        }
                      }}
                      aria-expanded={isExpanded}
                    >
                      <td>
                        <span className="test-log-row-toggle" aria-hidden>
                          {isExpanded ? '▼' : '▶'}
                        </span>{' '}
                        {row.tested_on}
                      </td>
                      <td>
                        <span className="test-log-valve-id">{row.valve_id}</span>
                      </td>
                      <td className="table-cell-clamp" title={description || undefined}>
                        {description || '—'}
                      </td>
                      <td>{row.size?.trim() || '—'}</td>
                      <td>{row.pressure?.trim() || '—'}</td>
                      <td>{row.test_type ?? '-'}</td>
                      <td>
                        <PassFailBadge value={row.pass_fail} />
                      </td>
                      <td>
                        <span className="test-log-tester-chip">{row.tester ?? '-'}</span>
                      </td>
                      <td>{row.action_taken ?? '-'}</td>
                      <td className="test-log-saved-at">{formatSavedAt(row)}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className="test-log-detail-row">
                        <td colSpan={RECENT_TABLE_COL_COUNT}>
                          <div className="test-log-detail-panel">
                            {canWrite ? (
                              <div className="test-log-detail-actions">
                                <button
                                  type="button"
                                  className="button-primary"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingEntry(row)
                                  }}
                                >
                                  {editingEntry?.id === row.id ? 'Editing…' : 'Edit test'}
                                </button>
                              </div>
                            ) : null}
                            <div className="test-log-detail-grid">
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Saved</span>
                                <span className="test-log-detail-value">{formatSavedAt(row)}</span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Description</span>
                                <span
                                  className={
                                    description
                                      ? 'test-log-detail-value'
                                      : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {description || '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Size</span>
                                <span className={row.size ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'}>
                                  {row.size ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Pressure</span>
                                <span
                                  className={
                                    row.pressure ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {row.pressure ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Standard</span>
                                <span
                                  className={
                                    details?.testStandardParams?.checkedStandards?.length
                                      ? 'test-log-detail-value'
                                      : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {details?.testStandardParams?.checkedStandards?.length
                                    ? formatCheckedStandardsSummary(details.testStandardParams.checkedStandards)
                                    : '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Test pressures</span>
                                <span
                                  className={
                                    details?.testStandardParams
                                      ? 'test-log-detail-value'
                                      : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {details?.testStandardParams
                                    ? formatTestPressuresSummary({
                                        shellPressure: details.testStandardParams.shellPressure,
                                        hpSeatPressure: details.testStandardParams.hpSeatPressure,
                                        lpSeatPressure: details.testStandardParams.lpSeatPressure,
                                      })
                                    : '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Type</span>
                                <span
                                  className={
                                    row.valve_type ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {row.valve_type ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Test requirements</span>
                                <span
                                  className={
                                    details && formatTestProceduresSummary(details)
                                      ? 'test-log-detail-value'
                                      : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {(details && formatTestProceduresSummary(details)) || row.worked || '—'}
                                </span>
                              </div>
                            </div>

                            {details ? (
                              <>
                                <div className="test-log-detail-pressure-grid">
                                  {(
                                    [
                                      ['Low', details.lowTest],
                                      ['High', details.highTest],
                                      ['Shell', details.shellTest],
                                    ] as const
                                  ).map(([label, block]) => (
                                    <div key={label} className="test-log-detail-pressure-card">
                                      <div className="test-log-detail-pressure-title">{label} pressure</div>
                                      <div>Media: {resolveTestMedia(block) || '—'}</div>
                                      <div>Gauge: {block.gauge || '—'}</div>
                                      <div>Pressure: {block.pressure || '—'}</div>
                                      <div>Time: {block.time || '—'}</div>
                                      {label === 'Shell' && block.chartRecorderNumber ? (
                                        <div>Chart recorder: {block.chartRecorderNumber}</div>
                                      ) : null}
                                      <div>Result: {block.result ? block.result.toUpperCase() : '—'}</div>
                                      {block.reason ? <div>Reason: {block.reason}</div> : null}
                                    </div>
                                  ))}
                                </div>

                                {details.heliumTest.enabled ? (
                                  <div className="test-log-detail-additional-block">
                                    <div className="test-log-detail-pressure-title">Helium test</div>
                                    <div>Media: {resolveTestMedia(details.heliumTest) || '—'}</div>
                                    <div>Gauge: {details.heliumTest.gauge || '—'}</div>
                                    <div>Pressure: {details.heliumTest.pressure || '—'}</div>
                                    <div>Time: {details.heliumTest.time || '—'}</div>
                                    <div>Ambient: {details.heliumTest.ambient || '—'}</div>
                                    <div>Stem: {details.heliumTest.stem || '—'}</div>
                                    <div>Bonnet: {details.heliumTest.bonnet || '—'}</div>
                                    <div>Body: {details.heliumTest.body || '—'}</div>
                                    <div>
                                      Result: {details.heliumTest.result ? details.heliumTest.result.toUpperCase() : '—'}
                                    </div>
                                  </div>
                                ) : null}

                                {details.cavityReliefTest.enabled ? (
                                  <div className="test-log-detail-additional-block">
                                    <div className="test-log-detail-pressure-title">Cavity relief test</div>
                                    <div>Media: {resolveTestMedia(details.cavityReliefTest) || '—'}</div>
                                    <div>MAWP @ 100°F: {details.cavityReliefTest.mawp100F || '—'}</div>
                                    <div>Seat A: {details.cavityReliefTest.seatA || '—'}</div>
                                    <div>Seat B: {details.cavityReliefTest.seatB || '—'}</div>
                                    <div>
                                      Result:{' '}
                                      {details.cavityReliefTest.result ? details.cavityReliefTest.result.toUpperCase() : '—'}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            {details?.additionalNotes ? (
                              <p className="test-log-detail-additional">
                                <span className="test-log-detail-label">Other notes</span> {details.additionalNotes}
                              </p>
                            ) : null}

                            {details ? (
                              <TestLogReportsSection
                                mode="saved"
                                testLogId={row.id}
                                reportData={{
                                  tested_on: row.tested_on,
                                  valve_id: row.valve_id,
                                  size: row.size,
                                  pressure: row.pressure,
                                  valve_type: row.valve_type,
                                  manufacturer: row.manufacturer,
                                  tester: row.tester,
                                  pass_fail: row.pass_fail,
                                  action_taken: row.action_taken,
                                  testing_details: details,
                                }}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
