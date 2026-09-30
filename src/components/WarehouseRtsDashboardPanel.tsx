import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterRowsByCompanyValveId } from '../lib/companyDataScope'
import { isActiveShopWork } from '../lib/jobDisplayStatus'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { valveStatusPatch } from '../lib/valveStatusPatch'
import type { Valve } from '../types'
import { useToast } from './ToastNotification'

const APPROVAL_SELECT =
  'id,valve_id,customer,cell,status,order_type,due_date,date_closed,shipment_final_approved,shipment_final_approved_by,shipment_final_approved_at'
const BASE_SELECT = 'id,valve_id,customer,cell,status,order_type,due_date,date_closed'

/** Same open-work filter as Job board → Ready to ship (excludes closed Completed order types). */
const OPEN_ORDER_TYPES = ['In-Process Order', 'On-Hold', 'Waiting on Arrival'] as const

type WarehouseRtsRow = {
  id: number
  valve_id: string
  customer: string | null
  cell: string | null
  status: string
  order_type: string | null
  due_date: string | null
  date_closed: string | null
  shipment_final_approved: boolean
  shipment_final_approved_by: string | null
  shipment_final_approved_at: string | null
}

function isMissingApprovalColumn(message: string | null | undefined) {
  return /shipment_final_approved|schema cache|column.*does not exist/i.test(String(message ?? ''))
}

function mapRow(raw: Record<string, unknown>, approvalColumnsAvailable: boolean): WarehouseRtsRow {
  return {
    id: Number(raw.id),
    valve_id: String(raw.valve_id ?? ''),
    customer: (raw.customer as string | null) ?? null,
    cell: (raw.cell as string | null) ?? null,
    status: String(raw.status ?? ''),
    order_type: (raw.order_type as string | null) ?? null,
    due_date: (raw.due_date as string | null) ?? null,
    date_closed: (raw.date_closed as string | null) ?? null,
    shipment_final_approved: approvalColumnsAvailable
      ? Boolean(raw.shipment_final_approved)
      : false,
    shipment_final_approved_by: approvalColumnsAvailable
      ? ((raw.shipment_final_approved_by as string | null) ?? null)
      : null,
    shipment_final_approved_at: approvalColumnsAvailable
      ? ((raw.shipment_final_approved_at as string | null) ?? null)
      : null,
  }
}

function formatApprovedAt(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function sortByDueDate(rows: WarehouseRtsRow[]) {
  return [...rows].sort((a, b) => {
    const aDue = a.due_date ?? '9999-99-99'
    const bDue = b.due_date ?? '9999-99-99'
    if (aDue !== bDue) return aDue.localeCompare(bDue)
    return a.valve_id.localeCompare(b.valve_id)
  })
}

function asValveForActiveCheck(row: WarehouseRtsRow): Valve {
  return {
    id: row.id,
    valve_id: row.valve_id,
    customer: row.customer,
    cell: row.cell,
    size: null,
    status: row.status,
    order_type: row.order_type,
    test_type: null,
    valve_type: null,
    due_date: row.due_date,
    date_closed: row.date_closed,
    date_tested: null,
    description: null,
    notes: null,
  }
}

/** Ready-to-ship status for the active company (JS: Warehouse RTS, VSI: Shipping). */
export function readyToShipStatusForWorkflow(workflowKey: string) {
  return workflowKey === 'vsi' ? 'Shipping' : 'Warehouse RTS'
}

export function WarehouseRtsDashboardPanel() {
  const { showToast } = useToast()
  const { role, username } = useAuth()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const canWrite = canWriteShop(role)
  const statusLabel = readyToShipStatusForWorkflow(workflow.key)

  const [rows, setRows] = useState<WarehouseRtsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [approvalEnabled, setApprovalEnabled] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const status = readyToShipStatusForWorkflow(workflow.key)

    const primary = await supabase
      .from('valves')
      .select(APPROVAL_SELECT)
      .eq('status', status)
      .in('order_type', [...OPEN_ORDER_TYPES])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('valve_id', { ascending: true })

    let approvalColumnsAvailable = true
    let data = primary.data as Record<string, unknown>[] | null
    let error = primary.error

    if (error && isMissingApprovalColumn(error.message)) {
      approvalColumnsAvailable = false
      const fallback = await supabase
        .from('valves')
        .select(BASE_SELECT)
        .eq('status', status)
        .in('order_type', [...OPEN_ORDER_TYPES])
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('valve_id', { ascending: true })
      data = fallback.data as Record<string, unknown>[] | null
      error = fallback.error
    }

    setLoading(false)

    if (error) {
      showToast(`Could not load ${status} valves: ${error.message}`)
      setRows([])
      return
    }

    setApprovalEnabled(approvalColumnsAvailable)
    const mapped = (data ?? []).map((row) => {
      const item = mapRow(row, approvalColumnsAvailable)
      return { ...item, valve_row_id: item.id }
    })
    const openOnly = mapped.filter((row) => isActiveShopWork(asValveForActiveCheck(row)))
    const scoped = filterRowsByCompanyValveId(openOnly, {
      workflowKey: workflow.key,
      activeOrganization,
    }).map(({ valve_row_id: _valveRowId, ...row }) => row)
    setRows(scoped)
  }, [workflow.key, activeOrganization, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const pendingRows = useMemo(
    () => sortByDueDate(rows.filter((row) => !row.shipment_final_approved)),
    [rows],
  )
  const approvedRows = useMemo(
    () => sortByDueDate(rows.filter((row) => row.shipment_final_approved)),
    [rows],
  )

  const toggleApproval = async (row: WarehouseRtsRow, checked: boolean) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!approvalEnabled) {
      showToast('Run supabase/migration-valve-shipment-final-approval.sql in Supabase to enable final approval.')
      return
    }

    const approvedBy = username?.trim() || 'Unknown'
    const approvedAt = new Date().toISOString()
    const patch = checked
      ? {
          shipment_final_approved: true,
          shipment_final_approved_by: approvedBy,
          shipment_final_approved_at: approvedAt,
        }
      : {
          shipment_final_approved: false,
          shipment_final_approved_by: null,
          shipment_final_approved_at: null,
        }

    setSavingId(row.id)
    const { error } = await supabase.from('valves').update(patch).eq('id', row.id)
    setSavingId(null)

    if (error) {
      showToast(
        isMissingApprovalColumn(error.message)
          ? 'Run supabase/migration-valve-shipment-final-approval.sql in Supabase to enable final approval.'
          : `Could not save approval: ${error.message}`,
      )
      if (isMissingApprovalColumn(error.message)) setApprovalEnabled(false)
      return
    }

    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              shipment_final_approved: checked,
              shipment_final_approved_by: checked ? approvedBy : null,
              shipment_final_approved_at: checked ? approvedAt : null,
            }
          : item,
      ),
    )
    showToast(
      checked
        ? `${row.valve_id} moved to Final QC Approval`
        : `${row.valve_id} moved back to awaiting Final QC Approval`,
    )
  }

  const markShipped = async (row: WarehouseRtsRow) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!row.shipment_final_approved) {
      showToast('Final QC Approval must be checked before shipping.')
      return
    }

    const closedBy = username?.trim() || 'Unknown'
    const closedAt = new Date().toISOString()
    const statusPatch = valveStatusPatch('Completed', {
      status: row.status,
      order_type: row.order_type,
      date_closed: row.date_closed,
    })
    // Always move Warehouse RTS / Shipping → Completed and stamp who/when.
    const patch = {
      ...statusPatch,
      status: 'Completed',
      order_type: 'Completed',
      date_closed: statusPatch.date_closed ?? new Date().toISOString().slice(0, 10),
      shipment_closed_by: closedBy,
      shipment_closed_at: closedAt,
    }

    setSavingId(row.id)
    const { error } = await supabase.from('valves').update(patch).eq('id', row.id)
    setSavingId(null)

    if (error) {
      if (/shipment_closed_by|shipment_closed_at|schema cache|column.*does not exist/i.test(error.message)) {
        // Columns not migrated yet — still complete the job, without who/when stamp.
        const { error: fallbackError } = await supabase
          .from('valves')
          .update({
            status: 'Completed',
            order_type: 'Completed',
            date_closed: patch.date_closed,
          })
          .eq('id', row.id)
        if (fallbackError) {
          showToast(`Could not mark shipped: ${fallbackError.message}`)
          return
        }
        setRows((prev) => prev.filter((item) => item.id !== row.id))
        showToast(
          `${row.valve_id} set to Completed. Run migration-valve-shipment-closed.sql to record who shipped and when.`,
        )
        return
      }
      showToast(`Could not mark shipped: ${error.message}`)
      return
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id))
    showToast(
      `${row.valve_id} set to Completed · closed by ${closedBy} · ${new Date(closedAt).toLocaleString()}`,
    )
  }

  const renderValveCells = (row: WarehouseRtsRow) => (
    <>
      <td>
        <Link to={`/job-board?open=${row.id}`}>{row.valve_id}</Link>
      </td>
      <td>{row.customer ?? '—'}</td>
      <td>{row.cell ?? '—'}</td>
      <td>{row.due_date ?? '—'}</td>
    </>
  )

  return (
    <section className="dashboard-panel warehouse-rts-dashboard-panel">
      <div className="rework-dashboard-panel-header">
        <div>
          <h3>{statusLabel}</h3>
          <p className="status-breakdown-note">
            Check <strong>Final QC Approval</strong> to move a valve into the green table below, then
            press <strong>Shipped</strong> to set status to <strong>Completed</strong> (records who
            closed it and when).
            {rows.length > 0 ? (
              <>
                {' '}
                <strong>{pendingRows.length}</strong> awaiting · <strong>{approvedRows.length}</strong>{' '}
                approved.
              </>
            ) : null}
          </p>
        </div>
        <div className="rework-dashboard-panel-actions">
          <button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <Link
            className="button-secondary"
            to={`/job-board?scope=ready-to-ship`}
            title={`Open job board filtered to ${statusLabel}`}
          >
            Job board
          </Link>
        </div>
      </div>

      {!approvalEnabled ? (
        <p className="status-breakdown-note warehouse-rts-migration-note">
          Approval checkboxes need{' '}
          <code>supabase/migration-valve-shipment-final-approval.sql</code> run in Supabase.
        </p>
      ) : null}

      {loading ? (
        <p className="placeholder-copy">Loading…</p>
      ) : (
        <>
          <div className="warehouse-rts-subpanel">
            <h4>Awaiting Final QC Approval</h4>
            {pendingRows.length === 0 ? (
              <p className="placeholder-copy">
                No valves awaiting Final QC Approval
                {activeOrganization?.name ? ` for ${activeOrganization.name}` : ''}.
              </p>
            ) : (
              <div className="dashboard-table-wrap warehouse-rts-table-wrap">
                <table className="dashboard-table warehouse-rts-table">
                  <thead>
                    <tr>
                      <th>Final QC Approval</th>
                      <th>Valve ID</th>
                      <th>Customer</th>
                      <th>{workflow.workCellLabel}</th>
                      <th>Due date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((row) => (
                      <tr key={row.id} className="warehouse-rts-row warehouse-rts-row--pending">
                        <td className="warehouse-rts-approval-cell">
                          <label className="warehouse-rts-approval-label">
                            <input
                              type="checkbox"
                              checked={false}
                              disabled={!canWrite || !approvalEnabled || savingId === row.id}
                              onChange={(e) => void toggleApproval(row, e.target.checked)}
                              aria-label={`Final QC Approval for ${row.valve_id}`}
                            />
                            <span>Pending</span>
                          </label>
                        </td>
                        {renderValveCells(row)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="warehouse-rts-subpanel warehouse-rts-subpanel--approved">
            <h4>Final QC Approval</h4>
            <p className="status-breakdown-note">
              Green = Final QC approved. Press <strong>Shipped</strong> when the valve leaves the
              shop — status changes from {statusLabel} to Completed, with who closed it and the close
              timestamp (requires Final QC Approval).
            </p>
            {approvedRows.length === 0 ? (
              <p className="placeholder-copy">No valves with Final QC Approval yet.</p>
            ) : (
              <div className="dashboard-table-wrap warehouse-rts-table-wrap">
                <table className="dashboard-table warehouse-rts-table">
                  <thead>
                    <tr>
                      <th>Final QC Approval</th>
                      <th>Valve ID</th>
                      <th>Customer</th>
                      <th>{workflow.workCellLabel}</th>
                      <th>Due date</th>
                      <th>Signed off by</th>
                      <th>Signed off at</th>
                      <th>Ship</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedRows.map((row) => {
                      const canShip = Boolean(row.shipment_final_approved) && canWrite
                      return (
                        <tr key={row.id} className="warehouse-rts-row warehouse-rts-row--approved">
                          <td className="warehouse-rts-approval-cell">
                            <label className="warehouse-rts-approval-label">
                              <input
                                type="checkbox"
                                checked
                                disabled={!canWrite || !approvalEnabled || savingId === row.id}
                                onChange={(e) => void toggleApproval(row, e.target.checked)}
                                aria-label={`Final QC Approval for ${row.valve_id}`}
                              />
                              <span>Approved</span>
                            </label>
                          </td>
                          {renderValveCells(row)}
                          <td>{row.shipment_final_approved_by ?? '—'}</td>
                          <td>{formatApprovedAt(row.shipment_final_approved_at)}</td>
                          <td className="warehouse-rts-ship-cell">
                            <button
                              type="button"
                              className="button-primary warehouse-rts-ship-btn"
                              disabled={!canShip || savingId === row.id}
                              title={
                                row.shipment_final_approved
                                  ? 'Mark shipped and remove from dashboard'
                                  : 'Final QC Approval must be checked first'
                              }
                              onClick={() => void markShipped(row)}
                            >
                              {savingId === row.id ? 'Saving…' : 'Shipped'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
