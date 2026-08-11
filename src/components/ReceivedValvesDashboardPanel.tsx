import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  isActiveReceivedValve,
  loadReceivedValveRowsShared,
  receivedValveStatusLabel,
  sortReceivedValveRows,
  type ReceivedValveRecord,
} from '../lib/receivedValves'

const DASHBOARD_LOG_LIMIT = 8

export function ReceivedValvesDashboardPanel() {
  const [rows, setRows] = useState<ReceivedValveRecord[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await loadReceivedValveRowsShared()
    setLoading(false)
    if (!result.ok) {
      setRows([])
      return
    }
    setRows(result.rows.filter(isActiveReceivedValve))
  }, [])

  useEffect(() => {
    void reload()
    const onFocus = () => {
      void reload()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  const sortedRows = useMemo(() => sortReceivedValveRows(rows).slice(0, DASHBOARD_LOG_LIMIT), [rows])

  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-title-row">
        <h3>Received valve log</h3>
        <Link className="button-secondary" to="/received-valves">
          Log / view all
        </Link>
      </div>
      <p className="status-breakdown-note">
        Open received valves{rows.length ? ` · ${rows.length} active` : ''}. Converted and Lost entries leave this list
        and stay in Reports.
      </p>
      <div className="dashboard-table-wrap manager-dashboard-scroll">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Picture</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Estimate #</th>
              <th>SO #</th>
              <th>Status</th>
              <th>WO printed</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? (
              sortedRows.map((row) => (
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
                  <td>{receivedValveStatusLabel(row.status)}</td>
                  <td>{row.workOrderPrinted ? 'Yes' : 'No'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="table-empty-cell">
                  {loading ? (
                    'Loading…'
                  ) : (
                    <>
                      No open received valves.{' '}
                      <Link to="/received-valves">Add an entry</Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
