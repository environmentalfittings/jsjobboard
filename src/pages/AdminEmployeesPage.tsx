import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { validateEmployeePassword } from '../lib/auth'
import { loadEmployeeAccountStatus } from '../lib/employeeAccounts'
import { supabase } from '../lib/supabase'
import { useEmployees } from '../hooks/useEmployees'
import type {
  Employee,
  EmployeeAccountStatus,
  EmployeeAuthStatus,
  QualityTeamLevel,
} from '../types/employees'
import {
  QUALITY_TEAM_LEVEL_OPTIONS,
  normalizeQualityTeamLevel,
  qualityTeamLevelLabel,
} from '../types/employees'

type StatusFilter = 'all' | 'no_account' | 'active'

type ManageEmployeeAccountPayload = {
  error?: string
  success?: boolean
  user_id?: string
  rows?: EmployeeAccountStatus[]
}

function isDeployError(message: string) {
  return /failed to fetch|404|not found|function/i.test(message)
}

async function invokeManageEmployeeAccount(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-employee-account', { body })
  if (error) throw error
  const payload = (data ?? {}) as ManageEmployeeAccountPayload
  if (payload.error) throw new Error(payload.error)
  return payload
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function employeeStatus(employee: Employee): EmployeeAuthStatus {
  if (!employee.is_active) return 'inactive'
  if (employee.auth_user_id) return 'active'
  return 'no_account'
}

function statusLabel(status: EmployeeAuthStatus) {
  if (status === 'active') return '✅ Active'
  if (status === 'inactive') return 'Inactive'
  return '⭕ No Account'
}

export function AdminEmployeesPage({ isAdmin }: { isAdmin: boolean }) {
  const { showToast } = useToast()
  const { employees, loading, error, reload } = useEmployees()
  const [accountStatus, setAccountStatus] = useState<Record<string, EmployeeAccountStatus>>({})
  const [statusLoading, setStatusLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [busy, setBusy] = useState(false)

  const [createTarget, setCreateTarget] = useState<Employee | null>(null)
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirm, setCreateConfirm] = useState('')

  const [resetTarget, setResetTarget] = useState<Employee | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')

  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    employee_no: '',
    first_name: '',
    last_name: '',
    username: '',
    initials: '',
    is_tester: false,
    is_salesman: false,
    quality_team_level: 'none' as QualityTeamLevel,
    createLogin: false,
    password: '',
    confirmPassword: '',
  })

  const loadStatus = useCallback(async (rows: Employee[]) => {
    setStatusLoading(true)
    const withAccounts = rows.filter((row) => row.auth_user_id)
    const employeeIds = withAccounts.map((row) => row.id)
    const map: Record<string, EmployeeAccountStatus> = {}

    if (employeeIds.length) {
      const statusRows = await loadEmployeeAccountStatus(employeeIds)
      for (const row of statusRows) {
        map[row.employee_id] = row
      }
    }

    // Current session always has last_sign_in_at — fill it in even if RPC is missing.
    const { data: me } = await supabase.auth.getUser()
    const myId = me.user?.id
    const myLastSignIn = me.user?.last_sign_in_at ?? null
    if (myId && myLastSignIn) {
      const mine = rows.find((row) => row.auth_user_id === myId)
      if (mine) {
        map[mine.id] = {
          employee_id: mine.id,
          last_sign_in_at: map[mine.id]?.last_sign_in_at || myLastSignIn,
        }
      }
    }

    setAccountStatus(map)
    setStatusLoading(false)
  }, [])

  useEffect(() => {
    if (!employees.length) return
    void loadStatus(employees)
  }, [employees, loadStatus])

  const missingAccounts = useMemo(
    () => employees.filter((employee) => employee.is_active && !employee.auth_user_id),
    [employees],
  )

  const nextEmployeeNo = useMemo(() => {
    let max = 0
    for (const row of employees) {
      const n = Number.parseInt(String(row.employee_no).replace(/\D/g, ''), 10)
      if (Number.isFinite(n) && n > max) max = n
    }
    return String(max + 1)
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((employee) => {
      const status = employeeStatus(employee)
      if (statusFilter === 'no_account' && status !== 'no_account') return false
      if (statusFilter === 'active' && status !== 'active') return false
      if (!q) return true
      const haystack = [employee.full_name, employee.employee_no, employee.initials, employee.username]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, search, statusFilter])

  const refreshAll = async () => {
    await reload()
  }

  const openAddEmployee = () => {
    setAddForm({
      employee_no: nextEmployeeNo,
      first_name: '',
      last_name: '',
      username: '',
      initials: '',
      is_tester: false,
      is_salesman: false,
      quality_team_level: 'none',
      createLogin: false,
      password: '',
      confirmPassword: '',
    })
    setAddOpen(true)
  }

  const patchAddName = (field: 'first_name' | 'last_name', value: string) => {
    setAddForm((prev) => {
      const next = { ...prev, [field]: value }
      const first = field === 'first_name' ? value : next.first_name
      const last = field === 'last_name' ? value : next.last_name
      const autoUsername =
        `${first.trim().charAt(0)}${last.trim()}`.toLowerCase().replace(/[^a-z0-9]/g, '') || ''
      const autoInitials =
        `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase().replace(/[^A-Z]/g, '') || ''
      // Only auto-fill username/initials while they still match the previous suggestion pattern
      // or are empty — keep manual edits if user changed them.
      const prevAutoUser =
        `${prev.first_name.trim().charAt(0)}${prev.last_name.trim()}`
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') || ''
      const prevAutoInit =
        `${prev.first_name.trim().charAt(0)}${prev.last_name.trim().charAt(0)}`
          .toUpperCase()
          .replace(/[^A-Z]/g, '') || ''
      return {
        ...next,
        username: !prev.username || prev.username === prevAutoUser ? autoUsername : prev.username,
        initials: !prev.initials || prev.initials === prevAutoInit ? autoInitials : prev.initials,
      }
    })
  }

  const handleAddEmployee = async () => {
    if (!isAdmin) {
      showToast('Only Admin can add employees')
      return
    }
    const employee_no = addForm.employee_no.trim()
    const first_name = addForm.first_name.trim()
    const last_name = addForm.last_name.trim()
    const username = addForm.username.trim().toLowerCase()
    const initials = addForm.initials.trim().toUpperCase()
    if (!employee_no || !first_name || !last_name || !username || !initials) {
      showToast('Employee #, name, username, and initials are required')
      return
    }
    if (employees.some((e) => e.username.toLowerCase() === username)) {
      showToast('That username is already in use')
      return
    }
    if (employees.some((e) => e.employee_no === employee_no)) {
      showToast('That employee # is already in use')
      return
    }
    if (addForm.createLogin) {
      const validation = validateEmployeePassword(addForm.password, addForm.confirmPassword)
      if (validation) {
        showToast(validation)
        return
      }
    }

    setBusy(true)
    const full_name = `${first_name} ${last_name}`.trim()
    const payload = {
      employee_no,
      first_name,
      last_name,
      full_name,
      username,
      initials,
      company: 'J-S Machine & Valve, Inc.',
      is_active: true,
      is_tester: addForm.is_tester,
      is_salesman: addForm.is_salesman,
      quality_team_level: addForm.quality_team_level,
      auth_user_id: null as string | null,
    }

    const { data, error } = await supabase.from('employees').insert(payload).select('id,full_name,username').single()
    if (error || !data) {
      setBusy(false)
      showToast(
        error?.message?.includes('policy') || error?.message?.includes('RLS')
          ? 'Run migration-employees-write-policies.sql in Supabase, then try again'
          : error?.message ?? 'Could not add employee',
      )
      return
    }

    if (addForm.createLogin) {
      try {
        await invokeManageEmployeeAccount({
          action: 'create',
          employee_id: data.id,
          username: data.username,
          password: addForm.password,
          full_name: data.full_name,
        })
        showToast(`Employee added and login created — username: ${data.username}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login create failed'
        showToast(
          isDeployError(message)
            ? `Employee added, but deploy manage-employee-account to create login for ${data.username}`
            : `Employee added, but login failed: ${message}`,
        )
        setBusy(false)
        setAddOpen(false)
        await refreshAll()
        return
      }
    } else {
      showToast(`Employee added: ${full_name}`)
    }

    setBusy(false)
    setAddOpen(false)
    await refreshAll()
  }

  const handleCreate = async () => {
    if (!isAdmin) {
      showToast('Only Admin can create employee accounts')
      return
    }
    if (!createTarget) return
    const validation = validateEmployeePassword(createPassword, createConfirm)
    if (validation) {
      showToast(validation)
      return
    }

    setBusy(true)
    try {
      await invokeManageEmployeeAccount({
        action: 'create',
        employee_id: createTarget.id,
        username: createTarget.username,
        password: createPassword,
        full_name: createTarget.full_name,
      })
      showToast(`Account created for ${createTarget.full_name} — login: ${createTarget.username}`)
      setCreateTarget(null)
      setCreatePassword('')
      setCreateConfirm('')
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create account'
      showToast(isDeployError(message) ? 'Deploy manage-employee-account in Supabase first' : message)
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async () => {
    if (!isAdmin) {
      showToast('Only Admin can reset passwords')
      return
    }
    if (!resetTarget) return
    const validation = validateEmployeePassword(resetPassword, resetConfirm)
    if (validation) {
      showToast(validation)
      return
    }

    setBusy(true)
    try {
      await invokeManageEmployeeAccount({
        action: 'reset_password',
        employee_id: resetTarget.id,
        new_password: resetPassword,
      })
      showToast(`Password reset for ${resetTarget.full_name}`)
      setResetTarget(null)
      setResetPassword('')
      setResetConfirm('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reset password'
      showToast(isDeployError(message) ? 'Deploy manage-employee-account in Supabase first' : message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeactivate = async () => {
    if (!isAdmin) {
      showToast('Only Admin can deactivate employees')
      return
    }
    if (!deactivateTarget) return
    setBusy(true)
    try {
      await invokeManageEmployeeAccount({
        action: 'deactivate',
        employee_id: deactivateTarget.id,
      })
      showToast(`${deactivateTarget.full_name} deactivated`)
      setDeactivateTarget(null)
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not deactivate employee'
      showToast(isDeployError(message) ? 'Deploy manage-employee-account in Supabase first' : message)
    } finally {
      setBusy(false)
    }
  }

  const toggleTester = async (employee: Employee, nextValue: boolean) => {
    if (!isAdmin) {
      showToast('Only Admin can update tester designation')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('set_employee_is_tester', {
      p_employee_id: employee.id,
      p_is_tester: nextValue,
    })
    setBusy(false)
    if (rpcError) {
      const message = rpcError.message || 'Could not update tester designation'
      showToast(
        /Only Admin can update tester designation/i.test(message)
          ? 'Admin check failed in database. Re-run supabase/migration-employee-is-tester.sql, then try again.'
          : /set_employee_is_tester|function|schema cache|does not exist/i.test(message)
            ? 'Run migration-employee-is-tester.sql in Supabase SQL Editor first'
            : message,
      )
      return
    }
    showToast(
      nextValue ? `${employee.full_name} marked as tester` : `${employee.full_name} removed from testers`,
    )
    await reload()
  }

  const toggleSalesman = async (employee: Employee, nextValue: boolean) => {
    if (!isAdmin) {
      showToast('Only Admin can update salesman designation')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('set_employee_is_salesman', {
      p_employee_id: employee.id,
      p_is_salesman: nextValue,
    })
    setBusy(false)
    if (rpcError) {
      const message = rpcError.message || 'Could not update salesman designation'
      showToast(
        /Only Admin can update salesman designation/i.test(message)
          ? 'Admin check failed in database. Re-run supabase/migration-employee-is-salesman.sql, then try again.'
          : /set_employee_is_salesman|function|schema cache|does not exist|is_salesman/i.test(message)
            ? 'Run migration-employee-is-salesman.sql in Supabase SQL Editor first'
            : message,
      )
      return
    }
    showToast(
      nextValue
        ? `${employee.full_name} marked as salesman`
        : `${employee.full_name} removed from salesmen`,
    )
    await reload()
  }

  const setQualityTeamLevel = async (employee: Employee, nextLevel: QualityTeamLevel) => {
    if (!isAdmin) {
      showToast('Only Admin can update Quality Team level')
      return
    }
    const level = normalizeQualityTeamLevel(nextLevel)
    if (level === employee.quality_team_level) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('set_employee_quality_team_level', {
      p_employee_id: employee.id,
      p_quality_team_level: level,
    })
    setBusy(false)
    if (rpcError) {
      const message = rpcError.message || 'Could not update Quality Team level'
      showToast(
        /Only Admin can update quality team level/i.test(message)
          ? 'Admin check failed in database. Re-run supabase/migration-employee-quality-team.sql, then try again.'
          : /set_employee_quality_team_level|function|schema cache|does not exist|quality_team_level/i.test(
                message,
              )
            ? 'Run migration-employee-quality-team.sql in Supabase SQL Editor first (not the is_tester migration).'
            : message,
      )
      return
    }
    showToast(
      level === 'none'
        ? `${employee.full_name} removed from Quality Team`
        : `${employee.full_name} set to Quality Team ${qualityTeamLevelLabel(level)}`,
    )
    await reload()
  }

  return (
    <section className="dashboard-page admin-employees-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Employees</h2>
        <div className="admin-employees-title-actions">
          <Link to="/admin/employees/print-usernames" className="button-secondary" target="_blank">
            Print usernames
          </Link>
          {isAdmin ? (
            <button type="button" className="button-primary" disabled={busy} onClick={openAddEmployee}>
              Add employee
            </button>
          ) : null}
        </div>
      </div>

      <p className="placeholder-copy">
        {isAdmin
          ? 'Add staff to the roster and create shop logins. Employees sign in with their username and password only.'
          : 'Shop employee roster and login status. Contact an admin if you need a new account or a password reset.'}
      </p>

      {error ? <p className="admin-employees-error">{error}</p> : null}
      <p className="admin-employees-tester-hint">
        Check <strong>Tester</strong> for people who should appear in the Test Log tester dropdown. Check{' '}
        <strong>Salesman</strong> for people who should appear when assigning a salesman on Inventory by Customer
        or Admin → Lists → Customers. Use <strong>Quality Team</strong> to assign Admin, Manager, Supervisor, or
        Technician (access by level comes later).
      </p>

      <section className="dashboard-panel admin-employees-panel">
        <div className="admin-employees-filters">
          <label>
            Search
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, username, employee #, or initials"
            />
          </label>
          <fieldset className="admin-employees-status-filter">
            <legend>Status</legend>
            {(
              [
                ['all', 'All'],
                ['no_account', 'No Account'],
                ['active', 'Active'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="employee-status-filter"
                  checked={statusFilter === value}
                  onChange={() => setStatusFilter(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <button type="button" className="button-secondary" onClick={() => void refreshAll()} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="dashboard-table-wrap">
          <table className="dashboard-table admin-employees-table">
            <thead>
              <tr>
                <th>Employee #</th>
                <th>Name</th>
                <th>Username</th>
                <th>Initials</th>
                <th>Tester</th>
                <th>Salesman</th>
                <th>Quality Team</th>
                <th>Status</th>
                <th>Last Sign In</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10}>Loading employees…</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={10}>No employees match your filters.</td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => {
                  const status = employeeStatus(employee)
                  const lastSignIn = accountStatus[employee.id]?.last_sign_in_at
                  return (
                    <tr
                      key={employee.id}
                      className={status === 'inactive' ? 'admin-employees-row-inactive' : undefined}
                    >
                      <td>{employee.employee_no}</td>
                      <td>{employee.full_name}</td>
                      <td>
                        <code>{employee.username}</code>
                      </td>
                      <td>{employee.initials}</td>
                      <td>
                        <label className="admin-employees-tester-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(employee.is_tester)}
                            disabled={!isAdmin || busy || !employee.is_active}
                            onChange={(e) => void toggleTester(employee, e.target.checked)}
                            aria-label={`Mark ${employee.full_name} as tester`}
                          />
                          <span>{employee.is_tester ? 'Yes' : 'No'}</span>
                        </label>
                      </td>
                      <td>
                        <label className="admin-employees-tester-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(employee.is_salesman)}
                            disabled={!isAdmin || busy || !employee.is_active}
                            onChange={(e) => void toggleSalesman(employee, e.target.checked)}
                            aria-label={`Mark ${employee.full_name} as salesman`}
                          />
                          <span>{employee.is_salesman ? 'Yes' : 'No'}</span>
                        </label>
                      </td>
                      <td>
                        <select
                          className="admin-employees-quality-select"
                          value={employee.quality_team_level ?? 'none'}
                          disabled={!isAdmin || busy || !employee.is_active}
                          aria-label={`Quality Team level for ${employee.full_name}`}
                          onChange={(e) =>
                            void setQualityTeamLevel(
                              employee,
                              normalizeQualityTeamLevel(e.target.value),
                            )
                          }
                        >
                          {QUALITY_TEAM_LEVEL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{statusLabel(status)}</td>
                      <td>{statusLoading && employee.auth_user_id ? '…' : formatDateTime(lastSignIn)}</td>
                      <td>
                        <div className="admin-employees-actions">
                          {isAdmin && status === 'no_account' ? (
                            <button
                              type="button"
                              className="button-secondary admin-employees-action"
                              onClick={() => {
                                setCreateTarget(employee)
                                setCreatePassword('')
                                setCreateConfirm('')
                              }}
                              disabled={busy}
                            >
                              Create Account
                            </button>
                          ) : isAdmin && status === 'active' ? (
                            <>
                              <button
                                type="button"
                                className="button-secondary admin-employees-action"
                                onClick={() => {
                                  setResetTarget(employee)
                                  setResetPassword('')
                                  setResetConfirm('')
                                }}
                                disabled={busy}
                              >
                                Reset Password
                              </button>
                              <button
                                type="button"
                                className="button-secondary admin-employees-action"
                                onClick={() => setDeactivateTarget(employee)}
                                disabled={busy}
                              >
                                Deactivate
                              </button>
                            </>
                          ) : (
                            '—'
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && createTarget ? (
        <div className="modal-overlay" role="presentation" onClick={() => !busy && setCreateTarget(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="technician-modal-head">
              <h3>Create Account</h3>
            </div>
            <div className="technician-modal-body">
              <label>
                Employee
                <input type="text" value={createTarget.full_name} readOnly />
              </label>
              <label>
                Username
                <input type="text" value={createTarget.username} readOnly />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                Confirm Password
                <input type="password" value={createConfirm} onChange={(e) => setCreateConfirm(e.target.value)} />
              </label>
            </div>
            <div className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={() => setCreateTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void handleCreate()}>
                {busy ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && resetTarget ? (
        <div className="modal-overlay" role="presentation" onClick={() => !busy && setResetTarget(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="technician-modal-head">
              <h3>Reset Password</h3>
            </div>
            <div className="technician-modal-body">
              <label>
                Employee
                <input type="text" value={resetTarget.full_name} readOnly />
              </label>
              <label>
                New Password
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                Confirm Password
                <input type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} />
              </label>
            </div>
            <div className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={() => setResetTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void handleReset()}>
                {busy ? 'Saving…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && deactivateTarget ? (
        <div className="modal-overlay" role="presentation" onClick={() => !busy && setDeactivateTarget(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="technician-modal-head">
              <h3>Deactivate employee?</h3>
            </div>
            <div className="technician-modal-body">
              <p>
                Deactivate <strong>{deactivateTarget.full_name}</strong>? They will no longer be able to log in.
              </p>
            </div>
            <div className="technician-modal-footer">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setDeactivateTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void handleDeactivate()}>
                {busy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && addOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => !busy && setAddOpen(false)}>
          <div className="modal-card modal-card-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="technician-modal-head">
              <h3>Add employee</h3>
            </div>
            <div className="technician-modal-body">
              <div className="admin-employees-add-grid">
                <label>
                  Employee #
                  <input
                    type="text"
                    value={addForm.employee_no}
                    onChange={(e) => setAddForm((f) => ({ ...f, employee_no: e.target.value }))}
                  />
                </label>
                <label>
                  First name
                  <input
                    type="text"
                    value={addForm.first_name}
                    onChange={(e) => patchAddName('first_name', e.target.value)}
                    autoFocus
                  />
                </label>
                <label>
                  Last name
                  <input
                    type="text"
                    value={addForm.last_name}
                    onChange={(e) => patchAddName('last_name', e.target.value)}
                  />
                </label>
                <label>
                  Username
                  <input
                    type="text"
                    value={addForm.username}
                    onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </label>
                <label>
                  Initials
                  <input
                    type="text"
                    value={addForm.initials}
                    onChange={(e) => setAddForm((f) => ({ ...f, initials: e.target.value.toUpperCase() }))}
                    maxLength={4}
                  />
                </label>
                <label className="admin-employees-add-check">
                  <input
                    type="checkbox"
                    checked={addForm.is_tester}
                    onChange={(e) => setAddForm((f) => ({ ...f, is_tester: e.target.checked }))}
                  />
                  Tester (show in Test Log)
                </label>
                <label className="admin-employees-add-check">
                  <input
                    type="checkbox"
                    checked={addForm.is_salesman}
                    onChange={(e) => setAddForm((f) => ({ ...f, is_salesman: e.target.checked }))}
                  />
                  Salesman (show in customer salesman dropdowns)
                </label>
                <label>
                  Quality Team
                  <select
                    value={addForm.quality_team_level}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        quality_team_level: normalizeQualityTeamLevel(e.target.value),
                      }))
                    }
                  >
                    {QUALITY_TEAM_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.value === 'none' ? 'Not on Quality Team' : opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-employees-add-check">
                  <input
                    type="checkbox"
                    checked={addForm.createLogin}
                    onChange={(e) => setAddForm((f) => ({ ...f, createLogin: e.target.checked }))}
                  />
                  Also create login account
                </label>
              </div>
              {addForm.createLogin ? (
                <>
                  <label>
                    Temporary password
                    <input
                      type="password"
                      value={addForm.password}
                      onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </label>
                  <label>
                    Confirm password
                    <input
                      type="password"
                      value={addForm.confirmPassword}
                      onChange={(e) => setAddForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <p className="placeholder-copy">
                  You can create their login later with <strong>Create Account</strong> on their row.
                  {missingAccounts.length
                    ? ` (${missingAccounts.length} existing employees still need accounts.)`
                    : ''}
                </p>
              )}
            </div>
            <div className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={() => setAddOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void handleAddEmployee()}>
                {busy ? 'Saving…' : 'Add employee'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
