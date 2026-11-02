import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterRowsByCompanyValveIdAsync } from '../lib/companyDataScope'
import {
  DUE_DATE_CUSTOMER_RESPONSES,
  type DueDateCustomerResponse,
} from '../lib/dueDateChangeReasons'
import {
  fetchPendingCustomerDueDateChanges,
  recordDueDateCustomerResponse,
  resolveChangedByName,
} from '../lib/dueDateChanges'
import type { DueDateChangeRecord } from '../types'
import { useToast } from './ToastNotification'

export function DueDateCustomerPendingPanel() {
  const { showToast } = useToast()
  const { username } = useAuth()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const [rows, setRows] = useState<DueDateChangeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<
    Record<number, { response: DueDateCustomerResponse | ''; comment: string }>
  >({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchPendingCustomerDueDateChanges()
    setLoading(false)
    if (error) {
      showToast(error.message)
      setRows([])
      return
    }
    setRows(
      await filterRowsByCompanyValveIdAsync(data, {
        workflowKey: workflow.key,
        activeOrganization,
      }),
    )
  }, [showToast, workflow.key, activeOrganization])

  useEffect(() => {
    void load()
  }, [load])

  const patchDraft = (
    id: number,
    patch: Partial<{ response: DueDateCustomerResponse | ''; comment: string }>,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        response: prev[id]?.response ?? '',
        comment: prev[id]?.comment ?? '',
        ...patch,
      },
    }))
  }

  const submitResponse = async (row: DueDateChangeRecord) => {
    const draft = drafts[row.id]
    if (!draft?.response) {
      showToast('Select Approved, Cancelled, or Other')
      return
    }
    if (!draft.comment.trim()) {
      showToast('Enter a comment for the customer response')
      return
    }
    setActionId(row.id)
    const respondedByName = await resolveChangedByName(username ?? 'Unknown')
    const { error } = await recordDueDateCustomerResponse({
      id: row.id,
      response: draft.response,
      comment: draft.comment,
      respondedByName,
    })
    setActionId(null)
    if (error) {
      showToast(error)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    showToast(`Customer response recorded for ${row.valve_id}`)
  }

  return (
    <section className="dashboard-panel due-date-pending-panel">
      <div className="rework-dashboard-panel-header">
        <div>
          <h3>Due date changes — awaiting customer response</h3>
          <p className="status-breakdown-note">
            Stays here until the customer answer is <strong>Approved</strong>, <strong>Cancelled</strong>, or{' '}
            <strong>Other</strong> (with a comment). Shows when the date changed and when the customer was notified.
          </p>
        </div>
        <div className="rework-dashboard-panel-actions">
          <button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <Link className="button-secondary" to={{ pathname: '/reports' }}>
            Full report
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="placeholder-copy">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="placeholder-copy">No due date changes waiting on customer response.</p>
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Changed</th>
                <th>Customer notified</th>
                <th>Valve ID</th>
                <th>Customer</th>
                <th>Previous</th>
                <th>New</th>
                <th>Reason</th>
                <th>Customer response</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.id] ?? { response: '' as const, comment: '' }
                return (
                  <tr key={row.id}>
                    <td>{new Date(row.changed_at).toLocaleString()}</td>
                    <td>
                      {row.customer_notification_at
                        ? new Date(row.customer_notification_at).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <Link to={`/job-board?open=${row.valve_row_id}`}>{row.valve_id}</Link>
                    </td>
                    <td>{row.customer?.trim() || '—'}</td>
                    <td>{row.previous_due_date ?? '—'}</td>
                    <td>{row.new_due_date ?? '—'}</td>
                    <td className="table-cell-clamp">{row.reason}</td>
                    <td className="due-date-pending-actions">
                      <select
                        value={draft.response}
                        disabled={actionId === row.id}
                        onChange={(e) =>
                          patchDraft(row.id, {
                            response: e.target.value as DueDateCustomerResponse | '',
                          })
                        }
                      >
                        <option value="">Select…</option>
                        {DUE_DATE_CUSTOMER_RESPONSES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={draft.comment}
                        disabled={actionId === row.id}
                        placeholder="Comment (required)"
                        onChange={(e) => patchDraft(row.id, { comment: e.target.value })}
                      />
                      <button
                        type="button"
                        className="button-primary"
                        disabled={actionId === row.id}
                        onClick={() => void submitResponse(row)}
                      >
                        {actionId === row.id ? 'Saving…' : 'Record'}
                      </button>
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
