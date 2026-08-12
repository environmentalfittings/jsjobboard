import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReceivedValveRfqBadge } from './ReceivedValveRfqBadge'
import {
  isReceivedValveStatus,
  loadReceivedValveRowsShared,
  RECEIVED_VALVE_STATUSES,
  RECEIVED_VALVE_STATUS_LABELS,
  receivedValveStatusLabel,
  sortReceivedValveRows,
  type ReceivedValveRecord,
  type ReceivedValveStatus,
} from '../lib/receivedValves'

type StatusFilter = 'all' | ReceivedValveStatus

export function ReceivedValvesReportPanel() {
  const [rows, setRows] = useState<ReceivedValveRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await loadReceivedValveRowsShared()
    setLoading(false)
    if (!result.ok) {
      setRows([])
      return
    }
    setRows(result.rows)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filteredRows = useMemo(() => {
    const sorted = sortReceivedValveRows(rows)
    if (statusFilter === 'all') return sorted
    return sorted.filter((row) => row.status === statusFilter)
  }, [rows, statusFilter])

  const counts = useMemo(() => {
    const next: Record<ReceivedValveStatus, number> = {
      waiting_on_salesman: 0,
      waiting_on_customer: 0,
      quoted: 0,
      converted: 0,
      lost: 0,
    }
    for (const row of rows) next[row.status] += 1
    return next
  }, [rows])

  return (
    <section className="dashboard-panel" id="received-valves">
      <div className="dashboard-panel-title-row">
        <h3>Received valves</h3>
        <Link className="button-secondary" to="/received-valves">
          Open receiving log
        </Link>
      </div>
      <p className="placeholder-copy">
        Full receiving history, including Converted and Lost entries that no longer appear on the Dashboard log.
      </p>
      <div className="report-filters">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'all' || isReceivedValveStatus(value)) setStatusFilter(value)
            }}
          >
            <option value="all">All ({rows.length})</option>
            {RECEIVED_VALVE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RECEIVED_VALVE_STATUS_LABELS[status]} ({counts[status]})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Picture</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Estimate #</th>
              <th>SO #</th>
              <th>WO printed</th>
              <th>Status</th>
              <th>Notes</th>
              <th>RFQ</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.imageDataUrl ? (
                      <a
                        href={row.imageDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="received-valves-image-link"
                      >
                        <img src={row.imageDataUrl} alt={row.imageName ?? 'Received valve'} />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{row.receivedDate || '—'}</td>
                  <td>{row.customer}</td>
                  <td className="table-cell-clamp">{row.description}</td>
                  <td>{row.estimateNumber || '—'}</td>
                  <td>{row.salesOrderNumber || '—'}</td>
                  <td>{row.workOrderPrinted ? 'Yes' : 'No'}</td>
                  <td>{receivedValveStatusLabel(row.status)}</td>
                  <td className="table-cell-clamp">{row.notes.trim() || '—'}</td>
                  <td>
                    <ReceivedValveRfqBadge sentToRfqAt={row.sentToRfqAt} showPendingLabel={false} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="table-empty-cell">
                  {loading ? 'Loading…' : 'No received valves match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
