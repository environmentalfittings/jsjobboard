import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterRowsByCompanyValveIdAsync } from '../lib/companyDataScope'
import {
  DUE_DATE_CHANGE_REASON_CODES,
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

type SortKey = 'changed_at' | 'customer_notification_at' | 'valve_id' | 'customer' | 'previous_due_date' | 'new_due_date'
type SortDir = 'asc' | 'desc'

function draftFromRow(row: DueDateChangeRecord): RowDraft {
  return {
    reasonCode: parseReasonCodeFromRecord(row.reason_code),
    otherText: row.other_text ?? '',
    comments: row.comments ?? '',
    response: '',
    comment: '',
  }
}

function sortValue(row: DueDateChangeRecord, key: SortKey): string {
  switch (key) {
    case 'changed_at':
      return row.changed_at ?? ''
    case 'customer_notification_at':
      return row.customer_notification_at ?? ''
    case 'valve_id':
      return (row.valve_id ?? '').toLowerCase()
    case 'customer':
      return (row.customer ?? '').trim().toLowerCase()
    case 'previous_due_date':
      return row.previous_due_date ?? ''
    case 'new_due_date':
      return row.new_due_date ?? ''
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
  /** Default customer A→Z so sales can work one customer at a time. */
  const [sortKey, setSortKey] = useState<SortKey>('customer')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      const emptyA = !av
      const emptyB = !bv
      if (emptyA !== emptyB) return emptyA ? 1 : -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      // Stable secondary: customer then changed time.
      const cust = (a.customer ?? '').localeCompare(b.customer ?? '', undefined, { sensitivity: 'base' })
      if (cust !== 0) return cust
      return (b.changed_at ?? '').localeCompare(a.changed_at ?? '')
    })
    return copy
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'changed_at' || key === 'customer_notification_at' ? 'desc' : 'asc')
  }

  const sortHeader = (key: SortKey, label: string) => {
    const active = sortKey === key
    return (
      <th>
        <button
          type="button"
          className={`list-col-sort-btn${active ? ` sorted-${sortDir}` : ''}`}
          onClick={() => toggleSort(key)}
          aria-label={`Sort by ${label}`}
        >
          <span>{label}</span>
          <span className="list-col-sort-indicator" aria-hidden>
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    )
  }

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
            Active in-shop jobs with a due date change awaiting{' '}
            <strong>Approved</strong>, <strong>Cancelled</strong>, or <strong>Other</strong> (with a comment). Jobs in{' '}
            <strong>Waiting on Customer</strong>, On Hold, and other pause statuses are left off this list. Sorted by{' '}
            <strong>Customer</strong> by default so you can clear one customer at a time. Click column headers to re-sort.
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
                {sortHeader('changed_at', 'Changed')}
                {sortHeader('customer_notification_at', 'Customer notified')}
                {sortHeader('valve_id', 'Valve ID')}
                {sortHeader('customer', 'Customer')}
                {sortHeader('previous_due_date', 'Previous')}
                {sortHeader('new_due_date', 'New')}
                <th>Reason</th>
                <th>Customer response</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const draft = drafts[row.id] ?? draftFromRow(row)
                const needOther = otherTextRequiredForReason(draft.reasonCode)
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
                        placeholder="Comments (required)"
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
