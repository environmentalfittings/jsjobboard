import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { useToast } from '../components/ToastNotification'
import { supabase } from '../lib/supabase'

interface ReceivedValveRecord {
  id: string
  receivedDate: string
  customer: string
  description: string
  teardownInspectionDate: string
  warehouseCheckInDate: string
  estimateNumber: string
  salesOrderNumber: string
  workOrderPrinted: boolean
  imageDataUrl: string | null
  imageName: string | null
  createdAt: string
}

interface ReceivedValveFormState {
  receivedDate: string
  customer: string
  description: string
  teardownInspectionDate: string
  warehouseCheckInDate: string
  estimateNumber: string
  salesOrderNumber: string
  workOrderPrinted: 'yes' | 'no'
  imageDataUrl: string | null
  imageName: string | null
}

type CustomerRow = { id: number; name: string }

const STORAGE_KEY = 'js-job-board-received-valves-v1'
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyForm(): ReceivedValveFormState {
  return {
    receivedDate: todayIso(),
    customer: '',
    description: '',
    teardownInspectionDate: '',
    warehouseCheckInDate: '',
    estimateNumber: '',
    salesOrderNumber: '',
    workOrderPrinted: 'no',
    imageDataUrl: null,
    imageName: null,
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

function loadStoredRows(): ReceivedValveRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row) => row && typeof row === 'object')
  } catch {
    return []
  }
}

export function ReceivedValvesPage() {
  const { showToast } = useToast()
  const [form, setForm] = useState<ReceivedValveFormState>(() => emptyForm())
  const [rows, setRows] = useState<ReceivedValveRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)
    const { data, error } = await supabase.from('customers').select('id,name').order('name')
    setLoadingCustomers(false)
    if (error) {
      showToast('Could not load customers')
      return
    }
    setCustomers((data ?? []) as CustomerRow[])
  }, [showToast])

  useEffect(() => {
    setRows(loadStoredRows())
    void loadCustomers()
  }, [loadCustomers])

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const dateCompare = (b.receivedDate ?? '').localeCompare(a.receivedDate ?? '')
        if (dateCompare !== 0) return dateCompare
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      }),
    [rows],
  )

  const persistRows = (nextRows: ReceivedValveRecord[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows))
      setRows(nextRows)
      return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Storage write failed'
      showToast(`Could not save received valves: ${msg}`)
      return false
    }
  }

  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file')
      event.target.value = ''
      return
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showToast('Image is too large (max 2 MB)')
      event.target.value = ''
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setForm((prev) => ({
        ...prev,
        imageDataUrl: dataUrl,
        imageName: file.name,
      }))
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown upload error'
      showToast(msg)
    } finally {
      event.target.value = ''
    }
  }

  const clearImage = () => {
    setForm((prev) => ({
      ...prev,
      imageDataUrl: null,
      imageName: null,
    }))
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.customer.trim()) {
      showToast('Customer is required')
      return
    }
    if (!form.description.trim()) {
      showToast('Description is required')
      return
    }
    setSaving(true)
    const nextRow: ReceivedValveRecord = {
      id: crypto.randomUUID(),
      receivedDate: form.receivedDate || todayIso(),
      customer: form.customer.trim(),
      description: form.description.trim(),
      teardownInspectionDate: form.teardownInspectionDate || '',
      warehouseCheckInDate: form.warehouseCheckInDate || '',
      estimateNumber: form.estimateNumber.trim(),
      salesOrderNumber: form.salesOrderNumber.trim(),
      workOrderPrinted: form.workOrderPrinted === 'yes',
      imageDataUrl: form.imageDataUrl,
      imageName: form.imageName,
      createdAt: new Date().toISOString(),
    }
    const nextRows = [nextRow, ...rows]
    const ok = persistRows(nextRows)
    setSaving(false)
    if (!ok) return
    setForm(emptyForm())
    showToast('Received valve entry saved')
  }

  const removeRow = (id: string) => {
    const nextRows = rows.filter((row) => row.id !== id)
    if (nextRows.length === rows.length) return
    const ok = persistRows(nextRows)
    if (ok) showToast('Entry removed')
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Received Valves</h2>
      </div>

      <section className="dashboard-panel">
        <h3>Log received valve</h3>
        <p className="placeholder-copy">
          Track incoming valves with key dates, order references, and an optional photo.
        </p>
        <form className="received-valves-form" onSubmit={onSubmit}>
          <label>
            Date received
            <input
              type="date"
              value={form.receivedDate}
              onChange={(e) => setForm((prev) => ({ ...prev, receivedDate: e.target.value }))}
            />
          </label>
          <label>
            Customer
            <select
              value={form.customer}
              onChange={(e) => setForm((prev) => ({ ...prev, customer: e.target.value }))}
              disabled={loadingCustomers}
              required
            >
              <option value="">— Select customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {loadingCustomers ? <span className="status-breakdown-note">Loading customer list…</span> : null}
          </label>
          <label className="received-valves-span-full">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Valve details / notes"
              rows={3}
              required
            />
          </label>
          <label>
            Teardown inspection date
            <input
              type="date"
              value={form.teardownInspectionDate}
              onChange={(e) => setForm((prev) => ({ ...prev, teardownInspectionDate: e.target.value }))}
            />
          </label>
          <label>
            Warehouse check in date
            <input
              type="date"
              value={form.warehouseCheckInDate}
              onChange={(e) => setForm((prev) => ({ ...prev, warehouseCheckInDate: e.target.value }))}
            />
          </label>
          <label>
            Estimate number
            <input
              type="text"
              value={form.estimateNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, estimateNumber: e.target.value }))}
              placeholder="Estimate #"
            />
          </label>
          <label>
            Sales order number
            <input
              type="text"
              value={form.salesOrderNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, salesOrderNumber: e.target.value }))}
              placeholder="Sales order #"
            />
          </label>
          <label>
            Work order printed out
            <select
              value={form.workOrderPrinted}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  workOrderPrinted: e.target.value === 'yes' ? 'yes' : 'no',
                }))
              }
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <div className="received-valves-image-wrap">
            <label>
              Picture
              <input type="file" accept="image/*" capture="environment" onChange={onImageChange} />
            </label>
            <p className="status-breakdown-note">On iPad, tapping Picture opens the camera so you can take a photo.</p>
            {form.imageDataUrl ? (
              <div className="received-valves-image-preview">
                <img src={form.imageDataUrl} alt={form.imageName ?? 'Valve upload preview'} />
                <div className="received-valves-image-meta">
                  <span>{form.imageName ?? 'Image attached'}</span>
                  <button type="button" className="button-secondary" onClick={clearImage}>
                    Remove image
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="received-valves-actions received-valves-span-full">
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save received valve'}
            </button>
          </div>
        </form>
      </section>

      <section className="dashboard-panel">
        <h3>Received valve log</h3>
        <p className="status-breakdown-note">Saved entries: {sortedRows.length}</p>
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Picture</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Description</th>
                <th>Teardown inspection</th>
                <th>Warehouse check in</th>
                <th>Estimate #</th>
                <th>Sales order #</th>
                <th>Work order printed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length ? (
                sortedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.imageDataUrl ? (
                        <a href={row.imageDataUrl} target="_blank" rel="noreferrer" className="received-valves-image-link">
                          <img src={row.imageDataUrl} alt={row.imageName ?? 'Received valve'} />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{row.receivedDate || '-'}</td>
                    <td>{row.customer}</td>
                    <td className="table-cell-clamp">{row.description}</td>
                    <td>{row.teardownInspectionDate || '-'}</td>
                    <td>{row.warehouseCheckInDate || '-'}</td>
                    <td>{row.estimateNumber || '-'}</td>
                    <td>{row.salesOrderNumber || '-'}</td>
                    <td>{row.workOrderPrinted ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" className="button-secondary" onClick={() => removeRow(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="table-empty-cell">
                    No received valves logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
