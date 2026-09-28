import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterRowsByCompanyValveId } from '../lib/companyDataScope'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { useToast } from './ToastNotification'

const APPROVAL_SELECT =
  'id,valve_id,customer,cell,status,due_date,shipment_final_approved,shipment_final_approved_by,shipment_final_approved_at'
const BASE_SELECT = 'id,valve_id,customer,cell,status,due_date'

type WarehouseRtsRow = {
  id: number
  valve_id: string
  customer: string | null
  cell: string | null
  status: string
  due_date: string | null
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
    due_date: (raw.due_date as string | null) ?? null,
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
    const scoped = filterRowsByCompanyValveId(mapped, {
      workflowKey: workflow.key,
      activeOrganization,
    }).map(({ valve_row_id: _valveRowId, ...row }) => row)
    setRows(scoped)
  }, [workflow.key, activeOrganization, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.shipment_final_approved !== b.shipment_final_approved) {
        return a.shipment_final_approved ? 1 : -1
      }
      const aDue = a.due_date ?? '9999-99-99'
      const bDue = b.due_date ?? '9999-99-99'
      if (aDue !== bDue) return aDue.localeCompare(bDue)
      return a.valve_id.localeCompare(b.valve_id)
    })
  }, [rows])

  const pendingCount = useMemo(
    () => rows.filter((row) => !row.shipment_final_approved).length,
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
        ? `${row.valve_id} approved for shipment by ${approvedBy}`
        : `${row.valve_id} final approval cleared`,
    )
  }

  return (
    <section className="dashboard-panel warehouse-rts-dashboard-panel">
      <div className="rework-dashboard-panel-header">
        <div>
          <h3>{statusLabel}</h3>
          <p className="status-breakdown-note">
            Final approval for shipment. Unchecked rows stay red until someone signs off.
            {rows.length > 0 ? (
              <>
                {' '}
                <strong>{pendingCount}</strong> waiting · <strong>{rows.length}</strong> total.
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
      ) : sortedRows.length === 0 ? (
        <p className="placeholder-copy">
          No valves in {statusLabel}
          {activeOrganization?.name ? ` for ${activeOrganization.name}` : ''}.
        </p>
      ) : (
        <div className="dashboard-table-wrap warehouse-rts-table-wrap">
          <table className="dashboard-table warehouse-rts-table">
            <thead>
              <tr>
                <th>Final approval</th>
                <th>Valve ID</th>
                <th>Customer</th>
                <th>{workflow.workCellLabel}</th>
                <th>Due date</th>
                <th>Signed off by</th>
                <th>Signed off at</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const approved = row.shipment_final_approved
                return (
                  <tr
                    key={row.id}
                    className={
                      approved
                        ? 'warehouse-rts-row warehouse-rts-row--approved'
                        : 'warehouse-rts-row warehouse-rts-row--pending'
                    }
                  >
                    <td className="warehouse-rts-approval-cell" onClick={(e) => e.stopPropagation()}>
                      <label className="warehouse-rts-approval-label">
                        <input
                          type="checkbox"
                          checked={approved}
                          disabled={!canWrite || !approvalEnabled || savingId === row.id}
                          onChange={(e) => void toggleApproval(row, e.target.checked)}
                          aria-label={`Final shipment approval for ${row.valve_id}`}
                        />
                        <span>{approved ? 'Approved' : 'Pending'}</span>
                      </label>
                    </td>
                    <td>
                      <Link to={`/job-board?open=${row.id}`}>{row.valve_id}</Link>
                    </td>
                    <td>{row.customer ?? '—'}</td>
                    <td>{row.cell ?? '—'}</td>
                    <td>{row.due_date ?? '—'}</td>
                    <td>{approved ? (row.shipment_final_approved_by ?? '—') : '—'}</td>
                    <td>{approved ? formatApprovedAt(row.shipment_final_approved_at) : '—'}</td>
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
