import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  isReceivedValveStatus,
  prepareReceivedValveImage,
  RECEIVED_VALVE_STATUSES,
  RECEIVED_VALVE_STATUS_LABELS,
  updateReceivedValve,
  uploadReceivedValveImage,
  type ReceivedValveRecord,
  type ReceivedValveStatus,
} from '../lib/receivedValves'
import { supabase } from '../lib/supabase'
import { VALVE_ATTACHMENTS_BUCKET } from '../lib/valveAttachments'

type CustomerRow = { id: number; name: string }

type EditForm = {
  receivedDate: string
  customer: string
  description: string
  teardownInspectionDate: string
  warehouseCheckInDate: string
  estimateNumber: string
  salesOrderNumber: string
  workOrderPrinted: 'yes' | 'no'
  status: ReceivedValveStatus
  notes: string
  imageDataUrl: string | null
  imageName: string | null
  imageStoragePath: string | null
}

function formFromRow(row: ReceivedValveRecord): EditForm {
  return {
    receivedDate: row.receivedDate,
    customer: row.customer,
    description: row.description,
    teardownInspectionDate: row.teardownInspectionDate,
    warehouseCheckInDate: row.warehouseCheckInDate,
    estimateNumber: row.estimateNumber,
    salesOrderNumber: row.salesOrderNumber,
    workOrderPrinted: row.workOrderPrinted ? 'yes' : 'no',
    status: row.status,
    notes: row.notes,
    imageDataUrl: row.imageDataUrl,
    imageName: row.imageName,
    imageStoragePath: row.imageStoragePath,
  }
}

type ReceivedValveEditModalProps = {
  row: ReceivedValveRecord
  onClose: () => void
  onSaved: (next: ReceivedValveRecord) => void
  onError: (message: string) => void
}

export function ReceivedValveEditModal({ row, onClose, onSaved, onError }: ReceivedValveEditModalProps) {
  const [form, setForm] = useState<EditForm>(() => formFromRow(row))
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [preparingImage, setPreparingImage] = useState(false)

  useEffect(() => {
    setForm(formFromRow(row))
    setImageFile(null)
    setRemoveExistingImage(false)
  }, [row])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingCustomers(true)
      const { data, error } = await supabase.from('customers').select('id,name').order('name')
      if (cancelled) return
      setLoadingCustomers(false)
      if (error) {
        onError('Could not load customers')
        return
      }
      setCustomers((data ?? []) as CustomerRow[])
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [onError])

  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setPreparingImage(true)
    try {
      const prepared = await prepareReceivedValveImage(file)
      if (!prepared.ok) {
        onError(prepared.error)
        return
      }
      setImageFile(prepared.file)
      setRemoveExistingImage(false)
      setForm((prev) => ({
        ...prev,
        imageDataUrl: prepared.dataUrl,
        imageName: prepared.file.name,
      }))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not read image')
    } finally {
      setPreparingImage(false)
      event.target.value = ''
    }
  }

  const clearImage = () => {
    setImageFile(null)
    setRemoveExistingImage(true)
    setForm((prev) => ({
      ...prev,
      imageDataUrl: null,
      imageName: null,
    }))
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.customer.trim()) {
      onError('Customer is required')
      return
    }
    if (!form.description.trim()) {
      onError('Description is required')
      return
    }

    setSaving(true)

    let imageDataUrl = form.imageDataUrl
    let imageStoragePath = form.imageStoragePath
    let imageName = form.imageName
    const previousStoragePath = row.imageStoragePath

    if (imageFile) {
      const uploaded = await uploadReceivedValveImage(row.id, imageFile)
      if (!uploaded.ok) {
        setSaving(false)
        onError(uploaded.error)
        return
      }
      imageDataUrl = uploaded.url
      imageStoragePath = uploaded.storagePath
      imageName = imageFile.name
    } else if (removeExistingImage) {
      imageDataUrl = null
      imageStoragePath = null
      imageName = null
    }

    const patch = {
      receivedDate: form.receivedDate,
      customer: form.customer.trim(),
      description: form.description.trim(),
      teardownInspectionDate: form.teardownInspectionDate,
      warehouseCheckInDate: form.warehouseCheckInDate,
      estimateNumber: form.estimateNumber.trim(),
      salesOrderNumber: form.salesOrderNumber.trim(),
      workOrderPrinted: form.workOrderPrinted === 'yes',
      status: form.status,
      notes: form.notes.trim(),
      imageDataUrl,
      imageStoragePath,
      imageName,
    }
    const result = await updateReceivedValve(row.id, patch)
    if (!result.ok) {
      setSaving(false)
      onError(result.error)
      return
    }

    // Best-effort cleanup of replaced/removed storage object.
    if (
      previousStoragePath &&
      (imageFile || removeExistingImage) &&
      previousStoragePath !== imageStoragePath
    ) {
      await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([previousStoragePath])
    }

    setSaving(false)
    onSaved({ ...row, ...patch })
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="received-valve-edit-title">
      <div className="modal-card modal-card-wide received-valve-edit-modal">
        <div className="modal-details-actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 id="received-valve-edit-title" style={{ margin: 0 }}>
            Edit received valve
          </h3>
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
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
              {form.customer && !customers.some((c) => c.name === form.customer) ? (
                <option value={form.customer}>{form.customer}</option>
              ) : null}
            </select>
          </label>
          <label className="received-valves-span-full">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
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
            />
          </label>
          <label>
            Sales order number
            <input
              type="text"
              value={form.salesOrderNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, salesOrderNumber: e.target.value }))}
            />
          </label>
          <label>
            Work order printed
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
          </label>

          <div className="received-valves-image-wrap received-valves-span-full">
            <label>
              Picture
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onImageChange}
                disabled={saving || preparingImage}
              />
            </label>
            <p className="status-breakdown-note">
              {preparingImage
                ? 'Preparing photo…'
                : 'Add or replace a photo if one was missed. Large photos are compressed automatically.'}
            </p>
            {form.imageDataUrl ? (
              <div className="received-valves-image-preview">
                <img src={form.imageDataUrl} alt={form.imageName ?? 'Valve photo'} />
                <div className="received-valves-image-meta">
                  <span>{form.imageName ?? 'Image attached'}</span>
                  <button type="button" className="button-secondary" onClick={clearImage} disabled={saving}>
                    Remove image
                  </button>
                </div>
              </div>
            ) : (
              <p className="status-breakdown-note">No picture on this entry yet.</p>
            )}
          </div>

          <label className="received-valves-span-full">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              placeholder="Follow-up notes…"
            />
          </label>
          <div className="received-valves-actions received-valves-span-full">
            <button type="submit" className="button-primary" disabled={saving || preparingImage}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
