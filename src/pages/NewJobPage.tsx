import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { JOB_TYPES, isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'
import { LOOKUP_CATEGORY_DEFS, type LookupCategory } from '../constants/lookupCategories'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { rememberValveForCompany } from '../lib/companyDataScope'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { hasAdminAccess } from '../lib/roles'
import { TEST_PROCEDURE_OTHER } from '../lib/testLogProcedure'
import { formatJobTestSelections, isPreTestRequiredForced, preTestLockReason, resolvePreTestRequired, isMissingPreTestRequiredColumn, omitPreTestRequiredColumn } from '../lib/jobTestCriteria'
import { isReliefValveType } from '../lib/reliefValveTest'
import { JobTestCriteriaFields } from '../components/JobTestCriteriaFields'
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
  const workflow = useCompanyWorkflow()
  const STATUS_ORDER = workflow.statusOrder
  const defaultStatus = workflow.key === 'vsi' ? 'Incoming' : 'Arrived - Not Started'
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
  const [testTypes, setTestTypes] = useState<string[]>([])
  const [testTypeOther, setTestTypeOther] = useState('')
  const [status, setStatus] = useState(defaultStatus)
  const [orderType, setOrderType] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dateReceived, setDateReceived] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [isTurnaround, setIsTurnaround] = useState(false)
  const [needsFailureAnalysis, setNeedsFailureAnalysis] = useState(false)
  const [preTestRequired, setPreTestRequired] = useState(false)
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
    loadLookupOptionsMap().then((map) => {
      if (workflow.key === 'vsi') {
        setLookupOptions({ ...map, finish_cell: [...workflow.workCells] })
      } else {
        setLookupOptions(map)
      }
    })
  }, [workflow.key, workflow.workCells])

  useEffect(() => {
    setStatus((prev) => ((STATUS_ORDER as readonly string[]).includes(prev) ? prev : defaultStatus))
    setCell((prev) =>
      prev && !(workflow.workCells as readonly string[]).includes(prev) ? '' : prev,
    )
  }, [workflow.key, STATUS_ORDER, defaultStatus, workflow.workCells])

  useEffect(() => {
    if (isPreTestRequiredForced({ needsFailureAnalysis, status })) {
      setPreTestRequired(true)
    }
  }, [needsFailureAnalysis, status])

  const reliefType = isReliefValveType(valveType)
  const prevReliefType = useRef(reliefType)
  useEffect(() => {
    if (prevReliefType.current === reliefType) return
    prevReliefType.current = reliefType
    setTestTypes([])
    setTestTypeOther('')
  }, [reliefType])

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
    setTestTypes([])
    setTestTypeOther('')
    setOrderType('')
    setDueDate('')
    setDateReceived(new Date().toISOString().slice(0, 10))
    setDescription('')
    setNotes('')
    setIsTurnaround(false)
    setNeedsFailureAnalysis(false)
    setPreTestRequired(false)
    setAddToPriority(false)
    setStatus(defaultStatus)
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
    const resolvedTestType = formatJobTestSelections({
      valveType,
      selected: testTypes,
      otherText: testTypeOther,
    })
    const resolvedPreTestRequired = resolvePreTestRequired({
      preTestRequired,
      needsFailureAnalysis,
      status,
    })

    if (valveRelated && isReliefValveType(valveType) && testTypes.includes('Other') && !testTypeOther.trim()) {
      showToast('Describe the other test media')
      return
    }
    if (valveRelated && testTypes.includes(TEST_PROCEDURE_OTHER) && !testTypeOther.trim()) {
      showToast('Describe the other test type')
      return
    }

    const payload = {
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
      date_received: dateReceived || new Date().toISOString().slice(0, 10),
      description: description.trim() || null,
      notes: notes.trim() || null,
      material_spec: valveRelated ? null : materialSpec.trim() || null,
      drawing_po_number: valveRelated ? null : drawingPoNumber.trim() || null,
      is_turnaround: isTurnaround,
      needs_failure_analysis: needsFailureAnalysis,
      pre_test_required: resolvedPreTestRequired,
      assigned_technician_ids: [],
    }

    setSaving(true)
    let { data: inserted, error } = await supabase.from('valves').insert(payload).select('*').single()
    if (error && /date_received/i.test(error.message ?? '')) {
      const { date_received: _drop, ...withoutReceived } = payload
      const retry = await supabase.from('valves').insert(withoutReceived).select('*').single()
      inserted = retry.data
      error = retry.error
      if (!error) {
        showToast('Saved without received date — run migration-valves-date-received.sql in Supabase')
      }
    }
    if (error && isMissingPreTestRequiredColumn(error.message)) {
      const retry = await supabase
        .from('valves')
        .insert(omitPreTestRequiredColumn(payload))
        .select('*')
        .single()
      inserted = retry.data
      error = retry.error
    }
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

    rememberValveForCompany(workflow.key, created.id)
    setCreatedJob(created)
    showToast(`Job created: ${id} — you can print the work order below`)
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">New job</h2>
      </div>
      <p className="admin-employees-orgs-note">
        Creating under <strong>{workflow.label}</strong>
        {workflow.key === 'vsi'
          ? ` — status list and ${workflow.workCellLabel.toLowerCase()} options are VSI (${workflow.workCells.join(', ')}).`
          : ' — JS Valve statuses and finish cells.'}
      </p>

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
                {workflow.workCellLabel}
                <select value={cell} onChange={(e) => setCell(e.target.value)}>
                  <option value="">— Select {workflow.workCellLabel.toLowerCase()} —</option>
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
                <JobTestCriteriaFields
                  idPrefix="new-job"
                  valveType={valveType}
                  procedureOptions={lookupOptions.test_procedure}
                  selected={testTypes}
                  otherText={testTypeOther}
                  onSelectedChange={setTestTypes}
                  onOtherTextChange={setTestTypeOther}
                  preTestRequired={preTestRequired}
                  onPreTestRequiredChange={setPreTestRequired}
                  preTestLocked={isPreTestRequiredForced({ needsFailureAnalysis, status })}
                  preTestLockReason={preTestLockReason({ needsFailureAnalysis, status })}
                  disabled={saving}
                  layout="new-job"
                />
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
                Received date
                <input
                  type="date"
                  value={dateReceived}
                  onChange={(e) => setDateReceived(e.target.value)}
                  title="Demand / receipt date used in demand reports"
                />
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
            <label className="new-job-flag-card">
              <input
                type="checkbox"
                checked={needsFailureAnalysis}
                onChange={(e) => {
                  const checked = e.target.checked
                  setNeedsFailureAnalysis(checked)
                  if (checked) setPreTestRequired(true)
                }}
              />
              <div className="new-job-flag-text">
                <span className="new-job-flag-title">Needs failure analysis</span>
                <span className="new-job-flag-desc">Flags job for engineering / failure analysis review</span>
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
