import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { JOB_TYPES, isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'
import { LOOKUP_CATEGORY_DEFS, type LookupCategory } from '../constants/lookupCategories'
import { STATUS_ORDER } from '../constants/statuses'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { hasAdminAccess } from '../lib/roles'
import { TEST_PROCEDURE_OTHER } from '../lib/testLogProcedure'
import { openValveTicketPdfForPrint } from '../lib/valveTicketPrint'
import { supabase } from '../lib/supabase'
import type { Valve } from '../types'
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
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const customerListId = useId()
  const customerRootRef = useRef<HTMLDivElement>(null)
  const [cell, setCell] = useState('')
  const [size, setSize] = useState('')
  const [pressureClass, setPressureClass] = useState('')
  const [bodyMaterial, setBodyMaterial] = useState('')
  const [jobType, setJobType] = useState('Valve Repair')
  const [materialSpec, setMaterialSpec] = useState('')
  const [drawingPoNumber, setDrawingPoNumber] = useState('')
  const [valveType, setValveType] = useState('')
  const [testType, setTestType] = useState('')
  const [testTypeOther, setTestTypeOther] = useState('')
  const [status, setStatus] = useState('Arrived - Not Started')
  const [orderType, setOrderType] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [isTurnaround, setIsTurnaround] = useState(false)
  const [addToPriority, setAddToPriority] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createdJob, setCreatedJob] = useState<Valve | null>(null)
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

  const customerSuggestions = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 40)
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 40)
  }, [customers, customerQuery])

  useEffect(() => {
    if (!customerOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!customerRootRef.current?.contains(event.target as Node)) setCustomerOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [customerOpen])

  const pickCustomer = (name: string) => {
    setCustomer(name)
    setCustomerQuery(name)
    setCustomerOpen(false)
  }

  const allowNaSizeAndClass =
    !isValveRelatedJobType(jobType) || (isValveRelatedJobType(jobType) && /actuator/i.test((valveType ?? '').trim()))

  const resetForm = () => {
    setValveId('')
    setCustomer('')
    setCustomerQuery('')
    setCustomerOpen(false)
    setCell('')
    setSize('')
    setPressureClass('')
    setBodyMaterial('')
    setJobType('Valve Repair')
    setMaterialSpec('')
    setDrawingPoNumber('')
    setValveType('')
    setTestType('')
    setTestTypeOther('')
    setOrderType('')
    setDueDate('')
    setDescription('')
    setNotes('')
    setIsTurnaround(false)
    setAddToPriority(false)
    setStatus('Arrived - Not Started')
  }

  const printCreatedWorkOrder = () => {
    if (!createdJob) return
    try {
      openValveTicketPdfForPrint(createdJob)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open work order for printing')
    }
  }

  const startAnotherJob = () => {
    setCreatedJob(null)
    resetForm()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = valveId.trim()
    if (!id) {
      showToast('Valve ID is required')
      return
    }
    const normalizedJobType = normalizeJobType(jobType)
    const valveRelated = isValveRelatedJobType(normalizedJobType)
    const resolvedTestType =
      testType === TEST_PROCEDURE_OTHER ? testTypeOther.trim() : testType.trim()

    if (valveRelated && testType === TEST_PROCEDURE_OTHER && !resolvedTestType) {
      showToast('Describe the other test type')
      return
    }

    setSaving(true)
    const { data: inserted, error } = await supabase
      .from('valves')
      .insert({
        valve_id: id,
        job_type: normalizedJobType,
        customer: customer.trim() || null,
        cell: cell.trim() || null,
        size: size.trim() || null,
        pressure_class: pressureClass.trim() || null,
        body_material: bodyMaterial.trim() || null,
        test_type: valveRelated ? resolvedTestType || null : null,
        valve_type: valveRelated ? valveType.trim() || null : null,
        order_type: orderType.trim() || null,
        status,
        due_date: dueDate || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        material_spec: valveRelated ? null : materialSpec.trim() || null,
        drawing_po_number: valveRelated ? null : drawingPoNumber.trim() || null,
        assigned_technician_ids: [],
      })
      .select('*')
      .single()
    setSaving(false)

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        const { data: existing } = await supabase
          .from('valves')
          .select('id,valve_id,status,order_type,customer')
          .eq('valve_id', id)
          .maybeSingle()
        if (existing?.id) {
          showToast(
            `Job ${existing.valve_id} already exists (${existing.status}${
              existing.customer ? ` · ${existing.customer}` : ''
            }). Opening it — don’t create a (1) copy.`,
          )
          navigate(`/job-board?open=${existing.id}`)
        } else {
          showToast('That Valve ID already exists')
        }
      } else {
        showToast(`Could not create job: ${error.message}`)
      }
      return
    }

    if (addToPriority) {
      await supabase.from('priority_queue').insert({ valve_id: id }).then(({ error: pErr }) => {
        if (pErr) showToast(`Job created but could not add to priority: ${pErr.message}`)
      })
    }

    const created = inserted as Valve | null
    if (!created) {
      showToast(`Job created: ${id}`)
      navigate('/job-board')
      return
    }

    setCreatedJob(created)
    showToast(`Job created: ${id} — you can print the work order below`)
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">New job</h2>
      </div>

      <section className="dashboard-panel">
        <h3>Create {normalizeJobType(jobType)} Job</h3>
        <p className="placeholder-copy">Adds a new valve to the board. Valve ID must be unique.</p>
        {hasAdminAccess(role) ? (
          <p className="new-job-hint">
            Customer list management moved to{' '}
            <Link to="/admin/lists" className="new-job-inline-link">
              Manage lists
            </Link>
            .
          </p>
        ) : null}

        {createdJob ? (
          <div className="new-job-created-banner" role="status">
            <div className="new-job-created-copy">
              <strong>Job {createdJob.valve_id} created</strong>
              <span>
                {[createdJob.customer, createdJob.cell, createdJob.status].filter(Boolean).join(' · ') ||
                  'Ready for the shop floor'}
              </span>
            </div>
            <div className="new-job-created-actions">
              <button type="button" className="button-primary" onClick={printCreatedWorkOrder}>
                Print work order
              </button>
              <button type="button" className="button-secondary" onClick={() => navigate('/job-board')}>
                Go to job board
              </button>
              <button type="button" className="button-secondary" onClick={startAnotherJob}>
                Create another
              </button>
            </div>
          </div>
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
                <div className="job-board-wo-combobox new-job-customer-combobox" ref={customerRootRef}>
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={customerOpen}
                    aria-controls={customerListId}
                    aria-autocomplete="list"
                    placeholder={loadingCustomers ? 'Loading customers…' : 'Type to search customer…'}
                    value={customerQuery}
                    disabled={loadingCustomers}
                    onChange={(e) => {
                      const next = e.target.value
                      setCustomerQuery(next)
                      setCustomer(next)
                      setCustomerOpen(true)
                    }}
                    onFocus={() => setCustomerOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setCustomerOpen(false)
                        return
                      }
                      if (e.key === 'Enter' && customerSuggestions[0] && customerOpen) {
                        e.preventDefault()
                        pickCustomer(customerSuggestions[0].name)
                      }
                    }}
                  />
                  {customerQuery ? (
                    <button
                      type="button"
                      className="job-board-wo-clear"
                      onClick={() => {
                        setCustomer('')
                        setCustomerQuery('')
                        setCustomerOpen(false)
                      }}
                      aria-label="Clear customer"
                    >
                      ×
                    </button>
                  ) : null}
                  {customerOpen && !loadingCustomers && customerSuggestions.length > 0 ? (
                    <ul className="job-board-wo-suggestions" id={customerListId} role="listbox">
                      {customerSuggestions.map((c) => (
                        <li key={c.id} role="none">
                          <button
                            type="button"
                            role="option"
                            className="job-board-wo-suggestion"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => pickCustomer(c.name)}
                          >
                            <strong>{c.name}</strong>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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
                  {allowNaSizeAndClass ? <option value="N/A">N/A</option> : null}
                  {lookupSelectOptions(lookupOptions.valve_size)}
                </select>
              </label>
              <label>
                Pressure class
                <select value={pressureClass} onChange={(e) => setPressureClass(e.target.value)}>
                  <option value="">— Select pressure class —</option>
                  {allowNaSizeAndClass ? <option value="N/A">N/A</option> : null}
                  {lookupSelectOptions(lookupOptions.pressure_class)}
                </select>
              </label>
              <label>
                Body material
                <select value={bodyMaterial} onChange={(e) => setBodyMaterial(e.target.value)}>
                  <option value="">— Select body material —</option>
                  {lookupSelectOptions(lookupOptions.body_material)}
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
                <>
                  <label>
                    Test type
                    <select
                      value={testType}
                      onChange={(e) => {
                        const next = e.target.value
                        setTestType(next)
                        if (next !== TEST_PROCEDURE_OTHER) setTestTypeOther('')
                      }}
                    >
                      <option value="">— Select test type —</option>
                      {lookupSelectOptions(lookupOptions.test_procedure)}
                      <option value={TEST_PROCEDURE_OTHER}>Other…</option>
                    </select>
                  </label>
                  {testType === TEST_PROCEDURE_OTHER ? (
                    <label>
                      Other test type
                      <input
                        type="text"
                        value={testTypeOther}
                        onChange={(e) => setTestTypeOther(e.target.value)}
                        placeholder="Describe other test requirements"
                        required
                      />
                    </label>
                  ) : null}
                </>
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

          <div className="new-job-flags-row">
            <label className="new-job-flag-card">
              <input
                type="checkbox"
                checked={isTurnaround}
                onChange={(e) => setIsTurnaround(e.target.checked)}
              />
              <div className="new-job-flag-text">
                <span className="new-job-flag-title">Turnaround</span>
                <span className="new-job-flag-desc">Customer job — use for updates &amp; turnaround reports</span>
              </div>
            </label>
            <label className="new-job-flag-card">
              <input
                type="checkbox"
                checked={addToPriority}
                onChange={(e) => setAddToPriority(e.target.checked)}
              />
              <div className="new-job-flag-text">
                <span className="new-job-flag-title">Priority queue</span>
                <span className="new-job-flag-desc">Flags job at the top of the board</span>
              </div>
            </label>
          </div>
          <div className="new-job-actions">
            <button type="submit" className="button-primary" disabled={saving || Boolean(createdJob)}>
              {saving ? 'Saving...' : createdJob ? 'Job already created' : 'Create job'}
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
