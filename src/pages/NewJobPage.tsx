import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { JOB_TYPES, isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'
import { LOOKUP_CATEGORY_DEFS, type LookupCategory } from '../constants/lookupCategories'
import { defaultJobSubStatus } from '../constants/jobSubStatuses'
import { STATUS_ORDER } from '../constants/statuses'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { supabase } from '../lib/supabase'
import type { UserRole } from './LoginPage'

interface NewJobPageProps {
  role: UserRole
}

type CustomerRow = { id: number; name: string }

function lookupSelectOptions(items: readonly string[]) {
  return items.map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ))
}

export function NewJobPage({ role }: NewJobPageProps) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [valveId, setValveId] = useState('')
  const [customer, setCustomer] = useState('')
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [cell, setCell] = useState('')
  const [size, setSize] = useState('')
  const [jobType, setJobType] = useState('Valve Repair')
  const [materialSpec, setMaterialSpec] = useState('')
  const [drawingPoNumber, setDrawingPoNumber] = useState('')
  const [valveType, setValveType] = useState('')
  const [testType, setTestType] = useState('')
  const [status, setStatus] = useState('Arrived - Not Started')
  const [orderType, setOrderType] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [isTurnaround, setIsTurnaround] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lookupOptions, setLookupOptions] = useState<Record<LookupCategory, string[]>>(() =>
    Object.fromEntries(LOOKUP_CATEGORY_DEFS.map((d) => [d.key, [...d.fallback]])) as Record<
      LookupCategory,
      string[]
    >,
  )

  useEffect(() => {
    loadLookupOptionsMap().then(setLookupOptions)
  }, [])

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
    loadCustomers()
  }, [loadCustomers])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = valveId.trim()
    if (!id) {
      showToast('Valve ID is required')
      return
    }
    const normalizedJobType = normalizeJobType(jobType)
    const valveRelated = isValveRelatedJobType(normalizedJobType)

    setSaving(true)
    const { error } = await supabase.from('valves').insert({
      valve_id: id,
      job_type: normalizedJobType,
      customer: customer.trim() || null,
      cell: cell.trim() || null,
      size: size.trim() || null,
      test_type: valveRelated ? testType.trim() || null : null,
      valve_type: valveRelated ? valveType.trim() || null : null,
      order_type: orderType.trim() || null,
      status,
      due_date: dueDate || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
      material_spec: valveRelated ? null : materialSpec.trim() || null,
      drawing_po_number: valveRelated ? null : drawingPoNumber.trim() || null,
      sub_status: defaultJobSubStatus(),
      assigned_technician_ids: [],
    })
    setSaving(false)

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        showToast('That Valve ID already exists')
      } else {
        showToast('Could not create job')
      }
      return
    }

    showToast(`Job created: ${id}`)
    setValveId('')
    setCustomer('')
    setCell('')
    setSize('')
    setJobType('Valve Repair')
    setMaterialSpec('')
    setDrawingPoNumber('')
    setValveType('')
    setTestType('')
    setOrderType('')
    setDueDate('')
    setDescription('')
    setNotes('')
    setIsTurnaround(false)
    setStatus('Arrived - Not Started')
    navigate('/job-board')
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">New job</h2>
      </div>

      <section className="dashboard-panel">
        <h3>Create {normalizeJobType(jobType)} Job</h3>
        <p className="placeholder-copy">Adds a new valve to the board. Valve ID must be unique.</p>
        {role === 'admin' ? (
          <p className="new-job-hint">
            Customer list management moved to{' '}
            <Link to="/admin/lists" className="new-job-inline-link">
              Manage lists
            </Link>
            .
          </p>
        ) : null}

        <form className="new-job-form" onSubmit={submit}>
          <fieldset className="new-job-section">
            <legend>Valve Info</legend>
            <div className="new-job-grid">
              <label>
                Job type
                <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                  {JOB_TYPES.map((jt) => (
                    <option key={jt} value={jt}>
                      {jt}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valve ID <span className="required-mark">*</span>
                <input
                  type="text"
                  value={valveId}
                  onChange={(e) => setValveId(e.target.value)}
                  placeholder="e.g. 488518-6"
                  required
                />
              </label>
              <label>
                Customer
                <select
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  disabled={loadingCustomers}
                >
                  <option value="">— Select customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {loadingCustomers ? <span className="new-job-hint">Loading list…</span> : null}
              </label>
              <label>
                Finish cell
                <select value={cell} onChange={(e) => setCell(e.target.value)}>
                  <option value="">— Select finish cell —</option>
                  {lookupSelectOptions(lookupOptions.finish_cell)}
                </select>
              </label>
              <label>
                Size
                <select value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">— Select size —</option>
                  {lookupSelectOptions(lookupOptions.valve_size)}
                </select>
              </label>
              {isValveRelatedJobType(jobType) ? (
                <>
                  <label>
                    Valve type
                    <select value={valveType} onChange={(e) => setValveType(e.target.value)}>
                      <option value="">— Select valve type —</option>
                      {lookupSelectOptions(lookupOptions.valve_type)}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Material / spec
                    <input
                      type="text"
                      value={materialSpec}
                      onChange={(e) => setMaterialSpec(e.target.value)}
                      placeholder="e.g. 316 SS, ASTM A105, custom alloy"
                    />
                  </label>
                  <label>
                    Drawing / PO number
                    <input
                      type="text"
                      value={drawingPoNumber}
                      onChange={(e) => setDrawingPoNumber(e.target.value)}
                      placeholder="e.g. DWG-2049 / PO-88113"
                    />
                  </label>
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="new-job-section">
            <legend>Job Details</legend>
            <div className="new-job-grid">
              {isValveRelatedJobType(jobType) ? (
                <label>
                  Test type
                  <select value={testType} onChange={(e) => setTestType(e.target.value)}>
                    <option value="">— Select test type —</option>
                    {lookupSelectOptions(lookupOptions.test_type)}
                  </select>
                </label>
              ) : null}
              <label>
                Work status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Order type
                <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                  <option value="">— Select order type —</option>
                  {lookupSelectOptions(lookupOptions.order_type)}
                </select>
              </label>
              <label>
                Due date
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset className="new-job-section">
            <legend>Scheduling & Notes</legend>
            <div className="new-job-grid">
              <label className="new-job-span-full">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Job or valve description"
                  rows={3}
                  className="new-job-textarea"
                />
              </label>
              <label className="new-job-span-full">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes"
                  rows={4}
                  className="new-job-textarea"
                />
              </label>
            </div>
          </fieldset>

          <label className="new-job-checkbox-row">
            <input
              type="checkbox"
              checked={isTurnaround}
              onChange={(e) => setIsTurnaround(e.target.checked)}
            />
            <span>Turnaround (customer job — use for updates &amp; turnaround reports)</span>
          </label>
          <div className="new-job-actions">
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create job & go to board'}
            </button>
            <Link to="/job-board" className="button-secondary new-job-link">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </section>
  )
}
