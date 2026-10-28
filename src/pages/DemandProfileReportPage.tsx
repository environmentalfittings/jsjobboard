import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { JOB_TYPES } from '../constants/jobTypes'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import {
  resolveActiveCompanyKey,
} from '../lib/companyDataScope'
import {
  customerYoyPct,
  demandAllTimeStart,
  demandDefaultRange,
  downloadCsv,
  fetchDemandProfileJobs,
  fetchDemandProfileReport,
  isDecliningCustomer,
  stackedBarSeries,
  typeYoyPct,
  uniquePeriods,
  type DemandCustomerSummaryRow,
  type DemandPeriod,
  type DemandProfileJobRow,
  type DemandProfileReport,
  type DemandTypeDimension,
} from '../lib/demandProfile'
import { printDemandProfileReport } from '../lib/demandProfilePrint'

type FilterOption = { value: string; label: string }

function mergeFilterOptions(
  prev: FilterOption[],
  incoming: FilterOption[],
  selected: string[],
): FilterOption[] {
  const byValue = new Map<string, FilterOption>()
  for (const opt of prev) byValue.set(opt.value, opt)
  for (const opt of incoming) byValue.set(opt.value, opt)
  for (const value of selected) {
    if (!byValue.has(value)) byValue.set(value, { value, label: value })
  }
  return [...byValue.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
}

function SearchableMultiFilter({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Search…',
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q),
    )
  }, [options, query])

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )
  }

  const selectedLabels = selected.map(
    (value) => options.find((opt) => opt.value === value)?.label ?? value,
  )

  return (
    <div className="demand-search-filter" ref={rootRef}>
      <span className="demand-search-filter-label">{label}</span>
      <button
        type="button"
        className={`demand-search-filter-trigger${selected.length ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>
          {selected.length === 0
            ? `All ${label.toLowerCase()}`
            : selected.length === 1
              ? selectedLabels[0]
              : `${selected.length} selected`}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="demand-search-filter-panel" role="listbox" aria-label={label}>
          <input
            type="search"
            className="demand-search-filter-input"
            value={query}
            placeholder={placeholder}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="demand-search-filter-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <span className="job-muted">
              {filtered.length} of {options.length}
            </span>
          </div>
          <ul className="demand-search-filter-list">
            {filtered.length === 0 ? (
              <li className="demand-search-filter-empty">No matches</li>
            ) : (
              filtered.map((opt) => {
                const checked = selected.includes(opt.value)
                return (
                  <li key={opt.value}>
                    <label className={`demand-search-filter-option${checked ? ' is-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
      {selected.length > 0 ? (
        <div className="demand-search-filter-tags">
          {selectedLabels.slice(0, 4).map((text, index) => (
            <button
              key={`${selected[index]}-${text}`}
              type="button"
              className="demand-search-filter-tag"
              title={`Remove ${text}`}
              onClick={() => toggle(selected[index])}
            >
              {text}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {selected.length > 4 ? (
            <span className="job-muted">+{selected.length - 4} more</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const PERIOD_PRESETS: { value: '24' | '36' | 'all'; label: string }[] = [
  { value: '24', label: '24 mo' },
  { value: '36', label: '36 mo' },
  { value: 'all', label: 'All time' },
]

const TYPE_DIMENSIONS: { value: DemandTypeDimension; label: string }[] = [
  { value: 'valve_type', label: 'Valve type' },
  { value: 'job_type', label: 'Job type' },
  { value: 'size', label: 'Size' },
  { value: 'pressure_class', label: 'Pressure class' },
]

const GROUP_BY: { value: DemandPeriod; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]

const TYPE_COLORS = [
  '#0f766e',
  '#0369a1',
  '#a16207',
  '#be123c',
  '#7c3aed',
  '#15803d',
  '#c2410c',
  '#334155',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#4b5563',
]

function formatYoy(pct: number | null): string {
  if (pct == null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

export function DemandProfileReportPage() {
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyKey = useMemo(
    () => resolveActiveCompanyKey(workflow.key, activeOrganization),
    [workflow.key, activeOrganization],
  )
  const companyLabel = activeOrganization?.name?.trim() || (companyKey === 'vsi' ? 'VSI' : 'JS Valve')

  const defaultRange = useMemo(() => demandDefaultRange(24), [])
  const [rangePreset, setRangePreset] = useState<'24' | '36' | 'all'>('24')
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [period, setPeriod] = useState<DemandPeriod>('quarter')
  const [typeDimension, setTypeDimension] = useState<DemandTypeDimension>('valve_type')
  const [jobTypeFilter, setJobTypeFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [customerFilter, setCustomerFilter] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<DemandProfileReport | null>(null)
  const [typeOptions, setTypeOptions] = useState<FilterOption[]>([])
  const [customerOptions, setCustomerOptions] = useState<FilterOption[]>([])
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([...JOB_TYPES])
  const [drillJobs, setDrillJobs] = useState<DemandProfileJobRow[]>([])
  const [drillTitle, setDrillTitle] = useState('')
  const [drillLoading, setDrillLoading] = useState(false)

  const applyPreset = (preset: '24' | '36' | 'all') => {
    setRangePreset(preset)
    if (preset === 'all') {
      setStartDate(demandAllTimeStart())
      setEndDate(demandDefaultRange(24).end)
      return
    }
    const range = demandDefaultRange(Number(preset))
    setStartDate(range.start)
    setEndDate(range.end)
  }

  const load = useCallback(async () => {
    if (!startDate || !endDate) return
    if (startDate > endDate) {
      showToast('Start date must be on or before end date')
      return
    }
    setLoading(true)
    const result = await fetchDemandProfileReport({
      start: startDate,
      end: endDate,
      period,
      typeDimension,
      jobTypes: jobTypeFilter,
      typeKeys: typeFilter,
      customerKeys: customerFilter,
      workflowKey: companyKey,
      activeOrganization,
    })
    setLoading(false)
    if (result.error || !result.data) {
      showToast(
        /demand_profile_report|schema cache|could not find/i.test(result.error ?? '')
          ? 'Run supabase/migration-demand-profile-rpc.sql (after date_received + customer_aliases) in Supabase.'
          : `Could not load demand profile: ${result.error ?? 'No data returned'}`,
      )
      setReport(null)
      return
    }
    const data = result.data
    setReport(data)
    setTypeOptions((prev) =>
      mergeFilterOptions(
        typeFilter.length === 0 && customerFilter.length === 0 ? [] : prev,
        data.filterOptions.types.map((t) => ({ value: t, label: t })),
        typeFilter,
      ),
    )
    setCustomerOptions((prev) =>
      mergeFilterOptions(
        typeFilter.length === 0 && customerFilter.length === 0 ? [] : prev,
        data.filterOptions.customers.map((c) => ({
          value: c.key,
          label: c.label,
        })),
        customerFilter,
      ),
    )
    if (data.filterOptions.jobTypes.length) {
      setJobTypeOptions(data.filterOptions.jobTypes)
    }
    setDrillJobs([])
    setDrillTitle('')
  }, [
    activeOrganization,
    companyKey,
    customerFilter,
    endDate,
    jobTypeFilter,
    period,
    showToast,
    startDate,
    typeDimension,
    typeFilter,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const years = report?.meta.years ?? []
  const typeLabels = useMemo(
    () => report?.typeSummary.map((r) => r.type) ?? [],
    [report],
  )
  const periods = useMemo(
    () => (report ? uniquePeriods(report.typePeriods) : []),
    [report],
  )
  const stacked = useMemo(
    () => (report ? stackedBarSeries(periods, report.typePeriods, typeLabels) : []),
    [periods, report, typeLabels],
  )
  const stackMax = Math.max(1, ...stacked.map((r) => r.total))

  const customerPeriods = useMemo(() => {
    if (!report) return []
    const keys = [
      ...report.customerSummary.filter((c) => c.rank <= 10).map((c) => c.key),
      '__other__',
    ]
    const labels = new Map(
      report.customerPeriods.map((r) => [r.key, r.customer] as const),
    )
    const periodKeys = uniquePeriods(report.customerPeriods)
    return periodKeys.map((p) => {
      const values: Record<string, number> = {}
      let total = 0
      for (const key of keys) {
        const n =
          report.customerPeriods.find((r) => r.period === p && r.key === key)?.jobCount ?? 0
        values[key] = n
        total += n
      }
      return { period: p, values, total, keys, labels }
    })
  }, [report])
  const customerStackMax = Math.max(1, ...customerPeriods.map((r) => r.total))

  const openCell = async (customerKey: string | null, typeLabel: string | null, title: string) => {
    setDrillLoading(true)
    setDrillTitle(title)
    const result = await fetchDemandProfileJobs({
      start: startDate,
      end: endDate,
      typeDimension,
      jobTypes: jobTypeFilter,
      customerKey,
      typeLabel,
      workflowKey: companyKey,
      activeOrganization,
    })
    setDrillLoading(false)
    if (result.error) {
      showToast(`Could not load jobs: ${result.error}`)
      setDrillJobs([])
      return
    }
    setDrillJobs(result.data)
  }

  const printSection = (section: 'all' | 'type' | 'customer' | 'matrix') => {
    if (!report) return
    const { error } = printDemandProfileReport({
      report,
      companyLabel,
      sections: [section],
    })
    if (error) showToast(error)
  }

  const exportTypeCsv = () => {
    if (!report) return
    downloadCsv(
      `demand-by-type-${startDate}-to-${endDate}.csv`,
      ['Type', 'Total', '% of total', ...years.map((y) => `${y}`), 'YoY %', 'Last job'],
      report.typeSummary.map((row) => [
        row.type,
        row.total,
        row.pctOfTotal,
        ...years.map((y) => row.yearCounts[y] ?? 0),
        formatYoy(typeYoyPct(row, years)),
        row.lastJobDate ?? '',
      ]),
    )
  }

  const exportCustomerCsv = () => {
    if (!report) return
    downloadCsv(
      `demand-by-customer-${startDate}-to-${endDate}.csv`,
      [
        'Rank',
        'Customer',
        'Total',
        '% of total',
        ...years.map((y) => `${y}`),
        'YoY %',
        'Jobs',
        'Last job',
        'New in range',
        'Declining',
      ],
      report.customerSummary.map((row) => [
        row.rank,
        row.customer,
        row.total,
        row.pctOfTotal,
        ...years.map((y) => row.yearCounts[y] ?? 0),
        formatYoy(customerYoyPct(row, years)),
        row.jobCount,
        row.lastJobDate ?? '',
        row.isNewInRange ? 'Yes' : '',
        isDecliningCustomer(row, years) ? 'Yes' : '',
      ]),
    )
  }

  const exportMatrixCsv = () => {
    if (!report) return
    const { customers, types, cells } = report.matrix
    downloadCsv(
      `demand-matrix-${startDate}-to-${endDate}.csv`,
      ['Customer', ...types, 'Row total'],
      customers.map((c) => {
        const rowCounts = types.map(
          (t) => cells.find((cell) => cell.customerKey === c.key && cell.type === t)?.jobCount ?? 0,
        )
        return [c.customer, ...rowCounts, rowCounts.reduce((a, b) => a + b, 0)]
      }),
    )
  }

  const typeTotalCheck = report?.typeSummary.reduce((s, r) => s + r.total, 0) ?? 0
  const customerTotalCheck = report?.customerSummary.reduce((s, r) => s + r.total, 0) ?? 0
  const hasActiveFilters =
    jobTypeFilter.length > 0 || typeFilter.length > 0 || customerFilter.length > 0

  const clearAllFilters = () => {
    setJobTypeFilter([])
    setTypeFilter([])
    setCustomerFilter([])
  }

  return (
    <div className="page-stack demand-profile-page">
      <header className="page-header-row">
        <div>
          <p className="breadcrumb-row">
            <Link to="/reports">Reports</Link>
          </p>
          <h1>Demand profile by type and customer{companyLabel ? ` · ${companyLabel}` : ''}</h1>
          <p className="placeholder-copy">
            Job counts by received/due date. Map spelling variants under{' '}
            <Link to="/admin/customer-aliases">Customer name mapping</Link>.
          </p>
        </div>
        <button
          type="button"
          className="button-primary"
          disabled={!report || loading}
          onClick={() => printSection('all')}
        >
          Print report
        </button>
      </header>

      <section className="dashboard-panel">
        <div className="report-filters">
          <label>
            Range preset
            <select
              value={rangePreset}
              onChange={(e) => applyPreset(e.target.value as '24' | '36' | 'all')}
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setRangePreset('24')
                setStartDate(e.target.value)
              }}
            />
          </label>
          <label>
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setRangePreset('24')
                setEndDate(e.target.value)
              }}
            />
          </label>
          <label>
            Group by
            <select value={period} onChange={(e) => setPeriod(e.target.value as DemandPeriod)}>
              {GROUP_BY.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type field
            <select
              value={typeDimension}
              onChange={(e) => {
                setTypeFilter([])
                setTypeOptions([])
                setTypeDimension(e.target.value as DemandTypeDimension)
              }}
            >
              {TYPE_DIMENSIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button-primary" disabled={loading} onClick={() => void load()}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="demand-filter-toolbar">
          <SearchableMultiFilter
            label="Job types"
            options={jobTypeOptions.map((jt) => ({ value: jt, label: jt }))}
            selected={jobTypeFilter}
            onChange={setJobTypeFilter}
            placeholder="Search job types…"
          />
          <SearchableMultiFilter
            label="Types"
            options={typeOptions}
            selected={typeFilter}
            onChange={setTypeFilter}
            placeholder="Search types…"
          />
          <SearchableMultiFilter
            label="Customers"
            options={customerOptions}
            selected={customerFilter}
            onChange={setCustomerFilter}
            placeholder="Search customers…"
          />
          {hasActiveFilters ? (
            <button type="button" className="button-secondary demand-filter-clear-all" onClick={clearAllFilters}>
              Clear filters
            </button>
          ) : null}
        </div>

        {report ? (
          <div className="report-summary-bar">
            <div className="report-summary-item">
              <span>Jobs in range</span>
              <strong>{report.meta.totalJobs}</strong>
            </div>
            <div className="report-summary-item">
              <span>Unspecified type</span>
              <strong>{report.meta.unspecifiedTypePct.toFixed(1)}%</strong>
            </div>
            <div className="report-summary-item">
              <span>Excluded null dates</span>
              <strong>{report.meta.excludedNull}</strong>
            </div>
            <div className="report-summary-item">
              <span>Excluded bad/sentinel dates</span>
              <strong>{report.meta.excludedBad}</strong>
            </div>
          </div>
        ) : null}
        <p className="status-breakdown-note">
          Excludes null demand dates and dates before 2022-01-01 or more than 1 year ahead
          {report
            ? ` (${report.meta.excludedNull + report.meta.excludedBad} excluded of ${report.meta.scopedTotal} scoped jobs).`
            : '.'}{' '}
          {report?.meta.footnote}
        </p>
      </section>

      {/* Section A */}
      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>A — Demand by type</h3>
          <div className="report-head-actions">
            <button type="button" className="button-secondary" disabled={!report} onClick={() => printSection('type')}>
              Print
            </button>
            <button type="button" className="button-secondary" disabled={!report} onClick={exportTypeCsv}>
              Export CSV
            </button>
          </div>
        </div>
        {!report || stacked.length === 0 ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No jobs in this range.'}</p>
        ) : (
          <>
            <p className="status-breakdown-note">
              Unspecified type share: <strong>{report.meta.unspecifiedTypePct.toFixed(1)}%</strong>
            </p>
            <div className="demand-stack-legend" aria-hidden="true">
              {typeLabels.map((type, i) => (
                <span key={type} className="demand-stack-legend-item">
                  <i style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                  {type}
                </span>
              ))}
            </div>
            <div className="demand-stack-chart" role="img" aria-label="Stacked demand by type">
              {stacked.map((col) => (
                <div key={col.period} className="demand-stack-col">
                  <div className="demand-stack-bars" style={{ height: `${Math.max(8, (col.total / stackMax) * 100)}%` }}>
                    {typeLabels.map((type, i) => {
                      const n = col.values[type] ?? 0
                      if (!n) return null
                      const h = (n / col.total) * 100
                      return (
                        <div
                          key={type}
                          className="demand-stack-seg"
                          style={{
                            height: `${h}%`,
                            background: TYPE_COLORS[i % TYPE_COLORS.length],
                          }}
                          title={`${col.period} · ${type}: ${n}`}
                        />
                      )
                    })}
                  </div>
                  <div className="demand-stack-xlabel">{col.period}</div>
                  <div className="demand-stack-count">{col.total}</div>
                </div>
              ))}
            </div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Total</th>
                    <th>%</th>
                    {years.map((y) => (
                      <th key={y}>{y}</th>
                    ))}
                    <th>YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {report.typeSummary.map((row) => (
                    <tr key={row.type}>
                      <td>{row.type}</td>
                      <td>{row.total}</td>
                      <td>{row.pctOfTotal.toFixed(1)}%</td>
                      {years.map((y) => (
                        <td key={y}>{row.yearCounts[y] ?? 0}</td>
                      ))}
                      <td>{formatYoy(typeYoyPct(row, years))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Section B */}
      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>B — Demand by customer</h3>
          <div className="report-head-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={!report}
              onClick={() => printSection('customer')}
            >
              Print
            </button>
            <button type="button" className="button-secondary" disabled={!report} onClick={exportCustomerCsv}>
              Export CSV
            </button>
          </div>
        </div>
        {!report ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No data.'}</p>
        ) : (
          <>
            {customerPeriods.length > 0 ? (
              <div className="demand-stack-chart demand-stack-chart--customers" role="img" aria-label="Top customers over time">
                {customerPeriods.map((col) => (
                  <div key={col.period} className="demand-stack-col">
                    <div
                      className="demand-stack-bars"
                      style={{ height: `${Math.max(8, (col.total / customerStackMax) * 100)}%` }}
                    >
                      {col.keys.map((key, i) => {
                        const n = col.values[key] ?? 0
                        if (!n) return null
                        return (
                          <div
                            key={key}
                            className="demand-stack-seg"
                            style={{
                              height: `${(n / col.total) * 100}%`,
                              background: TYPE_COLORS[i % TYPE_COLORS.length],
                            }}
                            title={`${col.period} · ${col.labels.get(key) ?? key}: ${n}`}
                          />
                        )
                      })}
                    </div>
                    <div className="demand-stack-xlabel">{col.period}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>%</th>
                    {years.map((y) => (
                      <th key={y}>{y}</th>
                    ))}
                    <th>YoY</th>
                    <th>Jobs</th>
                    <th>Last job</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {report.customerSummary.map((row) => (
                    <CustomerRow
                      key={row.key}
                      row={row}
                      years={years}
                      onOpen={() => void openCell(row.key, null, `Jobs · ${row.customer}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Section C */}
      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>C — Customer × type matrix</h3>
          <div className="report-head-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={!report}
              onClick={() => printSection('matrix')}
            >
              Print
            </button>
            <button type="button" className="button-secondary" disabled={!report} onClick={exportMatrixCsv}>
              Export CSV
            </button>
          </div>
        </div>
        {!report || report.matrix.customers.length === 0 ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No matrix data.'}</p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table demand-matrix-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  {report.matrix.types.map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.matrix.customers.map((c) => {
                  const maxCell = Math.max(
                    1,
                    ...report.matrix.cells
                      .filter((cell) => cell.customerKey === c.key)
                      .map((cell) => cell.jobCount),
                  )
                  return (
                    <tr key={c.key}>
                      <td>{c.customer}</td>
                      {report.matrix.types.map((t) => {
                        const n =
                          report.matrix.cells.find(
                            (cell) => cell.customerKey === c.key && cell.type === t,
                          )?.jobCount ?? 0
                        const intensity = n / maxCell
                        return (
                          <td key={t} className="demand-matrix-cell">
                            {n > 0 ? (
                              <button
                                type="button"
                                className="demand-matrix-btn"
                                style={{ background: `rgba(15, 118, 110, ${0.12 + intensity * 0.55})` }}
                                onClick={() =>
                                  void openCell(c.key, t, `${c.customer} · ${t}`)
                                }
                              >
                                {n}
                              </button>
                            ) : (
                              <span className="job-muted">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="status-breakdown-note">Click a cell to list underlying jobs.</p>
      </section>

      {(drillTitle || drillLoading) && (
        <section className="dashboard-panel">
          <div className="top-jobs-chart-head">
            <h3>{drillTitle || 'Jobs'}</h3>
            <button type="button" className="button-secondary" onClick={() => { setDrillJobs([]); setDrillTitle('') }}>
              Clear
            </button>
          </div>
          {drillLoading ? (
            <p className="placeholder-copy">Loading jobs…</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Job type</th>
                    <th>Demand date</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {drillJobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="job-muted">
                        No jobs.
                      </td>
                    </tr>
                  ) : (
                    drillJobs.map((row) => (
                      <tr key={row.id}>
                        <td>{row.valveId}</td>
                        <td>{row.customer}</td>
                        <td>{row.type}</td>
                        <td>{row.jobType}</td>
                        <td>{row.demandDate}</td>
                        <td>{row.status}</td>
                        <td>
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
          )}
        </section>
      )}

      {report ? (
        <p className="status-breakdown-note">
          Spot-check: type totals = <strong>{typeTotalCheck}</strong>, customer totals ={' '}
          <strong>{customerTotalCheck}</strong>, overall = <strong>{report.meta.totalJobs}</strong>
          {typeTotalCheck === report.meta.totalJobs && customerTotalCheck === report.meta.totalJobs
            ? ' (match).'
            : ' (mismatch — check filters / Other rollup).'}
        </p>
      ) : null}
    </div>
  )
}

function CustomerRow({
  row,
  years,
  onOpen,
}: {
  row: DemandCustomerSummaryRow
  years: string[]
  onOpen: () => void
}) {
  const declining = isDecliningCustomer(row, years)
  return (
    <tr className={declining ? 'demand-row-declining' : row.isNewInRange ? 'demand-row-new' : undefined}>
      <td>{row.rank}</td>
      <td>
        <button type="button" className="linkish-button" onClick={onOpen}>
          {row.customer}
        </button>
      </td>
      <td>{row.total}</td>
      <td>{row.pctOfTotal.toFixed(1)}%</td>
      {years.map((y) => (
        <td key={y}>{row.yearCounts[y] ?? 0}</td>
      ))}
      <td>{formatYoy(customerYoyPct(row, years))}</td>
      <td>{row.jobCount}</td>
      <td>{row.lastJobDate ?? '—'}</td>
      <td>
        {row.isNewInRange ? <span className="demand-flag demand-flag--new">New</span> : null}{' '}
        {declining ? <span className="demand-flag demand-flag--down">Declining</span> : null}
      </td>
    </tr>
  )
}
