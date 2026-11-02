import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterRowsByCompanyValveIdAsync } from '../lib/companyDataScope'
import {
  commentsRequiredForReason,
  DUE_DATE_CHANGE_REASON_CODES,
  DUE_DATE_CUSTOMER_QUEUE_CUTOFF_DATE,
  DUE_DATE_CUSTOMER_RESPONSES,
  otherTextRequiredForReason,
  parseReasonCodeFromRecord,
  validateDueDateChangeReasonFields,
  type DueDateChangeReasonCode,
  type DueDateCustomerResponse,
} from '../lib/dueDateChangeReasons'
import {
  fetchPendingCustomerDueDateChanges,
  recordDueDateCustomerResponse,
  resolveChangedByName,
  updateDueDateChangeReason,
} from '../lib/dueDateChanges'
import type { DueDateChangeRecord } from '../types'
import { useToast } from './ToastNotification'

type RowDraft = {
  reasonCode: DueDateChangeReasonCode | ''
  otherText: string
  comments: string
  response: DueDateCustomerResponse | ''
  comment: string
}

function draftFromRow(row: DueDateChangeRecord): RowDraft {
  return {
    reasonCode: parseReasonCodeFromRecord(row.reason_code),
    otherText: row.other_text ?? '',
    comments: row.comments ?? '',
    response: '',
    comment: '',
  }
}

export function DueDateCustomerPendingPanel() {
  const { showToast } = useToast()
  const { username } = useAuth()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const [rows, setRows] = useState<DueDateChangeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchPendingCustomerDueDateChanges()
    setLoading(false)
    if (error) {
      showToast(error.message)
      setRows([])
      setDrafts({})
      return
    }
    const scoped = await filterRowsByCompanyValveIdAsync(data, {
      workflowKey: workflow.key,
      activeOrganization,
    })
    setRows(scoped)
    setDrafts((prev) => {
      const next: Record<number, RowDraft> = {}
      for (const row of scoped) {
        next[row.id] = prev[row.id] ?? draftFromRow(row)
      }
      return next
    })
  }, [showToast, workflow.key, activeOrganization])

  useEffect(() => {
    void load()
  }, [load])

  const patchDraft = (id: number, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {
          reasonCode: '' as const,
          otherText: '',
          comments: '',
          response: '' as const,
          comment: '',
        }),
        ...patch,
      },
    }))
  }

  const saveReasonOnly = async (row: DueDateChangeRecord) => {
    const draft = drafts[row.id] ?? draftFromRow(row)
    const validation = validateDueDateChangeReasonFields(draft)
    if (validation) {
      showToast(validation)
      return
    }
    setActionId(row.id)
    const { error, reason } = await updateDueDateChangeReason({
      id: row.id,
      reasonCode: draft.reasonCode as DueDateChangeReasonCode,
      otherText: draft.otherText,
      comments: draft.comments,
    })
    setActionId(null)
    if (error) {
      showToast(error)
      return
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              reason: reason ?? r.reason,
              reason_code: draft.reasonCode,
              other_text: draft.otherText.trim() || null,
              comments: draft.comments.trim() || null,
            }
          : r,
      ),
    )
    showToast(`Reason updated for ${row.valve_id}`)
  }

  const submitResponse = async (row: DueDateChangeRecord) => {
    const draft = drafts[row.id] ?? draftFromRow(row)
    if (!draft.response) {
      showToast('Select Approved, Cancelled, or Other before recording')
      return
    }
    if (!draft.comment.trim()) {
      showToast('Enter a comment for the customer response before recording')
      return
    }
    const reasonValidation = validateDueDateChangeReasonFields(draft)
    if (reasonValidation) {
      showToast(reasonValidation)
      return
    }
    setActionId(row.id)
    const respondedByName = await resolveChangedByName(username ?? 'Unknown')
    const { error } = await recordDueDateCustomerResponse({
      id: row.id,
      response: draft.response,
      comment: draft.comment,
      respondedByName,
      reason: {
        reasonCode: draft.reasonCode as DueDateChangeReasonCode,
        otherText: draft.otherText,
        comments: draft.comments,
      },
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
            Through <strong>{DUE_DATE_CUSTOMER_QUEUE_CUTOFF_DATE}</strong>: still-in-shop jobs (not Completed) that had a
            due date change. After that date: every due date change stays here until{' '}
            <strong>Approved</strong>, <strong>Cancelled</strong>, or <strong>Other</strong> (with a comment). You can
            change the reason here; <strong>Record</strong> does nothing until you pick a customer response and enter a
            comment.
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
                const draft = drafts[row.id] ?? draftFromRow(row)
                const needOther = otherTextRequiredForReason(draft.reasonCode)
                const needComments = commentsRequiredForReason(draft.reasonCode)
                const busy = actionId === row.id
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
                    <td className="due-date-pending-reason">
                      <select
                        value={draft.reasonCode}
                        disabled={busy}
                        onChange={(e) =>
                          patchDraft(row.id, {
                            reasonCode: e.target.value as DueDateChangeReasonCode | '',
                          })
                        }
                      >
                        <option value="">Select reason…</option>
                        {DUE_DATE_CHANGE_REASON_CODES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                      {needOther ? (
                        <input
                          type="text"
                          value={draft.otherText}
                          disabled={busy}
                          placeholder="What is Other? (required)"
                          onChange={(e) => patchDraft(row.id, { otherText: e.target.value })}
                        />
                      ) : null}
                      <input
                        type="text"
                        value={draft.comments}
                        disabled={busy}
                        placeholder={needComments ? 'Comments (required)' : 'Comments (optional)'}
                        onChange={(e) => patchDraft(row.id, { comments: e.target.value })}
                      />
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => void saveReasonOnly(row)}
                      >
                        Save reason
                      </button>
                    </td>
                    <td className="due-date-pending-actions">
                      <select
                        value={draft.response}
                        disabled={busy}
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
                        disabled={busy}
                        placeholder="Comment (required)"
                        onChange={(e) => patchDraft(row.id, { comment: e.target.value })}
                      />
                      <button
                        type="button"
                        className="button-primary"
                        disabled={busy}
                        onClick={() => void submitResponse(row)}
                      >
                        {busy ? 'Saving…' : 'Record'}
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
