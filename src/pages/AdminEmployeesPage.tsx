import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import {
  createEmployeeAccount,
  deactivateEmployeeAccount,
  loadEmployeeAccountStatus,
  resetEmployeePassword,
} from '../lib/employeeAccounts'
import { validateEmployeePassword } from '../lib/auth'
import { useEmployees } from '../hooks/useEmployees'
import type { Employee, EmployeeAccountStatus, EmployeeAuthStatus } from '../types/employees'

type StatusFilter = 'all' | 'no_account' | 'active'

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

export function AdminEmployeesPage() {
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

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkPassword, setBulkPassword] = useState('')
  const [bulkConfirm, setBulkConfirm] = useState('')
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  const loadStatus = useCallback(async (rows: Employee[]) => {
    setStatusLoading(true)
    const withAccounts = rows.filter((row) => row.auth_user_id)
    const details = await loadEmployeeAccountStatus(withAccounts.map((row) => row.id))
    const map: Record<string, EmployeeAccountStatus> = {}
    for (const row of details) {
      map[row.employee_id] = row
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

  const handleCreate = async () => {
    if (!createTarget) return
    const validation = validateEmployeePassword(createPassword, createConfirm)
    if (validation) {
      showToast(validation)
      return
    }

    setBusy(true)
    const result = await createEmployeeAccount({
      employee_id: createTarget.id,
      username: createTarget.username,
      password: createPassword,
      full_name: createTarget.full_name,
    })
    setBusy(false)

    if (!result.ok) {
      showToast(result.needsDeploy ? 'Deploy manage-employee-account in Supabase first' : result.error)
      return
    }

    showToast(`Account created for ${createTarget.full_name} — login: ${createTarget.username}`)
    setCreateTarget(null)
    setCreatePassword('')
    setCreateConfirm('')
    await refreshAll()
  }

  const handleReset = async () => {
    if (!resetTarget) return
    const validation = validateEmployeePassword(resetPassword, resetConfirm)
    if (validation) {
      showToast(validation)
      return
    }

    setBusy(true)
    const result = await resetEmployeePassword({
      employee_id: resetTarget.id,
      new_password: resetPassword,
    })
    setBusy(false)

    if (!result.ok) {
      showToast(result.needsDeploy ? 'Deploy manage-employee-account in Supabase first' : result.error)
      return
    }

    showToast(`Password reset for ${resetTarget.full_name}`)
    setResetTarget(null)
    setResetPassword('')
    setResetConfirm('')
  }

  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    setBusy(true)
    const result = await deactivateEmployeeAccount(deactivateTarget.id)
    setBusy(false)

    if (!result.ok) {
      showToast(result.needsDeploy ? 'Deploy manage-employee-account in Supabase first' : result.error)
      return
    }

    showToast(`${deactivateTarget.full_name} deactivated`)
    setDeactivateTarget(null)
    await refreshAll()
  }

  const handleBulkCreate = async () => {
    const validation = validateEmployeePassword(bulkPassword, bulkConfirm)
    if (validation) {
      showToast(validation)
      return
    }
    if (!missingAccounts.length) {
      showToast('No missing accounts')
      return
    }

    setBusy(true)
    setBulkProgress({ done: 0, total: missingAccounts.length })
    let created = 0

    for (let i = 0; i < missingAccounts.length; i += 1) {
      const employee = missingAccounts[i]
      const result = await createEmployeeAccount({
        employee_id: employee.id,
        username: employee.username,
        password: bulkPassword,
        full_name: employee.full_name,
      })
      if (result.ok) created += 1
      setBulkProgress({ done: i + 1, total: missingAccounts.length })
    }

    setBusy(false)
    setBulkOpen(false)
    setBulkPassword('')
    setBulkConfirm('')
    setBulkProgress(null)
    showToast(
      created === missingAccounts.length
        ? 'All accounts created. Hand out the username list and temporary password.'
        : `Created ${created} of ${missingAccounts.length} accounts`,
    )
    await refreshAll()
  }

  return (
    <section className="dashboard-page admin-employees-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Employees</h2>
        <div className="admin-employees-title-actions">
          <Link to="/admin/employees/print-usernames" className="button-secondary" target="_blank">
            Print usernames
          </Link>
          <button
            type="button"
            className="button-primary"
            disabled={busy || missingAccounts.length === 0}
            onClick={() => setBulkOpen(true)}
          >
            Create All Missing Accounts
          </button>
        </div>
      </div>

      <p className="placeholder-copy">
        Create shop logins for J-S Machine &amp; Valve staff. Employees sign in with their username and password only.
        Mike can reset passwords at any time.
      </p>

      {error ? <p className="admin-employees-error">{error}</p> : null}

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
                <th>Status</th>
                <th>Last Sign In</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Loading employees…</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7}>No employees match your filters.</td>
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
                      <td>{statusLabel(status)}</td>
                      <td>{statusLoading && employee.auth_user_id ? '…' : formatDateTime(lastSignIn)}</td>
                      <td>
                        <div className="admin-employees-actions">
                          {status === 'no_account' ? (
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
                          ) : status === 'active' ? (
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

      {createTarget ? (
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

      {resetTarget ? (
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

      {deactivateTarget ? (
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

      {bulkOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => !busy && setBulkOpen(false)}>
          <div className="modal-card modal-card-wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="technician-modal-head">
              <h3>Create accounts for {missingAccounts.length} employees</h3>
            </div>
            <div className="technician-modal-body">
              <ul className="admin-employees-bulk-list">
                {missingAccounts.map((employee) => (
                  <li key={employee.id}>
                    {employee.full_name} — <code>{employee.username}</code>
                  </li>
                ))}
              </ul>
              <label>
                Set the same temporary password for all
                <input type="password" value={bulkPassword} onChange={(e) => setBulkPassword(e.target.value)} />
              </label>
              <label>
                Confirm Password
                <input type="password" value={bulkConfirm} onChange={(e) => setBulkConfirm(e.target.value)} />
              </label>
              {bulkProgress ? (
                <p className="admin-employees-bulk-progress">
                  Created {bulkProgress.done} of {bulkProgress.total}…
                </p>
              ) : null}
            </div>
            <div className="technician-modal-footer">
              <button type="button" className="button-secondary" onClick={() => setBulkOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button-primary" disabled={busy} onClick={() => void handleBulkCreate()}>
                {busy ? 'Creating…' : 'Create All'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
