import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from './ToastNotification'
import {
  fetchReworkActionQueue,
  markReworkDispositionNa,
} from '../lib/statusReworkLog'
import type { StatusReworkRecord } from '../types'

export function ReworkDashboardPanel() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [rows, setRows] = useState<StatusReworkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchReworkActionQueue()
    setLoading(false)
    if (error) {
      showToast(
        /relation|does not exist|schema cache/i.test(error.message)
          ? 'Run supabase/migration-status-rework-log.sql for the rework queue'
          : `Could not load rework queue: ${error.message}`,
      )
      setRows([])
      return
    }
    setRows(data)
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const markNa = async (row: StatusReworkRecord) => {
    setActionId(row.id)
    const { error } = await markReworkDispositionNa(row.id)
    setActionId(null)
    if (error) {
      showToast(error)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    showToast(`Selected NA for ${row.valve_id}`)
  }

  const openIncr = (row: StatusReworkRecord) => {
    if (row.qa_disposition === 'incr' && row.incr_id) {
      navigate(`/quality-team/incrs/${row.incr_id}`)
      return
    }
    navigate(`/quality-team/incrs/new?reworkId=${row.id}`)
  }

  return (
    <section className="dashboard-panel rework-dashboard-panel">
      <div className="rework-dashboard-panel-header">
        <div>
          <h3>Rework / backward moves — action needed</h3>
          <p className="status-breakdown-note">
            Only items waiting on <strong>NA</strong> or <strong>INCR</strong>, plus open INCRs.
          </p>
        </div>
        <div className="rework-dashboard-panel-actions">
          <button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <Link className="button-secondary" to={{ pathname: '/reports', hash: 'rework' }}>
            Full report
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="placeholder-copy">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="placeholder-copy">No pending rework decisions or open INCRs.</p>
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Changed</th>
                <th>Valve ID</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>QA follow-up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const needsDecision = !row.qa_disposition
                const hasOpenIncr = row.qa_disposition === 'incr' && row.incr_id != null
                return (
                  <tr key={row.id}>
                    <td>{new Date(row.changed_at).toLocaleString()}</td>
                    <td>
                      <Link to={`/job-board?open=${row.valve_row_id}`}>{row.valve_id}</Link>
                    </td>
                    <td>{row.previous_status}</td>
                    <td>{row.new_status}</td>
                    <td className="table-cell-clamp">{row.reason}</td>
                    <td className="rework-qa-actions">
                      {hasOpenIncr ? (
                        <>
                          <span
                            className="rework-qa-badge rework-qa-badge--incr-open"
                            title={row.incr_number ?? undefined}
                          >
                            Open INCR
                            {row.incr_number ? ` · ${row.incr_number}` : ''}
                          </span>
                          <button
                            type="button"
                            className="button-primary rework-qa-btn"
                            onClick={() => openIncr(row)}
                          >
                            View
                          </button>
                        </>
                      ) : needsDecision ? (
                        <>
                          <button
                            type="button"
                            className="button-secondary rework-qa-btn"
                            disabled={actionId === row.id}
                            onClick={() => void markNa(row)}
                          >
                            {actionId === row.id ? '…' : 'NA'}
                          </button>
                          <button
                            type="button"
                            className="button-primary rework-qa-btn"
                            disabled={actionId === row.id}
                            onClick={() => openIncr(row)}
                          >
                            INCR
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="button-primary rework-qa-btn"
                          onClick={() => openIncr(row)}
                        >
                          Open INCR
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
