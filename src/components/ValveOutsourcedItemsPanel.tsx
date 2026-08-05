import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { addLookupValue, loadLookupOptionsMap } from '../lib/lookupValues'
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

function formatDisplayDate(raw: string | null): string {
  const v = toDateInputValue(raw)
  if (!v) return '—'
  const d = new Date(`${v}T12:00:00`)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function OutsourcedFieldsGrid({
  value,
  vendors,
  disabled,
  busy,
  onChange,
  onAddVendor,
}: {
  value: ValveOutsourcedItemInput
  vendors: string[]
  disabled?: boolean
  busy?: boolean
  onChange: (next: ValveOutsourcedItemInput) => void
  onAddVendor?: (vendorName: string) => Promise<void>
}) {
  const [addingVendor, setAddingVendor] = useState(false)
  const [vendorDraft, setVendorDraft] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  const set = <K extends keyof ValveOutsourcedItemInput>(key: K, next: ValveOutsourcedItemInput[K]) => {
    onChange({ ...value, [key]: next })
  }

  const submitNewVendor = async () => {
    const name = vendorDraft.trim()
    if (!name || !onAddVendor || savingVendor) return
    setSavingVendor(true)
    try {
      await onAddVendor(name)
      setVendorDraft('')
      setAddingVendor(false)
    } finally {
      setSavingVendor(false)
    }
  }

  return (
    <div className="outsourced-fields-grid">
      <label className="outsourced-field outsourced-field--wide">
        <span>Item shipped</span>
        <input
          type="text"
          className="outsourced-table-input"
          value={value.item_shipped}
          disabled={disabled || busy}
          placeholder="What was sent out"
          onChange={(e) => set('item_shipped', e.target.value)}
        />
      </label>
      <label className="outsourced-field">
        <span>Status</span>
        <select
          className={`outsourced-table-input outsourced-table-status outsourced-table-status--${value.status}`}
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
      <label className="outsourced-field">
        <span>Date shipped</span>
        <input
          type="date"
          className="outsourced-table-input"
          value={toDateInputValue(value.date_shipped)}
          disabled={disabled || busy}
          onChange={(e) => set('date_shipped', e.target.value || null)}
        />
      </label>
      <label className="outsourced-field">
        <span>Expected back</span>
        <input
          type="date"
          className="outsourced-table-input"
          value={toDateInputValue(value.expected_date_back)}
          disabled={disabled || busy}
          onChange={(e) => set('expected_date_back', e.target.value || null)}
        />
      </label>
      <label className="outsourced-field">
        <span>Date received</span>
        <input
          type="date"
          className="outsourced-table-input"
          value={toDateInputValue(value.date_received)}
          disabled={disabled || busy || value.status !== 'received'}
          title={value.status === 'received' ? undefined : 'Set status to Received to enter date'}
          onChange={(e) => set('date_received', e.target.value || null)}
        />
      </label>
      <label className="outsourced-field">
        <span>NetSuite PO #</span>
        <input
          type="text"
          className="outsourced-table-input"
          value={value.netsuite_po_number}
          disabled={disabled || busy}
          placeholder="PO #"
          onChange={(e) => set('netsuite_po_number', e.target.value)}
        />
      </label>
      <div className="outsourced-field outsourced-field--vendor">
        <div className="outsourced-field-label-row">
          <span>Vendor</span>
          {!disabled && onAddVendor ? (
            <button
              type="button"
              className="outsourced-add-vendor-toggle"
              disabled={busy || savingVendor}
              onClick={() => setAddingVendor((v) => !v)}
            >
              {addingVendor ? 'Cancel' : '+ Add vendor'}
            </button>
          ) : null}
        </div>
        <select
          className="outsourced-table-input"
          value={value.vendor}
          disabled={disabled || busy}
          onChange={(e) => set('vendor', e.target.value)}
        >
          <option value="">Select vendor…</option>
          {value.vendor && !vendors.includes(value.vendor) ? (
            <option value={value.vendor}>{value.vendor}</option>
          ) : null}
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {addingVendor && !disabled && onAddVendor ? (
          <div className="outsourced-add-vendor-row">
            <input
              type="text"
              className="outsourced-table-input"
              value={vendorDraft}
              disabled={busy || savingVendor}
              placeholder="New vendor name"
              aria-label="New vendor name"
              onChange={(e) => setVendorDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submitNewVendor()
                }
              }}
            />
            <button
              type="button"
              className="button-primary outsourced-table-btn"
              disabled={busy || savingVendor || !vendorDraft.trim()}
              onClick={() => void submitNewVendor()}
            >
              {savingVendor ? '…' : 'Save'}
            </button>
          </div>
        ) : null}
      </div>
      <label className="outsourced-field outsourced-field--full">
        <span>Work to be done</span>
        <textarea
          className="outsourced-table-input outsourced-table-textarea"
          rows={2}
          value={value.work_description}
          disabled={disabled || busy}
          placeholder="Description of work"
          onChange={(e) => set('work_description', e.target.value)}
        />
      </label>
    </div>
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

  const handleAddVendor = async (vendorName: string) => {
    try {
      const saved = await addLookupValue('vendor', vendorName)
      const map = await loadLookupOptionsMap()
      setVendors(map.vendor ?? [])
      if (editingId != null) {
        setEditDraft((prev) => ({ ...prev, vendor: saved }))
      } else {
        setDraft((prev) => ({ ...prev, vendor: saved }))
      }
      showToast(`Vendor “${saved}” added`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not add vendor')
      throw error
    }
  }

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
            Compact entry grid — fields wrap to fit. Use <strong>+ Add vendor</strong> next to Vendor, or manage the
            full list under <Link to="/admin/lists">Manage lists → Vendor</Link>.
          </p>
        </div>
      </div>

      {loadError ? (
        <p className="status-breakdown-note">
          Could not load outsourced items. Run <code>migration-valve-outsourced-items.sql</code> in Supabase, then
          refresh.
        </p>
      ) : null}

      <ul className="outsourced-rows">
        {rows.map((row) => (
          <li key={row.id} className={`outsourced-row outsourced-row--${row.status}`}>
            {editingId === row.id ? (
              <>
                <OutsourcedFieldsGrid
                  value={editDraft}
                  vendors={vendors}
                  disabled={disabled}
                  busy={busy}
                  onChange={setEditDraft}
                  onAddVendor={handleAddVendor}
                />
                <div className="outsourced-row-actions">
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
                </div>
              </>
            ) : (
              <>
                <div className="outsourced-row-summary">
                  <span className="outsourced-chip outsourced-chip--item">
                    <strong>Item</strong> {row.item_shipped?.trim() || '—'}
                  </span>
                  <select
                    className={`outsourced-table-input outsourced-table-status outsourced-table-status--${row.status}`}
                    value={row.status}
                    disabled={disabled || busy}
                    aria-label="Status"
                    onChange={(e) => void handleQuickStatusChange(row, e.target.value as ValveOutsourcedItemStatus)}
                  >
                    {OUTSOURCED_ITEM_STATUSES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="outsourced-chip">
                    <strong>Shipped</strong> {formatDisplayDate(row.date_shipped)}
                  </span>
                  <span className="outsourced-chip">
                    <strong>Back</strong> {formatDisplayDate(row.expected_date_back)}
                  </span>
                  <span className="outsourced-chip">
                    <strong>Received</strong> {formatDisplayDate(row.date_received)}
                  </span>
                  <span className="outsourced-chip">
                    <strong>PO</strong> {row.netsuite_po_number?.trim() || '—'}
                  </span>
                  <span className="outsourced-chip">
                    <strong>Vendor</strong> {row.vendor?.trim() || '—'}
                  </span>
                  <span className="outsourced-chip outsourced-chip--full">
                    <strong>Work</strong> {row.work_description?.trim() || '—'}
                  </span>
                </div>
                {!disabled ? (
                  <div className="outsourced-row-actions">
                    <button type="button" className="button-secondary outsourced-table-btn" disabled={busy} onClick={() => startEdit(row)}>
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
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}

        {!disabled ? (
          <li className="outsourced-row outsourced-row--add">
            <OutsourcedFieldsGrid
              value={draft}
              vendors={vendors}
              disabled={disabled}
              busy={busy}
              onChange={setDraft}
              onAddVendor={handleAddVendor}
            />
            <div className="outsourced-row-actions">
              <button type="button" className="button-primary outsourced-table-btn" disabled={busy} onClick={() => void handleCreate()}>
                {busy ? 'Saving…' : 'Add item'}
              </button>
            </div>
          </li>
        ) : null}
      </ul>

      {rows.length === 0 && disabled ? <p className="outsourced-items-hint">No outsourced items yet.</p> : null}
    </div>
  )
}
