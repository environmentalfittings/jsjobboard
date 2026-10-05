import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CollapsibleReportPanel } from './CollapsibleReportPanel'
import { ReceivedValvePhotosCell } from './ReceivedValvePhotosCell'
import { ReceivedValveRfqBadge } from './ReceivedValveRfqBadge'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterReceivedValvesForCompany } from '../lib/companyDataScope'
import { printTableReport } from '../lib/reportChartsPrint'
import { useToast } from './ToastNotification'
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
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyScope = useMemo(
    () => ({ workflowKey: workflow.key, activeOrganization }),
    [workflow.key, activeOrganization],
  )
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
    setRows(filterReceivedValvesForCompany(result.rows, companyScope))
  }, [companyScope])

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

  const printReport = () => {
    const companyLabel = activeOrganization?.name ?? workflow.label
    const statusLabel =
      statusFilter === 'all' ? 'All statuses' : RECEIVED_VALVE_STATUS_LABELS[statusFilter]
    const { error } = printTableReport({
      title: 'Received valves',
      subtitle: `${companyLabel} · ${statusLabel}`,
      columns: [
        'Date',
        'Customer',
        'Description',
        'Estimate #',
        'SO #',
        'WO printed',
        'Status',
        'Notes',
        'RFQ',
      ],
      rows: filteredRows.map((row) => [
        row.receivedDate || '—',
        row.customer,
        row.description,
        row.estimateNumber || '—',
        row.salesOrderNumber || '—',
        row.workOrderPrinted ? 'Yes' : 'No',
        receivedValveStatusLabel(row.status),
        row.notes.trim() || '—',
        row.sentToRfqAt ? 'Sent' : '—',
      ]),
      summaryLines: [`${filteredRows.length} received valve${filteredRows.length === 1 ? '' : 's'}`],
      orientation: 'landscape',
      frameId: 'received-valves-print-frame',
    })
    if (error) showToast(error)
  }

  return (
    <CollapsibleReportPanel id="received-valves" title="Received valves">
      <p className="placeholder-copy">
        Full receiving history, including Quoted, Converted, and Lost entries that no longer appear on the Dashboard
        log.
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
        <button
          type="button"
          className="button-secondary"
          onClick={printReport}
          disabled={loading || filteredRows.length === 0}
        >
          Print
        </button>
        <Link className="button-secondary" to="/received-valves">
          Open receiving log
        </Link>
      </div>
      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Pictures</th>
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
                    <ReceivedValvePhotosCell images={row.images} />
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
    </CollapsibleReportPanel>
  )
}
