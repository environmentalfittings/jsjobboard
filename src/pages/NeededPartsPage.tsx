import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterValvesForCompany } from '../lib/companyDataScope'
import { fetchAllValves } from '../lib/fetchAllValves'
import {
  JOB_NEEDED_PART_STATUSES,
  formatNeededPartNotes,
  jobNeededPartStatusLabel,
  listAllJobNeededParts,
  updateJobNeededPart,
  type JobNeededPart,
  type JobNeededPartStatus,
} from '../lib/jobNeededParts'
import { canWriteShop } from '../lib/roles'
import { useAuth } from '../contexts/AuthContext'
import type { Valve } from '../types'

type StatusFilter = 'open' | JobNeededPartStatus | 'all'

function valveLabel(valve: Valve | undefined, valveRowId: number): string {
  return valve?.valve_id?.trim() || `#${valveRowId}`
}

export function NeededPartsPage() {
  const { showToast } = useToast()
  const { role } = useAuth()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const canPurchase = canWriteShop(role) || Boolean(role)
  const [rows, setRows] = useState<JobNeededPart[]>([])
  const [valves, setValves] = useState<Valve[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [partsResult, valvesResult] = await Promise.all([listAllJobNeededParts(), fetchAllValves()])
    if (partsResult.error) showToast(partsResult.error)
    setRows(partsResult.rows)
    setValves(valvesResult.data)
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const companyValves = useMemo(
    () => filterValvesForCompany(valves, { workflowKey: workflow.key, activeOrganization }),
    [valves, workflow.key, activeOrganization],
  )
  const valveById = useMemo(() => {
    const map = new Map<number, Valve>()
    for (const valve of companyValves) map.set(valve.id, valve)
    return map
  }, [companyValves])

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (!valveById.has(row.valveRowId)) return false
      if (filter === 'all') return true
      if (filter === 'open') return row.status === 'needed' || row.status === 'ordered'
      return row.status === filter
    })
  }, [rows, valveById, filter])

  const patchRow = async (id: string, patch: Parameters<typeof updateJobNeededPart>[1]) => {
    setSavingId(id)
    const result = await updateJobNeededPart(id, patch)
    setSavingId(null)
    if (result.error || !result.row) {
      showToast(result.error || 'Could not update that part')
      return
    }
    setRows((prev) => prev.map((row) => (row.id === id ? result.row! : row)))
  }

  return (
    <section className="dashboard-page needed-parts-page">
      <section className="dashboard-panel">
        <div className="needed-parts-page-hdr">
          <div>
            <h2 className="dashboard-title">Needs parts</h2>
            <p className="placeholder-copy">
              Every required part from ITP travelers. Purchasing can mark ordered, add the PO, and set when it should
              be in.
            </p>
          </div>
          <div className="needed-parts-filters">
            {(
              [
                ['open', 'Open'],
                ['needed', 'Needed'],
                ['ordered', 'Ordered'],
                ['received', 'Received'],
                ['all', 'All'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`button-secondary${filter === value ? ' is-active' : ''}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
            <button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p className="status-breakdown-note">Loading parts…</p>
        ) : visible.length === 0 ? (
          <p className="placeholder-copy">No parts in this list. Add them from any ITP traveler step.</p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table needed-parts-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Part</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>PO</th>
                  <th>Ordered</th>
                  <th>Due in</th>
                  <th>Received</th>
                  <th>From step</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const valve = valveById.get(row.valveRowId)
                  const busy = savingId === row.id
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/itp/${row.valveRowId}/traveler`}>{valveLabel(valve, row.valveRowId)}</Link>
                        <div className="needed-parts-job-meta">
                          {[valve?.customer, valve?.valve_type, valve?.size].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td>
                        <strong>{row.partName}</strong>
                        <div className="needed-parts-job-meta">
                          {row.partNumber ? `#${row.partNumber}` : ''}
                          {row.supplier ? `${row.partNumber ? ' · ' : ''}${row.supplier}` : ''}
                          {row.notes
                            ? `${row.partNumber || row.supplier ? ' · ' : ''}${formatNeededPartNotes(row.notes)}`
                            : ''}
                        </div>
                      </td>
                      <td>{row.quantity}</td>
                      <td>
                        <select
                          value={row.status}
                          disabled={!canPurchase || busy}
                          onChange={(e) =>
                            void patchRow(row.id, { status: e.target.value as JobNeededPartStatus })
                          }
                        >
                          {JOB_NEEDED_PART_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {jobNeededPartStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={row.poNumber}
                          disabled={!canPurchase || busy}
                          placeholder="PO #"
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, poNumber: e.target.value } : item,
                              ),
                            )
                          }
                          onBlur={(e) => void patchRow(row.id, { poNumber: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.orderedDate ?? ''}
                          disabled={!canPurchase || busy}
                          onChange={(e) => void patchRow(row.id, { orderedDate: e.target.value || null })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.expectedDate ?? ''}
                          disabled={!canPurchase || busy}
                          onChange={(e) => void patchRow(row.id, { expectedDate: e.target.value || null })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={row.receivedDate ?? ''}
                          disabled={!canPurchase || busy}
                          onChange={(e) => void patchRow(row.id, { receivedDate: e.target.value || null })}
                        />
                      </td>
                      <td>{row.itpItemName || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
