import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { toDateInputValue } from '../lib/jobCardSave'
import {
  OUTSOURCED_ITEM_STATUSES,
  applyOutsourcedStatusChange,
  createValveOutsourcedItem,
  deleteValveOutsourcedItem,
  emptyOutsourcedItemInput,
  inputFromOutsourcedItem,
  listValveOutsourcedItems,
  outsourcedStatusLabel,
  updateValveOutsourcedItem,
  type ValveOutsourcedItemInput,
} from '../lib/valveOutsourcedItems'
import type { ValveOutsourcedItem, ValveOutsourcedItemStatus } from '../types'

type ValveOutsourcedItemsPanelProps = {
  valveRowId: number
  disabled?: boolean
}

function formatDisplayDate(raw: string | null): string {
  if (!raw) return '—'
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function isBlankInput(input: ValveOutsourcedItemInput): boolean {
  return (
    !input.date_shipped &&
    !input.expected_date_back &&
    !input.date_received &&
    !input.netsuite_po_number.trim() &&
    !input.vendor.trim() &&
    !input.item_shipped.trim() &&
    !input.work_description.trim() &&
    input.status === 'not_shipped'
  )
}

function OutsourcedItemForm({
  value,
  vendors,
  disabled,
  busy,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: ValveOutsourcedItemInput
  vendors: string[]
  disabled?: boolean
  busy?: boolean
  submitLabel: string
  onChange: (next: ValveOutsourcedItemInput) => void
  onSubmit: () => void
  onCancel?: () => void
}) {
  const set = <K extends keyof ValveOutsourcedItemInput>(key: K, next: ValveOutsourcedItemInput[K]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <form
      className="outsourced-item-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="outsourced-item-form-grid">
        <label className="modal-label">
          Status
          <select
            className="modal-status-select"
            value={value.status}
            disabled={disabled || busy}
            onChange={(e) =>
              onChange(applyOutsourcedStatusChange(value, e.target.value as ValveOutsourcedItemStatus))
            }
          >
            {OUTSOURCED_ITEM_STATUSES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {value.status === 'received' ? (
          <label className="modal-label">
            Date received
            <input
              type="date"
              className="modal-status-select"
              value={toDateInputValue(value.date_received)}
              disabled={disabled || busy}
              required
              onChange={(e) => set('date_received', e.target.value || null)}
            />
          </label>
        ) : (
          <div aria-hidden className="outsourced-item-form-spacer" />
        )}
        <label className="modal-label">
          Date shipped
          <input
            type="date"
            className="modal-status-select"
            value={toDateInputValue(value.date_shipped)}
            disabled={disabled || busy}
            onChange={(e) => set('date_shipped', e.target.value || null)}
          />
        </label>
        <label className="modal-label">
          Expected date back
          <input
            type="date"
            className="modal-status-select"
            value={toDateInputValue(value.expected_date_back)}
            disabled={disabled || busy}
            onChange={(e) => set('expected_date_back', e.target.value || null)}
          />
        </label>
        <label className="modal-label">
          NetSuite PO number
          <input
            type="text"
            className="modal-status-select"
            value={value.netsuite_po_number}
            disabled={disabled || busy}
            placeholder="PO #"
            onChange={(e) => set('netsuite_po_number', e.target.value)}
          />
        </label>
        <label className="modal-label">
          Vendor
          <select
            className="modal-status-select"
            value={value.vendor}
            disabled={disabled || busy}
            onChange={(e) => set('vendor', e.target.value)}
          >
            <option value="">Select vendor…</option>
            {value.vendor && !vendors.includes(value.vendor) ? (
              <option value={value.vendor}>{value.vendor} (not in list)</option>
            ) : null}
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="modal-label outsourced-item-form-span">
          Item shipped
          <input
            type="text"
            className="modal-status-select"
            value={value.item_shipped}
            disabled={disabled || busy}
            placeholder="What was sent out"
            onChange={(e) => set('item_shipped', e.target.value)}
          />
        </label>
        <label className="modal-label outsourced-item-form-span">
          Description of work to be done
          <textarea
            className="modal-textarea"
            rows={3}
            value={value.work_description}
            disabled={disabled || busy}
            placeholder="Work the vendor should perform"
            onChange={(e) => set('work_description', e.target.value)}
          />
        </label>
      </div>
      <div className="outsourced-item-form-actions">
        {onCancel ? (
          <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="button-primary" disabled={disabled || busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export function ValveOutsourcedItemsPanel({ valveRowId, disabled }: ValveOutsourcedItemsPanelProps) {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ValveOutsourcedItem[]>([])
  const [vendors, setVendors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ValveOutsourcedItemInput>(() => emptyOutsourcedItemInput())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<ValveOutsourcedItemInput>(() => emptyOutsourcedItemInput())
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [items, map] = await Promise.all([listValveOutsourcedItems(valveRowId), loadLookupOptionsMap()])
      setRows(items)
      setVendors(map.vendor ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load outsourced items'
      setLoadError(message)
      setRows([])
      if (/relation .* does not exist|Could not find the table/i.test(message)) {
        showToast('Run migration-valve-outsourced-items.sql in Supabase, then try again')
      } else {
        showToast(message)
      }
    } finally {
      setLoading(false)
    }
  }, [valveRowId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async () => {
    if (disabled || busy) return
    if (isBlankInput(draft)) {
      showToast('Fill in at least one field')
      return
    }
    if (draft.status === 'received' && !draft.date_received) {
      showToast('Enter the date received')
      return
    }
    setBusy(true)
    try {
      await createValveOutsourcedItem(valveRowId, draft)
      setDraft(emptyOutsourcedItemInput())
      setShowAddForm(false)
      showToast('Outsourced item added')
      await load()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save'
      if (/relation .* does not exist|Could not find the table/i.test(message)) {
        showToast('Run migration-valve-outsourced-items.sql in Supabase, then try again')
      } else {
        showToast(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (row: ValveOutsourcedItem) => {
    setEditingId(row.id)
    setEditDraft(inputFromOutsourcedItem(row))
    setShowAddForm(false)
  }

  const handleUpdate = async () => {
    if (editingId == null || disabled || busy) return
    if (isBlankInput(editDraft)) {
      showToast('Fill in at least one field')
      return
    }
    if (editDraft.status === 'received' && !editDraft.date_received) {
      showToast('Enter the date received')
      return
    }
    setBusy(true)
    try {
      await updateValveOutsourcedItem(editingId, editDraft)
      setEditingId(null)
      showToast('Outsourced item updated')
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update')
    } finally {
      setBusy(false)
    }
  }

  const handleQuickStatusChange = async (row: ValveOutsourcedItem, nextStatus: ValveOutsourcedItemStatus) => {
    if (disabled || busy || row.status === nextStatus) return
    const next = applyOutsourcedStatusChange(inputFromOutsourcedItem(row), nextStatus)
    if (nextStatus === 'received' && !next.date_received) {
      showToast('Enter the date received')
      startEdit({ ...row, status: nextStatus })
      return
    }
    setBusy(true)
    try {
      await updateValveOutsourcedItem(row.id, next)
      showToast(`Status set to ${outsourcedStatusLabel(nextStatus)}`)
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update status')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (row: ValveOutsourcedItem) => {
    if (disabled || busy) return
    const label = row.item_shipped?.trim() || row.vendor?.trim() || 'this item'
    if (!window.confirm(`Remove outsourced item “${label}”?`)) return
    setBusy(true)
    try {
      await deleteValveOutsourcedItem(row.id)
      if (editingId === row.id) setEditingId(null)
      showToast('Outsourced item removed')
      await load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="placeholder-copy">Loading outsourced items…</p>
  }

  return (
    <div className="outsourced-items-panel">
      <div className="outsourced-items-panel-hdr">
        <div>
          <h3 className="outsourced-items-title">Outsourced items</h3>
          <p className="outsourced-items-hint">
            Track parts or work sent to a vendor. Add vendors under{' '}
            <Link to="/admin/lists">Manage lists → Vendor</Link>.
          </p>
        </div>
        {!disabled ? (
          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={() => {
              setShowAddForm((v) => !v)
              setEditingId(null)
            }}
          >
            {showAddForm ? 'Close form' : '+ Add item'}
          </button>
        ) : null}
      </div>

      {loadError ? <p className="status-breakdown-note">{loadError}</p> : null}

      {showAddForm && !disabled ? (
        <div className="outsourced-item-card outsourced-item-card--form">
          <OutsourcedItemForm
            value={draft}
            vendors={vendors}
            disabled={disabled}
            busy={busy}
            submitLabel="Add outsourced item"
            onChange={setDraft}
            onSubmit={() => void handleCreate()}
            onCancel={() => {
              setShowAddForm(false)
              setDraft(emptyOutsourcedItemInput())
            }}
          />
        </div>
      ) : null}

      {rows.length === 0 && !showAddForm ? (
        <div className="job-card-empty-state">
          <p>No outsourced items yet.</p>
          {!disabled ? <p className="outsourced-items-hint">Use + Add item to record a shipment to a vendor.</p> : null}
        </div>
      ) : null}

      <ul className="outsourced-items-list">
        {rows.map((row) => (
          <li key={row.id} className={`outsourced-item-card outsourced-item-card--${row.status}`}>
            {editingId === row.id ? (
              <OutsourcedItemForm
                value={editDraft}
                vendors={vendors}
                disabled={disabled}
                busy={busy}
                submitLabel="Save changes"
                onChange={setEditDraft}
                onSubmit={() => void handleUpdate()}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="outsourced-item-card-top">
                  <div>
                    <div className="outsourced-item-name">{row.item_shipped?.trim() || 'Outsourced item'}</div>
                    <div className="outsourced-item-meta">
                      {row.vendor?.trim() || 'No vendor'}
                      {row.netsuite_po_number?.trim() ? ` · PO ${row.netsuite_po_number.trim()}` : ''}
                    </div>
                  </div>
                  <div className="outsourced-item-card-actions">
                    <label className="outsourced-item-status-control">
                      <span className="visually-hidden">Status</span>
                      <select
                        className={`outsourced-item-status-select outsourced-item-status-select--${row.status}`}
                        value={row.status}
                        disabled={disabled || busy}
                        onChange={(e) =>
                          void handleQuickStatusChange(row, e.target.value as ValveOutsourcedItemStatus)
                        }
                      >
                        {OUTSOURCED_ITEM_STATUSES.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!disabled ? (
                      <>
                        <button type="button" className="button-secondary" disabled={busy} onClick={() => startEdit(row)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={busy}
                          onClick={() => void handleDelete(row)}
                        >
                          Remove
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <dl className="outsourced-item-dl">
                  <div>
                    <dt>Date shipped</dt>
                    <dd>{formatDisplayDate(row.date_shipped)}</dd>
                  </div>
                  <div>
                    <dt>Expected back</dt>
                    <dd>{formatDisplayDate(row.expected_date_back)}</dd>
                  </div>
                  {row.status === 'received' ? (
                    <div>
                      <dt>Date received</dt>
                      <dd>{formatDisplayDate(row.date_received)}</dd>
                    </div>
                  ) : null}
                  <div className="outsourced-item-dl-span">
                    <dt>Work to be done</dt>
                    <dd>{row.work_description?.trim() || '—'}</dd>
                  </div>
                </dl>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
