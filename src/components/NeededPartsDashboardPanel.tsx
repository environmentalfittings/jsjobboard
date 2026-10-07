import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterValvesForCompany } from '../lib/companyDataScope'
import { fetchAllValves } from '../lib/fetchAllValves'
import {
  formatNeededPartsSummary,
  jobNeededPartStatusLabel,
  listAllJobNeededParts,
  type JobNeededPart,
} from '../lib/jobNeededParts'
import type { Valve } from '../types'

export function NeededPartsDashboardPanel() {
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const [rows, setRows] = useState<JobNeededPart[]>([])
  const [valves, setValves] = useState<Valve[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [partsResult, valvesResult] = await Promise.all([listAllJobNeededParts(), fetchAllValves()])
      if (cancelled) return
      setRows(partsResult.rows)
      setValves(valvesResult.data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const companyIds = useMemo(() => {
    const scoped = filterValvesForCompany(valves, { workflowKey: workflow.key, activeOrganization })
    return new Set(scoped.map((valve) => valve.id))
  }, [valves, workflow.key, activeOrganization])

  const valveById = useMemo(() => {
    const map = new Map<number, Valve>()
    for (const valve of valves) map.set(valve.id, valve)
    return map
  }, [valves])

  const openRows = useMemo(
    () =>
      rows.filter(
        (row) => companyIds.has(row.valveRowId) && (row.status === 'needed' || row.status === 'ordered'),
      ),
    [rows, companyIds],
  )

  return (
    <section className="dashboard-panel">
      <h3>Needs parts</h3>
      <p className="placeholder-copy">
        Open purchasing list — {formatNeededPartsSummary(openRows)}.
      </p>
      {openRows.length === 0 ? (
        <p className="status-breakdown-note">Nothing waiting on parts right now.</p>
      ) : (
        <ul className="needed-parts-dash-list">
          {openRows.slice(0, 8).map((row) => {
            const valve = valveById.get(row.valveRowId)
            return (
              <li key={row.id}>
                <Link to={`/itp/${row.valveRowId}/traveler`}>{valve?.valve_id || `#${row.valveRowId}`}</Link>
                <span>
                  {row.quantity}× {row.partName}
                </span>
                <span className={`needed-parts-status needed-parts-status--${row.status}`}>
                  {jobNeededPartStatusLabel(row.status)}
                </span>
                {row.expectedDate ? <span>due {row.expectedDate}</span> : null}
              </li>
            )
          })}
        </ul>
      )}
      <p>
        <Link to="/needed-parts">Open needs parts</Link>
      </p>
    </section>
  )
}
