import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RoleBadge } from '../components/RoleBadge'
import { useToast } from '../components/ToastNotification'
import { TERMINAL_STATUSES } from '../constants/statuses'
import { supabase } from '../lib/supabase'
import type { Technician } from '../types'

type Draft = {
  name: string
  employee_id: string
  work_cell_specialties: string
  group_team: string
  active: boolean
  role: 'admin' | 'manager' | 'supervisor' | 'technician'
  supervisor_id: number | null
  manager_id: number | null
  create_login: boolean
  email: string
  temp_password: string
}

const emptyDraft = (): Draft => ({
  name: '',
  employee_id: '',
  work_cell_specialties: '',
  group_team: '',
  active: true,
  role: 'technician',
  supervisor_id: null,
  manager_id: null,
  create_login: false,
  email: '',
  temp_password: '',
})

export function TechniciansPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Technician[]>([])
  const [valves, setValves] = useState<{ id: number; valve_id: string; assigned_technician_id: number | null }[]>([])
  const [valvesLoading, setValvesLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('technicians')
      .select('id,name,employee_id,work_cell_specialties,group_team,active,user_id,login_email,role,supervisor_id,manager_id,created_at,updated_at')
      .order('group_team', { ascending: true, nullsFirst: false })
      .order('name')
    setLoading(false)
    if (error) {
      showToast(`Could not load technicians: ${error.message}`)
      setRows([])
      return
    }
    setRows((data as Technician[]) ?? [])
  }, [showToast])

  useEffect(() => {
    /* Same mount-load pattern as AdminListsPage / JobBoardPage */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets loading flag then awaits Supabase
    void load()
  }, [load])

  useEffect(() => {
    const loadOpenValves = async () => {
      setValvesLoading(true)
      const terminalCsv = [...TERMINAL_STATUSES].join(',')
      const { data, error } = await supabase
        .from('valves')
        .select('id,valve_id,assigned_technician_id')
        .not('status', 'in', `(${terminalCsv})`)
      setValvesLoading(false)
      if (error) {
        showToast(`Could not load open jobs: ${error.message}`)
        setValves([])
        return
      }
      setValves(((data ?? []) as { id: number; valve_id: string; assigned_technician_id: number | null }[]) ?? [])
    }
    void loadOpenValves()
  }, [rows.length, showToast])

  const openJobsForTech = (
    techId: number,
    valveRows: { id: number; valve_id: string; assigned_technician_id: number | null }[],
  ) => {
    return valveRows.filter((row) => row.assigned_technician_id === techId)
  }

  const openCreate = () => {
    setEditingId(null)
    setDraft(emptyDraft())
    setModalOpen(true)
  }

  const openEdit = (t: Technician) => {
    setEditingId(t.id)
    setDraft({
      name: t.name,
      employee_id: t.employee_id ?? '',
      work_cell_specialties: (t.work_cell_specialties ?? []).join(', '),
      group_team: t.group_team ?? '',
      active: t.active,
      role: (t.role as Draft['role']) ?? 'technician',
      supervisor_id: t.supervisor_id ?? null,
      manager_id: t.manager_id ?? null,
      create_login: false,
      email: t.login_email ?? '',
      temp_password: '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setDraft(emptyDraft())
  }

  const saveModal = async () => {
    const name = draft.name.trim()
    if (!name) {
      showToast('Name is required')
      return
    }
    setSaving(true)
    const payload = {
      name,
      employee_id: draft.employee_id.trim() || null,
      work_cell_specialties: draft.work_cell_specialties
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
      group_team: draft.group_team.trim() || null,
      active: draft.active,
      login_email: draft.email.trim() || null,
      role: draft.role,
      supervisor_id: draft.role === 'technician' || draft.role === 'supervisor' ? draft.supervisor_id : null,
      manager_id: draft.role === 'technician' || draft.role === 'supervisor' ? draft.manager_id : null,
    }
    let authUserId: string | null = null
    let loginCreateWarning: string | null = null
    if (draft.create_login) {
      if (!draft.email.trim() || !draft.temp_password.trim()) {
        setSaving(false)
        showToast('Email and temporary password are required when creating login')
        return
      }
      const adminCreate = await supabase.auth.admin.createUser({
        email: draft.email.trim(),
        password: draft.temp_password,
        user_metadata: { role: draft.role, name },
        email_confirm: true,
      })
      if (!adminCreate.error && adminCreate.data.user) {
        authUserId = adminCreate.data.user.id
      } else {
        const adminMsg = adminCreate.error?.message || 'unknown error'
        if (/bearer token|not allowed|insufficient|admin/i.test(adminMsg)) {
          loginCreateWarning =
            'Technician was saved, but login was not auto-created from browser client. Create this user in Supabase Auth > Users.'
        } else {
          setSaving(false)
          showToast(`Could not create login: ${adminMsg}`)
          return
        }
      }
    }
    const q =
      editingId == null
        ? supabase.from('technicians').insert({ ...payload, user_id: authUserId })
        : supabase.from('technicians').update({ ...payload, user_id: authUserId ?? undefined }).eq('id', editingId)
    const { error } = await q
    setSaving(false)
    if (error) {
      showToast(`Could not save: ${error.message}`)
      return
    }
    if (authUserId || editingId != null) {
      const existing = editingId != null ? rows.find((r) => r.id === editingId) : null
      const targetUserId = authUserId ?? existing?.user_id ?? null
      if (targetUserId) {
        const { error: metaErr } = await supabase.auth.admin.updateUserById(targetUserId, {
          user_metadata: { role: draft.role, name },
        })
        if (metaErr && editingId != null) {
          showToast('Saved technician, but could not sync auth metadata from browser client')
        }
      }
    }
    if (loginCreateWarning) {
      showToast(loginCreateWarning)
    } else {
      showToast(editingId == null ? 'Technician added' : 'Technician updated')
    }
    closeModal()
    void load()
  }

  const remove = async (t: Technician) => {
    if (!window.confirm(`Delete technician “${t.name}”? Job cards will lose this id from assignments.`)) return
    const { error } = await supabase.from('technicians').delete().eq('id', t.id)
    if (error) {
      showToast('Could not delete')
      return
    }
    showToast('Technician removed')
    void load()
  }

  const resetPassword = async (t: Technician) => {
    const email = t.login_email?.trim() || ''
    if (!t.user_id && !email) {
      showToast('Technician has no linked login/email')
      return
    }
    const nextPassword = window.prompt(`Set temporary password for ${t.name}`)
    if (!nextPassword || !nextPassword.trim()) return
    if (t.user_id) {
      const { error } = await supabase.auth.admin.updateUserById(t.user_id, { password: nextPassword.trim() })
      if (!error) {
        showToast('Temporary password updated')
        return
      }
    }
    if (!email) {
      showToast('Could not reset password from browser client; no email available for reset link')
      return
    }
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email)
    if (resetErr) {
      showToast(`Could not reset password: ${resetErr.message}`)
      return
    }
    showToast('Password reset email sent')
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Technicians</h2>
        <div className="technicians-page-actions">
          <button type="button" className="button-primary" onClick={openCreate}>
            Add technician
          </button>
          <Link to="/job-board" className="button-secondary">
            Back to board
          </Link>
        </div>
      </div>

      <p className="placeholder-copy technicians-intro">
        Maintain shop technicians here. Assign them to jobs from the job card (Status board → open a job).
      </p>

      {loading ? (
        <p className="placeholder-copy">Loading…</p>
      ) : (
        <div className="table-wrap technicians-table-wrap">
          <table className="technicians-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Work cell specialties</th>
                <th>Group / team</th>
                <th>Active</th>
                <th>Role</th>
                <th>Reports To</th>
                <th>Email / Login</th>
                <th>Open jobs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.employee_id?.trim() || '—'}</td>
                  <td className="table-cell-clamp">{(t.work_cell_specialties ?? []).join(', ') || '—'}</td>
                  <td>{t.group_team?.trim() || '—'}</td>
                  <td>{t.active ? 'Yes' : 'No'}</td>
                  <td>
                    <RoleBadge role={t.role} />
                  </td>
                  <td>{rows.find((x) => x.id === t.supervisor_id)?.name ?? '—'}</td>
                  <td>{t.login_email?.trim() || 'No login'}</td>
                  <td>
                    {(() => {
                      const jobs = openJobsForTech(t.id, valves)
                      const count = jobs.length
                      if (valvesLoading) return <span className="job-muted">...</span>
                      if (count === 0) return <span className="job-muted">—</span>
                      const sample = jobs
                        .slice(0, 4)
                        .map((j) => j.valve_id)
                        .join(', ')
                      return (
                        <Link
                          className="technician-open-jobs-link"
                          to="/job-board?view=list"
                          title={sample}
                        >
                          {count}
                        </Link>
                      )
                    })()}
                  </td>
                  <td className="technicians-table-actions">
                    <button type="button" className="button-secondary admin-list-btn" onClick={() => openEdit(t)}>
                      Edit
                    </button>
                    <button type="button" className="button-secondary admin-list-btn" onClick={() => void resetPassword(t)}>
                      Reset password
                    </button>
                    <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void remove(t)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="placeholder-copy">No technicians yet. Click “Add technician”.</p> : null}
        </div>
      )}

      {modalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="technician-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="modal-card modal-card-wide technician-modal-card">
            <div className="technician-modal-head">
              <h3 id="technician-modal-title">{editingId == null ? 'Add technician' : 'Edit technician'}</h3>
              <button type="button" className="modal-close-x" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className="technician-modal-body">
              <label className="modal-label" htmlFor="tech-name">
                Name
              </label>
              <input
                id="tech-name"
                type="text"
                className="modal-status-select"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                disabled={saving}
                autoComplete="name"
              />

              <label className="modal-label" htmlFor="tech-emp">
                Employee ID
              </label>
              <input
                id="tech-emp"
                type="text"
                className="modal-status-select"
                value={draft.employee_id}
                onChange={(e) => setDraft((d) => ({ ...d, employee_id: e.target.value }))}
                disabled={saving}
              />

              <label className="modal-label" htmlFor="tech-cells">
                Work cell specialties
              </label>
              <textarea
                id="tech-cells"
                className="modal-textarea"
                rows={2}
                value={draft.work_cell_specialties}
                onChange={(e) => setDraft((d) => ({ ...d, work_cell_specialties: e.target.value }))}
                disabled={saving}
                placeholder="e.g. Cell 1, Cell 4, hydro bench"
              />

              <label className="modal-label" htmlFor="tech-team">
                Group / team
              </label>
              <input
                id="tech-team"
                type="text"
                className="modal-status-select"
                value={draft.group_team}
                onChange={(e) => setDraft((d) => ({ ...d, group_team: e.target.value }))}
                disabled={saving}
                placeholder="e.g. Day Shift A, PRV Team"
              />

              <label className="technician-active-row">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                  disabled={saving}
                />
                <span>Active</span>
              </label>
              <label className="modal-label" htmlFor="tech-role">
                Role
              </label>
              <select
                id="tech-role"
                className="modal-status-select"
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as Draft['role'] }))}
                disabled={saving}
              >
                <option value="technician">Technician</option>
                <option value="supervisor">Supervisor</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              {draft.role === 'technician' || draft.role === 'supervisor' ? (
                <>
                  <label className="modal-label" htmlFor="tech-supervisor-id">
                    Reports To (Supervisor)
                  </label>
                  <select
                    id="tech-supervisor-id"
                    className="modal-status-select"
                    value={draft.supervisor_id ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, supervisor_id: e.target.value ? Number.parseInt(e.target.value, 10) : null }))
                    }
                    disabled={saving}
                  >
                    <option value="">None</option>
                    {rows
                      .filter((r) => r.active && (r.role === 'supervisor' || r.role === 'manager'))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                  <label className="modal-label" htmlFor="tech-manager-id">
                    Manager
                  </label>
                  <select
                    id="tech-manager-id"
                    className="modal-status-select"
                    value={draft.manager_id ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, manager_id: e.target.value ? Number.parseInt(e.target.value, 10) : null }))
                    }
                    disabled={saving}
                  >
                    <option value="">None</option>
                    {rows
                      .filter((r) => r.active && r.role === 'manager')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </>
              ) : null}
              {editingId == null ? (
                <>
                  <label className="technician-active-row">
                    <input
                      type="checkbox"
                      checked={draft.create_login}
                      onChange={(e) => setDraft((d) => ({ ...d, create_login: e.target.checked }))}
                      disabled={saving}
                    />
                    <span>Create Login Credentials</span>
                  </label>
                  {draft.create_login ? (
                    <>
                      <label className="modal-label" htmlFor="tech-email">
                        Email
                      </label>
                      <input
                        id="tech-email"
                        type="email"
                        className="modal-status-select"
                        value={draft.email}
                        onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                        disabled={saving}
                      />
                      <label className="modal-label" htmlFor="tech-temp-password">
                        Temporary Password
                      </label>
                      <input
                        id="tech-temp-password"
                        type="text"
                        className="modal-status-select"
                        value={draft.temp_password}
                        onChange={(e) => setDraft((d) => ({ ...d, temp_password: e.target.value }))}
                        disabled={saving}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
            <footer className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={() => void saveModal()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}
