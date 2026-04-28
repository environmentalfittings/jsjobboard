import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { TechJobCard } from '../components/TechJobCard'
import { useToast } from '../components/ToastNotification'
import { supabase } from '../lib/supabase'
import type { Technician, Valve } from '../types'

interface MyWorkPageProps {
  user: User | null
  onLogout: () => void
}

export function MyWorkPage({ user, onLogout }: MyWorkPageProps) {
  const { showToast } = useToast()
  const [technician, setTechnician] = useState<Technician | null>(null)
  const [assignedJobs, setAssignedJobs] = useState<Valve[]>([])
  const [cellPriorityJobs, setCellPriorityJobs] = useState<Valve[]>([])
  const [techById, setTechById] = useState<Map<number, Technician>>(new Map())

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    [],
  )

  const loadData = async () => {
    if (!user) return
    const { data: tech, error: techError } = await supabase
      .from('technicians')
      .select('id,name,employee_id,work_cell_specialties,group_team,active,user_id,login_email,created_at,updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (techError || !tech) {
      showToast('Could not load technician profile')
      return
    }
    setTechnician(tech as Technician)

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

  const updateMyJobStatus = async (job: Valve, nextSubStatus: string) => {
    const { error } = await supabase
      .from('valves')
      .update({
        sub_status: nextSubStatus,
        received_status: nextSubStatus,
      } as never)
      .eq('id', job.id)
    if (error) {
      showToast('Could not update status')
      return
    }
    setAssignedJobs((prev) => prev.map((row) => (row.id === job.id ? { ...row, sub_status: nextSubStatus } : row)))
  }

  const flagForSupervisor = async (job: Valve) => {
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
        <h2 className="dashboard-title">Good morning, {technician?.name ?? user?.email ?? 'Technician'}</h2>
        <div className="technicians-page-actions">
          <span className="dashboard-refresh-hint">{todayLabel}</span>
          <button type="button" className="button-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <section className="dashboard-panel">
        <h3>My Assigned Jobs</h3>
        <div className="dashboard-grid">
          {assignedJobs.map((job) => {
            const assignedByName = job.assigned_by ? techById.get(job.assigned_by)?.name ?? '—' : '—'
            return (
              <div key={job.id}>
                <TechJobCard job={job} onStatusChange={updateMyJobStatus} />
                <p className="job-muted">
                  Assigned by: {assignedByName} {job.assigned_at ? `on ${new Date(job.assigned_at).toLocaleString()}` : ''}
                </p>
                <p className="job-muted">Assignment notes: {job.assignment_notes ?? '—'}</p>
                <button
                  type="button"
                  className="button-secondary admin-list-btn"
                  onClick={() => void flagForSupervisor(job)}
                  disabled={job.needs_attention === true}
                >
                  {job.needs_attention ? 'Flagged' : 'Flag for supervisor'}
                </button>
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
    </section>
  )
}
