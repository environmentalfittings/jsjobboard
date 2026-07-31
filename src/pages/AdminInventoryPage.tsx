import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import {
  createInventoryRecord,
  deleteInventoryRecord,
  emptyInventoryForm,
  INVENTORY_OPERATORS,
  inventoryMatchesSearch,
  inventoryToForm,
  loadInventoryFormOptions,
  loadInventoryRecords,
  updateInventoryRecord,
  type InventoryFormState,
  type InventoryRecord,
} from '../lib/inventory'

type ModalMode = 'create' | 'edit'

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="modal-label inventory-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function DatalistInput({
  listId,
  options,
  value,
  onChange,
  placeholder,
}: {
  listId: string
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}

export function AdminInventoryPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<InventoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<string[]>([])
  const [manufacturers, setManufacturers] = useState<string[]>([])
  const [valveTypes, setValveTypes] = useState<string[]>([])
  const [bodyMaterials, setBodyMaterials] = useState<string[]>([])
  const [sizes, setSizes] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<InventoryFormState>(() => emptyInventoryForm())
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, options] = await Promise.all([loadInventoryRecords(), loadInventoryFormOptions()])
    setLoading(false)
    if (error) {
      showToast(
        error.includes('inventory') || error.includes('relation')
          ? 'Customer inventory table missing — run the traveler / inventory migrations in Supabase'
          : `Could not load customer inventory: ${error}`,
      )
      setRows([])
    } else {
      setRows(data)
    }
    setCustomers(options.customers)
    setManufacturers(options.manufacturers)
    setValveTypes(options.valveTypes)
    setBodyMaterials(options.bodyMaterials)
    setSizes(options.sizes)
    if (options.error) {
      // Non-fatal — datalists still work from lookup_values.
    }
  }, [showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const filtered = useMemo(() => rows.filter((row) => inventoryMatchesSearch(row, search)), [rows, search])

  const patchForm = (partial: Partial<InventoryFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  const openCreate = () => {
    setModalMode('create')
    setEditingId(null)
    setForm(emptyInventoryForm())
    setModalOpen(true)
  }

  const openEdit = (row: InventoryRecord) => {
    setModalMode('edit')
    setEditingId(row.id)
    setForm(inventoryToForm(row))
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyInventoryForm())
  }

  const save = async () => {
    if (!form.jsInventoryId.trim() && !form.customer.trim() && !form.manufacturerName.trim()) {
      showToast('Enter at least a JS inventory ID, customer, or manufacturer')
      return
    }
    setSaving(true)
    const result =
      modalMode === 'edit' && editingId
        ? await updateInventoryRecord(editingId, form)
        : await createInventoryRecord(form)
    setSaving(false)
    if (result.error) {
      showToast(result.error)
      return
    }
    showToast(modalMode === 'edit' ? 'Customer inventory item updated' : 'Customer inventory item added')
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyInventoryForm())
    await reload()
  }

  const remove = async (row: InventoryRecord) => {
    const label = row.js_inventory_id || row.customer || 'this item'
    if (!window.confirm(`Remove ${label} from customer inventory?`)) return
    const { error } = await deleteInventoryRecord(row.id)
    if (error) {
      showToast(error)
      return
    }
    showToast('Customer inventory item removed')
    await reload()
  }

  return (
    <section className="dashboard-page inventory-page">
      <div className="dashboard-title-row admin-page-heading">
        <div>
          <h2 className="dashboard-title">Customer Inventory</h2>
          <p className="placeholder-copy">
            Track valves held for customers outside the active job board (warehouse / customer stock).
          </p>
        </div>
        <div className="admin-employees-title-actions">
          <button type="button" className="button-secondary" onClick={() => void reload()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="button-primary" onClick={openCreate}>
            Add customer inventory item
          </button>
          <Link to="/dashboard" className="button-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>

      <section className="dashboard-panel">
        <div className="report-filters inventory-filters">
          <label>
            Search
            <input
              type="search"
              value={search}
              placeholder="JS ID, customer, manufacturer, type…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="inventory-filter-meta">
            <span>
              {filtered.length} item{filtered.length === 1 ? '' : 's'}
              {search.trim() ? ' matching' : ''}
            </span>
          </div>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>JS inventory ID</th>
                <th>Customer</th>
                <th>Manufacturer</th>
                <th>Type</th>
                <th>Size</th>
                <th>Pressure</th>
                <th>Origin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="table-empty-cell">
                    Loading customer inventory…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty-cell">
                    {rows.length === 0
                      ? 'No customer inventory items yet — add the first one.'
                      : 'No customer inventory items match this search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.js_inventory_id || '—'}</td>
                    <td>{row.customer || '—'}</td>
                    <td>{row.manufacturer_name || '—'}</td>
                    <td>{row.valve_type_label || '—'}</td>
                    <td>{row.size || '—'}</td>
                    <td>{row.pressure || '—'}</td>
                    <td className="table-cell-clamp" title={row.origin || undefined}>
                      {row.origin || '—'}
                    </td>
                    <td className="list-col-actions-cell">
                      <button type="button" className="job-list-quick-action" onClick={() => openEdit(row)}>
                        Edit
                      </button>{' '}
                      <button
                        type="button"
                        className="job-list-quick-action"
                        onClick={() => void remove(row)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen ? (
        <div className="modal-overlay" role="presentation" onClick={closeModal}>
          <div
            className="modal-card modal-card-wide inventory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="technician-modal-head">
              <h3 id="inventory-modal-title">
                {modalMode === 'edit' ? 'Edit customer inventory item' : 'Add customer inventory item'}
              </h3>
              <button type="button" className="modal-close-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className="technician-modal-body inventory-modal-body">
              <div className="inventory-form-grid">
                <Field label="JS inventory ID">
                  <input
                    type="text"
                    value={form.jsInventoryId}
                    onChange={(e) => patchForm({ jsInventoryId: e.target.value })}
                    placeholder="e.g. JS-INV-1001"
                  />
                </Field>
                <Field label="Customer">
                  <DatalistInput
                    listId="inventory-customer-list"
                    options={customers}
                    value={form.customer}
                    onChange={(customer) => patchForm({ customer })}
                    placeholder="Customer name"
                  />
                </Field>
                <Field label="Manufacturer">
                  <DatalistInput
                    listId="inventory-manufacturer-list"
                    options={manufacturers}
                    value={form.manufacturerName}
                    onChange={(manufacturerName) => patchForm({ manufacturerName })}
                  />
                </Field>
                <Field label="Valve type">
                  <DatalistInput
                    listId="inventory-valve-type-list"
                    options={valveTypes}
                    value={form.valveType}
                    onChange={(valveType) => patchForm({ valveType })}
                  />
                </Field>
                <Field label="Body material">
                  <DatalistInput
                    listId="inventory-body-material-list"
                    options={bodyMaterials}
                    value={form.bodyMaterial}
                    onChange={(bodyMaterial) => patchForm({ bodyMaterial })}
                  />
                </Field>
                <Field label="API trim">
                  <input
                    type="text"
                    value={form.apiTrim}
                    onChange={(e) => patchForm({ apiTrim: e.target.value })}
                  />
                </Field>
                <Field label="Size">
                  <DatalistInput
                    listId="inventory-size-list"
                    options={sizes}
                    value={form.size}
                    onChange={(size) => patchForm({ size })}
                  />
                </Field>
                <Field label="Pressure">
                  <input
                    type="text"
                    value={form.pressure}
                    onChange={(e) => patchForm({ pressure: e.target.value })}
                    placeholder="e.g. 300"
                  />
                </Field>
                <Field label="Operator">
                  <select value={form.operator} onChange={(e) => patchForm({ operator: e.target.value })}>
                    <option value="">— Select —</option>
                    {INVENTORY_OPERATORS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Customer ID #">
                  <input
                    type="text"
                    value={form.customerIdNo}
                    onChange={(e) => patchForm({ customerIdNo: e.target.value })}
                  />
                </Field>
                <Field label="Origin / location">
                  <input
                    type="text"
                    value={form.origin}
                    onChange={(e) => patchForm({ origin: e.target.value })}
                    placeholder="Warehouse, yard, customer stock…"
                  />
                </Field>
                <Field label="Image URL (optional)">
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => patchForm({ imageUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => patchForm({ notes: e.target.value })}
                  placeholder="Condition, pull history, special instructions…"
                />
              </Field>
            </div>

            <div className="technician-modal-footer modal-footer">
              <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : modalMode === 'edit' ? 'Save changes' : 'Add item'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
