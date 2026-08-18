import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { DueDateChangeModal } from '../components/DueDateChangeModal'
import { ReworkReasonModal } from '../components/ReworkReasonModal'
import { TechJobCard } from '../components/TechJobCard'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { recordDueDateChange, resolveChangedByName } from '../lib/dueDateChanges'
import { loadItpCardSummaries, type ItpCardSummary } from '../lib/itpCardSummaries'
import {
  OTD_PAUSE_STATUS_LABEL,
  requiresDueDateUpdateWhenLeavingOtdPause,
} from '../lib/onTimeDelivery'
import { resolveTechnicianForUser } from '../lib/resolveTechnicianForUser'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import { recordStatusRework } from '../lib/statusReworkLog'
import { isBackwardStatusMove } from '../lib/statusWorkflow'
import { supabase } from '../lib/supabase'
import { valveStatusPatch } from '../lib/valveStatusPatch'
import type { Technician, Valve } from '../types'

interface MyWorkPageProps {
  user: User | null
  onLogout: () => void
}

export function MyWorkPage({ user, onLogout }: MyWorkPageProps) {
  const { showToast } = useToast()
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const [displayName, setDisplayName] = useState('Technician')
  const [profileLinked, setProfileLinked] = useState(true)
  const [assignedJobs, setAssignedJobs] = useState<Valve[]>([])
  const [cellPriorityJobs, setCellPriorityJobs] = useState<Valve[]>([])
  const [itpSummaries, setItpSummaries] = useState<Record<number, ItpCardSummary>>({})
  const [techById, setTechById] = useState<Map<number, Technician>>(new Map())
  const [pendingRework, setPendingRework] = useState<{ valve: Valve; nextStatus: string } | null>(null)
  const [savingRework, setSavingRework] = useState(false)
  const [pendingResumeDueDate, setPendingResumeDueDate] = useState<{ valve: Valve; nextStatus: string } | null>(
    null,
  )
  const [savingResumeDueDate, setSavingResumeDueDate] = useState(false)

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    [],
  )

  const loadData = async () => {
    if (!user) return

    const resolved = await resolveTechnicianForUser(user)
    setDisplayName(resolved.displayName)
    setProfileLinked(Boolean(resolved.technician))

    if (!resolved.technician) {
      setAssignedJobs([])
      setCellPriorityJobs([])
      setItpSummaries({})
      setTechById(new Map())
      return
    }

    const tech = resolved.technician
    const { data: mine, error: mineError } = await supabase
      .from('valves')
      .select('*')
      .eq('assigned_technician_id', tech.id)
      .not('status', 'in', '(Completed,Waiting/Hold)')
      .order('due_date', { ascending: true, nullsFirst: false })
    if (mineError) {
      showToast('Could not load assigned jobs')
    } else {
      setAssignedJobs((mine as Valve[]) ?? [])
    }
    const ids = new Set<number>()
    ;((mine as Valve[]) ?? []).forEach((job) => {
      if (job.assigned_by) ids.add(job.assigned_by)
    })
    if (ids.size > 0) {
      const { data: who } = await supabase.from('technicians').select('*').in('id', [...ids])
      setTechById(new Map(((who as Technician[]) ?? []).map((t) => [t.id, t])))
    } else {
      setTechById(new Map())
    }

    const cells = (tech.work_cell_specialties ?? []).filter(Boolean)
    const assigned = (mine as Valve[]) ?? []
    let priorityJobs: Valve[] = []
    if (cells.length === 0) {
      setCellPriorityJobs([])
    } else {
      const { data: priorityRows, error: priorityError } = await supabase
        .from('valves')
        .select('*')
        .in('cell', cells)
        .eq('status', 'In-shop Work')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10)
      if (priorityError) {
        showToast('Could not load priority jobs')
      } else {
        priorityJobs = (priorityRows as Valve[]) ?? []
        setCellPriorityJobs(priorityJobs)
      }
    }
    try {
      setItpSummaries(await loadItpCardSummaries([...assigned, ...priorityJobs].map((job) => job.id)))
    } catch {
      setItpSummaries({})
    }
  }

  useEffect(() => {
    void loadData()
  }, [user?.id])

  const applyMyJobStatus = async (
    job: Valve,
    nextStatus: string,
    options?: { reworkReason?: string; nextDueDate?: string | null; dueDateReason?: string },
  ) => {
    const previousDueDate = job.due_date?.trim() || null
    const patch: Partial<Valve> = valveStatusPatch(nextStatus, job)
    const dueDateProvided = options != null && 'nextDueDate' in options
    const nextDueDate = dueDateProvided ? options.nextDueDate?.trim() || null : previousDueDate
    if (dueDateProvided) patch.due_date = nextDueDate
    const dueDateChanged = dueDateProvided && previousDueDate !== nextDueDate

    const { error } = await supabase.from('valves').update(patch).eq('id', job.id)
    if (error) {
      showToast('Could not update status')
      return false
    }
    const changedByName = await resolveChangedByName(displayName)
    if (options?.reworkReason) {
      const { error: reworkError } = await recordStatusRework({
        valveRowId: job.id,
        valveId: job.valve_id,
        previousStatus: job.status,
        newStatus: nextStatus,
        reason: options.reworkReason,
        changedByName,
      })
      if (reworkError) {
        showToast(`Status updated, but rework log failed: ${reworkError.message}`)
      }
    }
    if (dueDateChanged) {
      const { error: logError } = await recordDueDateChange({
        valveRowId: job.id,
        valveId: job.valve_id,
        previousDueDate,
        newDueDate: nextDueDate,
        reason: options?.dueDateReason?.trim() || `Resumed from ${job.status}`,
        changedByName,
      })
      if (logError) {
        showToast(`Status updated, but due date change log failed: ${logError.message}`)
      }
    }
    setAssignedJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, ...patch } : row)))
    return true
  }

  const updateMyJobStatus = async (job: Valve, nextStatus: string) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (job.status === nextStatus) return
    if (requiresDueDateUpdateWhenLeavingOtdPause(job.status, nextStatus)) {
      setPendingResumeDueDate({ valve: job, nextStatus })
      return
    }
    if (isBackwardStatusMove(job.status, nextStatus)) {
      setPendingRework({ valve: job, nextStatus })
      return
    }
    await applyMyJobStatus(job, nextStatus)
  }

  const confirmPendingRework = async (reason: string) => {
    if (!pendingRework) return
    setSavingRework(true)
    try {
      const ok = await applyMyJobStatus(pendingRework.valve, pendingRework.nextStatus, {
        reworkReason: reason,
      })
      if (ok) setPendingRework(null)
    } finally {
      setSavingRework(false)
    }
  }

  const confirmResumeDueDate = async (nextDueDate: string | null, reason: string) => {
    if (!pendingResumeDueDate) return
    setSavingResumeDueDate(true)
    try {
      const ok = await applyMyJobStatus(pendingResumeDueDate.valve, pendingResumeDueDate.nextStatus, {
        nextDueDate,
        dueDateReason: reason,
      })
      if (ok) setPendingResumeDueDate(null)
    } finally {
      setSavingResumeDueDate(false)
    }
  }

  const flagForSupervisor = async (job: Valve) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    const { error } = await supabase.from('valves').update({ needs_attention: true }).eq('id', job.id)
    if (error) {
      showToast('Could not flag for supervisor')
      return
    }
    setAssignedJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, needs_attention: true } : row)))
    showToast('Flagged for supervisor')
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Good morning, {displayName}</h2>
        <div className="technicians-page-actions">
          <span className="dashboard-refresh-hint">{todayLabel}</span>
          <button type="button" className="button-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      {!profileLinked ? (
        <p className="placeholder-copy">
          Your shop login is active, but your technician profile is not linked yet. You can still use the status board.
          Ask Mike to link your account so assigned jobs appear here.
        </p>
      ) : null}

      <section className="dashboard-panel">
        <h3>My Assigned Jobs</h3>
        <div className="dashboard-grid">
          {assignedJobs.map((job) => {
            const assignedByName = job.assigned_by ? techById.get(job.assigned_by)?.name ?? '—' : '—'
            return (
              <div key={job.id}>
                <TechJobCard
                  job={job}
                  readOnly={!canWrite}
                  itpSummary={itpSummaries[job.id]}
                  onStatusChange={updateMyJobStatus}
                />
                <p className="job-muted">
                  Assigned by: {assignedByName} {job.assigned_at ? `on ${new Date(job.assigned_at).toLocaleString()}` : ''}
                </p>
                <p className="job-muted">Assignment notes: {job.assignment_notes ?? '—'}</p>
                {canWrite ? (
                  <button
                    type="button"
                    className="button-secondary admin-list-btn"
                    onClick={() => void flagForSupervisor(job)}
                    disabled={job.needs_attention === true}
                  >
                    {job.needs_attention ? 'Flagged' : 'Flag for supervisor'}
                  </button>
                ) : null}
              </div>
            )
          })}
          {assignedJobs.length === 0 ? <p className="placeholder-copy">No assigned work for today.</p> : null}
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>Priority Jobs in My Work Cell</h3>
        <div className="dashboard-grid">
          {cellPriorityJobs.map((job) => (
            <TechJobCard key={job.id} job={job} readOnly itpSummary={itpSummaries[job.id]} />
          ))}
          {cellPriorityJobs.length === 0 ? <p className="placeholder-copy">No priority jobs in your work cells.</p> : null}
        </div>
      </section>

      {pendingResumeDueDate ? (
        <DueDateChangeModal
          valve={pendingResumeDueDate.valve}
          isSaving={savingResumeDueDate}
          title="Update delivery date to resume"
          newDateLabel="New delivery / due date"
          defaultReason={`Resumed from ${pendingResumeDueDate.valve.status}`}
          reasonPlaceholder="Why is this job returning to the shop, and why this new date?"
          introExtra={`Moving from ${pendingResumeDueDate.valve.status} to ${pendingResumeDueDate.nextStatus}. ${OTD_PAUSE_STATUS_LABEL} do not count against on-time delivery until you set a new due date.`}
          onCancel={() => {
            if (!savingResumeDueDate) setPendingResumeDueDate(null)
          }}
          onSave={confirmResumeDueDate}
        />
      ) : null}

      {pendingRework ? (
        <ReworkReasonModal
          valve={pendingRework.valve}
          fromStatus={pendingRework.valve.status}
          toStatus={pendingRework.nextStatus}
          isSaving={savingRework}
          onCancel={() => {
            if (!savingRework) setPendingRework(null)
          }}
          onConfirm={confirmPendingRework}
        />
      ) : null}
    </section>
  )
}
