import { useEffect, useState, type FormEvent } from 'react'
import {
  isReceivedValveStatus,
  RECEIVED_VALVE_STATUSES,
  RECEIVED_VALVE_STATUS_LABELS,
  updateReceivedValve,
  type ReceivedValveRecord,
  type ReceivedValveStatus,
} from '../lib/receivedValves'
import { supabase } from '../lib/supabase'

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

  useEffect(() => {
    setForm(formFromRow(row))
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
    }
    const result = await updateReceivedValve(row.id, patch)
    setSaving(false)
    if (!result.ok) {
      onError(result.error)
      return
    }
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
            <button type="submit" className="button-primary" disabled={saving}>
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
