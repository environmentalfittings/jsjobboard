import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TechnicianAvatars } from '../components/TechnicianAvatars'
import { ValveAttachmentsPanel } from '../components/ValveAttachmentsPanel'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import { technicianIdsForValve } from '../lib/valveTechnicianIds'
import { fetchAllValves } from '../lib/fetchAllValves'
import { downloadValveTicketPdf, openValveTicketPdfForPrint } from '../lib/valveTicketPrint'
import { valveMatchesWorkOrderFilter, suggestWorkOrders } from '../lib/valveWorkOrderSearch'
import { supabase } from '../lib/supabase'
import type { Technician, Valve } from '../types'

function formatDate(value: string | null) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

type ItpTemplateStep = {
  id: number
  job_type: string
  valve_type: string | null
  step_order: number
  step_name: string
  required: boolean
}

type JobItpItem = {
  id: number
  valve_row_id: number
  template_step_id: number | null
  step_name: string
  required: boolean
  is_checked: boolean
  sort_order: number
}

export function ValveCardTicketPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [valves, setValves] = useState<Valve[]>([])
  const [search, setSearch] = useState('')
  const [valveIdQuery, setValveIdQuery] = useState('')
  const [valveIdSelected, setValveIdSelected] = useState('')
  const [valveIdOpen, setValveIdOpen] = useState(false)
  const valveIdListId = useId()
  const valveIdRootRef = useRef<HTMLDivElement>(null)
  const [customerFilter, setCustomerFilter] = useState('')
  const [cellFilter, setCellFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [descDraft, setDescDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [savingCard, setSavingCard] = useState(false)
  const [assignedTechnicianIdDraft, setAssignedTechnicianIdDraft] = useState<number | null>(null)
  const [itpItems, setItpItems] = useState<JobItpItem[]>([])
  const [loadingItp, setLoadingItp] = useState(false)

  const valveForPrint = (valve: Valve): Valve => ({
    ...valve,
    description: valve.id === selected?.id ? descDraft.trim() || null : valve.description,
    notes: valve.id === selected?.id ? notesDraft.trim() || null : valve.notes,
  })

  const downloadPdf = (valve: Valve) => {
    downloadValveTicketPdf(valveForPrint(valve))
    showToast('PDF downloaded')
  }

  const printPdf = (valve: Valve) => {
    try {
      openValveTicketPdfForPrint(valveForPrint(valve))
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open PDF for printing')
    }
  }

  const techniciansById = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians])

  useEffect(() => {
    const load = async () => {
      const { data, error } = await fetchAllValves()
      if (error) {
        showToast(`Could not load valves: ${error.message}`)
        setValves([])
        return
      }
      setValves(data)
    }
    load()
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('technicians')
        .select('id,name,employee_id,work_cell_specialties,group_team,active,created_at,updated_at')
        .order('name')
      if (cancelled) return
      if (!error && data) setTechnicians(data as Technician[])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!valveIdOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!valveIdRootRef.current?.contains(event.target as Node)) setValveIdOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [valveIdOpen])

  const valveIdSuggestions = useMemo(
    () => suggestWorkOrders(valves, valveIdQuery, 20),
    [valves, valveIdQuery],
  )

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase()
    let base = valves
    if (valveIdQuery.trim() || valveIdSelected) {
      base = base.filter((v) => valveMatchesWorkOrderFilter(v, valveIdQuery, valveIdSelected))
    }
    if (customerFilter) base = base.filter((v) => (v.customer ?? '') === customerFilter)
    if (cellFilter) base = base.filter((v) => (v.cell ?? '') === cellFilter)
    if (!text) return base.slice(0, 200)
    return base
      .filter(
        (v) =>
          v.valve_id.toLowerCase().includes(text) ||
          (v.customer ?? '').toLowerCase().includes(text) ||
          (v.cell ?? '').toLowerCase().includes(text) ||
          (v.description ?? '').toLowerCase().includes(text) ||
          (v.notes ?? '').toLowerCase().includes(text),
      )
      .slice(0, 200)
  }, [valves, search, valveIdQuery, valveIdSelected, customerFilter, cellFilter])

  const customerOptions = useMemo(
    () => Array.from(new Set(valves.map((v) => v.customer).filter((v): v is string => Boolean(v)))).sort(),
    [valves],
  )
  const cellOptions = useMemo(
    () => Array.from(new Set(valves.map((v) => v.cell).filter((v): v is string => Boolean(v)))).sort(),
    [valves],
  )

  const selected = filtered.find((v) => v.id === selectedId) ?? filtered[0] ?? null

  useEffect(() => {
    if (!selected) {
      setDescDraft('')
      setNotesDraft('')
      setAssignedTechnicianIdDraft(null)
      return
    }
    setDescDraft(selected.description ?? '')
    setNotesDraft(selected.notes ?? '')
    setAssignedTechnicianIdDraft(selected.assigned_technician_id ?? null)
  }, [selected?.id, selected?.description, selected?.notes, selected?.assigned_technician_id])

  useEffect(() => {
    if (!selected) {
      setItpItems([])
      return
    }
    const loadChecklist = async () => {
      setLoadingItp(true)
      const { data: existing, error: existingError } = await supabase
        .from('job_itp_items')
        .select('id,valve_row_id,template_step_id,step_name,required,is_checked,sort_order')
        .eq('valve_row_id', selected.id)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      if (existingError) {
        setLoadingItp(false)
        showToast('Could not load ITP checklist')
        return
      }
      if ((existing ?? []).length > 0) {
        setItpItems((existing ?? []) as JobItpItem[])
        setLoadingItp(false)
        return
      }
      const normalizedType = normalizeJobType(selected.job_type)
      const rawValveType = normalizeJobType(selected.job_type) === 'Valve Repair' ? (selected.valve_type ?? '').trim() : ''
      const { data: templateRows, error: templateError } = await supabase
        .from('itp_templates')
        .select('id,job_type,valve_type,step_order,step_name,required')
        .eq('job_type', normalizedType)
        .order('step_order', { ascending: true })
        .order('id', { ascending: true })
      if (templateError) {
        setLoadingItp(false)
        showToast('Could not load ITP template')
        return
      }
      const allRows = ((templateRows ?? []) as ItpTemplateStep[]).filter((row) => normalizeJobType(row.job_type) === normalizedType)
      const valveSpecific = rawValveType
        ? allRows.filter((row) => (row.valve_type ?? '').trim().toLowerCase() === rawValveType.toLowerCase())
        : []
      const generic = allRows.filter((row) => row.valve_type === null)
      const matchRows = valveSpecific.length > 0 ? valveSpecific : generic
      if (matchRows.length === 0) {
        setItpItems([])
        setLoadingItp(false)
        return
      }
      const inserts = matchRows.map((row, index) => ({
        valve_row_id: selected.id,
        template_step_id: row.id,
        step_name: row.step_name,
        required: row.required,
        is_checked: false,
        sort_order: row.step_order ?? index,
      }))
      const { data: created, error: createError } = await supabase
        .from('job_itp_items')
        .insert(inserts)
        .select('id,valve_row_id,template_step_id,step_name,required,is_checked,sort_order')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      setLoadingItp(false)
      if (createError) {
        showToast('Could not start ITP checklist')
        return
      }
      setItpItems((created ?? []) as JobItpItem[])
    }
    void loadChecklist()
  }, [selected?.id, selected?.job_type, selected?.valve_type, showToast])

  const toggleItpItem = async (item: JobItpItem) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    const nextChecked = !item.is_checked
    setItpItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_checked: nextChecked } : row)))
    const { error } = await supabase.from('job_itp_items').update({ is_checked: nextChecked }).eq('id', item.id)
    if (error) {
      setItpItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_checked: item.is_checked } : row)))
      showToast('Could not update ITP step')
    }
  }

  const itpDoneCount = useMemo(() => itpItems.filter((row) => row.is_checked).length, [itpItems])
  const showItpWarnings = useMemo(() => {
    if (!selected) return false
    const status = selected.status.toLowerCase()
    return status.includes('ready to ship') || status.includes('done') || status.includes('complete')
  }, [selected?.status])

  const saveCardText = async () => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!selected) return
    const patch = {
      description: descDraft.trim() || null,
      notes: notesDraft.trim() || null,
      assigned_technician_id: assignedTechnicianIdDraft,
    }
    setSavingCard(true)
    const { error } = await supabase.from('valves').update(patch).eq('id', selected.id)
    setSavingCard(false)
    if (error) {
      showToast('Could not save description or notes')
      return
    }
    setValves((prev) => prev.map((v) => (v.id === selected.id ? { ...v, ...patch } : v)))
    showToast('Saved')
  }

  const printTicket = (valve: Valve) => {
    printPdf(valve)
  }

  const copySelectedLink = async () => {
    if (!selected) return
    const url = `${window.location.origin}/jobs/${selected.id}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('Job card link copied')
    } catch {
      showToast('Could not copy link')
    }
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Valve card / ticket</h2>
      </div>

      <section className="dashboard-panel ticket-layout">
        <div className="ticket-list-pane">
          <div className="ticket-tools">
            <div className="ticket-valve-id-field" ref={valveIdRootRef}>
              <label>
                <span>Valve ID</span>
                <div className="job-board-wo-combobox ticket-valve-id-combobox">
                <input
                  type="text"
                  role="combobox"
                  aria-expanded={valveIdOpen}
                  aria-controls={valveIdListId}
                  aria-autocomplete="list"
                  placeholder="Type to search valve ID…"
                  value={valveIdSelected || valveIdQuery}
                  onChange={(event) => {
                    setValveIdSelected('')
                    setValveIdQuery(event.target.value)
                    setValveIdOpen(true)
                  }}
                  onFocus={() => setValveIdOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setValveIdOpen(false)
                      return
                    }
                    if (event.key === 'Enter' && valveIdSuggestions[0]) {
                      event.preventDefault()
                      const valve = valveIdSuggestions[0]
                      setValveIdSelected(valve.valve_id)
                      setValveIdQuery(valve.valve_id)
                      setSelectedId(valve.id)
                      setValveIdOpen(false)
                    }
                  }}
                />
                {valveIdSelected || valveIdQuery ? (
                  <button
                    type="button"
                    className="job-board-wo-clear"
                    onClick={() => {
                      setValveIdSelected('')
                      setValveIdQuery('')
                      setValveIdOpen(false)
                    }}
                    aria-label="Clear valve ID filter"
                  >
                    ×
                  </button>
                ) : null}
                {valveIdOpen && valveIdQuery.trim() && !valveIdSelected && valveIdSuggestions.length > 0 ? (
                  <ul className="job-board-wo-suggestions" id={valveIdListId} role="listbox">
                    {valveIdSuggestions.map((valve) => (
                      <li key={valve.id} role="none">
                        <button
                          type="button"
                          role="option"
                          className="job-board-wo-suggestion"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setValveIdSelected(valve.valve_id)
                            setValveIdQuery(valve.valve_id)
                            setSelectedId(valve.id)
                            setValveIdOpen(false)
                          }}
                        >
                          <strong>{valve.valve_id}</strong>
                          <span>{valve.customer ?? 'Unknown customer'}</span>
                          {valve.status ? (
                            <span className="job-board-wo-suggestion-status">{valve.status}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              </label>
            </div>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="">All Customers</option>
              {customerOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select value={cellFilter} onChange={(e) => setCellFilter(e.target.value)}>
              <option value="">All Cells</option>
              {cellOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search valve, customer, cell, description, or notes"
            />
          </div>
          <div className="ticket-list">
            {filtered.map((valve) => (
              <button
                key={valve.id}
                type="button"
                className={`ticket-item ${selected?.id === valve.id ? 'active' : ''}`}
                onClick={() => setSelectedId(valve.id)}
                onDoubleClick={() => printTicket(valve)}
              >
                <div className="ticket-item-id">{valve.valve_id}</div>
                <div className="ticket-item-meta">{valve.customer ?? '-'}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="ticket-preview-pane">
          {selected ? (
            <div className="ticket-preview-card">
              {(() => {
                const jobType = normalizeJobType(selected.job_type)
                const valveRelated = isValveRelatedJobType(jobType)
                return (
                  <>
              <div className="ticket-preview-head">
                <h3>{selected.valve_id}</h3>
                <div className="ticket-preview-head-actions">
                  <button type="button" className="button-primary" onClick={() => printPdf(selected)}>
                    Print production card
                  </button>
                  <button type="button" className="button-secondary ticket-copy-link-btn" onClick={() => void copySelectedLink()}>
                    <span aria-hidden>📋</span> Copy link
                  </button>
                </div>
              </div>
              <p>
                <strong>Job type:</strong> {jobType}
              </p>
              <p>
                <strong>Customer:</strong> {selected.customer ?? '-'}
              </p>
              <p>
                <strong>Work Cell:</strong> {selected.cell ?? '-'}
              </p>
              <p>
                <strong>Size:</strong> {selected.size ?? '-'}
              </p>
              <p>
                <strong>Pressure class:</strong> {selected.pressure_class ?? '-'}
              </p>
              <p>
                <strong>Body material:</strong> {selected.body_material ?? '-'}
              </p>
              {valveRelated ? (
                <>
                  <p>
                    <strong>Valve type:</strong> {selected.valve_type ?? '-'}
                  </p>
                  <p>
                    <strong>Test type:</strong> {selected.test_type ?? '-'}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>Material / spec:</strong> {selected.material_spec ?? '-'}
                  </p>
                  <p>
                    <strong>Drawing / PO #:</strong> {selected.drawing_po_number ?? '-'}
                  </p>
                </>
              )}
              <p>
                <strong>Order type:</strong> {selected.order_type ?? '-'}
              </p>
              <p>
                <strong>Due Date:</strong> {formatDate(selected.due_date)}
              </p>
              <p>
                <strong>Status:</strong> {selected.status}
              </p>
              <p>
                <strong>Assigned technicians:</strong>{' '}
                {technicianIdsForValve(selected).length === 0 ? (
                  '—'
                ) : (
                  <span className="ticket-tech-inline">
                    <TechnicianAvatars ids={technicianIdsForValve(selected)} byId={techniciansById} max={8} />
                    <span className="ticket-tech-names">
                      {technicianIdsForValve(selected)
                        .map((id) => techniciansById.get(id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                )}
              </p>
              <label className="ticket-field-label" htmlFor="ticket-assigned-tech">
                Assign technician
              </label>
              <select
                id="ticket-assigned-tech"
                className="modal-status-select"
                value={assignedTechnicianIdDraft ?? ''}
                onChange={(e) => setAssignedTechnicianIdDraft(e.target.value ? Number.parseInt(e.target.value, 10) : null)}
                disabled={savingCard || !canWrite}
              >
                <option value="">Unassigned</option>
                {technicians
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <p>
                <strong>Turnaround:</strong> {selected.is_turnaround === true ? 'Yes' : 'No'}
              </p>

              <ValveAttachmentsPanel valveRowId={selected.id} disabled={!canWrite} />

              <label className="ticket-field-label">Description</label>
              <textarea
                className="ticket-preview-textarea"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Job or valve description"
                rows={3}
                disabled={savingCard || !canWrite}
              />

              <label className="ticket-field-label">Notes</label>
              <textarea
                className="ticket-preview-textarea"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Internal notes"
                rows={4}
                disabled={savingCard || !canWrite}
              />

              <section className="ticket-itp-section">
                <div className="ticket-itp-head">
                  <label className="ticket-field-label">ITP Checklist</label>
                  <span className="ticket-itp-summary">
                    ITP: {itpDoneCount} / {itpItems.length} steps complete
                  </span>
                </div>
                {loadingItp ? (
                  <p className="status-breakdown-note">Loading ITP checklist…</p>
                ) : itpItems.length === 0 ? (
                  <p className="status-breakdown-note">No template found for this job type/valve type.</p>
                ) : (
                  <div className="ticket-itp-list">
                    {itpItems.map((item) => {
                      const warn = showItpWarnings && item.required && !item.is_checked
                      return (
                        <label key={item.id} className={`ticket-itp-item ${warn ? 'ticket-itp-item-warn' : ''}`}>
                          <input
                            type="checkbox"
                            checked={item.is_checked}
                            onChange={() => void toggleItpItem(item)}
                          />
                          <span>{item.step_name}</span>
                          <span className={`ticket-itp-required ${item.required ? 'required' : 'optional'}`}>
                            {item.required ? 'Required' : 'Optional'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </section>

              <div className="ticket-preview-actions ticket-print-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => navigate(`/traveler/${encodeURIComponent(selected.valve_id)}`)}
                >
                  <span aria-hidden>📄</span> Open Traveler
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={savingCard || !canWrite}
                  onClick={() => void saveCardText()}
                >
                  {savingCard ? 'Saving…' : 'Save description & notes'}
                </button>
                <button type="button" className="button-primary" onClick={() => printPdf(selected)}>
                  Print production card
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => downloadPdf(selected)}
                >
                  Download PDF
                </button>
              </div>
              <p className="status-breakdown-note ticket-print-hint">
                <strong>Recommended:</strong> use <strong>Print production card</strong> or{' '}
                <strong>Download PDF</strong> on 3.5&quot;&nbsp;&times;&nbsp;3&quot; card stock. In the print dialog,
                pick that paper size (or a custom size) and print at <strong>100% scale</strong> — do not shrink to fit.
                A label printer (e.g. Brother QL tape) is narrower than the card and will clip the layout.
              </p>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="status-breakdown-note">No valve found.</div>
          )}
        </div>
      </section>
    </section>
  )
}
