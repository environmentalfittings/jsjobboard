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

function OutsourcedRowFields({
  value,
  vendors,
  disabled,
  busy,
  onChange,
}: {
  value: ValveOutsourcedItemInput
  vendors: string[]
  disabled?: boolean
  busy?: boolean
  onChange: (next: ValveOutsourcedItemInput) => void
}) {
  const set = <K extends keyof ValveOutsourcedItemInput>(key: K, next: ValveOutsourcedItemInput[K]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <>
      <td>
        <select
          className="outsourced-table-input"
          value={value.status}
          disabled={disabled || busy}
          aria-label="Status"
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
      </td>
      <td>
        <input
          type="date"
          className="outsourced-table-input"
          value={toDateInputValue(value.date_shipped)}
          disabled={disabled || busy}
          aria-label="Date shipped"
          onChange={(e) => set('date_shipped', e.target.value || null)}
        />
      </td>
      <td>
        <input
          type="date"
          className="outsourced-table-input"
          value={toDateInputValue(value.expected_date_back)}
          disabled={disabled || busy}
          aria-label="Expected date back"
          onChange={(e) => set('expected_date_back', e.target.value || null)}
        />
      </td>
      <td>
        <input
          type="date"
          className="outsourced-table-input"
          value={toDateInputValue(value.date_received)}
          disabled={disabled || busy || value.status !== 'received'}
          aria-label="Date received"
          title={value.status === 'received' ? undefined : 'Set status to Received to enter date'}
          onChange={(e) => set('date_received', e.target.value || null)}
        />
      </td>
      <td>
        <input
          type="text"
          className="outsourced-table-input"
          value={value.netsuite_po_number}
          disabled={disabled || busy}
          placeholder="PO #"
          aria-label="NetSuite PO number"
          onChange={(e) => set('netsuite_po_number', e.target.value)}
        />
      </td>
      <td>
        <select
          className="outsourced-table-input"
          value={value.vendor}
          disabled={disabled || busy}
          aria-label="Vendor"
          onChange={(e) => set('vendor', e.target.value)}
        >
          <option value="">Vendor…</option>
          {value.vendor && !vendors.includes(value.vendor) ? (
            <option value={value.vendor}>{value.vendor}</option>
          ) : null}
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="text"
          className="outsourced-table-input"
          value={value.item_shipped}
          disabled={disabled || busy}
          placeholder="Item"
          aria-label="Item shipped"
          onChange={(e) => set('item_shipped', e.target.value)}
        />
      </td>
      <td>
        <input
          type="text"
          className="outsourced-table-input"
          value={value.work_description}
          disabled={disabled || busy}
          placeholder="Work to be done"
          aria-label="Description of work"
          onChange={(e) => set('work_description', e.target.value)}
        />
      </td>
    </>
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
            Enter rows below. Add vendors under <Link to="/admin/lists">Manage lists → Vendor</Link>.
          </p>
        </div>
      </div>

      {loadError ? <p className="status-breakdown-note">{loadError}</p> : null}

      <div className="outsourced-table-wrap">
        <table className="outsourced-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Shipped</th>
              <th>Expected back</th>
              <th>Received</th>
              <th>PO #</th>
              <th>Vendor</th>
              <th>Item</th>
              <th>Work to be done</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editingId === row.id ? (
                <tr key={row.id} className="outsourced-table-row--editing">
                  <OutsourcedRowFields
                    value={editDraft}
                    vendors={vendors}
                    disabled={disabled}
                    busy={busy}
                    onChange={setEditDraft}
                  />
                  <td className="outsourced-table-actions">
                    <button type="button" className="button-primary outsourced-table-btn" disabled={busy} onClick={() => void handleUpdate()}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="button-secondary outsourced-table-btn"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className={`outsourced-table-row--${row.status}`}>
                  <td>
                    <select
                      className={`outsourced-table-input outsourced-table-status outsourced-table-status--${row.status}`}
                      value={row.status}
                      disabled={disabled || busy}
                      aria-label="Status"
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
                  </td>
                  <td>{toDateInputValue(row.date_shipped) || '—'}</td>
                  <td>{toDateInputValue(row.expected_date_back) || '—'}</td>
                  <td>{toDateInputValue(row.date_received) || '—'}</td>
                  <td>{row.netsuite_po_number?.trim() || '—'}</td>
                  <td>{row.vendor?.trim() || '—'}</td>
                  <td>{row.item_shipped?.trim() || '—'}</td>
                  <td className="outsourced-table-work">{row.work_description?.trim() || '—'}</td>
                  <td className="outsourced-table-actions">
                    {!disabled ? (
                      <>
                        <button
                          type="button"
                          className="button-secondary outsourced-table-btn"
                          disabled={busy}
                          onClick={() => startEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button-secondary outsourced-table-btn"
                          disabled={busy}
                          onClick={() => void handleDelete(row)}
                        >
                          Remove
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ),
            )}

            {!disabled ? (
              <tr className="outsourced-table-row--add">
                <OutsourcedRowFields
                  value={draft}
                  vendors={vendors}
                  disabled={disabled}
                  busy={busy}
                  onChange={setDraft}
                />
                <td className="outsourced-table-actions">
                  <button
                    type="button"
                    className="button-primary outsourced-table-btn"
                    disabled={busy}
                    onClick={() => void handleCreate()}
                  >
                    {busy ? '…' : 'Add'}
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && disabled ? <p className="outsourced-items-hint">No outsourced items yet.</p> : null}
    </div>
  )
}
