import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { JobSubStatusSelect, SubStatusBadge } from '../components/JobSubStatusUI'
import { StatusBadge } from '../components/StatusBadge'
import { TechnicianAvatars } from '../components/TechnicianAvatars'
import { ItpEditorModal } from '../components/ItpEditorModal'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { useToast } from '../components/ToastNotification'
import { normalizeJobType } from '../constants/jobTypes'
import { normalizeJobSubStatus, type JobSubStatus } from '../constants/jobSubStatuses'
import {
  DONE_STATUSES,
  IN_SHOP_STATUSES,
  PHASES,
  TERMINAL_STATUSES,
  TESTING_STATUSES,
  WAITING_STATUSES,
} from '../constants/statuses'
import { parseAssignedTechnicianIds } from '../lib/valveTechnicianIds'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { Technician, Valve } from '../types'

type BoardTab = 'kanban' | 'list'
type PhaseKey = (typeof PHASES)[number]['key']
type PhaseOrder = Record<PhaseKey, number[]>
type ScopeFilter = 'all' | 'in-process' | 'on-hold' | 'ready-to-ship' | 'not-arrived'
type TurnaroundFilter = 'all' | 'turnaround' | 'not_turnaround'

function compareValveIdSequential(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function isTurnaroundValve(v: Valve): boolean {
  return v.is_turnaround === true
}

function dueDateLabel(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed
}

function isDueDateOverdue(raw: string | null): boolean {
  const label = dueDateLabel(raw)
  if (!label) return false
  // Compare YYYY-MM-DD strings in local "date only" semantics.
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayIso = `${yyyy}-${mm}-${dd}`
  return label < todayIso
}

function isDueSoon(raw: string | null): boolean {
  const label = dueDateLabel(raw)
  if (!label || isDueDateOverdue(label)) return false
  const due = new Date(`${label}T00:00:00`)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.floor((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays >= 0 && diffDays <= 3
}

const PHASE_DROP_STATUS: Record<PhaseKey, string> = {
  incoming: 'Arrived - Not Started',
  'in-shop': 'Teardown',
  testing: 'Testing',
  waiting: 'Waiting on Parts',
  done: 'Completed',
}

const ORDER_STORAGE_KEY = 'job-board-phase-order-v1'
const EMPTY_ORDER: PhaseOrder = {
  incoming: [],
  'in-shop': [],
  testing: [],
  waiting: [],
  done: [],
}

interface KanbanJobCardProps {
  valve: Valve
  techIds: number[]
  phaseKey: PhaseKey
  priorityIds: Set<string>
  draggedValveId: number | null
  dropCardId: number | null
  attachmentCounts: Record<number, number>
  techniciansById: Map<number, Technician>
  onOpen: (v: Valve) => void
  onSubStatusChange: (v: Valve, next: JobSubStatus) => void | Promise<void>
  onQuickReceive: (v: Valve) => void | Promise<void>
  setDraggedValveId: (id: number | null) => void
  onDragEnd: () => void
  handleCardDragOver: (phaseKey: PhaseKey, targetId: number) => void
  handleCardDrop: (phaseKey: PhaseKey, targetId: number) => void
}

function KanbanJobCard({
  valve,
  techIds,
  phaseKey,
  priorityIds,
  draggedValveId,
  dropCardId,
  attachmentCounts,
  techniciansById,
  onOpen,
  onSubStatusChange,
  onQuickReceive,
  setDraggedValveId,
  onDragEnd,
  handleCardDragOver,
  handleCardDrop,
}: KanbanJobCardProps) {
  const sub = normalizeJobSubStatus(valve.sub_status)
  const assignedName = valve.assigned_technician_id ? techniciansById.get(valve.assigned_technician_id)?.name : null
  const urgencyClass =
    phaseKey === 'done'
      ? ''
      : isDueDateOverdue(valve.due_date)
        ? ' job-card-urgency-overdue'
        : isDueSoon(valve.due_date)
          ? ' job-card-urgency-soon'
          : ''
  return (
    <div
      className={`job-card${urgencyClass} ${priorityIds.has(valve.valve_id) ? 'priority' : ''} ${draggedValveId === valve.id ? 'dragging' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        setDraggedValveId(valve.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault()
        handleCardDragOver(phaseKey, valve.id)
      }}
      onDrop={async (event) => {
        event.preventDefault()
        await handleCardDrop(phaseKey, valve.id)
      }}
      data-drop-target={dropCardId === valve.id ? 'true' : 'false'}
    >
      <div className="job-card-click-area" onClick={() => onOpen(valve)} role="presentation">
        {isTurnaroundValve(valve) ? (
          <div className="job-card-turnaround-flag">Turnaround</div>
        ) : null}
        <div className="job-card-job-type-badge">{normalizeJobType(valve.job_type)}</div>
        <div className="job-id">{valve.valve_id}</div>
        <div className="job-muted truncate">{valve.customer ?? 'Unknown customer'}</div>
        <div className="job-muted small">{valve.cell ?? 'No cell'}</div>
        <div className="job-card-detail">
          <span className="job-card-detail-label">Description</span>
          <span className="job-card-detail-text" title={valve.description ?? ''}>
            {(valve.description ?? '').trim() || '—'}
          </span>
        </div>
        <div className="job-card-detail job-card-detail-notes">
          <span className="job-card-detail-label">Notes</span>
          <span className="job-card-detail-text" title={valve.notes ?? ''}>
            {(valve.notes ?? '').trim() || '—'}
          </span>
        </div>
      {dueDateLabel(valve.due_date) ? (
        <div className="job-card-due-date">
          <span className="job-card-detail-label">Due date</span>
          <span className={isDueDateOverdue(valve.due_date) ? 'due-date-overdue' : 'due-date-ok'}>
            {dueDateLabel(valve.due_date)}
          </span>
          {isDueDateOverdue(valve.due_date) ? <span className="job-card-overdue-badge">Overdue</span> : null}
        </div>
      ) : null}
        {(attachmentCounts[valve.id] ?? 0) > 0 ? (
          <div className="job-card-attachments" title="Attachments & photos">
            <span className="job-card-attachments-icon" aria-hidden>
              📎
            </span>
            <span>{attachmentCounts[valve.id]}</span>
          </div>
        ) : null}
      </div>
      <div
        className="job-card-no-navigate job-card-kanban-footer"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <SubStatusBadge status={sub} />
        <JobSubStatusSelect
          compact
          value={sub}
          onChange={(next) => void onSubStatusChange(valve, next)}
        />
        {phaseKey === 'incoming' && valve.status === 'Not Arrived' ? (
          <button
            type="button"
            className="job-card-quick-action"
            onClick={(e) => {
              e.stopPropagation()
              void onQuickReceive(valve)
            }}
          >
            Receive
          </button>
        ) : null}
        {assignedName ? <span className="job-card-tech-name-chip">{assignedName}</span> : null}
        <TechnicianAvatars ids={techIds} byId={techniciansById} />
      </div>
    </div>
  )
}

export function JobBoardPage() {
  const navigate = useNavigate()
  const { id: routeJobId } = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const isDedicatedDetailRoute = Boolean(routeJobId)
  const initialTab = searchParams.get('view') === 'list' ? 'list' : 'kanban'
  const scopeParam = searchParams.get('scope')
  const statusParam = searchParams.get('status')
  const cellParam = searchParams.get('cell')
  const initialScope: ScopeFilter =
    scopeParam === 'in-process' ||
    scopeParam === 'on-hold' ||
    scopeParam === 'ready-to-ship' ||
    scopeParam === 'not-arrived'
      ? scopeParam
      : 'all'

  const [tab, setTab] = useState<BoardTab>(initialTab)
  const [valves, setValves] = useState<Valve[]>([])
  const [priorityIds, setPriorityIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [activeValve, setActiveValve] = useState<Valve | null>(null)
  const [itpValve, setItpValve] = useState<Valve | null>(null)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [attachmentCounts, setAttachmentCounts] = useState<Record<number, number>>({})
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(statusParam ? statusParam : 'All')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(initialScope)
  const [cellFilter, setCellFilter] = useState(cellParam ? cellParam : 'all')
  const [turnaroundFilter, setTurnaroundFilter] = useState<TurnaroundFilter>('all')
  const [draggedValveId, setDraggedValveId] = useState<number | null>(null)
  const [dropPhase, setDropPhase] = useState<PhaseKey | null>(null)
  const [dropCardId, setDropCardId] = useState<number | null>(null)
  const lastHoverKeyRef = useRef<string>('')
  const dragFrameRef = useRef<number | null>(null)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [jobTechnicianIdsByValve, setJobTechnicianIdsByValve] = useState<Record<number, number[]>>({})
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [phaseOrder, setPhaseOrder] = useState<PhaseOrder>(() => {
    try {
      const stored = window.localStorage.getItem(ORDER_STORAGE_KEY)
      if (!stored) return EMPTY_ORDER
      const parsed = JSON.parse(stored) as Partial<PhaseOrder>
      return {
        incoming: Array.isArray(parsed.incoming) ? parsed.incoming : [],
        'in-shop': Array.isArray(parsed['in-shop']) ? parsed['in-shop'] : [],
        testing: Array.isArray(parsed.testing) ? parsed.testing : [],
        waiting: Array.isArray(parsed.waiting) ? parsed.waiting : [],
        done: Array.isArray(parsed.done) ? parsed.done : [],
      }
    } catch {
      return EMPTY_ORDER
    }
  })
  const { showToast } = useToast()

  const techniciansById = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians])
  const activeTechnicians = useMemo(() => technicians.filter((t) => t.active), [technicians])
  const compareValvesForDisplay = useCallback(
    (a: Valve, b: Valve) => {
      const aPriority = priorityIds.has(a.valve_id) ? 1 : 0
      const bPriority = priorityIds.has(b.valve_id) ? 1 : 0
      if (aPriority !== bPriority) return bPriority - aPriority
      return compareValveIdSequential(a.valve_id, b.valve_id)
    },
    [priorityIds],
  )
  const technicianIdsForValve = useCallback(
    (valve: Valve) => jobTechnicianIdsByValve[valve.id] ?? parseAssignedTechnicianIds(valve.assigned_technician_ids),
    [jobTechnicianIdsByValve],
  )

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

  const loadAttachmentCounts = useCallback(async () => {
    const { data, error } = await supabase.from('valve_attachments').select('valve_row_id')
    if (error || !data) return
    const next: Record<number, number> = {}
    for (const r of data as { valve_row_id: number }[]) {
      next[r.valve_row_id] = (next[r.valve_row_id] ?? 0) + 1
    }
    setAttachmentCounts(next)
  }, [])

  const loadJobTechnicianAssignments = useCallback(async () => {
    const { data, error } = await supabase.from('job_technicians').select('valve_row_id,technician_id')
    if (error) return
    const map: Record<number, number[]> = {}
    for (const row of (data ?? []) as { valve_row_id: number; technician_id: number }[]) {
      if (!map[row.valve_row_id]) map[row.valve_row_id] = []
      map[row.valve_row_id].push(row.technician_id)
    }
    setJobTechnicianIdsByValve(map)
  }, [])

  const fetchValves = async () => {
    const { data, error } = await supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .order('id', { ascending: false })

    if (error) {
      showToast(`Could not load valves: ${error.message}`)
    } else if (data) {
      setValves(data as Valve[])
    }
    setLoading(false)
    void loadAttachmentCounts()
  }

  const fetchPriority = async () => {
    const { data, error } = await supabase.from('priority_queue').select('valve_id')
    if (error || !data) return
    setPriorityIds(new Set(data.map((item: { valve_id: string }) => item.valve_id)))
  }

  useEffect(() => {
    fetchValves()
    fetchPriority()
    void loadJobTechnicianAssignments()

    const interval = window.setInterval(fetchValves, 30000)
    return () => window.clearInterval(interval)
  }, [loadJobTechnicianAssignments])

  const openParam = searchParams.get('open')
  const requestedOpenId = routeJobId ?? openParam

  useEffect(() => {
    if (loading) return
    if (!requestedOpenId) return
    const id = Number.parseInt(requestedOpenId, 10)
    if (!Number.isFinite(id)) {
      if (isDedicatedDetailRoute) {
        navigate('/job-board', { replace: true })
      } else {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('open')
            return next
          },
          { replace: true },
        )
      }
      return
    }
    const v = valves.find((x) => x.id === id)
    if (!v) {
      if (valves.length > 0) {
        if (isDedicatedDetailRoute) {
          navigate('/job-board', { replace: true })
        } else {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.delete('open')
              return next
            },
            { replace: true },
          )
        }
      }
      return
    }
    if (activeValve?.id === v.id) return
    setActiveValve(v)
    setSelectedStatus(v.status)
  }, [loading, requestedOpenId, valves, setSearchParams, activeValve?.id, isDedicatedDetailRoute, navigate])

  useEffect(() => {
    const channel = supabase
      .channel('job-board-valves')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'valves' },
        async (payload) => {
          const row = payload.new as { id: number } | null
          if (!row?.id) return
          const { data } = await supabase.from('valves').select(VALVE_LIST_SELECT).eq('id', row.id).single()

          if (!data) return
          setValves((prev) => {
            const existing = prev.some((v) => v.id === data.id)
            if (!existing) return [data as Valve, ...prev]
            return prev.map((v) => (v.id === data.id ? (data as Valve) : v))
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'valves' },
        async (payload) => {
          const row = payload.new as { id: number } | null
          if (!row?.id) return
          const { data } = await supabase.from('valves').select(VALVE_LIST_SELECT).eq('id', row.id).single()
          if (!data) return
          setValves((prev) => [data as Valve, ...prev.filter((v) => v.id !== data.id)])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const doneLimited = useMemo(() => {
    return valves
      .filter((v) => DONE_STATUSES.has(v.status))
      .sort((a, b) => {
        const ad = a.date_closed ? new Date(a.date_closed).getTime() : 0
        const bd = b.date_closed ? new Date(b.date_closed).getTime() : 0
        return bd - ad
      })
      .slice(0, 20)
  }, [valves])

  const activeNonTerminal = useMemo(
    () => valves.filter((v) => !TERMINAL_STATUSES.has(v.status)),
    [valves],
  )

  const availableCells = useMemo(() => {
    return [...new Set(activeNonTerminal.map((v) => v.cell).filter((c): c is string => Boolean(c && c.trim())))]
      .sort((a, b) => a.localeCompare(b))
  }, [activeNonTerminal])

  const tableRows = useMemo(() => {
    return activeNonTerminal.filter((v) => {
      const matchesScope =
        scopeFilter === 'all' ||
        (scopeFilter === 'in-process' && (IN_SHOP_STATUSES.has(v.status) || TESTING_STATUSES.has(v.status))) ||
        (scopeFilter === 'on-hold' && WAITING_STATUSES.has(v.status)) ||
        (scopeFilter === 'ready-to-ship' && v.status === 'Warehouse RTS') ||
        (scopeFilter === 'not-arrived' && v.status === 'Not Arrived')
      const text = searchText.trim().toLowerCase()
      const matchesText =
        !text ||
        v.valve_id.toLowerCase().includes(text) ||
        (v.customer ?? '').toLowerCase().includes(text) ||
        (v.description ?? '').toLowerCase().includes(text) ||
        (v.notes ?? '').toLowerCase().includes(text)
      const matchesStatus = statusFilter === 'All' || v.status === statusFilter
      const matchesCell = cellFilter === 'all' || (v.cell ?? '') === cellFilter
      const matchesTurnaround =
        turnaroundFilter === 'all' ||
        (turnaroundFilter === 'turnaround' && isTurnaroundValve(v)) ||
        (turnaroundFilter === 'not_turnaround' && !isTurnaroundValve(v))
      const matchesTechnician =
        technicianFilter === 'all' || technicianIdsForValve(v).includes(Number.parseInt(technicianFilter, 10))
      return matchesScope && matchesText && matchesStatus && matchesCell && matchesTurnaround && matchesTechnician
    }).sort(compareValvesForDisplay)
  }, [activeNonTerminal, scopeFilter, searchText, statusFilter, cellFilter, turnaroundFilter, technicianFilter, technicianIdsForValve, compareValvesForDisplay])

  const openModal = (valve: Valve) => {
    setActiveValve(valve)
    setSelectedStatus(valve.status)
  }

  const updateSubStatusFromKanban = async (valve: Valve, next: JobSubStatus) => {
    const prev = normalizeJobSubStatus(valve.sub_status)
    if (prev === next) return
    setValves((p) => p.map((v) => (v.id === valve.id ? { ...v, sub_status: next } : v)))
    const { error } = await supabase.from('valves').update({ sub_status: next }).eq('id', valve.id)
    if (error) {
      setValves((p) => p.map((v) => (v.id === valve.id ? { ...v, sub_status: prev } : v)))
      showToast(`Could not update sub-status: ${error.message}`)
      return
    }
    showToast('Sub-status updated')
  }

  const closeModal = useCallback(() => {
    setActiveValve(null)
    setSelectedStatus('')
    setIsSaving(false)
    if (isDedicatedDetailRoute) {
      navigate('/job-board', { replace: true })
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('open')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams, isDedicatedDetailRoute, navigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (itpValve) {
        setItpValve(null)
        return
      }
      if (activeValve) closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [itpValve, activeValve, closeModal])

  const saveModalChanges = async (
    description: string,
    notes: string,
    bowlType: string | null,
    valveType: string | null,
    isTurnaround: boolean,
    subStatus: JobSubStatus,
    assignedTechnicianId: number | null,
  ) => {
    if (!activeValve || !selectedStatus) return
    const today = new Date().toISOString().slice(0, 10)
    const patch: Partial<Valve> = {
      description: description.trim() || null,
      notes: notes.trim() || null,
      bowl_type: bowlType?.trim() || null,
      valve_type: valveType?.trim() || null,
      is_turnaround: isTurnaround,
      sub_status: subStatus,
      assigned_technician_id: assignedTechnicianId,
    }
    if (selectedStatus !== activeValve.status) {
      patch.status = selectedStatus
      if (selectedStatus === 'Testing') patch.date_tested = today
      if (selectedStatus === 'Completed' || selectedStatus === 'Warehouse RTS') patch.date_closed = today
    }

    setIsSaving(true)
    const { error } = await supabase.from('valves').update(patch).eq('id', activeValve.id)
    setIsSaving(false)
    if (error) {
      showToast(`Could not save changes: ${error.message}`)
      return
    }
    setValves((prev) => prev.map((v) => (v.id === activeValve.id ? { ...v, ...patch } : v)))
    setActiveValve((prev) => (prev && prev.id === activeValve.id ? { ...prev, ...patch } : prev))
    showToast('Saved')
  }

  const togglePriority = async (valve: Valve) => {
    const currentlyPriority = priorityIds.has(valve.valve_id)
    if (currentlyPriority) {
      const { error } = await supabase.from('priority_queue').delete().eq('valve_id', valve.valve_id)
      if (error) {
        showToast(`Could not remove ${valve.valve_id} from priority`)
        return
      }
      setPriorityIds((prev) => {
        const next = new Set(prev)
        next.delete(valve.valve_id)
        return next
      })
      showToast(`${valve.valve_id} removed from priority`)
      return
    }

    const { error } = await supabase.from('priority_queue').insert({ valve_id: valve.valve_id })
    if (error) {
      showToast(`Could not add ${valve.valve_id} to priority`)
      return
    }
    setPriorityIds((prev) => new Set(prev).add(valve.valve_id))
    showToast(`${valve.valve_id} added to priority`)
  }

  const isValveInPhase = (valve: Valve, phaseKey: PhaseKey) => {
    if (phaseKey === 'done') return DONE_STATUSES.has(valve.status)
    const phase = PHASES.find((item) => item.key === phaseKey)
    return phase ? phase.statuses.has(valve.status) : false
  }

  const itemsForPhase = (phaseKey: PhaseKey) => {
    const base =
      phaseKey === 'done'
        ? doneLimited
        : activeNonTerminal.filter((valve) => isValveInPhase(valve, phaseKey))
    return [...base].sort(compareValvesForDisplay)
  }

  const placeInPhaseOrder = (phaseKey: PhaseKey, draggedId: number, targetId: number | null) => {
    const orderedIds = itemsForPhase(phaseKey).map((item) => item.id)
    if (!orderedIds.includes(draggedId)) return
    const withoutDragged = orderedIds.filter((id) => id !== draggedId)
    const targetIndex = targetId == null ? withoutDragged.length : withoutDragged.indexOf(targetId)
    const insertAt = targetIndex < 0 ? withoutDragged.length : targetIndex
    const currentIndex = orderedIds.indexOf(draggedId)
    const normalizedCurrentIndex = currentIndex > insertAt ? currentIndex : currentIndex - 1
    if (normalizedCurrentIndex === insertAt) return
    withoutDragged.splice(insertAt, 0, draggedId)

    setPhaseOrder((prev) => ({ ...prev, [phaseKey]: withoutDragged }))
  }

  const moveValveToStatus = async (valve: Valve, nextStatus: string) => {
    if (!nextStatus || valve.status === nextStatus) return
    const today = new Date().toISOString().slice(0, 10)
    const previous = { ...valve }
    const patch: Partial<Valve> = { status: nextStatus }
    if (nextStatus === 'Testing') patch.date_tested = today
    if (nextStatus === 'Completed' || nextStatus === 'Warehouse RTS') patch.date_closed = today

    setValves((prev) => prev.map((v) => (v.id === valve.id ? { ...v, ...patch } : v)))
    const { error } = await supabase.from('valves').update(patch).eq('id', valve.id)

    if (error) {
      setValves((prev) => prev.map((v) => (v.id === previous.id ? previous : v)))
      showToast(`Could not move ${valve.valve_id}: ${error.message}`)
      return
    }

    showToast(`${valve.valve_id} moved to ${nextStatus}`)
  }

  const quickMarkArrived = async (valve: Valve) => {
    if (valve.status !== 'Not Arrived') return
    await moveValveToStatus(valve, 'Arrived - Not Started')
  }

  const handleDrop = async (phaseKey: PhaseKey) => {
    const id = draggedValveId
    setDropPhase(null)
    setDropCardId(null)
    setDraggedValveId(null)
    if (!id) return

    const valve = valves.find((v) => v.id === id)
    if (!valve || isValveInPhase(valve, phaseKey)) return

    await moveValveToStatus(valve, PHASE_DROP_STATUS[phaseKey])
    placeInPhaseOrder(phaseKey, id, null)
  }

  const handleCardDrop = async (phaseKey: PhaseKey, targetId: number) => {
    const id = draggedValveId
    setDropPhase(null)
    setDropCardId(null)
    setDraggedValveId(null)
    if (!id) return

    const valve = valves.find((v) => v.id === id)
    if (!valve) return

    if (isValveInPhase(valve, phaseKey)) {
      placeInPhaseOrder(phaseKey, id, targetId)
      return
    }

    await moveValveToStatus(valve, PHASE_DROP_STATUS[phaseKey])
    placeInPhaseOrder(phaseKey, id, targetId)
  }

  useEffect(() => {
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(phaseOrder))
  }, [phaseOrder])

  useEffect(() => {
    const idsByPhase: Record<PhaseKey, Set<number>> = {
      incoming: new Set(itemsForPhase('incoming').map((item) => item.id)),
      'in-shop': new Set(itemsForPhase('in-shop').map((item) => item.id)),
      testing: new Set(itemsForPhase('testing').map((item) => item.id)),
      waiting: new Set(itemsForPhase('waiting').map((item) => item.id)),
      done: new Set(itemsForPhase('done').map((item) => item.id)),
    }

    setPhaseOrder((prev) => {
      const next: PhaseOrder = {
        incoming: prev.incoming.filter((id) => idsByPhase.incoming.has(id)),
        'in-shop': prev['in-shop'].filter((id) => idsByPhase['in-shop'].has(id)),
        testing: prev.testing.filter((id) => idsByPhase.testing.has(id)),
        waiting: prev.waiting.filter((id) => idsByPhase.waiting.has(id)),
        done: prev.done.filter((id) => idsByPhase.done.has(id)),
      }

      let changed = false
      ;(Object.keys(next) as PhaseKey[]).forEach((key) => {
        if (next[key].length !== prev[key].length) changed = true
      })
      return changed ? next : prev
    })
  }, [valves, activeNonTerminal, doneLimited])

  useEffect(() => {
    return () => {
      if (dragFrameRef.current != null) {
        window.cancelAnimationFrame(dragFrameRef.current)
      }
    }
  }, [])

  const handleCardDragOver = (phaseKey: PhaseKey, targetId: number) => {
    if (!draggedValveId) return
    const hoverKey = `${phaseKey}:${targetId}:${draggedValveId}`
    if (lastHoverKeyRef.current === hoverKey) return
    lastHoverKeyRef.current = hoverKey

    if (dragFrameRef.current != null) {
      window.cancelAnimationFrame(dragFrameRef.current)
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      setDropPhase((prev) => (prev === phaseKey ? prev : phaseKey))
      setDropCardId((prev) => (prev === targetId ? prev : targetId))
      const valve = valves.find((v) => v.id === draggedValveId)
      if (!valve) return
      if (isValveInPhase(valve, phaseKey)) {
        placeInPhaseOrder(phaseKey, draggedValveId, targetId)
      }
    })
  }

  return (
    <section className="job-board-page">
      {!isDedicatedDetailRoute ? (
        <div className="page-header">
          <h2>Job Board</h2>
          <div className="tabs">
            <button className={`tab ${tab === 'kanban' ? 'active' : ''}`} onClick={() => setTab('kanban')}>
              Kanban board
            </button>
            <button className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
              List view
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <div className="loading">Loading valves...</div> : null}

      {!isDedicatedDetailRoute && tab === 'kanban' ? (
        <div className="kanban-grid">
          {PHASES.map((phase) => {
            const items = itemsForPhase(phase.key)
            return (
              <div key={phase.key} className="kanban-column">
                <div className={`phase-header ${phase.className}`}>
                  <span>{phase.title}</span>
                  <span className="count-badge">{items.length}</span>
                </div>
                <div
                  className={`column-cards ${dropPhase === phase.key ? 'drop-target' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropPhase(phase.key)
                  }}
                  onDragLeave={() => {
                    if (dropPhase === phase.key) setDropPhase(null)
                  }}
                  onDrop={async (event) => {
                    event.preventDefault()
                    await handleDrop(phase.key)
                  }}
                >
                  {(() => {
                    const onDragEnd = () => {
                      if (dragFrameRef.current != null) {
                        window.cancelAnimationFrame(dragFrameRef.current)
                        dragFrameRef.current = null
                      }
                      lastHoverKeyRef.current = ''
                      setDraggedValveId(null)
                      setDropPhase(null)
                      setDropCardId(null)
                    }
                    const cardProps = (valve: Valve) => ({
                      valve,
                      techIds: technicianIdsForValve(valve),
                      phaseKey: phase.key,
                      priorityIds,
                      draggedValveId,
                      dropCardId,
                      attachmentCounts,
                      techniciansById,
                      onOpen: openModal,
                      onSubStatusChange: updateSubStatusFromKanban,
                      onQuickReceive: quickMarkArrived,
                      setDraggedValveId,
                      onDragEnd,
                      handleCardDragOver,
                      handleCardDrop,
                    })
                    return (
                      <>
                        {items.map((valve) => (
                          <KanbanJobCard key={valve.id} {...cardProps(valve)} />
                        ))}
                      </>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      ) : !isDedicatedDetailRoute ? (
        <div className="list-view">
          <div className="filters">
            <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}>
              <option value="all">All work</option>
              <option value="in-process">In process</option>
              <option value="on-hold">On hold</option>
              <option value="ready-to-ship">Ready to ship</option>
              <option value="not-arrived">Not arrived</option>
            </select>
            <input
              type="text"
              placeholder="Search valve, customer, description, or notes"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All statuses</option>
              {[...new Set(activeNonTerminal.map((v) => v.status))].map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
            <select value={cellFilter} onChange={(e) => setCellFilter(e.target.value)}>
              <option value="all">All cells</option>
              {availableCells.map((cell) => (
                <option value={cell} key={cell}>
                  {cell}
                </option>
              ))}
            </select>
            <select
              value={turnaroundFilter}
              onChange={(e) => setTurnaroundFilter(e.target.value as TurnaroundFilter)}
              aria-label="Filter by turnaround"
            >
              <option value="all">All jobs</option>
              <option value="turnaround">Turnarounds only</option>
              <option value="not_turnaround">Exclude turnarounds</option>
            </select>
            <select value={technicianFilter} onChange={(e) => setTechnicianFilter(e.target.value)}>
              <option value="all">All technicians</option>
              {activeTechnicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Valve ID</th>
                  <th>Customer</th>
                  <th>Cell</th>
                  <th>Size</th>
                  <th>Turnaround</th>
                  <th>Status</th>
                  <th>Sub-status</th>
                  <th>Techs</th>
                  <th>Due Date</th>
                  <th>Description</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((valve) => (
                  <tr key={valve.id} onClick={() => openModal(valve)}>
                    <td>{valve.valve_id}</td>
                    <td>{valve.customer ?? '-'}</td>
                    <td>{valve.cell ?? '-'}</td>
                    <td>{valve.size ?? '-'}</td>
                    <td>{isTurnaroundValve(valve) ? 'Yes' : '—'}</td>
                    <td>
                      <StatusBadge status={valve.status} />
                    </td>
                    <td>
                      <SubStatusBadge status={normalizeJobSubStatus(valve.sub_status)} />
                    </td>
                    <td>
                      {technicianIdsForValve(valve).length > 0 ? (
                        <TechnicianAvatars ids={technicianIdsForValve(valve)} byId={techniciansById} />
                      ) : (
                        <span className="job-muted">—</span>
                      )}
                    </td>
                    <td>
                      {dueDateLabel(valve.due_date) ? (
                        <span className={isDueDateOverdue(valve.due_date) ? 'due-date-overdue' : 'due-date-ok'}>
                          {dueDateLabel(valve.due_date)}
                          {isDueDateOverdue(valve.due_date) ? ' (Overdue)' : ''}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="table-cell-clamp">{valve.description ?? '-'}</td>
                    <td className="table-cell-clamp">{valve.notes ?? '-'}</td>
                    <td>
                      {valve.status === 'Not Arrived' ? (
                        <button
                          type="button"
                          className="job-list-quick-action"
                          onClick={(e) => {
                            e.stopPropagation()
                            void quickMarkArrived(valve)
                          }}
                        >
                          Mark arrived
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeValve ? (
        <StatusChangeModal
          valve={activeValve}
          selectedStatus={selectedStatus}
          onSelectStatus={setSelectedStatus}
          isPriority={priorityIds.has(activeValve.valve_id)}
          onTogglePriority={() => void togglePriority(activeValve)}
          onCancel={closeModal}
          isSaving={isSaving}
          onSaveAll={saveModalChanges}
          assignedTechnicianIds={technicianIdsForValve(activeValve)}
          assignedTechnicianId={activeValve.assigned_technician_id ?? null}
          onAssignmentsChanged={loadJobTechnicianAssignments}
          onAttachmentsChanged={loadAttachmentCounts}
          onOpenItp={() => setItpValve(activeValve)}
          onOpenFullPage={() => navigate(`/jobs/${activeValve.id}`)}
          forceMaximized={isDedicatedDetailRoute}
        />
      ) : null}

      {itpValve ? <ItpEditorModal valve={itpValve} onClose={() => setItpValve(null)} /> : null}
    </section>
  )
}
