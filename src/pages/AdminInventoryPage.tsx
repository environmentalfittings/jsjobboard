import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import {
  buildInventoryItemUrl,
  allocateNextJsInventoryId,
  createInventoryRecord,
  deleteInventoryRecord,
  emptyInventoryForm,
  emptyPhotoDraft,
  INVENTORY_OPERATORS,
  INVENTORY_ORIGINS,
  inventoryMatchesSearch,
  inventoryToForm,
  loadInventoryFormOptions,
  loadInventoryRecords,
  updateInventoryRecord,
  validateInventoryPhoto,
  type InventoryFormState,
  type InventoryPhotoDraft,
  type InventoryRecord,
} from '../lib/inventory'

type ModalMode = 'create' | 'edit'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="inventory-field">
      <span>
        {label}
        {required ? <span className="inventory-required"> *</span> : null}
      </span>
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

function PhotoCard({
  title,
  hint,
  draft,
  required,
  inputId,
  onPick,
  onClear,
}: {
  title: string
  hint: string
  draft: InventoryPhotoDraft
  required?: boolean
  inputId: string
  onPick: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const preview = draft.previewUrl || draft.existingUrl

  return (
    <div className={`inventory-photo-card${preview ? ' has-preview' : ''}`}>
      <div className="inventory-photo-card-head">
        <h4>
          {title}
          {required ? <span className="inventory-required"> *</span> : null}
        </h4>
        <p>{hint}</p>
      </div>
      {preview ? (
        <div className="inventory-photo-preview">
          <img src={preview} alt={title} />
        </div>
      ) : (
        <button
          type="button"
          className="inventory-photo-drop"
          onClick={() => inputRef.current?.click()}
        >
          <span className="inventory-photo-drop-title">Add photo</span>
          <span className="inventory-photo-drop-sub">Click to upload or use camera</span>
        </button>
      )}
      <div className="inventory-photo-actions">
        <button type="button" className="button-secondary" onClick={() => inputRef.current?.click()}>
          {preview ? 'Replace' : 'Upload'}
        </button>
        <button type="button" className="button-secondary" onClick={() => cameraRef.current?.click()}>
          Camera
        </button>
        {preview ? (
          <button type="button" className="button-secondary" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        className="inventory-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="inventory-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function AdminInventoryPage() {
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [valvePhoto, setValvePhoto] = useState<InventoryPhotoDraft>(() => emptyPhotoDraft())
  const [tagPhoto, setTagPhoto] = useState<InventoryPhotoDraft>(() => emptyPhotoDraft())
  const [saving, setSaving] = useState(false)
  const [qrItem, setQrItem] = useState<InventoryRecord | null>(null)

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
  }, [showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const itemId = searchParams.get('item')?.trim()
    if (!itemId || loading || !rows.length) return
    const match = rows.find((row) => row.id === itemId)
    if (match) setQrItem(match)
  }, [searchParams, rows, loading])

  const filtered = useMemo(() => rows.filter((row) => inventoryMatchesSearch(row, search)), [rows, search])

  const patchForm = (partial: Partial<InventoryFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  const revokePreview = (draft: InventoryPhotoDraft) => {
    if (draft.previewUrl && draft.previewUrl.startsWith('blob:')) URL.revokeObjectURL(draft.previewUrl)
  }

  const pickPhoto = (
    kind: 'valve' | 'tag',
    file: File,
  ) => {
    const error = validateInventoryPhoto(file)
    if (error) {
      showToast(error)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    if (kind === 'valve') {
      setValvePhoto((prev) => {
        revokePreview(prev)
        return { file, previewUrl, existingUrl: prev.existingUrl }
      })
    } else {
      setTagPhoto((prev) => {
        revokePreview(prev)
        return { file, previewUrl, existingUrl: prev.existingUrl }
      })
    }
  }

  const clearPhoto = (kind: 'valve' | 'tag') => {
    if (kind === 'valve') {
      setValvePhoto((prev) => {
        revokePreview(prev)
        return emptyPhotoDraft(null)
      })
    } else {
      setTagPhoto((prev) => {
        revokePreview(prev)
        return emptyPhotoDraft(null)
      })
    }
  }

  const openCreate = async () => {
    setModalMode('create')
    setEditingId(null)
    setForm(emptyInventoryForm())
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setModalOpen(true)
    const allocated = await allocateNextJsInventoryId()
    if (allocated.error) {
      showToast(`Could not preview next ID — will assign on save (${allocated.error})`)
    }
    setForm((prev) => ({ ...prev, jsInventoryId: allocated.id }))
  }

  const openEdit = (row: InventoryRecord) => {
    setModalMode('edit')
    setEditingId(row.id)
    setForm(inventoryToForm(row))
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft(row.valve_image_url)
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft(row.tag_image_url)
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyInventoryForm())
    setValvePhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
    setTagPhoto((prev) => {
      revokePreview(prev)
      return emptyPhotoDraft()
    })
  }

  const save = async () => {
    if (!form.customer.trim()) {
      showToast('Customer is required')
      return
    }
    if (modalMode === 'edit' && !form.jsInventoryId.trim()) {
      showToast('JS inventory ID is required')
      return
    }
    if (form.origin === 'other' && !form.originOther.trim()) {
      showToast('Enter the other location')
      return
    }

    const hasValve = Boolean(valvePhoto.file || valvePhoto.existingUrl)
    const hasTag = Boolean(tagPhoto.file || tagPhoto.existingUrl)
    if (!hasValve) {
      showToast('A picture of the valve is required')
      return
    }
    if (!hasTag) {
      showToast('A picture of the tag is required')
      return
    }

    setSaving(true)
    if (modalMode === 'create') {
      if (!valvePhoto.file || !tagPhoto.file) {
        setSaving(false)
        showToast('Upload both the valve photo and the tag photo')
        return
      }
      const result = await createInventoryRecord(form, { valve: valvePhoto.file, tag: tagPhoto.file })
      setSaving(false)
      if (result.error || !result.data) {
        showToast(result.error || 'Could not create item')
        return
      }
      showToast('Customer inventory item added')
      closeModal()
      setQrItem(result.data)
      await reload()
      return
    }

    if (!editingId) {
      setSaving(false)
      return
    }
    const existing = rows.find((row) => row.id === editingId)
    if (!existing) {
      setSaving(false)
      showToast('Could not find inventory item to update')
      return
    }
    const result = await updateInventoryRecord(editingId, form, {
      valve: valvePhoto,
      tag: tagPhoto,
      existing,
    })
    setSaving(false)
    if (result.error || !result.data) {
      showToast(result.error || 'Could not update item')
      return
    }
    showToast('Customer inventory item updated')
    closeModal()
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
    if (qrItem?.id === row.id) setQrItem(null)
    await reload()
  }

  const downloadQr = () => {
    if (!qrItem?.qr_code_data_url) return
    const link = document.createElement('a')
    const name = (qrItem.js_inventory_id || qrItem.id).replace(/[^\w.-]+/g, '_')
    link.href = qrItem.qr_code_data_url
    link.download = `${name}-inventory-qr.png`
    link.click()
  }

  const printQr = () => {
    if (!qrItem?.qr_code_data_url) return
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=480,height=640')
    if (!popup) {
      showToast('Allow pop-ups to print the QR code')
      return
    }
    const title = qrItem.js_inventory_id || 'Customer inventory'
    popup.document.write(`<!doctype html><html><head><title>${title}</title>
      <style>
        body{font-family:Georgia,serif;text-align:center;padding:24px;color:#0f172a}
        img{width:280px;height:280px}
        h1{font-size:20px;margin:0 0 8px}
        p{margin:4px 0;font-size:14px}
      </style></head><body>
      <h1>${title}</h1>
      <p>${qrItem.customer || ''}</p>
      <img src="${qrItem.qr_code_data_url}" alt="QR code" />
      <p>${buildInventoryItemUrl(qrItem.id)}</p>
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`)
    popup.document.close()
  }

  const closeQr = () => {
    setQrItem(null)
    if (searchParams.get('item')) {
      const next = new URLSearchParams(searchParams)
      next.delete('item')
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <section className="dashboard-page inventory-page">
      <div className="dashboard-title-row admin-page-heading">
        <div>
          <h2 className="dashboard-title">Customer Inventory</h2>
          <p className="placeholder-copy">
            Track valves held for customers outside the active job board. Each item needs a valve photo, a tag photo,
            and gets a QR code when created.
          </p>
        </div>
        <div className="admin-employees-title-actions">
          <button type="button" className="button-secondary" onClick={() => void reload()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="button-primary" onClick={() => void openCreate()}>
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
                <th>Photos</th>
                <th>JS inventory ID</th>
                <th>Customer</th>
                <th>Manufacturer</th>
                <th>Type</th>
                <th>Size</th>
                <th>Pressure</th>
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
                    <td>
                      <div className="inventory-table-thumbs">
                        {row.valve_image_url ? (
                          <img src={row.valve_image_url} alt="Valve" />
                        ) : (
                          <span className="inventory-thumb-empty">Valve</span>
                        )}
                        {row.tag_image_url ? (
                          <img src={row.tag_image_url} alt="Tag" />
                        ) : (
                          <span className="inventory-thumb-empty">Tag</span>
                        )}
                      </div>
                    </td>
                    <td>{row.js_inventory_id || '—'}</td>
                    <td>{row.customer || '—'}</td>
                    <td>{row.manufacturer_name || '—'}</td>
                    <td>{row.valve_type_label || '—'}</td>
                    <td>{row.size || '—'}</td>
                    <td>{row.pressure || '—'}</td>
                    <td className="list-col-actions-cell">
                      <button type="button" className="job-list-quick-action" onClick={() => openEdit(row)}>
                        Edit
                      </button>{' '}
                      <button
                        type="button"
                        className="job-list-quick-action"
                        onClick={() => setQrItem(row)}
                        disabled={!row.qr_code_data_url}
                      >
                        QR
                      </button>{' '}
                      <button type="button" className="job-list-quick-action" onClick={() => void remove(row)}>
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
              <div>
                <p className="inventory-modal-kicker">Customer Inventory</p>
                <h3 id="inventory-modal-title">
                  {modalMode === 'edit' ? 'Edit inventory item' : 'Add inventory item'}
                </h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className="technician-modal-body inventory-modal-body">
              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>Identity</h4>
                  <p>Who owns it and how we track it on the shelf.</p>
                </div>
                <div className="inventory-form-grid">
                  <Field label="JS inventory ID" required>
                    <input
                      type="text"
                      value={form.jsInventoryId}
                      readOnly
                      aria-readonly
                      className="inventory-id-readonly"
                      title="Assigned automatically — duplicates are blocked"
                    />
                    <span className="inventory-field-hint">
                      {modalMode === 'create'
                        ? 'Assigned automatically (unique). Confirmed again when you save.'
                        : 'Locked after create — unique in customer inventory.'}
                    </span>
                  </Field>
                  <Field label="Customer" required>
                    <DatalistInput
                      listId="inventory-customer-list"
                      options={customers}
                      value={form.customer}
                      onChange={(customer) => patchForm({ customer })}
                      placeholder="Customer name"
                    />
                  </Field>
                  <Field label="Customer ID #">
                    <input
                      type="text"
                      value={form.customerIdNo}
                      onChange={(e) => patchForm({ customerIdNo: e.target.value })}
                    />
                  </Field>
                  <Field label="Origin / location">
                    <select
                      value={form.origin}
                      onChange={(e) =>
                        patchForm({
                          origin: e.target.value,
                          originOther: e.target.value === 'other' ? form.originOther : '',
                        })
                      }
                    >
                      <option value="">— Select —</option>
                      {INVENTORY_ORIGINS.map((option) => (
                        <option key={option} value={option}>
                          {option === 'other' ? 'Other' : option}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {form.origin === 'other' ? (
                    <Field label="Other location" required>
                      <input
                        type="text"
                        value={form.originOther}
                        onChange={(e) => patchForm({ originOther: e.target.value })}
                        placeholder="Describe location"
                      />
                    </Field>
                  ) : null}
                </div>
              </section>

              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>Valve details</h4>
                  <p>Type, size, and materials for quick picking.</p>
                </div>
                <div className="inventory-form-grid">
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
                </div>
              </section>

              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>Required photos</h4>
                  <p>Both photos are required before the item can be saved.</p>
                </div>
                <div className="inventory-photo-grid">
                  <PhotoCard
                    title="Valve photo"
                    hint="Clear shot of the valve body"
                    draft={valvePhoto}
                    required
                    inputId="inventory-valve-photo"
                    onPick={(file) => pickPhoto('valve', file)}
                    onClear={() => clearPhoto('valve')}
                  />
                  <PhotoCard
                    title="Tag photo"
                    hint="Nameplate / tag so ID is readable"
                    draft={tagPhoto}
                    required
                    inputId="inventory-tag-photo"
                    onPick={(file) => pickPhoto('tag', file)}
                    onClear={() => clearPhoto('tag')}
                  />
                </div>
              </section>

              <section className="inventory-form-section">
                <div className="inventory-form-section-head">
                  <h4>Notes</h4>
                </div>
                <Field label="Notes">
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => patchForm({ notes: e.target.value })}
                    placeholder="Condition, pull history, special instructions…"
                  />
                </Field>
                {modalMode === 'create' ? (
                  <p className="inventory-qr-note">A QR code is generated automatically when you create this item.</p>
                ) : null}
              </section>
            </div>

            <div className="technician-modal-footer modal-footer">
              <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={() => void save()} disabled={saving}>
                {saving
                  ? 'Saving…'
                  : modalMode === 'edit'
                    ? 'Save changes'
                    : 'Create & generate QR'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrItem?.qr_code_data_url ? (
        <div className="modal-overlay" role="presentation" onClick={closeQr}>
          <div
            className="modal-card inventory-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-qr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="technician-modal-head">
              <div>
                <p className="inventory-modal-kicker">QR code ready</p>
                <h3 id="inventory-qr-title">{qrItem.js_inventory_id || 'Customer inventory item'}</h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeQr} aria-label="Close">
                ×
              </button>
            </div>
            <div className="technician-modal-body inventory-qr-body">
              <img src={qrItem.qr_code_data_url} alt="Inventory QR code" className="inventory-qr-image" />
              <p className="inventory-qr-customer">{qrItem.customer || '—'}</p>
              <p className="inventory-qr-url">{buildInventoryItemUrl(qrItem.id)}</p>
              <div className="inventory-table-thumbs inventory-qr-thumbs">
                {qrItem.valve_image_url ? <img src={qrItem.valve_image_url} alt="Valve" /> : null}
                {qrItem.tag_image_url ? <img src={qrItem.tag_image_url} alt="Tag" /> : null}
              </div>
            </div>
            <div className="technician-modal-footer modal-footer">
              <button type="button" className="button-secondary" onClick={closeQr}>
                Close
              </button>
              <button type="button" className="button-secondary" onClick={downloadQr}>
                Download QR
              </button>
              <button type="button" className="button-primary" onClick={printQr}>
                Print QR
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
