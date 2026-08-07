import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { JOB_TYPES, isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'
import { STATUS_ORDER } from '../constants/statuses'
import { ITP_BOWL_TYPE_OPTIONS, itpTemplateLabel } from '../constants/itpTemplates'
import { VALVE_TYPE_EDIT_PIN } from '../constants/valveTypeEditGate'
import { useToast } from './ToastNotification'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { formatJobTestTypes, parseJobTestTypes } from '../lib/jobTestTypes'
import { TEST_PROCEDURE_OTHER } from '../lib/testLogProcedure'
import { buildTestLogEntryHref } from '../lib/testLogEntryPrefill'
import { type JobCardSaveFields, toDateInputValue } from '../lib/jobCardSave'
import { supabase } from '../lib/supabase'
import { openValveTicketPdfForPrint } from '../lib/valveTicketPrint'
import {
  formatOutsourcedExpectedLabel,
  listValveOutsourcedItems,
  summarizeOutsourcedItemsForCard,
  type OutsourcedCardSummary,
} from '../lib/valveOutsourcedItems'
import type { Technician, TestLogEntry, Valve } from '../types'
import { ValveAttachmentsPanel } from './ValveAttachmentsPanel'
import { ValveOutsourcedItemsPanel } from './ValveOutsourcedItemsPanel'

export type JobCardTab = 'summary' | 'details' | 'itp' | 'test-log' | 'photos' | 'outsourced' | 'notes'

const JOB_CARD_TABS: { id: JobCardTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'details', label: 'Details' },
  { id: 'outsourced', label: 'Parts' },
  { id: 'itp', label: 'ITP' },
  { id: 'test-log', label: 'Test Log' },
  { id: 'photos', label: 'Photos' },
  { id: 'notes', label: 'Notes' },
]

function JobCardMaximizeIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
      </svg>
    )
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

function jobCardSubtitle(valve: Valve, descriptionDraft: string): string {
  const parts: string[] = []
  const sz = (valve.size ?? '').trim()
  if (sz) parts.push(sz.includes('"') ? sz : `${sz}"`)
  const pc = (valve.pressure_class ?? '').trim()
  if (pc) parts.push(`Class ${pc}`)
  const d = (descriptionDraft ?? '').trim()
  if (d) parts.push(d)
  const ot = (valve.order_type ?? '').trim()
  if (ot) parts.push(ot)
  return parts.join(' · ') || 'Add description on the Details tab'
}

interface StatusChangeModalProps {
  valve: Valve
  selectedStatus: string
  onSelectStatus: (status: string) => void
  isPriority: boolean
  onTogglePriority: () => void
  onCancel: () => void
  isSaving: boolean
  onSaveAll: (fields: JobCardSaveFields) => void | Promise<void>
  canEditJobDetails?: boolean
  assignedTechnicianIds: number[]
  assignedTechnicianId?: number | null
  onAssignmentsChanged?: () => void
  onAttachmentsChanged?: () => void
  onOutsourcedChanged?: () => void
  onOpenItp: () => void
  onOpenFullPage?: () => void
  onCopy?: () => void
  forceMaximized?: boolean
  /** Open to a specific tab (e.g. outsourced from board badge). */
  initialTab?: JobCardTab
}

export function StatusChangeModal({
  valve,
  selectedStatus,
  onSelectStatus,
  isPriority,
  onTogglePriority,
  onCancel,
  isSaving,
  onSaveAll,
  assignedTechnicianIds,
  assignedTechnicianId = null,
  onAssignmentsChanged,
  onAttachmentsChanged,
  onOutsourcedChanged,
  onOpenItp,
  onOpenFullPage,
  onCopy,
  forceMaximized = false,
  canEditJobDetails = true,
  initialTab = 'summary',
}: StatusChangeModalProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<JobCardTab>(initialTab)
  const [description, setDescription] = useState(valve.description ?? '')
  const [notes, setNotes] = useState(valve.notes ?? '')
  const [bowlTypeDraft, setBowlTypeDraft] = useState(valve.bowl_type ?? '')
  const [valveTypeDraft, setValveTypeDraft] = useState(valve.valve_type ?? '')
  const [valveTypeOptions, setValveTypeOptions] = useState<string[]>([])
  const [pressureClassOptions, setPressureClassOptions] = useState<string[]>([])
  const [pressureClassDraft, setPressureClassDraft] = useState(valve.pressure_class ?? '')
  const [bodyMaterialOptions, setBodyMaterialOptions] = useState<string[]>([])
  const [bodyMaterialDraft, setBodyMaterialDraft] = useState(valve.body_material ?? '')
  const [valveTypeUnlocked, setValveTypeUnlocked] = useState(false)
  const [pinPromptOpen, setPinPromptOpen] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [pinError, setPinError] = useState(false)
  const [testLogRows, setTestLogRows] = useState<TestLogEntry[]>([])
  const [testLogLoading, setTestLogLoading] = useState(false)
  const [turnaroundDraft, setTurnaroundDraft] = useState(() => valve.is_turnaround === true)
  const [needsFailureAnalysisDraft, setNeedsFailureAnalysisDraft] = useState(
    () => valve.needs_failure_analysis === true,
  )
  const [isMaximized, setIsMaximized] = useState(forceMaximized)
  const [assignedTechDraft, setAssignedTechDraft] = useState<number[]>(assignedTechnicianIds)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addingTechId, setAddingTechId] = useState('')
  const [savingAssignments, setSavingAssignments] = useState(false)
  const [assignedTechSingleDraft, setAssignedTechSingleDraft] = useState<number | null>(assignedTechnicianId)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [customerDraft, setCustomerDraft] = useState(valve.customer ?? '')
  const [cellDraft, setCellDraft] = useState(valve.cell ?? '')
  const [sizeDraft, setSizeDraft] = useState(valve.size ?? '')
  const [jobTypeDraft, setJobTypeDraft] = useState(valve.job_type ?? 'Valve Repair')
  const [orderTypeDraft, setOrderTypeDraft] = useState(valve.order_type ?? '')
  const [dueDateDraft, setDueDateDraft] = useState(toDateInputValue(valve.due_date))
  const [testTypesDraft, setTestTypesDraft] = useState<string[]>([])
  const [testTypeOtherDraft, setTestTypeOtherDraft] = useState('')
  const [materialSpecDraft, setMaterialSpecDraft] = useState(valve.material_spec ?? '')
  const [drawingPoNumberDraft, setDrawingPoNumberDraft] = useState(valve.drawing_po_number ?? '')
  const [finishCellOptions, setFinishCellOptions] = useState<string[]>([])
  const [sizeOptions, setSizeOptions] = useState<string[]>([])
  const [orderTypeOptions, setOrderTypeOptions] = useState<string[]>([])
  const [testTypeOptions, setTestTypeOptions] = useState<string[]>([])
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([])
  const [outsourcedSummary, setOutsourcedSummary] = useState<Omit<OutsourcedCardSummary, 'valveRowId'> | null>(null)
  const { showToast } = useToast()
  const travelerValveId = (valve.valve_id ?? '').trim()
  const assignedTechKey = useMemo(() => assignedTechnicianIds.slice().sort((a, b) => a - b).join(','), [assignedTechnicianIds])

  const refreshOutsourcedSummary = async () => {
    try {
      const rows = await listValveOutsourcedItems(valve.id)
      setOutsourcedSummary(summarizeOutsourcedItemsForCard(rows))
    } catch {
      setOutsourcedSummary(null)
    }
  }

  useEffect(() => {
    setIsMaximized(forceMaximized)
    setActiveTab(initialTab)
  }, [valve.id, forceMaximized, initialTab])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await listValveOutsourcedItems(valve.id)
        if (!cancelled) setOutsourcedSummary(summarizeOutsourcedItemsForCard(rows))
      } catch {
        if (!cancelled) setOutsourcedSummary(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [valve.id])

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
    setAssignedTechDraft(assignedTechnicianIds)
    setPickerOpen(false)
    setAddingTechId('')
    setAssignedTechSingleDraft(assignedTechnicianId)
  }, [valve.id, assignedTechKey, assignedTechnicianId])

  useEffect(() => {
    void loadLookupOptionsMap().then((map) => {
      setValveTypeOptions(map.valve_type ?? [])
      setPressureClassOptions(map.pressure_class ?? [])
      setBodyMaterialOptions(map.body_material ?? [])
      setFinishCellOptions(map.finish_cell ?? [])
      setSizeOptions(map.valve_size ?? [])
      setOrderTypeOptions(map.order_type ?? [])
      setTestTypeOptions(map.test_procedure ?? [])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.from('customers').select('id,name').order('name')
      if (cancelled || error) return
      setCustomers((data ?? []) as { id: number; name: string }[])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const vid = (valve.valve_id ?? '').trim()
    if (!vid) {
      setTestLogRows([])
      return
    }
    setTestLogLoading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('test_logs')
        .select(
          'id,tested_on,valve_id,test_type,pass_fail,tester,action_taken,pressure,worked,size,manufacturer,valve_type',
        )
        .eq('valve_id', vid)
        .order('tested_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12)

      if (cancelled) return
      setTestLogLoading(false)
      if (error) {
        setTestLogRows([])
        return
      }
      setTestLogRows((data as TestLogEntry[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [valve.id, valve.valve_id])

  useEffect(() => {
    setDescription(valve.description ?? '')
    setNotes(valve.notes ?? '')
    setBowlTypeDraft(valve.bowl_type ?? '')
    setPressureClassDraft(valve.pressure_class ?? '')
    setBodyMaterialDraft(valve.body_material ?? '')
    setCustomerDraft(valve.customer ?? '')
    setCellDraft(valve.cell ?? '')
    setSizeDraft(valve.size ?? '')
    setJobTypeDraft(valve.job_type ?? 'Valve Repair')
    setOrderTypeDraft(valve.order_type ?? '')
    setDueDateDraft(toDateInputValue(valve.due_date))
    const known = testTypeOptions.length
      ? [...testTypeOptions, TEST_PROCEDURE_OTHER]
      : [TEST_PROCEDURE_OTHER]
    const parsed = parseJobTestTypes(valve.test_type, known)
    const knownSet = new Set(known)
    const recognized = parsed.filter((value) => knownSet.has(value))
    const custom = parsed.filter((value) => !knownSet.has(value))
    setTestTypesDraft(custom.length ? [...recognized, TEST_PROCEDURE_OTHER] : recognized)
    setTestTypeOtherDraft(custom.join(', '))
    setMaterialSpecDraft(valve.material_spec ?? '')
    setDrawingPoNumberDraft(valve.drawing_po_number ?? '')
  }, [
    valve.id,
    valve.description,
    valve.notes,
    valve.bowl_type,
    valve.pressure_class,
    valve.body_material,
    valve.customer,
    valve.cell,
    valve.size,
    valve.job_type,
    valve.order_type,
    valve.due_date,
    valve.test_type,
    valve.material_spec,
    valve.drawing_po_number,
    testTypeOptions,
  ])

  useEffect(() => {
    setValveTypeDraft(valve.valve_type ?? '')
    setValveTypeUnlocked(false)
    setPinPromptOpen(false)
    setPinDraft('')
    setPinError(false)
  }, [valve.id])

  useEffect(() => {
    if (!valveTypeUnlocked) {
      setValveTypeDraft(valve.valve_type ?? '')
    }
  }, [valve.valve_type, valveTypeUnlocked])

  const techniciansSorted = useMemo(() => {
    return [...technicians].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [technicians])

  const activeTechnicians = useMemo(() => techniciansSorted.filter((t) => t.active), [techniciansSorted])

  const addTechnician = async () => {
    if (!canEditJobDetails) return

    const techId = Number.parseInt(addingTechId, 10)
    if (!Number.isFinite(techId) || techId <= 0) return
    if (assignedTechDraft.includes(techId)) return
    setSavingAssignments(true)
    const { error } = await supabase.from('job_technicians').insert({ valve_row_id: valve.id, technician_id: techId })
    setSavingAssignments(false)
    if (error) {
      showToast(`Could not add technician: ${error.message}`)
      return
    }
    setAssignedTechDraft((prev) => [...prev, techId])
    setAddingTechId('')
    setPickerOpen(false)
    showToast('Technician assigned')
    onAssignmentsChanged?.()
  }

  const removeTechnician = async (techId: number) => {
    if (!canEditJobDetails) return

    setSavingAssignments(true)
    const { error } = await supabase
      .from('job_technicians')
      .delete()
      .eq('valve_row_id', valve.id)
      .eq('technician_id', techId)
    setSavingAssignments(false)
    if (error) {
      showToast(`Could not remove technician: ${error.message}`)
      return
    }
    setAssignedTechDraft((prev) => prev.filter((id) => id !== techId))
    showToast('Technician removed')
    onAssignmentsChanged?.()
  }

  const valveTypeSelectOptions = useMemo(() => {
    const s = new Set(valveTypeOptions)
    const cur = (valveTypeDraft ?? '').trim()
    if (cur) s.add(cur)
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [valveTypeOptions, valveTypeDraft])

  const displayValveType = (valveTypeUnlocked ? valveTypeDraft : (valve.valve_type ?? '')).trim() || '—'
  const bowlSummaryLabel =
    bowlTypeDraft.trim() === '' ? 'Auto (from valve type)' : itpTemplateLabel(bowlTypeDraft)

  const testLogEntryHref = useMemo(
    () =>
      buildTestLogEntryHref({
        valveId: valve.valve_id,
        size: valve.size,
        pressure: valve.pressure_class,
        valveType: (valveTypeUnlocked ? valveTypeDraft : (valve.valve_type ?? '')).trim() || null,
        testType: valve.test_type,
        customer: valve.customer,
        cell: valve.cell,
        description,
        jobStatus: selectedStatus,
      }),
    [
      valve.valve_id,
      valve.size,
      valve.pressure_class,
      valve.test_type,
      valve.customer,
      valve.cell,
      valve.valve_type,
      valveTypeUnlocked,
      valveTypeDraft,
      description,
      selectedStatus,
    ],
  )

  const tryUnlockValveType = () => {
    if (pinDraft === VALVE_TYPE_EDIT_PIN) {
      setValveTypeUnlocked(true)
      setPinPromptOpen(false)
      setPinDraft('')
      setPinError(false)
    } else {
      setPinError(true)
    }
  }

  const cancelPinPrompt = () => {
    setPinPromptOpen(false)
    setPinDraft('')
    setPinError(false)
  }

  const lockValveType = () => {
    setValveTypeUnlocked(false)
    setValveTypeDraft(valve.valve_type ?? '')
  }

  const reprintJobCard = () => {
    try {
      openValveTicketPdfForPrint({
        ...valve,
        description: description.trim() || null,
        customer: customerDraft.trim() || null,
        cell: cellDraft.trim() || null,
        size: sizeDraft.trim() || null,
        pressure_class: pressureClassDraft.trim() || null,
        due_date: dueDateDraft.trim() || null,
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open job card for printing')
    }
  }

  const save = () => {
    if (!canEditJobDetails) {
      showToast('You do not have permission to edit this job card')
      return
    }
    const normalizedJobType = normalizeJobType(jobTypeDraft)
    const valveRelated = isValveRelatedJobType(normalizedJobType)
    void onSaveAll({
      description,
      notes,
      bowlType: bowlTypeDraft.trim() || null,
      valveType: valveTypeDraft.trim() || null,
      isTurnaround: turnaroundDraft,
      needsFailureAnalysis: needsFailureAnalysisDraft,
      assignedTechnicianId: assignedTechSingleDraft,
      pressureClass: pressureClassDraft.trim() || null,
      bodyMaterial: bodyMaterialDraft.trim() || null,
      customer: customerDraft.trim() || null,
      cell: cellDraft.trim() || null,
      size: sizeDraft.trim() || null,
      jobType: normalizedJobType,
      orderType: orderTypeDraft.trim() || null,
      dueDate: dueDateDraft.trim() || null,
      testType: valveRelated
        ? formatJobTestTypes(
            testTypesDraft.includes(TEST_PROCEDURE_OTHER)
              ? [
                  ...testTypesDraft.filter((value) => value !== TEST_PROCEDURE_OTHER),
                  testTypeOtherDraft.trim(),
                ]
              : testTypesDraft,
          ) || null
        : null,
      materialSpec: valveRelated ? null : materialSpecDraft.trim() || null,
      drawingPoNumber: valveRelated ? null : drawingPoNumberDraft.trim() || null,
    })
  }

  const normalizedJobType = normalizeJobType(jobTypeDraft)
  const valveRelatedJob = isValveRelatedJobType(normalizedJobType)
  const allowNaSizeAndClass =
    !valveRelatedJob || (valveRelatedJob && /actuator/i.test((valveTypeDraft ?? '').trim()))

  const renderValveTypeEditor = (inPanel?: boolean) => (
    <div className={inPanel ? 'job-card-panel-body' : ''}>
      {!valveTypeUnlocked ? (
        <>
          <div className="modal-static-text job-card-readonly-value" title={valve.valve_type ?? undefined}>
            {(valve.valve_type ?? '').trim() || '—'}
          </div>
          {pinPromptOpen ? (
            <div className="modal-valve-type-pin-gate">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                className="modal-pin-input"
                value={pinDraft}
                onChange={(e) => {
                  setPinDraft(e.target.value)
                  setPinError(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') tryUnlockValveType()
                }}
                placeholder="PIN"
                aria-label="PIN to edit valve type"
                disabled={isSaving}
              />
              <button type="button" className="button-secondary" onClick={tryUnlockValveType} disabled={isSaving}>
                Unlock
              </button>
              <button type="button" className="button-secondary" onClick={cancelPinPrompt} disabled={isSaving}>
                Cancel
              </button>
              {pinError ? <p className="modal-pin-error">Incorrect PIN.</p> : null}
            </div>
          ) : (
            <button
              type="button"
              className="button-secondary job-card-edit-btn"
              onClick={() => setPinPromptOpen(true)}
              disabled={isSaving}
            >
              Edit
            </button>
          )}
        </>
      ) : (
        <div className="modal-valve-type-edit-row">
          <div className="modal-valve-type-combobox-wrap">
            <input
              type="text"
              id="modal-valve-type-select"
              className="modal-status-select modal-valve-type-combobox"
              list={`job-modal-valve-type-dl-${valve.id}`}
              value={valveTypeDraft}
              onChange={(e) => setValveTypeDraft(e.target.value)}
              disabled={isSaving}
              aria-label="Valve type"
              placeholder="Choose from list or type…"
              autoComplete="off"
            />
            <datalist id={`job-modal-valve-type-dl-${valve.id}`}>
              {valveTypeSelectOptions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <p className="modal-save-hint-subtle modal-valve-type-combobox-hint">
              Suggestions from Manage lists. Type any value if not listed.
            </p>
          </div>
          <button type="button" className="button-secondary" onClick={lockValveType} disabled={isSaving}>
            Lock
          </button>
        </div>
      )}
    </div>
  )

  const renderTestLogBody = (compact?: boolean) => (
    <>
      {valve.date_tested ? (
        <p className="modal-save-hint-subtle modal-test-log-shop-date">
          Shop “date tested” on this card: <strong>{valve.date_tested}</strong> (set when status is Testing).
        </p>
      ) : null}
      {testLogLoading ? (
        <p className="job-card-muted">Loading test log…</p>
      ) : testLogRows.length === 0 ? (
        <p className="job-card-muted">No bench/hydro entries yet.</p>
      ) : (
        <ul className={`modal-test-log-list${compact ? ' job-card-test-log-list--compact' : ''}`}>
          {testLogRows.map((r) => (
            <li key={r.id} className="modal-test-log-item">
              <span className="modal-test-log-line">
                <strong>{r.tested_on}</strong>
                {r.test_type ? ` · ${r.test_type}` : ''}
                {r.pass_fail ? ` · ${r.pass_fail}` : ''}
                {r.tester ? ` · ${r.tester}` : ''}
              </span>
              {r.pressure ? <span className="modal-test-log-meta">Pressure: {r.pressure}</span> : null}
              {r.worked ? <span className="modal-test-log-meta">Worked: {r.worked}</span> : null}
              {r.action_taken ? (
                <span className="modal-test-log-action" title={r.action_taken}>
                  {r.action_taken}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="modal-save-hint-subtle">
        <Link to="/test-log-entry" className="modal-inline-link">
          {testLogRows.length === 0 ? 'Add test log entry' : 'Open Test Log entry'}
        </Link>{' '}
        for full history.
      </p>
    </>
  )

  return (
    <div
      className={`modal-overlay${isMaximized ? ' modal-overlay--job-max' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className={`modal-card modal-card-job-detail modal-card-with-attachments job-card-shell${
          isMaximized ? ' modal-card-job-detail--max' : ''
        }`}
      >
        <header className="job-card-header">
          <div className="job-card-header-top">
            <div className="job-card-header-text">
              <div id="job-modal-title" className="job-card-job-id">
                {valve.valve_id}
              </div>
              <div className="job-card-valve-type-title">{displayValveType}</div>
              <p className="job-card-subtitle">{jobCardSubtitle(valve, description)}</p>
              <div className="job-card-header-chips">
                <label className="job-card-turnaround-pill">
                  <input
                    type="checkbox"
                    checked={turnaroundDraft}
                    onChange={(e) => setTurnaroundDraft(e.target.checked)}
                    disabled={isSaving || !canEditJobDetails}
                  />
                  <span>Turnaround</span>
                </label>
                <label className="job-card-turnaround-pill job-card-failure-analysis-pill">
                  <input
                    type="checkbox"
                    checked={needsFailureAnalysisDraft}
                    onChange={(e) => setNeedsFailureAnalysisDraft(e.target.checked)}
                    disabled={isSaving || !canEditJobDetails}
                  />
                  <span>Failure analysis</span>
                </label>
                <div className="job-card-status-field">
                  <span className="job-card-status-prefix" id="job-card-status-label">
                    Status:
                  </span>
                  <select
                    className="job-card-status-select"
                    value={selectedStatus}
                    onChange={(e) => onSelectStatus(e.target.value)}
                    disabled={isSaving || !canEditJobDetails}
                    aria-labelledby="job-card-status-label"
                  >
                    {STATUS_ORDER.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="job-card-header-actions">
              <button
                type="button"
                className="button-secondary job-card-header-btn"
                onClick={onCancel}
                disabled={isSaving}
              >
                Cancel
              </button>
              {onCopy ? (
                <button
                  type="button"
                  className="button-secondary job-card-header-btn"
                  onClick={onCopy}
                  disabled={isSaving}
                >
                  Copy job
                </button>
              ) : null}
              <button
                type="button"
                className="button-primary job-card-header-btn"
                onClick={onOpenItp}
                disabled={isSaving}
              >
                Open ITP
              </button>
              <button
                type="button"
                className="button-primary job-card-header-btn"
                onClick={() => navigate(`/traveler/${encodeURIComponent(travelerValveId)}`)}
                disabled={isSaving || !travelerValveId}
              >
                Open Traveler
              </button>
              <button
                type="button"
                className="button-secondary job-card-header-btn"
                onClick={reprintJobCard}
                disabled={isSaving}
                title="Reprint production job card"
              >
                Reprint card
              </button>
              <button
                type="button"
                className="modal-window-toggle job-card-window-toggle"
                onClick={() => {
                  if (onOpenFullPage && !forceMaximized) {
                    onOpenFullPage()
                    return
                  }
                  setIsMaximized((m) => !m)
                }}
                disabled={isSaving}
                aria-label={isMaximized ? 'Exit full screen' : 'Full screen'}
                title={isMaximized ? 'Exit full screen' : 'Full screen'}
              >
                <JobCardMaximizeIcon expanded={isMaximized} />
              </button>
              <button
                type="button"
                className="modal-close-x job-card-close-x"
                onClick={onCancel}
                disabled={isSaving}
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>
          </div>
          <nav className="job-card-tabs" role="tablist" aria-label="Job card sections">
            {JOB_CARD_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`job-card-tab${activeTab === t.id ? ' job-card-tab--active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <div className={`job-card-body${isMaximized ? ' modal-job-card-body--max-scroll' : ''}`}>
          {activeTab === 'summary' ? (
            <>
              <div className="job-card-section-head">
                <h3 className="job-card-section-title">Job details</h3>
                <div className="job-card-section-tools">
                  <button
                    type="button"
                    className={`job-card-seg${activeTab === 'summary' ? ' job-card-seg--on' : ''}`}
                    onClick={() => setActiveTab('summary')}
                  >
                    Summary
                  </button>
                  <button type="button" className="job-card-seg" onClick={() => setActiveTab('details')}>
                    Details
                  </button>
                  <button type="button" className="job-card-seg job-card-seg-primary" onClick={onOpenItp}>
                    Open ITP ▾
                  </button>
                  <button
                    type="button"
                    className="job-card-seg job-card-seg-primary"
                    onClick={() => navigate(`/traveler/${encodeURIComponent(travelerValveId)}`)}
                    disabled={isSaving || !travelerValveId}
                  >
                    Open Traveler
                  </button>
                </div>
              </div>

              <div className="job-card-panel">
                <div className="job-card-panel-head">
                  <span className="job-card-panel-title">Priority queue</span>
                </div>
                <div className="job-card-panel-body job-card-priority-inline">
                  <span className="job-card-muted">Flag this job for the shop priority column.</span>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={onTogglePriority}
                    disabled={isSaving || !canEditJobDetails}
                    title={canEditJobDetails ? undefined : 'View only — ask an Admin or Manager to make changes'}
                  >
                    {isPriority ? 'Remove from priority' : 'Add to priority'}
                  </button>
                </div>
              </div>

              <div className="job-card-panel">
                <div className="job-card-panel-head">
                  <span className="job-card-panel-title">Parts</span>
                </div>
                <div className="job-card-panel-body">
                  {outsourcedSummary ? (
                    <button
                      type="button"
                      className={`job-card-outsourced job-card-outsourced--${outsourcedSummary.tone} job-card-outsourced--in-modal`}
                      onClick={() => setActiveTab('outsourced')}
                    >
                      <span className="job-card-outsourced-label">Parts</span>
                      {outsourcedSummary.tone === 'received' ? (
                        <span className="job-card-outsourced-meta">All received</span>
                      ) : formatOutsourcedExpectedLabel(outsourcedSummary.latestExpectedBack) ? (
                        <span className="job-card-outsourced-meta">
                          Expect by {formatOutsourcedExpectedLabel(outsourcedSummary.latestExpectedBack)}
                          {outsourcedSummary.openCount > 1 ? ` · ${outsourcedSummary.openCount} open` : ''}
                        </span>
                      ) : (
                        <span className="job-card-outsourced-meta">
                          {outsourcedSummary.openCount} open · open details
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="job-card-priority-inline">
                      <span className="job-card-muted">No parts logged for this job yet.</span>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setActiveTab('outsourced')}
                        disabled={isSaving}
                      >
                        Add parts
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="job-card-panel">
                <div className="job-card-panel-head">
                  <span className="job-card-panel-title">Valve info</span>
                </div>
                <div className="job-card-panel-row">
                  <span className="job-card-row-label">Valve type</span>
                  <div className="job-card-row-value">{renderValveTypeEditor(true)}</div>
                </div>
                {(valve.pressure_class ?? '').trim() ? (
                  <div className="job-card-panel-row">
                    <span className="job-card-row-label">Pressure class</span>
                    <div className="job-card-row-value job-card-readonly-value">{valve.pressure_class}</div>
                  </div>
                ) : null}
                {(valve.body_material ?? '').trim() ? (
                  <div className="job-card-panel-row">
                    <span className="job-card-row-label">Body material</span>
                    <div className="job-card-row-value job-card-readonly-value">{valve.body_material}</div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="job-card-template-trigger"
                  onClick={() => setActiveTab('details')}
                  disabled={isSaving}
                >
                  <span className="job-card-template-trigger-label">Checklist template</span>
                  <span className="job-card-template-trigger-value">{bowlSummaryLabel}</span>
                  <span className="job-card-chevron" aria-hidden>
                    ›
                  </span>
                </button>
                {(valve.customer ?? '').trim() || (valve.cell ?? '').trim() ? (
                  <p className="job-card-panel-foot">
                    {(valve.customer ?? '').trim() || '—'}
                    {(valve.cell ?? '').trim() ? ` · Cell: ${(valve.cell ?? '').trim()}` : ''}
                  </p>
                ) : null}
              </div>

              <div className="job-card-panel">
                <div className="job-card-panel-head">
                  <span className="job-card-panel-title">Assigned technicians</span>
                </div>
                <div className="job-card-panel-body">
                  <label className="modal-label" htmlFor={`assigned-tech-${valve.id}`}>
                    Assign Technician (Primary)
                  </label>
                  <select
                    id={`assigned-tech-${valve.id}`}
                    className="modal-status-select"
                    value={assignedTechSingleDraft ?? ''}
                    onChange={(e) => {
                      const next = e.target.value ? Number.parseInt(e.target.value, 10) : null
                      setAssignedTechSingleDraft(Number.isFinite(next as number) ? next : null)
                    }}
                    disabled={isSaving}
                  >
                    <option value="">Unassigned</option>
                    {activeTechnicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <p className="job-card-tech-assign-hint">Add or remove assigned technicians for this job card.</p>
                  {assignedTechDraft.length === 0 ? (
                    <p className="job-card-muted">No technicians assigned yet.</p>
                  ) : (
                    <div className="job-card-tech-assigned-list" role="list" aria-label="Assigned technicians">
                      {assignedTechDraft.map((id) => {
                        const t = techniciansSorted.find((row) => row.id === id)
                        if (!t) return null
                        return (
                          <div key={id} className="job-card-tech-assigned-pill" role="listitem">
                            <span>
                              {t.name}
                              {t.group_team?.trim() ? <span className="job-card-muted"> · {t.group_team.trim()}</span> : null}
                            </span>
                            <button
                              type="button"
                              className="job-card-tech-remove"
                              onClick={() => void removeTechnician(id)}
                              disabled={isSaving || savingAssignments || !canEditJobDetails}
                              aria-label={`Remove ${t.name}`}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {activeTechnicians.length === 0 ? (
                    <p className="job-card-muted">No technicians in the database yet.</p>
                  ) : (
                    <div className="job-card-tech-add-wrap">
                      <button
                        type="button"
                        className="button-secondary admin-list-btn"
                        onClick={() => setPickerOpen((v) => !v)}
                        disabled={isSaving || savingAssignments || !canEditJobDetails}
                      >
                        Add technician
                      </button>
                      {pickerOpen ? (
                        <div className="job-card-tech-add-controls">
                          <select
                            value={addingTechId}
                            onChange={(e) => setAddingTechId(e.target.value)}
                            disabled={isSaving || savingAssignments}
                          >
                            <option value="">Select technician…</option>
                            {activeTechnicians
                              .filter((t) => !assignedTechDraft.includes(t.id))
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                  {t.group_team?.trim() ? ` · ${t.group_team.trim()}` : ''}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="button-primary admin-list-btn"
                            onClick={() => void addTechnician()}
                            disabled={!addingTechId || isSaving || savingAssignments}
                          >
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="job-card-panel">
                <div className="job-card-panel-head job-card-panel-head--split">
                  <span className="job-card-panel-title">Test log</span>
                  <Link to={testLogEntryHref} className="button-secondary job-card-panel-link-btn">
                    Add test log entry
                  </Link>
                </div>
                <div className="job-card-panel-body">{renderTestLogBody(true)}</div>
              </div>

            </>
          ) : null}

          {activeTab === 'details' ? (
            <div className="job-card-tab-pad">
              {canEditJobDetails ? (
                <>
                  <h3 className="job-card-section-title">Job info</h3>
                  <p className="modal-save-hint-subtle">Edit the same fields as when creating a new job. Click Save changes when done.</p>

                  <label className="modal-label" htmlFor="modal-job-type">
                    Job type
                  </label>
                  <select
                    id="modal-job-type"
                    className="modal-status-select"
                    value={jobTypeDraft}
                    onChange={(e) => setJobTypeDraft(e.target.value)}
                    disabled={isSaving}
                  >
                    {JOB_TYPES.map((jt) => (
                      <option key={jt} value={jt}>
                        {jt}
                      </option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="modal-customer">
                    Customer
                  </label>
                  <select
                    id="modal-customer"
                    className="modal-status-select"
                    value={customerDraft}
                    onChange={(e) => setCustomerDraft(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">— Select customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="modal-cell">
                    Finish cell
                  </label>
                  <select
                    id="modal-cell"
                    className="modal-status-select"
                    value={cellDraft}
                    onChange={(e) => setCellDraft(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">— Select finish cell —</option>
                    {finishCellOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="modal-size">
                    Size
                  </label>
                  <select
                    id="modal-size"
                    className="modal-status-select"
                    value={sizeDraft}
                    onChange={(e) => setSizeDraft(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">— Select size —</option>
                    {allowNaSizeAndClass ? <option value="N/A">N/A</option> : null}
                    {sizeOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="modal-order-type">
                    Order type
                  </label>
                  <select
                    id="modal-order-type"
                    className="modal-status-select"
                    value={orderTypeDraft}
                    onChange={(e) => setOrderTypeDraft(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">— Select order type —</option>
                    {orderTypeOptions.map((ot) => (
                      <option key={ot} value={ot}>
                        {ot}
                      </option>
                    ))}
                  </select>

                  <label className="modal-label" htmlFor="modal-due-date">
                    Due date
                  </label>
                  <input
                    id="modal-due-date"
                    type="date"
                    className="modal-status-select"
                    value={dueDateDraft}
                    onChange={(e) => setDueDateDraft(e.target.value)}
                    disabled={isSaving}
                  />

                  {valveRelatedJob ? (
                    <>
                      <label className="modal-label" htmlFor="modal-valve-type-details">
                        Valve type
                      </label>
                      <input
                        id="modal-valve-type-details"
                        type="text"
                        className="modal-status-select"
                        list={`job-modal-valve-type-dl-details-${valve.id}`}
                        value={valveTypeDraft}
                        onChange={(e) => setValveTypeDraft(e.target.value)}
                        disabled={isSaving}
                        placeholder="Choose from list or type…"
                      />
                      <datalist id={`job-modal-valve-type-dl-details-${valve.id}`}>
                        {valveTypeSelectOptions.map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>

                      <fieldset className="modal-test-types">
                        <legend className="modal-label">Test type(s)</legend>
                        <div className="modal-test-type-checkboxes" role="group" aria-label="Test types">
                          {[...testTypeOptions, TEST_PROCEDURE_OTHER].map((option) => (
                            <label key={option} className="modal-test-type-checkbox">
                              <input
                                type="checkbox"
                                checked={testTypesDraft.includes(option)}
                                disabled={isSaving}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  setTestTypesDraft((prev) => {
                                    const next = checked
                                      ? [...prev, option]
                                      : prev.filter((value) => value !== option)
                                    if (!next.includes(TEST_PROCEDURE_OTHER)) setTestTypeOtherDraft('')
                                    return next
                                  })
                                }}
                              />
                              <span>{option === TEST_PROCEDURE_OTHER ? 'Other…' : option}</span>
                            </label>
                          ))}
                        </div>
                        {testTypesDraft.includes(TEST_PROCEDURE_OTHER) ? (
                          <label className="modal-label" htmlFor="modal-test-type-other">
                            Other test type
                            <input
                              id="modal-test-type-other"
                              type="text"
                              className="modal-status-select"
                              value={testTypeOtherDraft}
                              onChange={(e) => setTestTypeOtherDraft(e.target.value)}
                              disabled={isSaving}
                              placeholder="Describe other test requirements"
                            />
                          </label>
                        ) : null}
                      </fieldset>
                    </>
                  ) : (
                    <>
                      <label className="modal-label" htmlFor="modal-material-spec">
                        Material / spec
                      </label>
                      <input
                        id="modal-material-spec"
                        type="text"
                        className="modal-status-select"
                        value={materialSpecDraft}
                        onChange={(e) => setMaterialSpecDraft(e.target.value)}
                        disabled={isSaving}
                      />

                      <label className="modal-label" htmlFor="modal-drawing-po">
                        Drawing / PO number
                      </label>
                      <input
                        id="modal-drawing-po"
                        type="text"
                        className="modal-status-select"
                        value={drawingPoNumberDraft}
                        onChange={(e) => setDrawingPoNumberDraft(e.target.value)}
                        disabled={isSaving}
                      />
                    </>
                  )}
                </>
              ) : (
                <p className="modal-save-hint-subtle">You can view this card but not edit job details.</p>
              )}

              <label className="modal-label" htmlFor="modal-bowl-type">
                Bowl type (inspection checklist)
              </label>
              <select
                id="modal-bowl-type"
                className="modal-status-select"
                value={bowlTypeDraft}
                onChange={(e) => setBowlTypeDraft(e.target.value)}
                disabled={isSaving || !canEditJobDetails}
              >
                <option value="">Auto (from valve type)</option>
                {ITP_BOWL_TYPE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="modal-save-hint-subtle">
                Sets inspection sections on the Traveler inspection checklist. Leave Auto to infer from valve type when possible.
              </p>

              <label className="modal-label" htmlFor="modal-pressure-class">
                Pressure class
              </label>
              <select
                id="modal-pressure-class"
                className="modal-status-select"
                value={pressureClassDraft}
                onChange={(e) => setPressureClassDraft(e.target.value)}
                disabled={isSaving || !canEditJobDetails}
              >
                <option value="">— Select pressure class —</option>
                {allowNaSizeAndClass ? <option value="N/A">N/A</option> : null}
                {pressureClassOptions.map((pc) => (
                  <option key={pc} value={pc}>{pc}</option>
                ))}
              </select>

              <label className="modal-label" htmlFor="modal-body-material">
                Body material
              </label>
              <select
                id="modal-body-material"
                className="modal-status-select"
                value={bodyMaterialDraft}
                onChange={(e) => setBodyMaterialDraft(e.target.value)}
                disabled={isSaving || !canEditJobDetails}
              >
                <option value="">— Select body material —</option>
                {bodyMaterialOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <div className="modal-label">Description</div>
              <textarea
                className="modal-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Job or valve description"
                rows={4}
                disabled={isSaving || !canEditJobDetails}
              />

              <p className="modal-save-hint">
                Status and turnaround are in the header. Use <strong>Save changes</strong> below for job info, description,
                notes, bowl type, and valve type.
              </p>
            </div>
          ) : null}

          {activeTab === 'itp' ? (
            <div className="job-card-tab-pad job-card-itp-tab">
              <div className="job-card-empty-state job-card-empty-state--large">
                <span className="job-card-empty-icon" aria-hidden>
                  ◇
                </span>
                <p>Open the Inspection &amp; Test Plan in full screen to record body, plug, stem, and the rest of the checklist.</p>
                <button type="button" className="button-primary job-card-itp-open" onClick={onOpenItp} disabled={isSaving}>
                  Open ITP ›
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === 'test-log' ? <div className="job-card-tab-pad">{renderTestLogBody()}</div> : null}

          {activeTab === 'photos' ? (
            <div className="job-card-tab-pad">
              <ValveAttachmentsPanel
                valveRowId={valve.id}
                disabled={isSaving || !canEditJobDetails}
                onListChange={onAttachmentsChanged}
              />
            </div>
          ) : null}

          {activeTab === 'outsourced' ? (
            <div className="job-card-tab-pad">
              <ValveOutsourcedItemsPanel
                valveRowId={valve.id}
                disabled={isSaving || !canEditJobDetails}
                onListChange={() => {
                  onOutsourcedChanged?.()
                  void refreshOutsourcedSummary()
                }}
              />
            </div>
          ) : null}

          {activeTab === 'notes' ? (
            <div className="job-card-tab-pad">
              <div className="modal-label">Internal notes</div>
              <textarea
                className="modal-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes, follow-ups, etc."
                rows={12}
                disabled={isSaving || !canEditJobDetails}
              />
              <p className="modal-save-hint-subtle">Saved with the rest of the card when you click Save changes.</p>
            </div>
          ) : null}
        </div>

        <footer className="job-card-footer">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <div className="job-card-footer-right">
            <button type="button" className="button-primary" disabled={isSaving || !canEditJobDetails} onClick={save}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="button-secondary job-card-footer-reprint"
              onClick={reprintJobCard}
              disabled={isSaving}
              title="Reprint production job card"
            >
              Reprint job card
            </button>
            <button type="button" className="button-primary job-card-footer-itp" onClick={onOpenItp} disabled={isSaving}>
              Open ITP ›
            </button>
            <button
              type="button"
              className="button-primary job-card-footer-itp"
              onClick={() => navigate(`/traveler/${encodeURIComponent(travelerValveId)}`)}
              disabled={isSaving || !travelerValveId}
            >
              Open Traveler ›
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
