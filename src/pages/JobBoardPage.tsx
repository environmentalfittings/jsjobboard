import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CopyJobModal } from '../components/CopyJobModal'
import { DueDateChangeModal } from '../components/DueDateChangeModal'
import { StatusBadge } from '../components/StatusBadge'
import { FinishCellBadge } from '../components/FinishCellBadge'
import { TechnicianAvatars } from '../components/TechnicianAvatars'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { useToast } from '../components/ToastNotification'
import { normalizeJobType } from '../constants/jobTypes'
import { ColumnFilterCombobox } from '../components/ColumnFilterCombobox'
import { ColumnFilterStatusChecklist } from '../components/ColumnFilterStatusChecklist'
import { WorkOrderFilterBar } from '../components/WorkOrderFilterBar'
import {
  DONE_STATUSES,
  PHASES,
  STATUS_ORDER,
} from '../constants/statuses'
import { parseAssignedTechnicianIds } from '../lib/valveTechnicianIds'
import { fetchAllValves } from '../lib/fetchAllValves'
import { displayJobStatus, isActiveOrderType, isActiveShopWork, isClosedWorkOrder } from '../lib/jobDisplayStatus'
import { valveStatusPatch } from '../lib/valveStatusPatch'
import {
  compareValvesBySort,
  valveMatchesDescriptionSearch,
  valveMatchesWorkOrderFilter,
  type ValveListSort,
} from '../lib/valveWorkOrderSearch'
import {
  compareValvesByListColumn,
  emptyColumnFilters,
  LIST_FILTER_COLUMNS,
  valveMatchesAllColumnFilters,
  type ListColumnKey,
  type ListColumnContext,
  type ListSortState,
  type ColumnFilterState,
} from '../lib/jobBoardListColumns'
import { recordDueDateChange, resolveChangedByName } from '../lib/dueDateChanges'
import { isEligiblePriorityValve, syncPriorityQueueWithValves, compareValvesWithPriorityOrder, persistPriorityQueueOrder, reorderPriorityQueueIds } from '../lib/priorityQueue'
import { supabase } from '../lib/supabase'
import type { JobCardSaveFields } from '../lib/jobCardSave'
import { can, canWriteShop, permissionDeniedReason } from '../lib/roles'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { Technician, Valve } from '../types'
import type { UserRole } from './LoginPage'

type BoardTab = 'kanban' | 'list'
type PhaseKey = (typeof PHASES)[number]['key']
type PhaseOrder = Record<PhaseKey, number[]>
type ScopeFilter =
  | 'all'
  | 'in-process'
  | 'on-hold'
  | 'waiting-on-arrival'
  | 'on-order'
  | 'closed'
  | 'ready-to-ship'
  | 'not-arrived'

function isTurnaroundValve(v: Valve): boolean {
  return v.is_turnaround === true
}

function dueDateLabel(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed
}

function formatShortDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [, month, day] = value.split('-')
  return `${month}/${day}`
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

const ORDER_STORAGE_KEY = 'job-board-phase-order-v1'
const LIST_REST_ORDER_STORAGE_KEY = 'job-board-list-rest-order-v1'

function readStoredListRestOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LIST_REST_ORDER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((id) => String(id)).filter(Boolean)
  } catch {
    return []
  }
}

function reorderListIds(order: readonly string[], valveId: string, direction: 'up' | 'down'): string[] | null {
  const index = order.indexOf(valveId)
  if (index < 0) return null
  if (direction === 'up') {
    if (index === 0) return null
    const next = [...order]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    return next
  }
  if (index >= order.length - 1) return null
  const next = [...order]
  ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
  return next
}

/** Merge a reordered visible subset back into the full persisted rest order. */
function applyVisibleRestReorder(
  fullOrder: readonly string[],
  visibleOrdered: readonly string[],
  nextVisibleOrdered: readonly string[],
): string[] {
  if (visibleOrdered.length !== nextVisibleOrdered.length) return [...fullOrder]
  const visibleSet = new Set(visibleOrdered)
  const queue = [...nextVisibleOrdered]
  const next = fullOrder.map((id) => (visibleSet.has(id) ? queue.shift()! : id))
  for (const id of queue) {
    if (!next.includes(id)) next.push(id)
  }
  return next
}

function sortValvesWithPriorityAndRest(
  items: Valve[],
  priorityQueueIds: readonly string[],
  restOrder: readonly string[],
): Valve[] {
  const prioritySet = new Set(priorityQueueIds)
  const priorityRows = items
    .filter((row) => prioritySet.has(row.valve_id))
    .sort((a, b) => compareValvesWithPriorityOrder(a, b, priorityQueueIds))
  const restRows = items.filter((row) => !prioritySet.has(row.valve_id))
  const restRank = new Map(restOrder.map((id, index) => [id, index]))
  restRows.sort((a, b) => {
    const aRank = restRank.get(a.valve_id)
    const bRank = restRank.get(b.valve_id)
    if (aRank != null && bRank != null) return aRank - bRank
    if (aRank != null) return -1
    if (bRank != null) return 1
    return compareValvesWithPriorityOrder(a, b, priorityQueueIds)
  })
  return [...priorityRows, ...restRows]
}
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
  attachmentCounts: Record<number, number>
  techniciansById: Map<number, Technician>
  onOpen: (v: Valve) => void
  onStatusChange: (v: Valve, nextStatus: string) => void | Promise<void>
  onEditDueDate: (v: Valve) => void
  onQuickReceive: (v: Valve) => void | Promise<void>
  canMoveToTop: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveToTop: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canCopy?: boolean
  onCopy?: (v: Valve) => void
  canWrite?: boolean
}

function KanbanJobCard({
  valve,
  techIds,
  phaseKey,
  priorityIds,
  attachmentCounts,
  techniciansById,
  onOpen,
  onStatusChange,
  onEditDueDate,
  onQuickReceive,
  canMoveToTop,
  canMoveUp,
  canMoveDown,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  canCopy = false,
  onCopy,
  canWrite = true,
}: KanbanJobCardProps) {
  const assignedName = valve.assigned_technician_id ? techniciansById.get(valve.assigned_technician_id)?.name : null
  const urgencyClass =
    phaseKey === 'done'
      ? ''
      : isDueDateOverdue(valve.due_date)
        ? ' job-card-urgency-overdue'
        : isDueSoon(valve.due_date)
          ? ' job-card-urgency-soon'
          : ''
  const isInTesting = valve.status === 'Testing'
  const testedDateLabel = formatShortDate(valve.date_tested)
  const showTestedBadge = Boolean(testedDateLabel) && !isInTesting
  return (
    <div
      className={`job-card${urgencyClass}${isInTesting ? ' job-card-in-testing' : ''}${showTestedBadge ? ' job-card-was-tested' : ''} ${priorityIds.has(valve.valve_id) ? 'priority' : ''}`}
    >
      <div className="job-card-reorder-bar" onMouseDown={(e) => e.stopPropagation()}>
        <div className="job-card-reorder-buttons">
          <button
            type="button"
            className="job-card-reorder-btn job-card-reorder-btn--top"
            disabled={!canMoveToTop}
            title="Move to top"
            aria-label={`Move ${valve.valve_id} to top of column`}
            onClick={onMoveToTop}
          >
            ⇈
          </button>
          <button
            type="button"
            className="job-card-reorder-btn"
            disabled={!canMoveUp}
            title="Move up"
            aria-label={`Move ${valve.valve_id} up`}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            className="job-card-reorder-btn"
            disabled={!canMoveDown}
            title="Move down"
            aria-label={`Move ${valve.valve_id} down`}
            onClick={onMoveDown}
          >
            ↓
          </button>
          {canCopy && onCopy ? (
            <button
              type="button"
              className="job-card-reorder-btn job-card-copy-btn"
              title="Copy job card"
              aria-label={`Copy ${valve.valve_id}`}
              onClick={(e) => {
                e.stopPropagation()
                onCopy(valve)
              }}
            >
              ⧉
            </button>
          ) : null}
        </div>
      </div>
      <div className="job-card-click-area" onClick={() => onOpen(valve)} role="presentation">
        {isTurnaroundValve(valve) ? (
          <div className="job-card-turnaround-flag">Turnaround</div>
        ) : null}
        {valve.needs_failure_analysis === true ? (
          <div className="job-card-failure-analysis-flag">Failure analysis</div>
        ) : null}
        <div className="job-card-job-type-badge">{normalizeJobType(valve.job_type)}</div>
        {isInTesting || showTestedBadge ? (
          <div className="job-card-test-flags">
            {isInTesting ? (
              <span className="job-card-testing-badge" title="Currently in the test area">
                In testing
                {testedDateLabel ? ` · ${testedDateLabel}` : ''}
              </span>
            ) : null}
            {showTestedBadge ? (
              <span className="job-card-tested-badge" title={`Shop date tested: ${valve.date_tested}`}>
                Tested {testedDateLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="job-id">{valve.valve_id}</div>
        <div className="job-muted truncate">{valve.customer ?? 'Unknown customer'}</div>
        <div className="job-muted small"><FinishCellBadge cell={valve.cell} /></div>
        <div className="job-muted small">
          {(() => {
            const rawSize = (valve.size ?? '').trim()
            const sizeToken = rawSize ? rawSize.replace(/"/g, '').trim() : '—'
            const cls = (valve.pressure_class ?? '').trim()
            return cls ? `${sizeToken} in ${cls}` : `${sizeToken} in —`
          })()}
        </div>
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
      <div className={`job-card-due-date${canWrite ? ' job-card-due-date--editable' : ''}`}>
        <span className="job-card-detail-label">Due date</span>
        {canWrite ? (
          <button
            type="button"
            className="job-card-due-date-button"
            onClick={(e) => {
              e.stopPropagation()
              onEditDueDate(valve)
            }}
          >
            {dueDateLabel(valve.due_date) ? (
              <span className={isDueDateOverdue(valve.due_date) ? 'due-date-overdue' : 'due-date-ok'}>
                {dueDateLabel(valve.due_date)}
              </span>
            ) : (
              <span className="job-card-due-date-empty">Set due date</span>
            )}
          </button>
        ) : (
          <span className={isDueDateOverdue(valve.due_date) ? 'due-date-overdue' : 'due-date-ok'}>
            {dueDateLabel(valve.due_date) || '—'}
          </span>
        )}
        {dueDateLabel(valve.due_date) && isDueDateOverdue(valve.due_date) ? (
          <span className="job-card-overdue-badge">Overdue</span>
        ) : null}
      </div>
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
        <label className="job-card-status-label">
          <span className="job-card-detail-label">Status</span>
          <select
            className="job-sub-status-select job-sub-status-select--compact job-card-kanban-status-select"
            value={valve.status}
            disabled={!canWrite}
            title={canWrite ? undefined : 'View only — ask an Admin or Manager to make changes'}
            onChange={(e) => void onStatusChange(valve, e.target.value)}
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        {canWrite && phaseKey === 'incoming' && valve.status === 'Not Arrived' ? (
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

export function JobBoardPage({ role, username }: { role?: UserRole; username?: string }) {
  const navigate = useNavigate()
  const { id: routeJobId } = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const isDedicatedDetailRoute = Boolean(routeJobId)
  const initialTab = searchParams.get('view') === 'list' ? 'list' : 'kanban'
  const scopeParam = searchParams.get('scope')
  const initialScope: ScopeFilter =
    scopeParam === 'in-process' ||
    scopeParam === 'on-hold' ||
    scopeParam === 'waiting-on-arrival' ||
    scopeParam === 'on-order' ||
    scopeParam === 'closed' ||
    scopeParam === 'ready-to-ship' ||
    scopeParam === 'not-arrived'
      ? scopeParam
      : 'all'

  const [tab, setTab] = useState<BoardTab>(initialTab)
  const [valves, setValves] = useState<Valve[]>([])
  const [priorityQueueIds, setPriorityQueueIds] = useState<string[]>([])
  const priorityIds = useMemo(() => new Set(priorityQueueIds), [priorityQueueIds])
  const [loading, setLoading] = useState(true)
  const [activeValve, setActiveValve] = useState<Valve | null>(null)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [attachmentCounts, setAttachmentCounts] = useState<Record<number, number>>({})
  const [workOrderQuery, setWorkOrderQuery] = useState('')
  const [descriptionQuery, setDescriptionQuery] = useState('')
  const [selectedWorkOrder, setSelectedWorkOrder] = useState('')
  const [listSort, setListSort] = useState<ValveListSort>('default')
  const [columnFilters, setColumnFilters] = useState(() => {
    const filters = emptyColumnFilters()
    const cell = searchParams.get('cell')?.trim()
    if (cell) filters.cell = { query: cell, selected: cell }
    return filters
  })
  const [listColumnSort, setListColumnSort] = useState<ListSortState>({ column: 'default', direction: 'asc' })
  const [listRestOrder, setListRestOrder] = useState<string[]>(() => readStoredListRestOrder())
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(initialScope)
  const viewingCompletedValves = scopeFilter === 'closed'
  const canCopyJobs = can(role, 'copyJob')
  const canWrite = canWriteShop(role)
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [jobTechnicianIdsByValve, setJobTechnicianIdsByValve] = useState<Record<number, number[]>>({})
  const [dueDateEditValve, setDueDateEditValve] = useState<Valve | null>(null)
  const [copySourceValve, setCopySourceValve] = useState<Valve | null>(null)
  const [savingDueDate, setSavingDueDate] = useState(false)
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
  const compareValvesForDisplay = useCallback(
    (a: Valve, b: Valve) => compareValvesWithPriorityOrder(a, b, priorityQueueIds),
    [priorityQueueIds],
  )
  const technicianIdsForValve = useCallback(
    (valve: Valve) => jobTechnicianIdsByValve[valve.id] ?? parseAssignedTechnicianIds(valve.assigned_technician_ids),
    [jobTechnicianIdsByValve],
  )
  const technicianLabelForValve = useCallback(
    (valve: Valve) =>
      technicianIdsForValve(valve)
        .map((id) => techniciansById.get(id)?.name)
        .filter((name): name is string => Boolean(name))
        .join(', '),
    [technicianIdsForValve, techniciansById],
  )
  const listColumnContext = useMemo<ListColumnContext>(
    () => ({ technicianLabelForValve }),
    [technicianLabelForValve],
  )
  const setColumnFilter = useCallback((key: ListColumnKey, next: ColumnFilterState) => {
    setColumnFilters((prev) => ({ ...prev, [key]: next }))
  }, [])
  const toggleColumnSort = useCallback((key: ListColumnKey) => {
    setListColumnSort((prev) => {
      if (prev.column !== key) return { column: key, direction: 'asc' }
      if (prev.direction === 'asc') return { column: key, direction: 'desc' }
      return { column: 'default', direction: 'asc' }
    })
  }, [])
  const activeColumnFilterCount = useMemo(
    () =>
      LIST_FILTER_COLUMNS.filter(({ key }) => {
        const f = columnFilters[key]
        return Boolean(f.selected || f.query.trim() || (f.checked?.length ?? 0) > 0)
      }).length,
    [columnFilters],
  )

  // Apply dashboard deep-links: ?view=list&scope=…&cell=Durco/Twinseal
  useEffect(() => {
    const view = searchParams.get('view')
    if (view === 'list') setTab('list')
    else if (view === 'kanban') setTab('kanban')

    const nextScope = searchParams.get('scope')
    if (
      nextScope === 'in-process' ||
      nextScope === 'on-hold' ||
      nextScope === 'waiting-on-arrival' ||
      nextScope === 'on-order' ||
      nextScope === 'closed' ||
      nextScope === 'ready-to-ship' ||
      nextScope === 'not-arrived' ||
      nextScope === 'all'
    ) {
      setScopeFilter(nextScope === 'all' ? 'all' : nextScope)
    }

    const cell = searchParams.get('cell')?.trim() ?? ''
    if (cell) {
      setColumnFilters((prev) => {
        if (prev.cell.selected === cell && prev.cell.query === cell) return prev
        return { ...prev, cell: { query: cell, selected: cell } }
      })
    }
  }, [searchParams])

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
    const { data, error } = await fetchAllValves()

    if (error) {
      showToast(`Could not load valves: ${error.message}`)
    } else {
      setValves(data)
      const eligiblePriority = await syncPriorityQueueWithValves(data)
      setPriorityQueueIds(eligiblePriority)
    }
    setLoading(false)
    void loadAttachmentCounts()
  }

  useEffect(() => {
    fetchValves()
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
    const byClosedDesc = (a: Valve, b: Valve) => {
      const ad = a.date_closed ? new Date(a.date_closed).getTime() : 0
      const bd = b.date_closed ? new Date(b.date_closed).getTime() : 0
      if (bd !== ad) return bd - ad
      return b.valve_id.localeCompare(a.valve_id)
    }
    // Only true done statuses — do not pull in mis-tagged Completed + still-in-shop rows.
    const done = valves.filter((v) => DONE_STATUSES.has(v.status))
    // Always keep Junked (and Replaced) visible so accidental moves can be fixed.
    const recoverable = done.filter((v) => v.status === 'Junked' || v.status === 'Replaced').sort(byClosedDesc)
    const recoverableIds = new Set(recoverable.map((v) => v.id))
    const recentOther = done
      .filter((v) => !recoverableIds.has(v.id))
      .sort(byClosedDesc)
      .slice(0, 20)
    return [...recoverable, ...recentOther]
  }, [valves])

  const activeNonTerminal = useMemo(() => valves.filter((v) => isActiveShopWork(v)), [valves])

  const closedWorkOrders = useMemo(
    () =>
      valves
        .filter((v) => isClosedWorkOrder(v))
        .sort((a, b) => {
          const rank = (v: Valve) =>
            v.status === 'Junked' ? 0 : v.status === 'Replaced' ? 1 : 2
          const rankDiff = rank(a) - rank(b)
          if (rankDiff !== 0) return rankDiff
          return (b.date_closed ?? '').localeCompare(a.date_closed ?? '')
        }),
    [valves],
  )

  const setListScope = useCallback(
    (next: ScopeFilter) => {
      setScopeFilter(next)
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set('view', 'list')
          if (next === 'all') {
            params.delete('scope')
          } else {
            params.set('scope', next)
          }
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const toggleCompletedValvesView = useCallback(() => {
    setListScope(viewingCompletedValves ? 'all' : 'closed')
  }, [setListScope, viewingCompletedValves])

  const scopeBaseValves = useMemo(() => {
    const base = scopeFilter === 'closed' ? closedWorkOrders : activeNonTerminal
    const scoped = base.filter((v) => {
      const matchesScope =
        scopeFilter === 'all' ||
        scopeFilter === 'closed' ||
        (scopeFilter === 'in-process' && v.order_type === 'In-Process Order') ||
        (scopeFilter === 'on-hold' && v.order_type === 'On-Hold') ||
        (scopeFilter === 'waiting-on-arrival' && v.order_type === 'Waiting on Arrival') ||
        (scopeFilter === 'on-order' && isActiveOrderType(v.order_type)) ||
        (scopeFilter === 'ready-to-ship' && v.status === 'Warehouse RTS') ||
        (scopeFilter === 'not-arrived' && v.status === 'Not Arrived')
      return matchesScope
    })

    // When searching by WO # or Valve ID, include matching closed jobs so older WOs remain findable.
    if (scopeFilter === 'closed') return scoped

    const woColumn = columnFilters.valve_id
    const hasWoColumnSearch = Boolean(woColumn.selected || woColumn.query.trim())
    const hasTopWoSearch = Boolean(selectedWorkOrder || workOrderQuery.trim())
    if (!hasWoColumnSearch && !hasTopWoSearch) return scoped

    const known = new Set(scoped.map((v) => v.id))
    const closedMatches = closedWorkOrders.filter((v) => {
      if (known.has(v.id)) return false
      if (hasTopWoSearch && valveMatchesWorkOrderFilter(v, workOrderQuery, selectedWorkOrder)) {
        return true
      }
      if (hasWoColumnSearch && valveMatchesWorkOrderFilter(v, woColumn.query, woColumn.selected)) {
        return true
      }
      return false
    })
    return closedMatches.length ? [...scoped, ...closedMatches] : scoped
  }, [
    activeNonTerminal,
    closedWorkOrders,
    scopeFilter,
    columnFilters.valve_id,
    selectedWorkOrder,
    workOrderQuery,
  ])

  const sortValves = useCallback(
    (items: Valve[]) => {
      if (listSort === 'default') {
        return [...items].sort(compareValvesForDisplay)
      }
      return [...items].sort((a, b) => compareValvesBySort(a, b, listSort, compareValvesForDisplay))
    },
    [listSort, compareValvesForDisplay],
  )

  const tableRows = useMemo(() => {
    const filtered = scopeBaseValves
      .filter((v) => valveMatchesAllColumnFilters(v, columnFilters, listColumnContext))
      .filter((v) => valveMatchesWorkOrderFilter(v, workOrderQuery, selectedWorkOrder))
      .filter((v) => valveMatchesDescriptionSearch(v, descriptionQuery))

    const usingCustomOrder =
      listSort === 'default' && listColumnSort.column === 'default'

    if (usingCustomOrder) {
      return sortValvesWithPriorityAndRest(filtered, priorityQueueIds, listRestOrder)
    }
    if (listSort !== 'default') {
      return [...filtered].sort((a, b) => compareValvesBySort(a, b, listSort, compareValvesForDisplay))
    }
    return [...filtered].sort((a, b) =>
      compareValvesByListColumn(a, b, listColumnSort, listColumnContext, compareValvesForDisplay),
    )
  }, [
    scopeBaseValves,
    columnFilters,
    listColumnSort,
    listColumnContext,
    compareValvesForDisplay,
    workOrderQuery,
    selectedWorkOrder,
    listSort,
    descriptionQuery,
    priorityQueueIds,
    listRestOrder,
  ])

  // Keep persisted rest-order stable: drop removed jobs, append newly seen non-priority jobs at the end.
  useEffect(() => {
    const knownIds = new Set(valves.map((v) => v.valve_id))
    const prioritySet = new Set(priorityQueueIds)
    const candidateRest = valves
      .filter((v) => !prioritySet.has(v.valve_id) && !isClosedWorkOrder(v))
      .map((v) => v.valve_id)

    setListRestOrder((prev) => {
      const kept = prev.filter((id) => knownIds.has(id) && !prioritySet.has(id))
      const missing = candidateRest.filter((id) => !kept.includes(id))
      const next = missing.length ? [...kept, ...missing] : kept
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev
      return next
    })
  }, [valves, priorityQueueIds])

  useEffect(() => {
    try {
      window.localStorage.setItem(LIST_REST_ORDER_STORAGE_KEY, JSON.stringify(listRestOrder))
    } catch {
      // ignore
    }
  }, [listRestOrder])

  const openModal = (valve: Valve) => {
    setActiveValve(valve)
    setSelectedStatus(valve.status)
  }

  const openDueDateEditor = (valve: Valve) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    setDueDateEditValve(valve)
  }

  const saveDueDateChange = async (nextDueDate: string | null, reason: string) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!dueDateEditValve) return
    const previousDueDate = dueDateLabel(dueDateEditValve.due_date)
    if ((previousDueDate ?? null) === nextDueDate) return

    setSavingDueDate(true)
    const changedByName = await resolveChangedByName(username ?? 'Unknown')
    const { error: valveError } = await supabase
      .from('valves')
      .update({ due_date: nextDueDate })
      .eq('id', dueDateEditValve.id)

    if (valveError) {
      setSavingDueDate(false)
      showToast(`Could not update due date: ${valveError.message}`)
      return
    }

    const { error: logError } = await recordDueDateChange({
      valveRowId: dueDateEditValve.id,
      valveId: dueDateEditValve.valve_id,
      previousDueDate,
      newDueDate: nextDueDate,
      reason,
      changedByName,
    })

    setSavingDueDate(false)
    if (logError) {
      showToast(`Due date saved, but change log failed: ${logError.message}`)
    } else {
      showToast('Due date updated')
    }

    setValves((prev) =>
      prev.map((v) => (v.id === dueDateEditValve.id ? { ...v, due_date: nextDueDate } : v)),
    )
    setActiveValve((prev) =>
      prev && prev.id === dueDateEditValve.id ? { ...prev, due_date: nextDueDate } : prev,
    )
    setDueDateEditValve(null)
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
      if (activeValve) closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeValve, closeModal])

  const saveModalChanges = async (fields: JobCardSaveFields) => {
    if (!activeValve || !selectedStatus) return
    const patch: Partial<Valve> = {
      description: fields.description.trim() || null,
      notes: fields.notes.trim() || null,
      bowl_type: fields.bowlType?.trim() || null,
      valve_type: fields.valveType?.trim() || null,
      is_turnaround: fields.isTurnaround,
      needs_failure_analysis: fields.needsFailureAnalysis,
      assigned_technician_id: fields.assignedTechnicianId,
      pressure_class: fields.pressureClass,
      body_material: fields.bodyMaterial,
      customer: fields.customer,
      cell: fields.cell,
      size: fields.size,
      job_type: fields.jobType,
      order_type: fields.orderType,
      due_date: fields.dueDate,
      test_type: fields.testType,
      material_spec: fields.materialSpec,
      drawing_po_number: fields.drawingPoNumber,
    }
    if (selectedStatus !== activeValve.status) {
      Object.assign(patch, valveStatusPatch(selectedStatus, activeValve))
    }

    const previousDueDate = dueDateLabel(activeValve.due_date)
    const nextDueDate = fields.dueDate?.trim() || null
    const dueDateChanged = (previousDueDate ?? null) !== nextDueDate

    setIsSaving(true)
    const { error } = await supabase.from('valves').update(patch).eq('id', activeValve.id)
    if (error) {
      setIsSaving(false)
      showToast(`Could not save changes: ${error.message}`)
      return
    }

    if (dueDateChanged) {
      const changedByName = await resolveChangedByName(username ?? 'Unknown')
      const { error: logError } = await recordDueDateChange({
        valveRowId: activeValve.id,
        valveId: activeValve.valve_id,
        previousDueDate,
        newDueDate: nextDueDate,
        reason: 'Updated from job card',
        changedByName,
      })
      if (logError) {
        showToast(`Saved, but due date change log failed: ${logError.message}`)
      }
    }

    setIsSaving(false)
    setValves((prev) => prev.map((v) => (v.id === activeValve.id ? { ...v, ...patch } : v)))
    setActiveValve((prev) => (prev && prev.id === activeValve.id ? { ...prev, ...patch } : prev))
    showToast('Saved')
  }

  const togglePriority = async (valve: Valve) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    const currentlyPriority = priorityIds.has(valve.valve_id)
    if (currentlyPriority) {
      const { error } = await supabase.from('priority_queue').delete().eq('valve_id', valve.valve_id)
      if (error) {
        showToast(`Could not remove ${valve.valve_id} from priority`)
        return
      }
      setPriorityQueueIds((prev) => prev.filter((id) => id !== valve.valve_id))
      showToast(`${valve.valve_id} removed from priority`)
      return
    }

    if (!isEligiblePriorityValve(valve)) {
      showToast('Only in-process active jobs can be added to priority')
      return
    }

    const { error } = await supabase.from('priority_queue').insert({ valve_id: valve.valve_id })
    if (error) {
      showToast(`Could not add ${valve.valve_id} to priority`)
      return
    }
    setPriorityQueueIds((prev) => [...prev, valve.valve_id])
    showToast(`${valve.valve_id} added to priority`)
  }

  const [savingPriorityOrder, setSavingPriorityOrder] = useState(false)

  const movePriorityInQueue = useCallback(
    async (valveId: string, direction: 'top' | 'up' | 'down') => {
      if (!canWrite) {
        showToast(permissionDeniedReason('shopWrite'))
        return
      }
      const reordered = reorderPriorityQueueIds(priorityQueueIds, valveId, direction)
      if (!reordered) return

      const previous = priorityQueueIds
      setPriorityQueueIds(reordered)
      setSavingPriorityOrder(true)
      const { error } = await persistPriorityQueueOrder(previous, reordered)
      setSavingPriorityOrder(false)

      if (error) {
        setPriorityQueueIds(previous)
        showToast('Could not reorder priorities')
        return
      }
      showToast('Priority order updated')
    },
    [canWrite, priorityQueueIds, showToast],
  )

  const moveRestInList = useCallback(
    (valveId: string, direction: 'top' | 'up' | 'down') => {
      if (!canWrite) {
        showToast(permissionDeniedReason('shopWrite'))
        return
      }
      if (priorityIds.has(valveId)) return

      const visibleRestIds = tableRows
        .filter((row) => !priorityIds.has(row.valve_id))
        .map((row) => row.valve_id)
      const index = visibleRestIds.indexOf(valveId)
      if (index < 0) return

      const hasPriorityAbove = tableRows.some((row) => priorityIds.has(row.valve_id))

      if (direction === 'top') {
        if (hasPriorityAbove) {
          showToast('Add it to the priority list before moving it above priority jobs.')
          return
        }
        if (index === 0) return
        const nextVisible = [valveId, ...visibleRestIds.filter((id) => id !== valveId)]
        setListRestOrder((prev) => applyVisibleRestReorder(prev, visibleRestIds, nextVisible))
        return
      }

      if (direction === 'up' && index === 0) {
        if (hasPriorityAbove) {
          showToast('Add it to the priority list before moving it above priority jobs.')
        }
        return
      }

      const nextVisible = reorderListIds(visibleRestIds, valveId, direction)
      if (!nextVisible) return
      setListRestOrder((prev) => applyVisibleRestReorder(prev, visibleRestIds, nextVisible))
    },
    [canWrite, priorityIds, tableRows, showToast],
  )

  const moveListRow = useCallback(
    (valveId: string, direction: 'top' | 'up' | 'down') => {
      if (listSort !== 'default' || listColumnSort.column !== 'default') {
        showToast('Switch Sort to Default (priority) to reorder the list')
        return
      }
      if (priorityIds.has(valveId)) {
        void movePriorityInQueue(valveId, direction)
        return
      }
      moveRestInList(valveId, direction)
    },
    [listSort, listColumnSort.column, priorityIds, movePriorityInQueue, moveRestInList, showToast],
  )

  const isValveInPhase = (valve: Valve, phaseKey: PhaseKey) => {
    const status = displayJobStatus(valve)
    if (phaseKey === 'done') return DONE_STATUSES.has(status)
    const phase = PHASES.find((item) => item.key === phaseKey)
    return phase ? phase.statuses.has(status) : false
  }

  const hasWorkOrderSearch = Boolean(selectedWorkOrder || workOrderQuery.trim())

  const workOrderSearchMatches = useMemo(() => {
    if (!hasWorkOrderSearch) return [] as Valve[]
    return valves.filter((valve) =>
      valveMatchesWorkOrderFilter(valve, workOrderQuery, selectedWorkOrder),
    )
  }, [hasWorkOrderSearch, valves, workOrderQuery, selectedWorkOrder])

  const workOrderSearchStatus = useMemo(() => {
    if (!hasWorkOrderSearch) return null
    const total = workOrderSearchMatches.length
    if (total === 0) {
      return `No jobs match “${selectedWorkOrder || workOrderQuery.trim()}”.`
    }
    const closedCount = workOrderSearchMatches.filter((v) => isClosedWorkOrder(v)).length
    if (closedCount === total) {
      return `Found ${total} closed job${total === 1 ? '' : 's'} — shown in the Done column (or open the card from search).`
    }
    if (closedCount > 0) {
      return `Found ${total} job${total === 1 ? '' : 's'} (${closedCount} closed). Closed matches appear in Done.`
    }
    return `Found ${total} active job${total === 1 ? '' : 's'}.`
  }, [hasWorkOrderSearch, workOrderSearchMatches, selectedWorkOrder, workOrderQuery])

  const baseItemsForPhase = useCallback(
    (phaseKey: PhaseKey) => {
      if (phaseKey !== 'done') {
        return activeNonTerminal.filter((valve) => isValveInPhase(valve, phaseKey))
      }
      // WO search: include older closed jobs, not only the recent Done slice.
      if (hasWorkOrderSearch) {
        return valves.filter((v) => isClosedWorkOrder(v) || DONE_STATUSES.has(v.status))
      }
      return doneLimited
    },
    [activeNonTerminal, doneLimited, hasWorkOrderSearch, valves],
  )

  const itemsForPhase = useCallback(
    (phaseKey: PhaseKey) => {
      let base = baseItemsForPhase(phaseKey).filter((valve) =>
        valveMatchesWorkOrderFilter(valve, workOrderQuery, selectedWorkOrder),
      )
      if (descriptionQuery.trim()) {
        base = base.filter((valve) => valveMatchesDescriptionSearch(valve, descriptionQuery))
      }

      if (listSort !== 'default') {
        return sortValves(base)
      }

      const orderIds = phaseOrder[phaseKey]
      if (!orderIds.length) {
        return sortValves(base)
      }

      const byId = new Map(base.map((valve) => [valve.id, valve]))
      const ordered: Valve[] = []
      for (const id of orderIds) {
        const valve = byId.get(id)
        if (valve) {
          ordered.push(valve)
          byId.delete(id)
        }
      }
      const rest = sortValves([...byId.values()])
      return [...ordered, ...rest]
    },
    [baseItemsForPhase, phaseOrder, workOrderQuery, selectedWorkOrder, listSort, sortValves, descriptionQuery],
  )

  const placeInPhaseOrder = useCallback(
    (phaseKey: PhaseKey, draggedId: number, targetId: number | null) => {
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
    },
    [itemsForPhase],
  )

  const moveCardInPhase = useCallback(
    (phaseKey: PhaseKey, valveId: number, direction: 'top' | 'up' | 'down') => {
      const items = itemsForPhase(phaseKey)
      const index = items.findIndex((item) => item.id === valveId)
      if (index < 0) return

      if (direction === 'top') {
        if (index === 0) return
        placeInPhaseOrder(phaseKey, valveId, items[0].id)
        return
      }

      if (direction === 'up') {
        if (index === 0) return
        placeInPhaseOrder(phaseKey, valveId, items[index - 1].id)
        return
      }

      if (index >= items.length - 1) return
      const targetId = index + 2 < items.length ? items[index + 2].id : null
      placeInPhaseOrder(phaseKey, valveId, targetId)
    },
    [itemsForPhase, placeInPhaseOrder],
  )

  const moveValveToStatus = async (valve: Valve, nextStatus: string) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!nextStatus || valve.status === nextStatus) return
    const previous = { ...valve }
    const patch = valveStatusPatch(nextStatus, valve)

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
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (valve.status !== 'Not Arrived') return
    await moveValveToStatus(valve, 'Arrived - Not Started')
  }

  useEffect(() => {
    if (loading || valves.length === 0) return

    setPhaseOrder((prev) => {
      const next: PhaseOrder = {
        incoming: [],
        'in-shop': [],
        testing: [],
        waiting: [],
        done: [],
      }
      let changed = false

      for (const phase of PHASES) {
        const key = phase.key
        const idsInPhase = new Set(baseItemsForPhase(key).map((item) => item.id))
        const filtered = prev[key].filter((id) => idsInPhase.has(id))
        const known = new Set(filtered)
        const appended = baseItemsForPhase(key)
          .filter((item) => !known.has(item.id))
          .sort(compareValvesForDisplay)
          .map((item) => item.id)
        const merged = [...filtered, ...appended]

        if (
          merged.length !== prev[key].length ||
          merged.some((id, index) => id !== prev[key][index])
        ) {
          changed = true
        }
        next[key] = merged
      }

      return changed ? next : prev
    })
  }, [valves, baseItemsForPhase, compareValvesForDisplay, loading])

  useEffect(() => {
    if (loading) return
    window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(phaseOrder))
  }, [phaseOrder, loading])

  return (
    <section className="job-board-page">
      {!isDedicatedDetailRoute ? (
        <div className="page-header">
          <h2>Job Board</h2>
          <div className="page-header-actions">
            {can(role, 'createJob') ? (
              <Link to="/new-job" className="button-primary job-board-new-job-link">
                New job <kbd className="job-board-shortcut-kbd">N</kbd>
              </Link>
            ) : (
              <span className="button-primary job-board-new-job-link nav-item-disabled" title="Only Admin and Manager can create jobs" aria-disabled="true">
                New job
              </span>
            )}
            <div className="tabs">
              <button className={`tab ${tab === 'kanban' ? 'active' : ''}`} onClick={() => setTab('kanban')}>
                Kanban board
              </button>
              <button className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
                List view
              </button>
              <Link to="/shop-tv" className="tab">
                TV board
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="loading">Loading valves...</div> : null}

      {!isDedicatedDetailRoute && !loading ? (
        <WorkOrderFilterBar
          valves={valves}
          query={workOrderQuery}
          descriptionQuery={descriptionQuery}
          selectedValveId={selectedWorkOrder}
          sort={listSort}
          statusMessage={tab === 'kanban' ? workOrderSearchStatus : null}
          onQueryChange={setWorkOrderQuery}
          onDescriptionQueryChange={setDescriptionQuery}
          onSelect={(valve) => {
            setSelectedWorkOrder(valve.valve_id)
            setWorkOrderQuery(valve.valve_id)
            openModal(valve)
            if (isClosedWorkOrder(valve) && tab === 'list' && scopeFilter !== 'closed') {
              setListScope('closed')
            }
          }}
          onClear={() => setSelectedWorkOrder('')}
          onSortChange={setListSort}
        />
      ) : null}

      {!isDedicatedDetailRoute && tab === 'kanban' ? (
        <>
        <p className="kanban-reorder-hint">
          Click a card to open and edit job details. Use ⇈ ↑ ↓ on each card to set priority within a column.
          {canCopyJobs ? ' Use ⧉ to copy a card to a new job.' : ''}
        </p>
        <div className="kanban-grid">
          {PHASES.map((phase) => {
            const items = itemsForPhase(phase.key)
            return (
              <div key={phase.key} className="kanban-column">
                <div className={`phase-header ${phase.className}`}>
                  <span>{phase.title}</span>
                  <span className="count-badge">{items.length}</span>
                </div>
                <div className="column-cards">
                  {items.map((valve, index) => (
                    <KanbanJobCard
                      key={valve.id}
                      valve={valve}
                      techIds={technicianIdsForValve(valve)}
                      phaseKey={phase.key}
                      priorityIds={priorityIds}
                      attachmentCounts={attachmentCounts}
                      techniciansById={techniciansById}
                      onOpen={openModal}
                      onStatusChange={moveValveToStatus}
                      onEditDueDate={openDueDateEditor}
                      onQuickReceive={quickMarkArrived}
                      canMoveToTop={index > 0}
                      canMoveUp={index > 0}
                      canMoveDown={index < items.length - 1}
                      onMoveToTop={() => moveCardInPhase(phase.key, valve.id, 'top')}
                      onMoveUp={() => moveCardInPhase(phase.key, valve.id, 'up')}
                      onMoveDown={() => moveCardInPhase(phase.key, valve.id, 'down')}
                      canCopy={canCopyJobs}
                      onCopy={setCopySourceValve}
                      canWrite={canWrite}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        </>
      ) : !isDedicatedDetailRoute ? (
        <div className="list-view">
          <div className="filters list-view-scope">
            {viewingCompletedValves ? (
              <span className="list-view-scope-label">Closed valves</span>
            ) : (
              <select value={scopeFilter} onChange={(e) => setListScope(e.target.value as ScopeFilter)}>
                <option value="all">All active work</option>
                <option value="on-order">On order (all active)</option>
                <option value="in-process">In process</option>
                <option value="on-hold">On hold</option>
                <option value="waiting-on-arrival">Waiting on arrival</option>
                <option value="ready-to-ship">Ready to ship</option>
                <option value="not-arrived">Not arrived (shop status)</option>
              </select>
            )}
            <button
              type="button"
              className="button-secondary list-clear-filters"
              onClick={() => {
                setColumnFilters(emptyColumnFilters())
                setListColumnSort({ column: 'default', direction: 'asc' })
                setDescriptionQuery('')
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev)
                  next.delete('cell')
                  return next
                })
              }}
              disabled={
                activeColumnFilterCount === 0 &&
                listColumnSort.column === 'default' &&
                !descriptionQuery.trim()
              }
            >
              {activeColumnFilterCount > 0
                ? `Clear ${activeColumnFilterCount} filter${activeColumnFilterCount === 1 ? '' : 's'}`
                : 'Clear filters'}
            </button>
            <span className="list-view-scope-spacer" aria-hidden="true" />
            <span className="list-view-count">
              {tableRows.length} row{tableRows.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className={`button-secondary list-view-completed-toggle ${viewingCompletedValves ? 'active' : ''}`}
              onClick={toggleCompletedValvesView}
            >
              {viewingCompletedValves ? 'Active valves' : 'Closed valves'}
            </button>
          </div>
          {viewingCompletedValves ? (
            <p className="list-view-completed-hint">
              Includes Completed, Junked, and Replaced. Open a card to change status if one was marked by mistake.
            </p>
          ) : (
            <p className="list-view-priority-hint">
              Sort by <strong>Default (priority)</strong> to reorder. Priority jobs stay on top — use ⇈ ↑ ↓ on any
              row. Non-priority jobs cannot move above the priority list (you&apos;ll be asked to add them first). Your
              list order is saved until you change it.
            </p>
          )}
          <div className="table-wrap list-table-wrap">
            <table className="list-view-table">
              <thead>
                <tr className="list-filter-row">
                  {LIST_FILTER_COLUMNS.map(({ key, label }) => (
                    <th key={key}>
                      <div className="list-col-header">
                        <button
                          type="button"
                          className={`list-col-sort-btn ${
                            listColumnSort.column === key ? `sorted-${listColumnSort.direction}` : ''
                          }`}
                          onClick={() => toggleColumnSort(key)}
                          aria-label={`Sort by ${label}`}
                        >
                          <span className="list-col-label">
                            {key === 'due_date' && viewingCompletedValves ? 'Date closed' : label}
                          </span>
                          <span className="list-col-sort-indicator" aria-hidden="true">
                            {listColumnSort.column === key
                              ? listColumnSort.direction === 'asc'
                                ? '↑'
                                : '↓'
                              : '↕'}
                          </span>
                        </button>
                        {key === 'status' ? (
                          <ColumnFilterStatusChecklist
                            label={label}
                            valves={scopeBaseValves}
                            filter={columnFilters[key]}
                            onChange={(next) => setColumnFilter(key, next)}
                          />
                        ) : (
                          <ColumnFilterCombobox
                            column={key}
                            label={label}
                            valves={key === 'valve_id' ? valves : scopeBaseValves}
                            filter={columnFilters[key]}
                            context={listColumnContext}
                            onChange={(next) => setColumnFilter(key, next)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="list-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((valve) => {
                  const priorityIndex = priorityQueueIds.indexOf(valve.valve_id)
                  const inPriorityQueue = priorityIndex >= 0
                  const visibleRestIds = tableRows
                    .filter((row) => priorityQueueIds.indexOf(row.valve_id) < 0)
                    .map((row) => row.valve_id)
                  const restIndex = visibleRestIds.indexOf(valve.valve_id)
                  const canMoveUp = inPriorityQueue ? priorityIndex > 0 : restIndex > 0
                  const canMoveDown = inPriorityQueue
                    ? priorityIndex >= 0 && priorityIndex < priorityQueueIds.length - 1
                    : restIndex >= 0 && restIndex < visibleRestIds.length - 1
                  const usingCustomOrder = listSort === 'default' && listColumnSort.column === 'default'
                  return (
                  <tr
                    key={valve.id}
                    className={inPriorityQueue ? 'list-view-row-priority' : undefined}
                    onClick={() => openModal(valve)}
                  >
                    <td>{valve.valve_id}</td>
                    <td>{valve.customer ?? '-'}</td>
                    <td><FinishCellBadge cell={valve.cell} /></td>
                    <td>{valve.size ?? '-'}</td>
                    <td>{isTurnaroundValve(valve) ? 'Yes' : '—'}</td>
                    <td>
                      <div className="list-status-cell">
                        <StatusBadge status={valve.status} />
                        {valve.status === 'Testing' ? (
                          <span className="job-card-testing-badge">In testing</span>
                        ) : valve.date_tested ? (
                          <span className="job-card-tested-badge" title={`Shop date tested: ${valve.date_tested}`}>
                            Tested {formatShortDate(valve.date_tested) ?? valve.date_tested}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {technicianIdsForValve(valve).length > 0 ? (
                        <TechnicianAvatars ids={technicianIdsForValve(valve)} byId={techniciansById} />
                      ) : (
                        <span className="job-muted">—</span>
                      )}
                    </td>
                    <td>
                      {viewingCompletedValves ? (
                        valve.date_closed ?? '—'
                      ) : canWrite ? (
                        <button
                          type="button"
                          className="job-list-due-date-button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openDueDateEditor(valve)
                          }}
                        >
                          {dueDateLabel(valve.due_date) ? (
                            <span className={isDueDateOverdue(valve.due_date) ? 'due-date-overdue' : 'due-date-ok'}>
                              {dueDateLabel(valve.due_date)}
                              {isDueDateOverdue(valve.due_date) ? ' (Overdue)' : ''}
                            </span>
                          ) : (
                            <span className="job-card-due-date-empty">Set due date</span>
                          )}
                        </button>
                      ) : (
                        <span className={isDueDateOverdue(valve.due_date) ? 'due-date-overdue' : undefined}>
                          {dueDateLabel(valve.due_date) || '—'}
                        </span>
                      )}
                    </td>
                    <td className="table-cell-clamp">{valve.description ?? '-'}</td>
                    <td className="table-cell-clamp">{valve.notes ?? '-'}</td>
                    <td className="list-col-actions-cell" onClick={(e) => e.stopPropagation()}>
                      {viewingCompletedValves ? (
                        <button
                          type="button"
                          className="job-list-quick-action"
                          onClick={() => openModal(valve)}
                        >
                          Open card
                        </button>
                      ) : canWrite ? (
                        <div className="job-list-priority-actions">
                          <span className="job-list-priority-label">
                            {inPriorityQueue ? 'Priority' : 'Order'}
                          </span>
                          <div className="job-card-reorder-buttons">
                            <button
                              type="button"
                              className="job-card-reorder-btn job-card-reorder-btn--top"
                              title={
                                inPriorityQueue
                                  ? 'Move to top of priority'
                                  : 'Requires priority list — blocked above priority jobs'
                              }
                              aria-label={`Move ${valve.valve_id} to top`}
                              disabled={savingPriorityOrder || !usingCustomOrder}
                              onClick={() => moveListRow(valve.valve_id, 'top')}
                            >
                              ⇈
                            </button>
                            <button
                              type="button"
                              className="job-card-reorder-btn"
                              title={
                                inPriorityQueue
                                  ? 'Move up in priority'
                                  : canMoveUp
                                    ? 'Move up in list'
                                    : 'Add to the priority list to move above priority jobs'
                              }
                              aria-label={`Move ${valve.valve_id} up`}
                              disabled={savingPriorityOrder || !usingCustomOrder || (inPriorityQueue && !canMoveUp)}
                              onClick={() => moveListRow(valve.valve_id, 'up')}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="job-card-reorder-btn"
                              title="Move down"
                              aria-label={`Move ${valve.valve_id} down`}
                              disabled={savingPriorityOrder || !usingCustomOrder || !canMoveDown}
                              onClick={() => moveListRow(valve.valve_id, 'down')}
                            >
                              ↓
                            </button>
                          </div>
                          {inPriorityQueue ? (
                            <button
                              type="button"
                              className="job-list-priority-remove"
                              disabled={savingPriorityOrder}
                              onClick={() => void togglePriority(valve)}
                            >
                              Remove
                            </button>
                          ) : null}
                          {!inPriorityQueue && isEligiblePriorityValve(valve) ? (
                            <button
                              type="button"
                              className="job-list-quick-action"
                              onClick={() => void togglePriority(valve)}
                            >
                              Add priority
                            </button>
                          ) : null}
                          {!inPriorityQueue &&
                          !isEligiblePriorityValve(valve) &&
                          displayJobStatus(valve) === 'Not Arrived' ? (
                            <button
                              type="button"
                              className="job-list-quick-action"
                              onClick={() => void quickMarkArrived(valve)}
                            >
                              Mark arrived
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {dueDateEditValve ? (
        <DueDateChangeModal
          valve={dueDateEditValve}
          isSaving={savingDueDate}
          onCancel={() => {
            if (!savingDueDate) setDueDateEditValve(null)
          }}
          onSave={saveDueDateChange}
        />
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
          onOpenItp={() => navigate(`/itp/${activeValve.id}`)}
          onOpenFullPage={() => navigate(`/jobs/${activeValve.id}`)}
          onCopy={canCopyJobs ? () => setCopySourceValve(activeValve) : undefined}
          forceMaximized={isDedicatedDetailRoute}
          canEditJobDetails={canWrite}
        />
      ) : null}

      {copySourceValve ? (
        <CopyJobModal
          source={copySourceValve}
          onCancel={() => setCopySourceValve(null)}
          onCreated={() => {
            setCopySourceValve(null)
            void fetchValves()
          }}
        />
      ) : null}
    </section>
  )
}
