import { useCallback, useEffect, useState } from 'react'
import { useOrganization } from '../contexts/OrganizationContext'
import { getCompanyWorkflow } from '../constants/companyWorkflows'
import { valveRowBelongsToCompany } from '../lib/companyDataScope'
import { isExcludedFromOnTimeDelivery } from '../lib/onTimeDelivery'
import { fetchStatusReworkLog } from '../lib/statusReworkLog'
import { supabase } from '../lib/supabase'
import type { Organization } from '../types/organizations'
import { printTableReport } from '../lib/reportChartsPrint'
import { CollapsibleReportPanel } from './CollapsibleReportPanel'
import { useToast } from './ToastNotification'

type CompanyCompareRow = {
  organization: Organization
  completedWithDue: number
  onTime: number
  late: number
  otdPct: number | null
  reworkMoves: number
  /** Rework moves with QA disposition INCR (or a linked incr_id). */
  reworkBecameIncr: number
  activeJobs: number
}

function reworkBecameIncr(row: { qa_disposition?: string | null; incr_id?: number | null }) {
  if (row.qa_disposition === 'incr') return true
  return typeof row.incr_id === 'number' && Number.isFinite(row.incr_id)
}

function yearRange(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  }
}

async function loadCompareForOrganization(
  organization: Organization,
  year: number,
): Promise<CompanyCompareRow> {
  const workflow = getCompanyWorkflow(organization)
  const { start, end } = yearRange(year)

  const [completedResult, activeResult, reworkResult] = await Promise.all([
    supabase
      .from('valves')
      .select('id,date_closed,due_date,status,order_type,customer')
      .in('status', ['Completed', 'Warehouse RTS', 'Shipping'])
      .gte('date_closed', start)
      .lte('date_closed', end)
      .limit(5000),
    supabase.from('valves').select('id,status').limit(5000),
    fetchStatusReworkLog(start, end),
  ])

  const scope = {
    workflowKey: workflow.key,
    activeOrganization: organization,
  }

  const completed = ((completedResult.data ?? []) as {
    id: number
    date_closed: string
    due_date: string | null
    status: string | null
    order_type: string | null
    customer: string | null
  }[])
    .filter((row) => valveRowBelongsToCompany(row.id, scope))
    .filter((row) => !isExcludedFromOnTimeDelivery(row))

  const withDue = completed.filter((row) => row.due_date)
  const onTime = withDue.filter((row) => row.due_date && row.date_closed <= row.due_date).length
  const late = withDue.length - onTime

  const terminal = new Set(['Completed', 'Warehouse RTS', 'Shipping', 'Junked'])
  const activeJobs = ((activeResult.data ?? []) as { id: number; status: string | null }[])
    .filter((row) => !terminal.has(String(row.status ?? '')))
    .filter((row) => valveRowBelongsToCompany(row.id, scope)).length

  const companyRework = (reworkResult.data ?? []).filter((row) =>
    valveRowBelongsToCompany(row.valve_row_id, scope),
  )
  const reworkMoves = companyRework.length
  const reworkBecameIncrCount = companyRework.filter(reworkBecameIncr).length

  return {
    organization,
    completedWithDue: withDue.length,
    onTime,
    late,
    otdPct: withDue.length > 0 ? (onTime / withDue.length) * 100 : null,
    reworkMoves,
    reworkBecameIncr: reworkBecameIncrCount,
    activeJobs,
  }
}

/** Superadmin-only side-by-side company metrics. */
export function CompanyCompareReportPanel() {
  const { orgsEnabled, organizations, isOrgSuperAdmin, isLocalOrganizations } = useOrganization()
  const { showToast } = useToast()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CompanyCompareRow[]>([])

  const load = useCallback(async () => {
    if (!orgsEnabled || !isOrgSuperAdmin || organizations.length < 2) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      const next = await Promise.all(organizations.map((org) => loadCompareForOrganization(org, year)))
      setRows(next)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load company compare report')
      setRows([])
    }
    setLoading(false)
  }, [orgsEnabled, isOrgSuperAdmin, organizations, year, showToast])

  useEffect(() => {
    void load()
  }, [load])

  if (!orgsEnabled || !isOrgSuperAdmin || organizations.length < 2) return null

  const printReport = () => {
    const { error } = printTableReport({
      title: `Company compare · ${year}`,
      subtitle: 'Side-by-side metrics across companies (superadmin).',
      columns: [
        'Company',
        'Active jobs',
        `Completed w/ due (${year})`,
        'On-time',
        'Late',
        'OTD %',
        `Rework moves (${year})`,
        'Became INCRs',
        'INCR rate',
      ],
      rows: rows.map((row) => {
        const incrRate = row.reworkMoves > 0 ? (row.reworkBecameIncr / row.reworkMoves) * 100 : null
        return [
          row.organization.name,
          String(row.activeJobs),
          String(row.completedWithDue),
          String(row.onTime),
          String(row.late),
          row.otdPct == null ? '—' : `${row.otdPct.toFixed(1)}%`,
          String(row.reworkMoves),
          String(row.reworkBecameIncr),
          incrRate == null ? '—' : `${incrRate.toFixed(1)}%`,
        ]
      }),
      orientation: 'landscape',
      frameId: 'company-compare-print-frame',
    })
    if (error) showToast(error)
  }

  return (
    <CollapsibleReportPanel
      id="company-compare"
      className="company-compare-report"
      title="Company compare · Superadmin"
    >
      <p className="placeholder-copy">
        Side-by-side metrics across companies. Use the header company switcher for day-to-day work inside one
        company; this report is for cross-company review.
        {isLocalOrganizations
          ? ' In the local demo, VSI starts empty until VSI jobs exist — JS Valve numbers reflect live shop data scoped as JS.'
          : null}
      </p>

      <div className="report-filters">
        <label>
          Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button-primary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button type="button" className="button-secondary" disabled={loading || rows.length === 0} onClick={printReport}>
          Print
        </button>
      </div>

      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Active jobs</th>
              <th>Completed w/ due ({year})</th>
              <th>On-time</th>
              <th>Late</th>
              <th>OTD %</th>
              <th>Rework moves ({year})</th>
              <th title="Rework moves where QA selected INCR">Became INCRs</th>
              <th title="Share of rework moves that became INCRs">INCR rate</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={9}>Loading company compare…</td>
              </tr>
            ) : (
              rows.map((row) => {
                const incrRate =
                  row.reworkMoves > 0 ? (row.reworkBecameIncr / row.reworkMoves) * 100 : null
                return (
                  <tr key={row.organization.id}>
                    <td>
                      <strong>{row.organization.name}</strong>
                    </td>
                    <td>{row.activeJobs}</td>
                    <td>{row.completedWithDue}</td>
                    <td>{row.onTime}</td>
                    <td>{row.late}</td>
                    <td>
                      {row.otdPct == null ? (
                        '—'
                      ) : (
                        <span
                          className={
                            row.otdPct >= 90 ? 'text-green' : row.otdPct >= 75 ? 'text-yellow' : 'text-red'
                          }
                        >
                          {row.otdPct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td>{row.reworkMoves}</td>
                    <td>
                      {row.reworkBecameIncr}
                      {row.reworkMoves > 0 ? (
                        <span className="company-compare-incr-of"> of {row.reworkMoves}</span>
                      ) : null}
                    </td>
                    <td>{incrRate == null ? '—' : `${incrRate.toFixed(1)}%`}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleReportPanel>
  )
}
