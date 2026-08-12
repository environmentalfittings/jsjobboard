import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReceivedValveEditModal } from './ReceivedValveEditModal'
import { useToast } from './ToastNotification'
import {
  isActiveReceivedValve,
  isArchivedReceivedValveStatus,
  isReceivedValveStatus,
  loadReceivedValveRowsShared,
  RECEIVED_VALVE_STATUSES,
  RECEIVED_VALVE_STATUS_LABELS,
  receivedValveStatusLabel,
  sortReceivedValveRows,
  updateReceivedValve,
  type ReceivedValveRecord,
  type ReceivedValveStatus,
} from '../lib/receivedValves'

const DASHBOARD_LOG_LIMIT = 8

export function ReceivedValvesDashboardPanel() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ReceivedValveRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<ReceivedValveRecord | null>(null)
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({})

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

  const changeStatus = async (row: ReceivedValveRecord, status: ReceivedValveStatus) => {
    if (row.status === status) return
    setUpdatingId(row.id)
    const result = await updateReceivedValve(row.id, { status })
    setUpdatingId(null)
    if (!result.ok) {
      showToast(
        result.error.includes('received_valves_status_check') || /check constraint/i.test(result.error)
          ? `Could not save status — run supabase/migration-received-valves-quoted-lost.sql in Supabase (${result.error})`
          : `Could not save status: ${result.error}`,
      )
      return
    }
    if (isArchivedReceivedValveStatus(status)) {
      setRows((prev) => prev.filter((item) => item.id !== row.id))
      showToast(`Marked ${receivedValveStatusLabel(status)} — removed from Dashboard (still in Reports)`)
      return
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status } : item)))
    showToast(`Status updated to ${receivedValveStatusLabel(status)}`)
  }

  const saveNotes = async (row: ReceivedValveRecord, notes: string) => {
    const nextNotes = notes.trim()
    if (nextNotes === row.notes.trim()) {
      setNotesDrafts((prev) => {
        const copy = { ...prev }
        delete copy[row.id]
        return copy
      })
      return
    }
    const result = await updateReceivedValve(row.id, { notes: nextNotes })
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, notes: nextNotes } : item)))
    setNotesDrafts((prev) => {
      const copy = { ...prev }
      delete copy[row.id]
      return copy
    })
    showToast('Notes saved')
  }

  const onSavedEdit = (next: ReceivedValveRecord) => {
    setEditingRow(null)
    if (isArchivedReceivedValveStatus(next.status)) {
      setRows((prev) => prev.filter((item) => item.id !== next.id))
      showToast(`Saved — marked ${receivedValveStatusLabel(next.status)} and removed from Dashboard`)
      return
    }
    setRows((prev) => prev.map((item) => (item.id === next.id ? next : item)))
    showToast('Received valve updated')
  }

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
        Open received valves{rows.length ? ` · ${rows.length} active` : ''}. Use Edit to add a missed picture or change
        details. Notes and Status can be updated here too. Converted and Lost leave this list and stay in Reports.
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
              <th>Notes</th>
              <th>WO printed</th>
              <th>Actions</th>
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
                  <td>
                    <select
                      className="received-valves-status-select"
                      value={row.status}
                      disabled={updatingId === row.id}
                      aria-label={`Status for ${row.customer}`}
                      onChange={(e) => {
                        const value = e.target.value
                        if (!isReceivedValveStatus(value)) return
                        void changeStatus(row, value)
                      }}
                    >
                      {RECEIVED_VALVE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {RECEIVED_VALVE_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea
                      className="received-valves-notes-input"
                      rows={2}
                      value={notesDrafts[row.id] ?? row.notes}
                      placeholder="Add notes…"
                      aria-label={`Notes for ${row.customer}`}
                      onChange={(e) =>
                        setNotesDrafts((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      onBlur={(e) => void saveNotes(row, e.target.value)}
                    />
                  </td>
                  <td>{row.workOrderPrinted ? 'Yes' : 'No'}</td>
                  <td>
                    <button type="button" className="button-secondary" onClick={() => setEditingRow(row)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="table-empty-cell">
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

      {editingRow ? (
        <ReceivedValveEditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={onSavedEdit}
          onError={(message) => showToast(message)}
        />
      ) : null}
    </section>
  )
}
