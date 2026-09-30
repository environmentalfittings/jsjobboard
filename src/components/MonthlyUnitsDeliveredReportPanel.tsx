import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleReportPanel } from './CollapsibleReportPanel'
import { useToast } from './ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterValvesForCompany } from '../lib/companyDataScope'
import { calcCompletedMonthlyBars } from '../lib/dashboardMetrics'
import { fetchAllValves } from '../lib/fetchAllValves'
import { printMonthlyBarsReport } from '../lib/reportChartsPrint'
import type { Valve } from '../types'

export function MonthlyUnitsDeliveredReportPanel() {
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyScope = useMemo(
    () => ({ workflowKey: workflow.key, activeOrganization }),
    [workflow.key, activeOrganization],
  )

  const [valves, setValves] = useState<Valve[]>([])
  const [loading, setLoading] = useState(true)
  const [monthCount, setMonthCount] = useState(12)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchAllValves()
    setLoading(false)
    if (error) {
      showToast(`Could not load units delivered: ${error.message}`)
      setValves([])
      return
    }
    setValves(filterValvesForCompany(data ?? [], companyScope))
  }, [companyScope, showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const chart = useMemo(() => calcCompletedMonthlyBars(valves, new Date(), monthCount), [valves, monthCount])
  const total = useMemo(() => chart.bars.reduce((sum, bar) => sum + bar.count, 0), [chart.bars])

  const printChart = () => {
    const companyName = activeOrganization?.name?.trim() || (workflow.key === 'vsi' ? 'VSI' : 'JS Valve')
    const { error } = printMonthlyBarsReport({
      title: 'Monthly units delivered',
      subtitle: `${companyName} · last ${monthCount} months · completed / closed jobs by close date`,
      bars: chart.bars,
      valueLabel: 'Units',
      showPriorYear: true,
    })
    if (error) showToast(error)
  }

  return (
    <CollapsibleReportPanel id="monthly-units-delivered" title="Monthly units delivered">
      <p className="placeholder-copy">
        Completed jobs by close month for the active company. Bars show this year vs the same month last year.
      </p>
      <div className="report-filters">
        <label>
          Months
          <select value={monthCount} onChange={(e) => setMonthCount(Number(e.target.value))}>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={18}>Last 18 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        </label>
        <button type="button" className="button-secondary" onClick={() => void reload()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button type="button" className="button-primary" onClick={printChart} disabled={loading || total === 0}>
          Print chart
        </button>
      </div>
      <p className="status-breakdown-note">
        {loading ? 'Loading…' : `${total} unit${total === 1 ? '' : 's'} in the last ${monthCount} months`}
      </p>

      {!loading ? (
        <div className="report-monthly-chart" role="img" aria-label="Monthly units delivered chart">
          <div className="report-monthly-chart-legend">
            <span>
              <i className="report-monthly-swatch report-monthly-swatch--current" /> This period
            </span>
            <span>
              <i className="report-monthly-swatch report-monthly-swatch--prior" /> Same month prior year
            </span>
          </div>
          <div className="report-monthly-chart-plot">
            {chart.bars.map((bar) => {
              const h = bar.count > 0 ? Math.max(8, (bar.count / chart.maxCount) * 100) : 0
              const priorH =
                bar.priorYearCount > 0 ? Math.max(8, (bar.priorYearCount / chart.maxCount) * 100) : 0
              return (
                <div
                  key={bar.key}
                  className={`report-monthly-col${bar.isCurrentMonth ? ' is-current' : ''}`}
                  title={`${bar.label}: ${bar.count} (prior ${bar.priorYearLabel}: ${bar.priorYearCount})`}
                >
                  <div className="report-monthly-bars">
                    <div className="report-monthly-bar report-monthly-bar--prior" style={{ height: `${priorH}%` }} />
                    <div className="report-monthly-bar report-monthly-bar--current" style={{ height: `${h}%` }} />
                  </div>
                  <div className="report-monthly-count">{bar.count}</div>
                  <div className="report-monthly-xlabel">{bar.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </CollapsibleReportPanel>
  )
}
