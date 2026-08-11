import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import {
  deleteReceivedValve,
  emptyReceivedValveForm,
  insertReceivedValve,
  isReceivedValveStatus,
  loadReceivedValveRowsShared,
  readFileAsDataUrl,
  RECEIVED_VALVE_MAX_IMAGE_BYTES,
  RECEIVED_VALVE_STATUSES,
  RECEIVED_VALVE_STATUS_LABELS,
  receivedValveStatusLabel,
  sortReceivedValveRows,
  todayIsoDate,
  updateReceivedValve,
  uploadReceivedValveImage,
  type ReceivedValveFormState,
  type ReceivedValveRecord,
  type ReceivedValveStatus,
} from '../lib/receivedValves'
import { composeRfqEmail, getRfqEmail } from '../lib/rfqEmail'
import { supabase } from '../lib/supabase'

type CustomerRow = { id: number; name: string }

function detailsFromRow(row: Pick<
  ReceivedValveRecord,
  | 'receivedDate'
  | 'customer'
  | 'description'
  | 'teardownInspectionDate'
  | 'warehouseCheckInDate'
  | 'estimateNumber'
  | 'salesOrderNumber'
  | 'workOrderPrinted'
  | 'status'
  | 'imageName'
>) {
  return {
    receivedDate: row.receivedDate,
    customer: row.customer,
    description: row.description,
    teardownInspectionDate: row.teardownInspectionDate,
    warehouseCheckInDate: row.warehouseCheckInDate,
    estimateNumber: row.estimateNumber,
    salesOrderNumber: row.salesOrderNumber,
    workOrderPrinted: row.workOrderPrinted,
    status: receivedValveStatusLabel(row.status),
    imageName: row.imageName,
  }
}

export function ReceivedValvesPage() {
  const { showToast } = useToast()
  const [form, setForm] = useState<ReceivedValveFormState>(() => emptyReceivedValveForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ReceivedValveRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingRfqId, setSendingRfqId] = useState<string | null>(null)
  const [missingTable, setMissingTable] = useState(false)
  const rfqEmail = getRfqEmail()

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

  const reloadRows = useCallback(async () => {
    setLoading(true)
    const result = await loadReceivedValveRowsShared()
    setLoading(false)
    if (!result.ok) {
      setMissingTable(Boolean(result.missingTable))
      showToast(
        result.missingTable
          ? 'Received valves table is missing — run supabase/migration-received-valves.sql in Supabase'
          : `Could not load received valves: ${result.error}`,
      )
      return
    }
    setMissingTable(false)
    setRows(result.rows)
    if (result.migrated > 0) {
      showToast(`Moved ${result.migrated} local received-valve entr${result.migrated === 1 ? 'y' : 'ies'} to shared storage`)
    }
  }, [showToast])

  useEffect(() => {
    void reloadRows()
    void loadCustomers()
  }, [loadCustomers, reloadRows])

  const sortedRows = useMemo(() => sortReceivedValveRows(rows), [rows])

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
      setImageFile(file)
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
    setImageFile(null)
    setForm((prev) => ({
      ...prev,
      imageDataUrl: null,
      imageName: null,
    }))
  }

  const markSentToRfq = async (id: string) => {
    const sentToRfqAt = new Date().toISOString()
    const result = await updateReceivedValve(id, { sentToRfqAt })
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, sentToRfqAt } : row)))
  }

  const sendRowToRfq = async (row: ReceivedValveRecord, file?: File | null) => {
    setSendingRfqId(row.id)
    try {
      const result = await composeRfqEmail({
        details: detailsFromRow(row),
        imageFile: file ?? null,
        imageDataUrl: row.imageDataUrl,
      })
      if (result.ok) {
        await markSentToRfq(row.id)
        showToast(result.message)
      } else {
        showToast(result.message)
      }
    } finally {
      setSendingRfqId(null)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.customer.trim()) {
      showToast('Customer is required')
      return
    }
    if (!form.description.trim()) {
      showToast('Description is required')
      return
    }
    if (missingTable) {
      showToast('Run supabase/migration-received-valves.sql in Supabase before saving')
      return
    }

    setSaving(true)
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    let imageDataUrl: string | null = null
    let imageStoragePath: string | null = null
    let imageName: string | null = form.imageName

    if (imageFile) {
      const uploaded = await uploadReceivedValveImage(id, imageFile)
      if (!uploaded.ok) {
        setSaving(false)
        showToast(uploaded.error)
        return
      }
      imageDataUrl = uploaded.url
      imageStoragePath = uploaded.storagePath
    }

    const nextRow: ReceivedValveRecord = {
      id,
      receivedDate: form.receivedDate || todayIsoDate(),
      customer: form.customer.trim(),
      description: form.description.trim(),
      teardownInspectionDate: form.teardownInspectionDate || '',
      warehouseCheckInDate: form.warehouseCheckInDate || '',
      estimateNumber: form.estimateNumber.trim(),
      salesOrderNumber: form.salesOrderNumber.trim(),
      workOrderPrinted: form.workOrderPrinted === 'yes',
      status: form.status,
      imageDataUrl,
      imageStoragePath,
      imageName,
      sentToRfqAt: null,
      createdAt,
    }

    const insertResult = await insertReceivedValve(nextRow)
    if (!insertResult.ok) {
      setSaving(false)
      showToast(insertResult.error)
      return
    }

    const shouldSendRfq = form.sendToRfq
    const fileForRfq = imageFile
    setForm(emptyReceivedValveForm())
    setImageFile(null)
    setRows((prev) => [nextRow, ...prev])
    setSaving(false)
    showToast('Received valve entry saved')

    if (shouldSendRfq) {
      setSendingRfqId(nextRow.id)
      try {
        const result = await composeRfqEmail({
          details: detailsFromRow(nextRow),
          imageFile: fileForRfq,
          imageDataUrl: nextRow.imageDataUrl,
        })
        if (result.ok) {
          await markSentToRfq(nextRow.id)
          showToast(result.message)
        } else {
          showToast(result.message)
        }
      } finally {
        setSendingRfqId(null)
      }
    }
  }

  const changeStatus = async (row: ReceivedValveRecord, status: ReceivedValveStatus) => {
    if (row.status === status) return
    const result = await updateReceivedValve(row.id, { status })
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status } : item)))
    showToast(
      status === 'converted'
        ? 'Marked Converted — removed from Dashboard log (still in Reports)'
        : `Status updated to ${receivedValveStatusLabel(status)}`,
    )
  }

  const removeRow = async (row: ReceivedValveRecord) => {
    const result = await deleteReceivedValve(row)
    if (!result.ok) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.filter((item) => item.id !== row.id))
    showToast('Entry removed')
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
          Track incoming valves with key dates, order references, and an optional photo. Entries are shared for all
          users. Waiting statuses appear on the Dashboard; Converted drops off the Dashboard but stays in Reports.
          Check Send to RFQ to open an email to {rfqEmail} with the details and picture.
        </p>
        {missingTable ? (
          <p className="status-breakdown-note">
            Shared storage is not set up yet. Run <code>supabase/migration-received-valves.sql</code> in the Supabase
            SQL Editor, then refresh this page.
          </p>
        ) : null}
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

          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => {
                const value = e.target.value
                if (!isReceivedValveStatus(value)) return
                setForm((prev) => ({ ...prev, status: value }))
              }}
            >
              {RECEIVED_VALVE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RECEIVED_VALVE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <span className="status-breakdown-note">
              Converted removes this entry from the Dashboard log; it remains in Reports.
            </span>
          </label>

          <label className="received-valves-checkbox-row received-valves-span-full">
            <input
              type="checkbox"
              checked={form.sendToRfq}
              onChange={(e) => setForm((prev) => ({ ...prev, sendToRfq: e.target.checked }))}
            />
            <span>
              Send to RFQ
              <span className="status-breakdown-note">
                Opens an email to {rfqEmail} with this entry. On iPad, choose Mail so the picture attaches.
              </span>
            </span>
          </label>

          <div className="received-valves-actions received-valves-span-full">
            <button type="submit" className="button-primary" disabled={saving || sendingRfqId !== null || missingTable}>
              {saving ? 'Saving…' : form.sendToRfq ? 'Save & send to RFQ' : 'Save received valve'}
            </button>
          </div>
        </form>
      </section>

      <section className="dashboard-panel">
        <h3>Received valve log</h3>
        <p className="status-breakdown-note">
          {loading ? 'Loading…' : `Saved entries: ${sortedRows.length}`}
        </p>
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
                <th>Status</th>
                <th>RFQ</th>
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
                      <select
                        value={row.status}
                        aria-label={`Status for ${row.customer}`}
                        onChange={(e) => {
                          const value = e.target.value
                          if (!isReceivedValveStatus(value)) return
                          void changeStatus(row, value)
                        }}
                      >
                        {RECEIVED_VALVE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {RECEIVED_VALVE_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{row.sentToRfqAt ? 'Sent' : '—'}</td>
                    <td>
                      <div className="received-valves-row-actions">
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={sendingRfqId === row.id}
                          onClick={() => void sendRowToRfq(row)}
                        >
                          {sendingRfqId === row.id ? 'Opening…' : row.sentToRfqAt ? 'Resend RFQ' : 'Send to RFQ'}
                        </button>
                        <button type="button" className="button-secondary" onClick={() => void removeRow(row)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="table-empty-cell">
                    {loading ? 'Loading received valves…' : 'No received valves logged yet.'}
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
