import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import {
  emptyReceivedValveForm,
  loadReceivedValveRows,
  readFileAsDataUrl,
  RECEIVED_VALVE_MAX_IMAGE_BYTES,
  saveReceivedValveRows,
  sortReceivedValveRows,
  todayIsoDate,
  type ReceivedValveFormState,
  type ReceivedValveRecord,
} from '../lib/receivedValves'
import { supabase } from '../lib/supabase'

type CustomerRow = { id: number; name: string }

export function ReceivedValvesPage() {
  const { showToast } = useToast()
  const [form, setForm] = useState<ReceivedValveFormState>(() => emptyReceivedValveForm())
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
    setRows(loadReceivedValveRows())
    void loadCustomers()
  }, [loadCustomers])

  const sortedRows = useMemo(() => sortReceivedValveRows(rows), [rows])

  const persistRows = (nextRows: ReceivedValveRecord[]) => {
    const result = saveReceivedValveRows(nextRows)
    if (!result.ok) {
      showToast(`Could not save received valves: ${result.error}`)
      return false
    }
    setRows(nextRows)
    return true
  }

  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file')
      event.target.value = ''
      return
    }
    if (file.size > RECEIVED_VALVE_MAX_IMAGE_BYTES) {
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
      receivedDate: form.receivedDate || todayIsoDate(),
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
    setForm(emptyReceivedValveForm())
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
        <Link to="/dashboard" className="button-secondary">
          Back to dashboard
        </Link>
      </div>

      <section className="dashboard-panel">
        <h3>Log received valve</h3>
        <p className="placeholder-copy">
          Track incoming valves with key dates, order references, and an optional photo. Entries also appear on the
          Dashboard.
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
                        <a
                          href={row.imageDataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="received-valves-image-link"
                        >
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
