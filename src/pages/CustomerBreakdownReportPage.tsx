import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { JOB_TYPES } from '../constants/jobTypes'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { resolveActiveCompanyKey } from '../lib/companyDataScope'
import { printCustomerBreakdownReport } from '../lib/customerBreakdownPrint'
import {
  customerYoyPct,
  demandAllTimeStart,
  demandDefaultRange,
  downloadCsv,
  fetchDemandProfileJobs,
  fetchDemandProfileReport,
  typeYoyPct,
  uniquePeriods,
  type DemandCustomerSummaryRow,
  type DemandPeriod,
  type DemandProfileJobRow,
  type DemandProfileReport,
  type DemandTypeDimension,
} from '../lib/demandProfile'

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

function CustomerPicker({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; jobs: number }[]
  value: string
  onChange: (next: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
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

  const selected = options.find((opt) => opt.value === value)

  return (
    <div className="demand-search-filter customer-breakdown-picker" ref={rootRef}>
      <span className="demand-search-filter-label">Customer</span>
      <button
        type="button"
        className={`demand-search-filter-trigger${value ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected ? selected.label : 'Select a customer'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="demand-search-filter-panel" role="listbox" aria-label="Customer">
          <input
            type="search"
            className="demand-search-filter-input"
            value={query}
            placeholder="Search customers…"
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="demand-search-filter-actions">
            <span className="job-muted">
              {filtered.length} of {options.length}
            </span>
          </div>
          <ul className="demand-search-filter-list">
            {filtered.length === 0 ? (
              <li className="demand-search-filter-empty">No matches</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    className={`demand-search-filter-option customer-breakdown-option${value === opt.value ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <span>{opt.label}</span>
                    <em>{opt.jobs}</em>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function CustomerBreakdownReportPage() {
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
  const [customerKey, setCustomerKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyReport, setCompanyReport] = useState<DemandProfileReport | null>(null)
  const [customerReport, setCustomerReport] = useState<DemandProfileReport | null>(null)
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

  const baseArgs = useMemo(
    () => ({
      start: startDate,
      end: endDate,
      period,
      typeDimension,
      jobTypes: jobTypeFilter,
      workflowKey: companyKey,
      activeOrganization,
    }),
    [
      activeOrganization,
      companyKey,
      endDate,
      jobTypeFilter,
      period,
      startDate,
      typeDimension,
    ],
  )

  const loadCompany = useCallback(async () => {
    if (!startDate || !endDate) return
    if (startDate > endDate) {
      showToast('Start date must be on or before end date')
      return
    }
    setLoading(true)
    const companyResult = await fetchDemandProfileReport(baseArgs)
    if (companyResult.error || !companyResult.data) {
      setLoading(false)
      showToast(
        /demand_profile_report|schema cache|could not find/i.test(companyResult.error ?? '')
          ? 'Run supabase/migration-demand-profile-rpc.sql in Supabase first.'
          : `Could not load report: ${companyResult.error ?? 'No data'}`,
      )
      setCompanyReport(null)
      setCustomerReport(null)
      return
    }
    const companyData = companyResult.data
    setCompanyReport(companyData)
    setCustomerKey((prev) =>
      prev && companyData.customerSummary.some((c) => c.key === prev)
        ? prev
        : companyData.customerSummary[0]?.key ?? '',
    )
    setLoading(false)
  }, [baseArgs, endDate, showToast, startDate])

  const loadCustomer = useCallback(async () => {
    if (!customerKey || !startDate || !endDate || startDate > endDate) {
      setCustomerReport(null)
      return
    }
    setLoading(true)
    const customerResult = await fetchDemandProfileReport({
      ...baseArgs,
      customerKeys: [customerKey],
    })
    setLoading(false)
    if (customerResult.error || !customerResult.data) {
      showToast(`Could not load customer detail: ${customerResult.error ?? 'No data'}`)
      setCustomerReport(null)
      return
    }
    setCustomerReport(customerResult.data)
    setDrillJobs([])
    setDrillTitle('')
  }, [baseArgs, customerKey, endDate, showToast, startDate])

  useEffect(() => {
    void loadCompany()
  }, [loadCompany])

  useEffect(() => {
    void loadCustomer()
  }, [loadCustomer])

  const load = () => {
    void loadCompany().then(() => void loadCustomer())
  }

  const selectedCustomer: DemandCustomerSummaryRow | null = useMemo(() => {
    if (!companyReport || !customerKey) return null
    return companyReport.customerSummary.find((c) => c.key === customerKey) ?? null
  }, [companyReport, customerKey])

  const customerOptions = useMemo(
    () =>
      (companyReport?.customerSummary ?? []).map((c) => ({
        value: c.key,
        label: c.customer,
        jobs: c.total,
      })),
    [companyReport],
  )

  const years = customerReport?.meta.years ?? companyReport?.meta.years ?? []
  const periodTotals = useMemo(() => {
    if (!customerReport) return []
    return uniquePeriods(customerReport.typePeriods).map((p) => ({
      period: p,
      total: customerReport.typePeriods
        .filter((r) => r.period === p)
        .reduce((sum, r) => sum + r.jobCount, 0),
    }))
  }, [customerReport])
  const periodMax = Math.max(1, ...periodTotals.map((p) => p.total))

  const companyTotal = companyReport?.meta.totalJobs ?? 0
  const sharePct =
    selectedCustomer && companyTotal > 0
      ? (selectedCustomer.total / companyTotal) * 100
      : 0

  const openTypeJobs = async (typeLabel: string | null, title: string) => {
    if (!customerKey) return
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

  const exportCsv = () => {
    if (!customerReport || !selectedCustomer) return
    downloadCsv(
      `customer-breakdown-${selectedCustomer.customer.replace(/\s+/g, '-')}-${startDate}-to-${endDate}.csv`,
      ['Type', 'Total', '% of customer', ...years.map((y) => `${y}`), 'YoY %', 'Last job'],
      customerReport.typeSummary.map((row) => [
        row.type,
        row.total,
        row.pctOfTotal,
        ...years.map((y) => row.yearCounts[y] ?? 0),
        formatYoy(typeYoyPct(row, years)),
        row.lastJobDate ?? '',
      ]),
    )
  }

  const printReport = () => {
    if (!customerReport || !selectedCustomer) return
    const { error } = printCustomerBreakdownReport({
      companyLabel,
      customer: selectedCustomer,
      companyTotalJobs: companyTotal,
      customerReport,
    })
    if (error) showToast(error)
  }

  const jobTypeOptions =
    companyReport?.filterOptions.jobTypes.length
      ? companyReport.filterOptions.jobTypes
      : [...JOB_TYPES]

  return (
    <div className="page-stack demand-profile-page customer-breakdown-page">
      <header className="page-header-row">
        <div>
          <p className="breadcrumb-row">
            <Link to="/reports">Reports</Link>
            {' · '}
            <Link to="/reports/demand-profile">Demand profile</Link>
          </p>
          <h1>Customer breakdown{companyLabel ? ` · ${companyLabel}` : ''}</h1>
          <p className="placeholder-copy">
            Deep dive one customer&apos;s demand mix and trend. Same demand date rules as Demand
            profile.
          </p>
        </div>
        <div className="report-head-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={!customerReport || !selectedCustomer}
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!customerReport || !selectedCustomer || loading}
            onClick={printReport}
          >
            Print report
          </button>
        </div>
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
              onChange={(e) => setTypeDimension(e.target.value as DemandTypeDimension)}
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

        <div className="demand-filter-toolbar customer-breakdown-toolbar">
          <CustomerPicker
            options={customerOptions}
            value={customerKey}
            onChange={setCustomerKey}
          />
          <div className="demand-search-filter">
            <span className="demand-search-filter-label">Job types</span>
            <div className="demand-chip-row">
              {jobTypeOptions.map((jt) => {
                const selected = jobTypeFilter.includes(jt)
                return (
                  <button
                    key={jt}
                    type="button"
                    className={`pcms-chip${selected ? ' is-selected' : ''}`}
                    onClick={() =>
                      setJobTypeFilter((prev) =>
                        prev.includes(jt) ? prev.filter((v) => v !== jt) : [...prev, jt],
                      )
                    }
                  >
                    {jt}
                  </button>
                )
              })}
              {jobTypeFilter.length > 0 ? (
                <button type="button" className="button-secondary" onClick={() => setJobTypeFilter([])}>
                  Clear
                </button>
              ) : (
                <span className="job-muted">All</span>
              )}
            </div>
          </div>
        </div>

        {selectedCustomer && companyReport ? (
          <div className="report-summary-bar">
            <div className="report-summary-item">
              <span>Jobs</span>
              <strong>{selectedCustomer.total}</strong>
            </div>
            <div className="report-summary-item">
              <span>Share of company</span>
              <strong>{sharePct.toFixed(1)}%</strong>
            </div>
            <div className="report-summary-item">
              <span>Rank</span>
              <strong>#{selectedCustomer.rank}</strong>
            </div>
            <div className="report-summary-item">
              <span>YoY</span>
              <strong>{formatYoy(customerYoyPct(selectedCustomer, years))}</strong>
            </div>
            <div className="report-summary-item">
              <span>Last job</span>
              <strong>{selectedCustomer.lastJobDate ?? '—'}</strong>
            </div>
          </div>
        ) : null}
        <p className="status-breakdown-note">
          {companyReport?.meta.footnote}{' '}
          {selectedCustomer
            ? `${selectedCustomer.customer} accounts for ${sharePct.toFixed(1)}% of ${companyTotal} jobs in range.`
            : loading
              ? 'Loading…'
              : 'Pick a customer to see their mix.'}
        </p>
      </section>

      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>Demand over time</h3>
        </div>
        {!customerReport || periodTotals.length === 0 ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No jobs for this customer in range.'}</p>
        ) : (
          <div className="demand-stack-chart" role="img" aria-label="Customer demand over time">
            {periodTotals.map((col) => (
              <div key={col.period} className="demand-stack-col">
                <div
                  className="demand-stack-bars"
                  style={{ height: `${Math.max(8, (col.total / periodMax) * 100)}%` }}
                >
                  <div
                    className="demand-stack-seg"
                    style={{ height: '100%', background: TYPE_COLORS[0] }}
                    title={`${col.period}: ${col.total}`}
                  />
                </div>
                <div className="demand-stack-xlabel">{col.period}</div>
                <div className="demand-stack-count">{col.total}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>
            Mix by{' '}
            {TYPE_DIMENSIONS.find((d) => d.value === typeDimension)?.label.toLowerCase() ?? 'type'}
          </h3>
        </div>
        {!customerReport || customerReport.typeSummary.length === 0 ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No type mix for this customer.'}</p>
        ) : (
          <>
            <div className="demand-stack-legend" aria-hidden="true">
              {customerReport.typeSummary.map((row, i) => (
                <span key={row.type} className="demand-stack-legend-item">
                  <i style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                  {row.type} ({row.pctOfTotal.toFixed(0)}%)
                </span>
              ))}
            </div>
            <div className="customer-breakdown-mix-bar" aria-hidden="true">
              {customerReport.typeSummary.map((row, i) => (
                <div
                  key={row.type}
                  className="customer-breakdown-mix-seg"
                  style={{
                    width: `${Math.max(row.pctOfTotal, 0)}%`,
                    background: TYPE_COLORS[i % TYPE_COLORS.length],
                  }}
                  title={`${row.type}: ${row.total} (${row.pctOfTotal.toFixed(1)}%)`}
                />
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {customerReport.typeSummary.map((row) => (
                    <tr key={row.type}>
                      <td>{row.type}</td>
                      <td>{row.total}</td>
                      <td>{row.pctOfTotal.toFixed(1)}%</td>
                      {years.map((y) => (
                        <td key={y}>{row.yearCounts[y] ?? 0}</td>
                      ))}
                      <td>{formatYoy(typeYoyPct(row, years))}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void openTypeJobs(row.type, `${selectedCustomer?.customer} · ${row.type}`)}
                        >
                          Jobs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {(drillTitle || drillLoading) && (
        <section className="dashboard-panel">
          <div className="top-jobs-chart-head">
            <h3>{drillTitle || 'Jobs'}</h3>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setDrillJobs([])
                setDrillTitle('')
              }}
            >
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
    </div>
  )
}
