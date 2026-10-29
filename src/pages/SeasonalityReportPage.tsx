import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { JOB_TYPES } from '../constants/jobTypes'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { resolveActiveCompanyKey } from '../lib/companyDataScope'
import {
  demandAllTimeStart,
  demandDefaultRange,
  downloadCsv,
  fetchDemandProfileReport,
  type DemandProfileReport,
  type DemandTypeDimension,
} from '../lib/demandProfile'
import { buildSeasonalityModel, seasonalityCsvRows } from '../lib/seasonality'
import { printSeasonalityReport } from '../lib/seasonalityPrint'

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

const YEAR_COLORS = [
  '#0f766e',
  '#0369a1',
  '#a16207',
  '#be123c',
  '#7c3aed',
  '#15803d',
  '#c2410c',
  '#334155',
]

function dimensionLabel(value: DemandTypeDimension) {
  return TYPE_DIMENSIONS.find((d) => d.value === value)?.label ?? 'Valve type'
}

export function SeasonalityReportPage() {
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyKey = useMemo(
    () => resolveActiveCompanyKey(workflow.key, activeOrganization),
    [workflow.key, activeOrganization],
  )
  const companyLabel = activeOrganization?.name?.trim() || (companyKey === 'vsi' ? 'VSI' : 'JS Valve')

  const defaultRange = useMemo(() => demandDefaultRange(36), [])
  const [rangePreset, setRangePreset] = useState<'24' | '36' | 'all'>('36')
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [typeDimension, setTypeDimension] = useState<DemandTypeDimension>('valve_type')
  const [jobTypeFilter, setJobTypeFilter] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<DemandProfileReport | null>(null)

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
      period: 'month',
      typeDimension,
      jobTypes: jobTypeFilter,
      workflowKey: companyKey,
      activeOrganization,
    })
    setLoading(false)
    if (result.error || !result.data) {
      showToast(
        /demand_profile_report|schema cache|could not find/i.test(result.error ?? '')
          ? 'Run supabase/migration-demand-profile-rpc.sql in Supabase first.'
          : `Could not load seasonality: ${result.error ?? 'No data'}`,
      )
      setReport(null)
      return
    }
    setReport(result.data)
  }, [
    activeOrganization,
    companyKey,
    endDate,
    jobTypeFilter,
    showToast,
    startDate,
    typeDimension,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const model = useMemo(() => buildSeasonalityModel(report), [report])
  const jobTypeOptions =
    report?.filterOptions.jobTypes.length ? report.filterOptions.jobTypes : [...JOB_TYPES]

  const subtitle = `${companyLabel} · ${startDate} to ${endDate} · ${dimensionLabel(typeDimension)} · ${report?.meta.totalJobs ?? 0} jobs`

  const exportCsv = () => {
    if (!report) return
    downloadCsv(
      `seasonality-${startDate}-to-${endDate}.csv`,
      ['Month', 'Avg jobs', 'Index (100=avg)', 'Years observed', ...model.years.map(String)],
      seasonalityCsvRows(model),
    )
  }

  const printReport = () => {
    if (!report) return
    const { error } = printSeasonalityReport({
      companyLabel,
      subtitle,
      model,
      footnote: report.meta.footnote,
    })
    if (error) showToast(error)
  }

  return (
    <div className="page-stack demand-profile-page seasonality-report-page">
      <header className="page-header-row">
        <div>
          <p className="breadcrumb-row">
            <Link to="/reports">Reports</Link>
            {' · '}
            <Link to="/reports/demand-profile">Demand profile</Link>
            {' · '}
            <Link to="/reports/customer-breakdown">Customer breakdown</Link>
          </p>
          <h1>Seasonality{companyLabel ? ` · ${companyLabel}` : ''}</h1>
          <p className="placeholder-copy">Volume variation month by month.</p>
        </div>
        <div className="report-head-actions">
          <button type="button" className="button-secondary" disabled={!report} onClick={exportCsv}>
            Export CSV
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!report || loading}
            onClick={printReport}
          >
            Print
          </button>
        </div>
      </header>

      <section className="dashboard-panel demand-controls-panel">
        <div className="demand-controls">
          <label>
            Range
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
          <div className="demand-search-filter">
            <span className="demand-search-filter-label">Job types</span>
            <select
              className="demand-job-type-select"
              value=""
              onChange={(e) => {
                const jt = e.target.value
                if (!jt) return
                setJobTypeFilter((prev) =>
                  prev.includes(jt) ? prev.filter((v) => v !== jt) : [...prev, jt],
                )
              }}
            >
              <option value="">
                {jobTypeFilter.length === 0 ? 'All job types' : `${jobTypeFilter.length} selected`}
              </option>
              {jobTypeOptions.map((jt) => (
                <option key={jt} value={jt}>
                  {jobTypeFilter.includes(jt) ? `✓ ${jt}` : jt}
                </option>
              ))}
            </select>
            {jobTypeFilter.length > 0 ? (
              <button
                type="button"
                className="button-secondary demand-inline-clear"
                onClick={() => setJobTypeFilter([])}
              >
                Clear job types
              </button>
            ) : null}
          </div>
          <div className="demand-controls-actions">
            <button type="button" className="button-primary" disabled={loading} onClick={() => void load()}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {report ? (
          <div className="report-summary-bar demand-summary-bar">
            <div className="report-summary-item">
              <span>Jobs</span>
              <strong>{report.meta.totalJobs}</strong>
            </div>
            <div className="report-summary-item">
              <span>Peak month</span>
              <strong>
                {model.peakMonth
                  ? `${model.peakMonth.label} (${model.peakMonth.avg.toFixed(0)})`
                  : '—'}
              </strong>
            </div>
            <div className="report-summary-item">
              <span>Trough month</span>
              <strong>
                {model.troughMonth
                  ? `${model.troughMonth.label} (${model.troughMonth.avg.toFixed(0)})`
                  : '—'}
              </strong>
            </div>
            <div className="report-summary-item">
              <span>Avg / month</span>
              <strong>{model.overallMonthlyAvg.toFixed(0)}</strong>
            </div>
          </div>
        ) : (
          <p className="status-breakdown-note">{loading ? 'Loading…' : 'No data in this range.'}</p>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>Average volume by calendar month</h3>
        </div>
        {!report || model.monthAverages.every((m) => m.yearsObserved === 0) ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No monthly demand in this range.'}</p>
        ) : (
          <>
            <div className="demand-stack-chart" role="img" aria-label="Average jobs by calendar month">
              {model.monthAverages.map((col) => (
                <div key={col.month} className="demand-stack-col">
                  <div
                    className="demand-stack-bars"
                    style={{
                      height: `${Math.max(8, (col.avg / model.maxMonthAvg) * 100)}%`,
                    }}
                  >
                    <div
                      className="demand-stack-seg"
                      style={{ height: '100%', background: '#0f766e' }}
                      title={`${col.label}: avg ${col.avg.toFixed(1)} (index ${col.index})`}
                    />
                  </div>
                  <div className="demand-stack-xlabel">{col.label}</div>
                  <div className="demand-stack-count">{col.avg.toFixed(0)}</div>
                </div>
              ))}
            </div>
            <p className="status-breakdown-note">
              Index 100 = average month. Peak index{' '}
              <strong>{model.peakMonth?.index ?? '—'}</strong>
              {model.troughMonth ? (
                <>
                  ; trough <strong>{model.troughMonth.index}</strong>
                </>
              ) : null}
              .
            </p>
          </>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>Year overlay by month</h3>
        </div>
        {!report || model.monthTotals.length === 0 ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No monthly series.'}</p>
        ) : (
          <>
            <div className="demand-stack-legend" aria-hidden="true">
              {model.years.map((year, i) => (
                <span key={year} className="demand-stack-legend-item">
                  <i style={{ background: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                  {year}
                </span>
              ))}
            </div>
            <div className="seasonality-year-chart" role="img" aria-label="Jobs by month and year">
              {model.monthAverages.map((monthRow) => (
                <div key={monthRow.month} className="seasonality-year-col">
                  <div className="seasonality-year-bars">
                    {model.years.map((year, i) => {
                      const n = model.matrix[year]?.[monthRow.month] ?? 0
                      const h = Math.max(n > 0 ? 4 : 0, (n / model.maxCell) * 100)
                      return (
                        <div
                          key={year}
                          className="seasonality-year-bar"
                          style={{
                            height: `${h}%`,
                            background: YEAR_COLORS[i % YEAR_COLORS.length],
                          }}
                          title={`${monthRow.label} ${year}: ${n}`}
                        />
                      )
                    })}
                  </div>
                  <div className="demand-stack-xlabel">{monthRow.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="top-jobs-chart-head">
          <h3>Month × year matrix</h3>
        </div>
        {!report || model.years.length === 0 ? (
          <p className="placeholder-copy">{loading ? 'Loading…' : 'No matrix data.'}</p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table demand-matrix-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Avg</th>
                  <th>Index</th>
                  {model.years.map((year) => (
                    <th key={year}>{year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.monthAverages.map((row) => (
                  <tr key={row.month}>
                    <td>{row.label}</td>
                    <td>{row.avg.toFixed(1)}</td>
                    <td>{row.yearsObserved ? row.index : '—'}</td>
                    {model.years.map((year) => {
                      const n = model.matrix[year]?.[row.month]
                      if (n == null) {
                        return (
                          <td key={year} className="job-muted">
                            —
                          </td>
                        )
                      }
                      const intensity = n / model.maxCell
                      return (
                        <td key={year} className="demand-matrix-cell">
                          <span
                            className="seasonality-heat-cell"
                            style={{
                              background: `rgba(15, 118, 110, ${0.12 + intensity * 0.55})`,
                            }}
                          >
                            {n}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
