import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RoleBadge } from '../components/RoleBadge'
import { useToast } from '../components/ToastNotification'
import { TERMINAL_STATUSES } from '../constants/statuses'
import { supabase } from '../lib/supabase'
import { ensureShopLogin } from '../lib/shopAuth'
import type { Technician } from '../types'

type Draft = {
  name: string
  employee_id: string
  work_cell_specialties: string
  group_team: string
  active: boolean
  role: 'admin' | 'manager' | 'supervisor' | 'technician' | 'sales'
  supervisor_id: number | null
  manager_id: number | null
  create_login: boolean
  username: string
  temp_password: string
}

const LOGIN_EMAIL_DOMAIN = String(import.meta.env.VITE_LOGIN_EMAIL_DOMAIN ?? 'users.jsvalve.local').trim() || 'users.jsvalve.local'

const normalizeUsername = (value: string) => value.trim().toLowerCase()

const usernameToLoginEmail = (username: string) => `${username}@${LOGIN_EMAIL_DOMAIN}`

const PUBLIC_APP_URL =
  String(import.meta.env.VITE_APP_PUBLIC_URL ?? 'https://jsjobboard.vercel.app').trim().replace(/\/$/, '') ||
  'https://jsjobboard.vercel.app'

const appLoginUrl = () => `${PUBLIC_APP_URL}/login`

function buildLoginWelcomeEmail(name: string, username: string, password: string): string {
  const greeting = name.trim() ? `Hi ${name.trim()},` : 'Hi,'
  return `Subject: JS Valve Job Board — your login

${greeting}

Your account has been set up for the JS Valve Job Board.

App link: ${appLoginUrl()}
Username: ${username}
Password: ${password}

Sign in with your username (not your email). Please change your password after your first login.

Thanks,
JS Valve`
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
  username: '',
  temp_password: '',
})

const cloneDraft = (draft: Draft): Draft => ({ ...draft })

export function TechniciansPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<Technician[]>([])
  const [valves, setValves] = useState<{ id: number; valve_id: string; assigned_technician_id: number | null }[]>([])
  const [valvesLoading, setValvesLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [modalBaseline, setModalBaseline] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [listFilter, setListFilter] = useState('')

  const filteredRows = useMemo(() => {
    const q = listFilter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((t) => {
      const haystack = [
        t.name,
        t.employee_id,
        t.group_team,
        t.login_username,
        t.role,
        ...(t.work_cell_specialties ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [listFilter, rows])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('technicians')
      .select(
        'id,name,employee_id,work_cell_specialties,group_team,active,user_id,login_username,login_email,role,supervisor_id,manager_id,created_at,updated_at',
      )
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
    const next = emptyDraft()
    setEditingId(null)
    setDraft(next)
    setModalBaseline(cloneDraft(next))
    setModalOpen(true)
  }

  const openEdit = (t: Technician) => {
    const next: Draft = {
      name: t.name,
      employee_id: t.employee_id ?? '',
      work_cell_specialties: (t.work_cell_specialties ?? []).join(', '),
      group_team: t.group_team ?? '',
      active: t.active,
      role: (t.role as Draft['role']) ?? 'technician',
      supervisor_id: t.supervisor_id ?? null,
      manager_id: t.manager_id ?? null,
      create_login: false,
      username: t.login_username ?? '',
      temp_password: '',
    }
    setEditingId(t.id)
    setDraft(next)
    setModalBaseline(cloneDraft(next))
    setModalOpen(true)
  }

  const technicianModalHasUnsavedChanges = useCallback(() => {
    return JSON.stringify(draft) !== JSON.stringify(modalBaseline)
  }, [draft, modalBaseline])

  const closeModal = useCallback((force = false) => {
    if (saving && !force) return
    if (!force && technicianModalHasUnsavedChanges()) {
      if (!window.confirm('You have unsaved changes. Discard them and close?')) return
    }
    setModalOpen(false)
    setEditingId(null)
    const next = emptyDraft()
    setDraft(next)
    setModalBaseline(next)
  }, [saving, technicianModalHasUnsavedChanges])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, closeModal])

  const saveModal = async () => {
    const name = draft.name.trim()
    if (!name) {
      showToast('Name is required')
      return
    }
    const normalizedUsername = normalizeUsername(draft.username)
    if (!normalizedUsername) {
      showToast('Username is required')
      return
    }
    if (!/^[a-z0-9._-]{3,64}$/.test(normalizedUsername)) {
      showToast('Username must be 3-64 characters: lowercase letters, numbers, dot, underscore, or dash')
      return
    }
    const loginEmail = usernameToLoginEmail(normalizedUsername)
    const duplicateUsername = rows.find(
      (row) =>
        row.id !== editingId &&
        (row.login_username ?? '').trim().toLowerCase() === normalizedUsername,
    )
    if (duplicateUsername) {
      showToast(
        `Username "${normalizedUsername}" is already used by ${duplicateUsername.name}. Edit that person instead, or choose a different username.`,
      )
      return
    }
    const { data: dbConflict } = await supabase
      .from('technicians')
      .select('id,name')
      .eq('login_username', normalizedUsername)
      .maybeSingle()
    if (dbConflict && dbConflict.id !== editingId) {
      showToast(
        `Username "${normalizedUsername}" is already used by ${dbConflict.name}. Click Edit on their row to update them.`,
      )
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
      login_username: normalizedUsername,
      login_email: loginEmail,
      role: draft.role,
      supervisor_id: draft.role === 'technician' || draft.role === 'supervisor' ? draft.supervisor_id : null,
      manager_id: draft.role === 'technician' || draft.role === 'supervisor' ? draft.manager_id : null,
    }
    let authUserId: string | null = null
    let loginCreateWarning: string | null = null
    if (draft.create_login) {
      if (!draft.temp_password.trim()) {
        setSaving(false)
        showToast('Temporary password is required when creating login')
        return
      }
      const existingForAuth = editingId != null ? rows.find((r) => r.id === editingId) : null
      const shopAuth = await ensureShopLogin({
        email: loginEmail,
        password: draft.temp_password.trim(),
        name,
        appRole: draft.role,
        userId: existingForAuth?.user_id,
      })
      if (shopAuth.ok && shopAuth.userId) {
        authUserId = shopAuth.userId
      } else if (shopAuth.needsDeploy) {
        const adminCreate = await supabase.auth.admin.createUser({
          email: loginEmail,
          password: draft.temp_password,
          user_metadata: { role: draft.role, name },
          email_confirm: true,
        })
        if (!adminCreate.error && adminCreate.data.user) {
          authUserId = adminCreate.data.user.id
        } else {
          const adminMsg = adminCreate.error?.message || shopAuth.error || 'unknown error'
          if (/bearer token|not allowed|insufficient|admin/i.test(adminMsg)) {
            loginCreateWarning =
              'Technician was saved, but login was not created. Use Reset password on their row after deploying shop-auth (see supabase/setup-shop-auth-function.md), or create the user in Supabase Auth > Users.'
          } else {
            setSaving(false)
            showToast(`Could not create login: ${adminMsg}`)
            return
          }
        }
      } else {
        setSaving(false)
        showToast(`Could not create login: ${shopAuth.error}`)
        return
      }
    }
    const q =
      editingId == null
        ? supabase.from('technicians').insert({ ...payload, user_id: authUserId })
        : supabase.from('technicians').update({ ...payload, user_id: authUserId ?? undefined }).eq('id', editingId)
    const { error } = await q
    setSaving(false)
    if (error) {
      if (/technicians_role_check|role.*check constraint/i.test(error.message)) {
        showToast(
          'Could not save: the database does not allow the Sales role yet. Run supabase/migration-technician-sales-role.sql in the Supabase SQL Editor, then try again.',
        )
        return
      }
      if (
        error.code === '23505' &&
        /login_username|idx_technicians_login_username_lower_unique/i.test(error.message)
      ) {
        void load()
        showToast(
          `Username "${normalizedUsername}" already exists. Refresh the page — if they still don't appear, run supabase/migration-fix-technicians-admin-read-rls.sql in the Supabase SQL Editor.`,
        )
        return
      }
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
    closeModal(true)
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

  const copyLoginEmailText = async (name: string, username: string, password: string) => {
    try {
      await navigator.clipboard.writeText(buildLoginWelcomeEmail(name, username, password))
      showToast('Login email copied to clipboard — paste into your email app')
    } catch {
      showToast('Could not copy — check browser clipboard permissions')
    }
  }

  const copyLoginEmail = async () => {
    const username = normalizeUsername(draft.username)
    const password = draft.temp_password.trim()
    if (!username) {
      showToast('Enter a username first')
      return
    }
    if (!password) {
      showToast('Enter a temporary password first')
      return
    }
    await copyLoginEmailText(draft.name, username, password)
  }

  const copyLoginEmailForRow = async (t: Technician) => {
    const username = normalizeUsername(t.login_username ?? '')
    if (!username) {
      showToast(`${t.name} has no username — edit their record and add one first`)
      return
    }
    const password = window.prompt(`Temporary password for ${t.name}'s login email`)
    if (!password?.trim()) return
    await copyLoginEmailText(t.name, username, password.trim())
  }

  const resetPassword = async (t: Technician) => {
    const username = normalizeUsername(t.login_username ?? '')
    const email =
      t.login_email?.trim() || (username ? usernameToLoginEmail(username) : '')
    if (!email) {
      showToast('Technician has no username — edit their record and add one first')
      return
    }
    const nextPassword = window.prompt(`Set temporary password for ${t.name}`)
    if (!nextPassword?.trim()) return
    const password = nextPassword.trim()

    const shopAuth = await ensureShopLogin({
      email,
      password,
      name: t.name,
      appRole: t.role ?? 'technician',
      userId: t.user_id,
    })
    if (shopAuth.ok && shopAuth.userId) {
      if (shopAuth.userId !== t.user_id) {
        const { error: linkErr } = await supabase
          .from('technicians')
          .update({ user_id: shopAuth.userId })
          .eq('id', t.id)
        if (linkErr) {
          showToast('Password set, but could not link login to technician record')
        } else {
          void load()
        }
      }
      showToast(shopAuth.created ? 'Login created — they can sign in now' : 'Temporary password updated')
      return
    }
    if (shopAuth.needsDeploy) {
      if (t.user_id) {
        const { error } = await supabase.auth.admin.updateUserById(t.user_id, { password })
        if (!error) {
          showToast('Temporary password updated')
          return
        }
      }
      showToast(
        'Could not set password from the browser. Deploy shop-auth (see supabase/setup-shop-auth-function.md) or create the user in Supabase Dashboard > Authentication > Users.',
      )
      return
    }
    showToast(`Could not reset password: ${shopAuth.error}`)
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

      {!loading && rows.length > 0 ? (
        <label className="technicians-list-filter">
          <input
            type="search"
            className="modal-status-select"
            placeholder="Search by name, username, team, role…"
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            aria-label="Search technicians"
          />
        </label>
      ) : null}

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
                <th>Username</th>
                <th>Open jobs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((t) => (
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
                  <td>{t.login_username?.trim() || 'No username'}</td>
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
                    <button
                      type="button"
                      className="button-secondary admin-list-btn"
                      onClick={() => void copyLoginEmailForRow(t)}
                      disabled={!t.login_username?.trim()}
                      title={t.login_username?.trim() ? 'Copy welcome email to send to this person' : 'Add a username first'}
                    >
                      Copy login email
                    </button>
                    <button type="button" className="button-secondary admin-list-btn danger" onClick={() => void remove(t)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="placeholder-copy">No technicians yet. Click “Add technician”.</p>
          ) : filteredRows.length === 0 ? (
            <p className="placeholder-copy">No technicians match your search.</p>
          ) : null}
        </div>
      )}

      {modalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="technician-modal-title"
        >
          <div className="modal-card modal-card-wide technician-modal-card">
            <div className="technician-modal-head">
              <h3 id="technician-modal-title">{editingId == null ? 'Add technician' : 'Edit technician'}</h3>
              <button type="button" className="modal-close-x" onClick={() => closeModal()} disabled={saving} aria-label="Close">
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
                <option value="sales">Sales</option>
                <option value="admin">Admin</option>
              </select>
              <label className="modal-label" htmlFor="tech-username">
                Username
              </label>
              <input
                id="tech-username"
                type="text"
                className="modal-status-select"
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                disabled={saving}
                autoComplete="username"
                placeholder="e.g. ghensley"
              />
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
                      <button
                        type="button"
                        className="button-secondary technician-copy-login-email"
                        onClick={() => void copyLoginEmail()}
                        disabled={saving || !draft.username.trim() || !draft.temp_password.trim()}
                      >
                        Copy login email
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
            <footer className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={() => closeModal()} disabled={saving}>
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
