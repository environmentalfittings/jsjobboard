import { useCallback, useEffect, useState } from 'react'
import { useOrganization } from '../contexts/OrganizationContext'
import { getCompanyWorkflow } from '../constants/companyWorkflows'
import { valveRowBelongsToCompany } from '../lib/companyDataScope'
import { isExcludedFromOnTimeDelivery } from '../lib/onTimeDelivery'
import { fetchStatusReworkLog } from '../lib/statusReworkLog'
import { supabase } from '../lib/supabase'
import type { Organization } from '../types/organizations'
import { useToast } from './ToastNotification'

type CompanyCompareRow = {
  organization: Organization
  completedWithDue: number
  onTime: number
  late: number
  otdPct: number | null
  reworkMoves: number
  activeJobs: number
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

  const reworkMoves = (reworkResult.data ?? []).filter((row) =>
    valveRowBelongsToCompany(row.valve_row_id, scope),
  ).length

  return {
    organization,
    completedWithDue: withDue.length,
    onTime,
    late,
    otdPct: withDue.length > 0 ? (onTime / withDue.length) * 100 : null,
    reworkMoves,
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

  return (
    <section className="dashboard-panel company-compare-report" id="company-compare">
      <div className="training-list-toolbar" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>Company compare · Superadmin</h3>
          <p className="placeholder-copy" style={{ marginTop: '0.35rem' }}>
            Side-by-side metrics across companies. Use the header company switcher for day-to-day work inside one
            company; this report is for cross-company review.
            {isLocalOrganizations
              ? ' In the local demo, VSI starts empty until VSI jobs exist — JS Valve numbers reflect live shop data scoped as JS.'
              : null}
          </p>
        </div>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7}>Loading company compare…</td>
              </tr>
            ) : (
              rows.map((row) => (
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
