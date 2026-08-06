import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ReworkReasonModal } from '../components/ReworkReasonModal'
import { TechJobCard } from '../components/TechJobCard'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { resolveChangedByName } from '../lib/dueDateChanges'
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
  const [techById, setTechById] = useState<Map<number, Technician>>(new Map())
  const [pendingRework, setPendingRework] = useState<{ valve: Valve; nextStatus: string } | null>(null)
  const [savingRework, setSavingRework] = useState(false)

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
    if (cells.length === 0) {
      setCellPriorityJobs([])
      return
    }
    const { data: priorityRows, error: priorityError } = await supabase
      .from('valves')
      .select('*')
      .in('cell', cells)
      .eq('status', 'In-shop Work')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10)
    if (priorityError) {
      showToast('Could not load priority jobs')
      return
    }
    setCellPriorityJobs((priorityRows as Valve[]) ?? [])
  }

  useEffect(() => {
    void loadData()
  }, [user?.id])

  const applyMyJobStatus = async (job: Valve, nextStatus: string, reworkReason?: string) => {
    const patch = valveStatusPatch(nextStatus, job)
    const { error } = await supabase.from('valves').update(patch).eq('id', job.id)
    if (error) {
      showToast('Could not update status')
      return false
    }
    if (reworkReason) {
      const changedByName = await resolveChangedByName(displayName)
      const { error: reworkError } = await recordStatusRework({
        valveRowId: job.id,
        valveId: job.valve_id,
        previousStatus: job.status,
        newStatus: nextStatus,
        reason: reworkReason,
        changedByName,
      })
      if (reworkError) {
        showToast(`Status updated, but rework log failed: ${reworkError.message}`)
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
      const ok = await applyMyJobStatus(pendingRework.valve, pendingRework.nextStatus, reason)
      if (ok) setPendingRework(null)
    } finally {
      setSavingRework(false)
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
                <TechJobCard job={job} readOnly={!canWrite} onStatusChange={updateMyJobStatus} />
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
            <TechJobCard key={job.id} job={job} readOnly />
          ))}
          {cellPriorityJobs.length === 0 ? <p className="placeholder-copy">No priority jobs in your work cells.</p> : null}
        </div>
      </section>

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
