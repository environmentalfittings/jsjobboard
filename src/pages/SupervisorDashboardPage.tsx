import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AssignJobModal } from '../components/AssignJobModal'
import { ReworkReasonModal } from '../components/ReworkReasonModal'
import { RoleBadge } from '../components/RoleBadge'
import { TeamJobsTable } from '../components/TeamJobsTable'
import { TechJobCard } from '../components/TechJobCard'
import { useToast } from '../components/ToastNotification'
import { resolveChangedByName } from '../lib/dueDateChanges'
import { recordStatusRework } from '../lib/statusReworkLog'
import { isBackwardStatusMove } from '../lib/statusWorkflow'
import { supabase } from '../lib/supabase'
import { valveStatusPatch } from '../lib/valveStatusPatch'
import type { Technician, Valve } from '../types'

interface SupervisorDashboardPageProps {
  user: User | null
  appRole: 'manager' | 'supervisor'
  onLogout: () => void
}

function isOverdue(raw: string | null): boolean {
  if (!raw) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return raw < today
}

export function SupervisorDashboardPage({ user, appRole, onLogout }: SupervisorDashboardPageProps) {
  const { showToast } = useToast()
  const [me, setMe] = useState<Technician | null>(null)
  const [team, setTeam] = useState<Technician[]>([])
  const [unassigned, setUnassigned] = useState<Valve[]>([])
  const [teamJobs, setTeamJobs] = useState<Valve[]>([])
  const [myJobs, setMyJobs] = useState<Valve[]>([])
  const [activeAssignJob, setActiveAssignJob] = useState<Valve | null>(null)
  const [pendingRework, setPendingRework] = useState<{ valve: Valve; nextStatus: string } | null>(null)
  const [savingRework, setSavingRework] = useState(false)

  const techById = useMemo(() => new Map(team.concat(me ? [me] : []).map((t) => [t.id, t])), [team, me])

  const load = async () => {
    if (!user) return
    const { data: meRow } = await supabase
      .from('technicians')
      .select('id,name,employee_id,work_cell_specialties,group_team,active,user_id,login_email,role,supervisor_id,manager_id,created_at,updated_at')
      .eq('user_id', user.id)
      .single()
    const mine = (meRow as Technician) ?? null
    if (!mine) return
    setMe(mine)

    const teamQuery =
      appRole === 'manager'
        ? supabase.from('technicians').select('*').eq('manager_id', mine.id).eq('active', true)
        : supabase.from('technicians').select('*').eq('supervisor_id', mine.id).eq('active', true)
    const { data: teamRows } = await teamQuery.order('name')
    setTeam((teamRows as Technician[]) ?? [])

    const { data: unassignedRows } = await supabase
      .from('valves')
      .select('*')
      .is('assigned_technician_id', null)
      .order('due_date', { ascending: true, nullsFirst: false })
    setUnassigned((unassignedRows as Valve[]) ?? [])

    const teamIds = ((teamRows as Technician[]) ?? []).map((t) => t.id)
    const { data: teamJobRows } = teamIds.length
      ? await supabase.from('valves').select('*').in('assigned_technician_id', teamIds).order('due_date', { ascending: true })
      : { data: [] as unknown[] }
    setTeamJobs((teamJobRows as Valve[]) ?? [])

    const { data: myJobRows } = await supabase
      .from('valves')
      .select('*')
      .eq('assigned_technician_id', mine.id)
      .not('status', 'in', '(Completed,Waiting/Hold)')
      .order('due_date', { ascending: true, nullsFirst: false })
    setMyJobs((myJobRows as Valve[]) ?? [])
  }

  useEffect(() => {
    void load()
  }, [user?.id, appRole])

  const assignJob = async (job: Valve, techId: number, notes: string) => {
    if (!me) return
    const { error } = await supabase
      .from('valves')
      .update({
        assigned_technician_id: techId,
        assigned_by: me.id,
        assigned_at: new Date().toISOString(),
        assignment_notes: notes.trim() || null,
      } as never)
      .eq('id', job.id)
    if (error) {
      showToast(`Could not assign: ${error.message}`)
      return
    }
    setActiveAssignJob(null)
    showToast('Job assigned')
    void load()
  }

  const applySupervisorJobStatus = async (job: Valve, nextStatus: string, reworkReason?: string) => {
    const patch = valveStatusPatch(nextStatus, job)
    const { error } = await supabase.from('valves').update(patch).eq('id', job.id)
    if (error) {
      showToast('Could not update status')
      return false
    }
    if (reworkReason) {
      const changedByName = await resolveChangedByName(me?.name ?? 'Unknown')
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
    setMyJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, ...patch } : row)))
    return true
  }

  const updateMyJobStatus = async (job: Valve, nextStatus: string) => {
    if (job.status === nextStatus) return
    if (isBackwardStatusMove(job.status, nextStatus)) {
      setPendingRework({ valve: job, nextStatus })
      return
    }
    await applySupervisorJobStatus(job, nextStatus)
  }

  const confirmPendingRework = async (reason: string) => {
    if (!pendingRework) return
    setSavingRework(true)
    try {
      const ok = await applySupervisorJobStatus(pendingRework.valve, pendingRework.nextStatus, reason)
      if (ok) setPendingRework(null)
    } finally {
      setSavingRework(false)
    }
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Welcome, {me?.name ?? user?.email ?? 'Supervisor'}</h2>
        <div className="technicians-page-actions">
          <RoleBadge role={appRole} />
          <span className="dashboard-refresh-hint">{new Date().toLocaleDateString()}</span>
          <button type="button" className="button-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <section className="dashboard-panel">
        <h3>Assign Jobs</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job #</th>
                <th>Customer</th>
                <th>Work cell</th>
                <th>Description</th>
                <th>Due date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {unassigned.map((job) => (
                <tr key={job.id}>
                  <td>{job.valve_id}</td>
                  <td>{job.customer ?? '—'}</td>
                  <td>{job.cell ?? '—'}</td>
                  <td className="table-cell-clamp">{job.description ?? '—'}</td>
                  <td className={isOverdue(job.due_date) ? 'due-date-overdue' : 'due-date-ok'}>{job.due_date ?? '—'}</td>
                  <td>
                    <button type="button" className="button-primary admin-list-btn" onClick={() => setActiveAssignJob(job)}>
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-panel">
        <h3>My Team's Active Jobs</h3>
        <TeamJobsTable jobs={teamJobs} techById={techById} onReassign={(job) => setActiveAssignJob(job)} />
      </section>

      <section className="dashboard-panel">
        <h3>My Own Assigned Jobs</h3>
        <div className="dashboard-grid">
          {myJobs.map((job) => (
            <TechJobCard key={job.id} job={job} onStatusChange={updateMyJobStatus} />
          ))}
          {myJobs.length === 0 ? <p className="placeholder-copy">No jobs assigned directly to you.</p> : null}
        </div>
      </section>

      {activeAssignJob ? (
        <AssignJobModal job={activeAssignJob} assignableTechs={team} onClose={() => setActiveAssignJob(null)} onConfirm={assignJob} />
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
