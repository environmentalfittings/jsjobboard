import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { validateEmployeePassword } from '../lib/auth'
import { loadEmployeeAccountStatus } from '../lib/employeeAccounts'
import {
  createOrganization,
  listOrganizationMembersForEmployees,
  setEmployeeOrganizationAccess,
} from '../lib/organizations'
import { supabase } from '../lib/supabase'
import { useEmployees } from '../hooks/useEmployees'
import { TechniciansPage } from './TechniciansPage'
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
import {
  ORGANIZATION_ROLE_OPTIONS,
  normalizeOrganizationRole,
  type OrganizationMember,
  type OrganizationRole,
} from '../types/organizations'

/** Required once so Superadmin (no Supabase session) can SELECT the roster. */
const EMPLOYEES_ANON_READ_SQL = `-- Allow Superadmin / local login to read the Employees roster
-- Run once in Supabase → SQL Editor, then Refresh this page.

begin;

drop policy if exists "anon read employees" on public.employees;
create policy "anon read employees"
on public.employees
for select
to anon
using (true);

commit;`

function slugifyCompanyName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type StatusFilter = 'all' | 'no_account' | 'active'
/** `all` or an organization id — view-only filter for the roster. */
type CompanyFilter = 'all' | string
type EmployeesTab = 'roster' | 'shop'

function parseEmployeesTab(value: string | null): EmployeesTab {
  return value === 'shop' ? 'shop' : 'roster'
}

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
  const {
    orgsEnabled,
    isLocalOrganizations,
    organizations,
    isOrgSuperAdmin,
    refreshOrganizations,
  } = useOrganization()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseEmployeesTab(searchParams.get('tab'))
  const setActiveTab = (tab: EmployeesTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'roster') next.delete('tab')
        else next.set('tab', tab)
        return next
      },
      { replace: true },
    )
  }
  const { employees, loading, error, reload } = useEmployees()
  const [accountStatus, setAccountStatus] = useState<Record<string, EmployeeAccountStatus>>({})
  const [statusLoading, setStatusLoading] = useState(false)
  const [orgMembers, setOrgMembers] = useState<OrganizationMember[]>([])
  const [orgMembersLoading, setOrgMembersLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>('all')
  const [busy, setBusy] = useState(false)

  const [createTarget, setCreateTarget] = useState<Employee | null>(null)
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirm, setCreateConfirm] = useState('')

  const [resetTarget, setResetTarget] = useState<Employee | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')

  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)

  const [createCompanyOpen, setCreateCompanyOpen] = useState(false)
  const [createCompanyName, setCreateCompanyName] = useState('')
  const [createCompanySlug, setCreateCompanySlug] = useState('')
  const [createCompanySlugTouched, setCreateCompanySlugTouched] = useState(false)

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
  /** Company access chosen at create time (Superadmin / multi-company). */
  const [addCompanyAccess, setAddCompanyAccess] = useState<
    Record<string, { canAccess: boolean; role: OrganizationRole }>
  >({})

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

  const loadOrgMembers = useCallback(async (rows: Employee[]) => {
    if (!orgsEnabled) {
      setOrgMembers([])
      setOrgMembersLoading(false)
      return
    }
    setOrgMembersLoading(true)
    const result = await listOrganizationMembersForEmployees(rows.map((row) => row.id))
    setOrgMembers(result.enabled ? result.data : [])
    setOrgMembersLoading(false)
  }, [orgsEnabled])

  useEffect(() => {
    if (!employees.length) {
      setOrgMembers([])
      return
    }
    void loadOrgMembers(employees)
  }, [employees, loadOrgMembers])

  const orgAccessByEmployee = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const row of orgMembers) {
      if (!row.employee_id || !row.can_access) continue
      const set = map.get(row.employee_id) ?? new Set<string>()
      set.add(row.organization_id)
      map.set(row.employee_id, set)
    }
    return map
  }, [orgMembers])

  const orgRoleByEmployee = useMemo(() => {
    const map = new Map<string, Map<string, OrganizationRole>>()
    for (const row of orgMembers) {
      if (!row.employee_id) continue
      const byOrg = map.get(row.employee_id) ?? new Map<string, OrganizationRole>()
      byOrg.set(row.organization_id, row.role)
      map.set(row.employee_id, byOrg)
    }
    return map
  }, [orgMembers])

  const canAssignCompanyRoles = isAdmin && isOrgSuperAdmin
  const rosterColSpan = orgsEnabled ? 11 : 10

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
      if (companyFilter !== 'all') {
        const access = orgAccessByEmployee.get(employee.id)
        if (!access?.has(companyFilter)) return false
      }
      if (!q) return true
      const haystack = [employee.full_name, employee.employee_no, employee.initials, employee.username]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [employees, search, statusFilter, companyFilter, orgAccessByEmployee])

  const refreshAll = async () => {
    await reload()
    if (orgsEnabled) await refreshOrganizations()
  }

  const toggleCompanyAccess = async (
    employee: Employee,
    organizationId: string,
    canAccess: boolean,
  ) => {
    if (!isAdmin) {
      showToast('Only Admin can change company access')
      return
    }
    if (!orgsEnabled) return
    setBusy(true)
    const existingRole = orgRoleByEmployee.get(employee.id)?.get(organizationId)
    const { error: accessError } = await setEmployeeOrganizationAccess({
      employeeId: employee.id,
      organizationId,
      canAccess,
      role: existingRole ?? 'technician',
      userId: employee.auth_user_id,
    })
    if (accessError) {
      setBusy(false)
      showToast(accessError)
      return
    }
    await loadOrgMembers(employees)
    setBusy(false)
    showToast(
      canAccess
        ? `Granted ${employee.full_name} access`
        : `Removed ${employee.full_name} access`,
    )
  }

  const setCompanyRole = async (
    employee: Employee,
    organizationId: string,
    role: OrganizationRole,
  ) => {
    if (!canAssignCompanyRoles) {
      showToast('Only Superadmin can assign company roles')
      return
    }
    if (!orgsEnabled) return
    setBusy(true)
    const { error: accessError } = await setEmployeeOrganizationAccess({
      employeeId: employee.id,
      organizationId,
      canAccess: true,
      role,
      userId: employee.auth_user_id,
    })
    if (accessError) {
      setBusy(false)
      showToast(accessError)
      return
    }
    await loadOrgMembers(employees)
    setBusy(false)
    showToast(`Set ${employee.full_name} to ${role.replace('_', ' ')}`)
  }

  const openCreateCompany = () => {
    setCreateCompanyName('')
    setCreateCompanySlug('')
    setCreateCompanySlugTouched(false)
    setCreateCompanyOpen(true)
  }

  const handleCreateCompany = async () => {
    if (!isOrgSuperAdmin) {
      showToast('Only a super admin can create companies')
      return
    }
    const name = createCompanyName.trim()
    const slug = (createCompanySlugTouched ? createCompanySlug : slugifyCompanyName(name)).trim()
    if (!name) {
      showToast('Company name is required')
      return
    }
    if (!slug) {
      showToast('Company slug is required')
      return
    }
    setBusy(true)
    const { data, error: createError } = await createOrganization({ name, slug })
    setBusy(false)
    if (createError || !data) {
      showToast(createError ?? 'Could not create company')
      return
    }
    setCreateCompanyOpen(false)
    await refreshOrganizations()
    showToast(`Company created: ${data.name}`)
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
    // Default new hires to JS Valve technician access; Superadmin can add VSI etc.
    const defaults: Record<string, { canAccess: boolean; role: OrganizationRole }> = {}
    for (const org of organizations) {
      const isJs =
        org.slug === 'js-valve' ||
        org.id.includes('js-valve') ||
        /js\s*valve/i.test(org.name)
      defaults[org.id] = { canAccess: isJs, role: 'technician' }
    }
    setAddCompanyAccess(defaults)
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

    let authUserId: string | null = null
    let toastMessage = `Employee added: ${full_name}`

    if (addForm.createLogin) {
      try {
        await invokeManageEmployeeAccount({
          action: 'create',
          employee_id: data.id,
          username: data.username,
          password: addForm.password,
          full_name: data.full_name,
        })
        const { data: linked } = await supabase
          .from('employees')
          .select('auth_user_id')
          .eq('id', data.id)
          .maybeSingle()
        authUserId = linked?.auth_user_id ? String(linked.auth_user_id) : null
        toastMessage = `Employee added and login created — username: ${data.username}`
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login create failed'
        toastMessage = isDeployError(message)
          ? `Employee added, but deploy manage-employee-account to create login for ${data.username}`
          : `Employee added, but login failed: ${message}`
      }
    }

    if (orgsEnabled) {
      const selected = Object.entries(addCompanyAccess).filter(([, value]) => value.canAccess)
      if (selected.length === 0) {
        // Never leave a new hire with zero companies — default to JS Valve technician.
        const jsOrg = organizations.find(
          (org) =>
            org.slug === 'js-valve' || org.id.includes('js-valve') || /js\s*valve/i.test(org.name),
        )
        if (jsOrg) {
          selected.push([jsOrg.id, { canAccess: true, role: 'technician' }])
        }
      }
      for (const [organizationId, value] of selected) {
        const { error: accessError } = await setEmployeeOrganizationAccess({
          employeeId: data.id,
          organizationId,
          canAccess: true,
          role: value.role,
          userId: authUserId,
        })
        if (accessError) {
          toastMessage = `${toastMessage}. Company access failed: ${accessError}`
          break
        }
      }
      const companyNames = selected
        .map(([orgId]) => organizations.find((org) => org.id === orgId)?.name)
        .filter(Boolean)
        .join(', ')
      if (companyNames && !toastMessage.includes('Company access failed')) {
        toastMessage = `${toastMessage} · ${companyNames}`
      }
    }

    showToast(toastMessage)
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
          {activeTab === 'roster' ? (
            <>
              <Link to="/admin/employees/print-usernames" className="button-secondary" target="_blank">
                Print usernames
              </Link>
              {isAdmin && orgsEnabled && isOrgSuperAdmin ? (
                <button type="button" className="button-secondary" disabled={busy} onClick={openCreateCompany}>
                  Create company
                </button>
              ) : null}
              {isAdmin ? (
                <button type="button" className="button-primary" disabled={busy} onClick={openAddEmployee}>
                  Add employee
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <p className="placeholder-copy">
        One place for people: <strong>Roster &amp; accounts</strong> (logins, Tester, Salesman, Quality Team) and{' '}
        <strong>Shop assignment</strong> (job-card assignees and App role for login permissions).
      </p>

      <div className="tabs admin-employees-tabs" role="tablist" aria-label="Employees sections">
        <button
          type="button"
          role="tab"
          className={`tab ${activeTab === 'roster' ? 'active' : ''}`}
          aria-selected={activeTab === 'roster'}
          onClick={() => setActiveTab('roster')}
        >
          Roster &amp; accounts
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${activeTab === 'shop' ? 'active' : ''}`}
          aria-selected={activeTab === 'shop'}
          onClick={() => setActiveTab('shop')}
        >
          Shop assignment
        </button>
      </div>

      {activeTab === 'shop' ? <TechniciansPage embedded /> : null}

      {activeTab === 'roster' && error ? <p className="admin-employees-error">{error}</p> : null}
      {activeTab === 'roster' ? (
        <p className="admin-employees-tester-hint">
          Check <strong>Tester</strong> for people who should appear in the Test Log tester dropdown. Check{' '}
          <strong>Salesman</strong> for people who should appear when assigning a salesman on Inventory by Customer
          or Admin → Lists → Customers. Use <strong>Quality Team</strong> for QC membership only — it does not change
          App role / login permissions (set those under Shop assignment).
        </p>
      ) : null}
      {activeTab === 'roster' && orgsEnabled ? (
        <p className="admin-employees-orgs-note">
          {isOrgSuperAdmin ? (
            <>
              <strong>Superadmin</strong> sees every employee across all companies. Use the{' '}
              <strong>Companies</strong> checkboxes and role menus for company access (including company Superadmin).
              The <strong>Quality Team</strong> column is QC only — it does not control login permissions. For someone
              to save changes when they log in, set their App role under <strong>Shop assignment</strong> to Admin (or
              grant company Superadmin, which elevates them automatically).
              {isLocalOrganizations
                ? ' Company roles are stored in this browser until migration-organizations-foundation.sql is run in Supabase.'
                : ''}
            </>
          ) : isLocalOrganizations ? (
            <>
              Local multi-company demo (Vite DEV) — JS Valve + VSI are stored in this browser only until
              migration-organizations-foundation.sql is run. Existing staff default to JS Valve access; grant VSI with
              the Companies checkboxes. Superadmin login needs supabase/migration-employees-anon-read.sql (or an
              employee admin login) to load this roster.
            </>
          ) : (
            <>Multi-company is enabled.</>
          )}{' '}
          {!isOrgSuperAdmin
            ? 'Users only see companies they can access in the header switcher.'
            : 'Use the header company switcher to work inside one company at a time, or open Reports for cross-company compare.'}
        </p>
      ) : null}

      {activeTab === 'roster' && isOrgSuperAdmin && !loading && employees.length === 0 ? (
        <section className="dashboard-panel admin-employees-superadmin-unlock" aria-live="polite">
          <h3>Unlock Employees roster for Superadmin</h3>
          <p>
            Superadmin signs in without a Supabase Auth session, so Postgres RLS currently hides the{' '}
            <code>employees</code> table. Run this once in your Supabase project → <strong>SQL Editor</strong>, then
            click Refresh. Safe to re-run. Or sign in with a normal employee admin account instead.
          </p>
          <pre className="admin-employees-superadmin-sql">{EMPLOYEES_ANON_READ_SQL}</pre>
          <div className="admin-employees-superadmin-unlock-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                void navigator.clipboard.writeText(EMPLOYEES_ANON_READ_SQL).then(
                  () => showToast('SQL copied — paste into Supabase SQL Editor and Run'),
                  () => showToast('Could not copy — select the SQL manually'),
                )
              }}
            >
              Copy SQL
            </button>
            <button type="button" className="button-secondary" disabled={busy || loading} onClick={() => void refreshAll()}>
              Refresh roster
            </button>
          </div>
        </section>
      ) : null}

      {activeTab === 'roster' ? (
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
          {orgsEnabled && organizations.length > 0 ? (
            <fieldset className="admin-employees-status-filter">
              <legend>Company</legend>
              <label>
                <input
                  type="radio"
                  name="employee-company-filter"
                  checked={companyFilter === 'all'}
                  onChange={() => setCompanyFilter('all')}
                />
                All
              </label>
              {organizations.map((org) => (
                <label key={org.id}>
                  <input
                    type="radio"
                    name="employee-company-filter"
                    checked={companyFilter === org.id}
                    onChange={() => setCompanyFilter(org.id)}
                  />
                  {org.name}
                </label>
              ))}
            </fieldset>
          ) : null}
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
                {orgsEnabled ? <th>Companies</th> : null}
                <th>Status</th>
                <th>Last Sign In</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={rosterColSpan}>Loading employees…</td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={rosterColSpan}>
                    {employees.length === 0
                      ? error ||
                        'No employees loaded. Sign in with an employee admin account, or run supabase/migration-employees-anon-read.sql so Superadmin can read the roster.'
                      : 'No employees match your filters.'}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => {
                  const status = employeeStatus(employee)
                  const lastSignIn = accountStatus[employee.id]?.last_sign_in_at
                  const accessSet = orgAccessByEmployee.get(employee.id)
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
                      {orgsEnabled ? (
                        <td>
                          {orgMembersLoading && !organizations.length ? (
                            <span className="admin-employees-company-access-empty">…</span>
                          ) : organizations.length === 0 ? (
                            <span className="admin-employees-company-access-empty">No companies</span>
                          ) : (
                            <div className="admin-employees-company-access">
                              {organizations.map((org) => {
                                const checked = accessSet?.has(org.id) ?? false
                                const companyRole =
                                  orgRoleByEmployee.get(employee.id)?.get(org.id) ?? 'technician'
                                return (
                                  <div key={org.id} className="admin-employees-company-access-row">
                                    <label className="admin-employees-company-access-item">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!isAdmin || busy || !employee.is_active}
                                        onChange={(e) =>
                                          void toggleCompanyAccess(employee, org.id, e.target.checked)
                                        }
                                        aria-label={`${employee.full_name} access to ${org.name}`}
                                      />
                                      <span>{org.name}</span>
                                    </label>
                                    {canAssignCompanyRoles ? (
                                      <select
                                        className="admin-employees-company-role-select"
                                        value={companyRole}
                                        disabled={!checked || busy || !employee.is_active}
                                        aria-label={`${employee.full_name} role at ${org.name}`}
                                        onChange={(e) =>
                                          void setCompanyRole(
                                            employee,
                                            org.id,
                                            normalizeOrganizationRole(e.target.value),
                                          )
                                        }
                                      >
                                        {ORGANIZATION_ROLE_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      ) : null}
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
      ) : null}

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

      {isAdmin && orgsEnabled && isOrgSuperAdmin && createCompanyOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => !busy && setCreateCompanyOpen(false)}
        >
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="technician-modal-head">
              <h3>Create company</h3>
            </div>
            <div className="technician-modal-body">
              <p className="placeholder-copy">
                Creates an empty company. Grant employees access with the Companies checkboxes on the roster.
              </p>
              <label>
                Company name
                <input
                  type="text"
                  value={createCompanyName}
                  autoFocus
                  onChange={(e) => {
                    const name = e.target.value
                    setCreateCompanyName(name)
                    if (!createCompanySlugTouched) setCreateCompanySlug(slugifyCompanyName(name))
                  }}
                />
              </label>
              <label>
                Slug
                <input
                  type="text"
                  value={createCompanySlug}
                  onChange={(e) => {
                    setCreateCompanySlugTouched(true)
                    setCreateCompanySlug(slugifyCompanyName(e.target.value))
                  }}
                />
              </label>
            </div>
            <div className="technician-modal-footer">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setCreateCompanyOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={busy}
                onClick={() => void handleCreateCompany()}
              >
                {busy ? 'Creating…' : 'Create company'}
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
              {orgsEnabled ? (
                <fieldset className="admin-employees-add-companies">
                  <legend>Companies</legend>
                  <p className="placeholder-copy" style={{ marginTop: 0 }}>
                    Choose which companies this person can access. Defaults to JS Valve. You can change this later on
                    their roster row.
                  </p>
                  {organizations.length === 0 ? (
                    <p className="placeholder-copy">No companies available.</p>
                  ) : (
                    <div className="admin-employees-company-access">
                      {organizations.map((org) => {
                        const entry = addCompanyAccess[org.id] ?? {
                          canAccess: false,
                          role: 'technician' as OrganizationRole,
                        }
                        return (
                          <div key={org.id} className="admin-employees-company-access-row">
                            <label className="admin-employees-company-access-item">
                              <input
                                type="checkbox"
                                checked={entry.canAccess}
                                disabled={busy}
                                onChange={(e) =>
                                  setAddCompanyAccess((prev) => ({
                                    ...prev,
                                    [org.id]: {
                                      canAccess: e.target.checked,
                                      role: prev[org.id]?.role ?? 'technician',
                                    },
                                  }))
                                }
                                aria-label={`Grant access to ${org.name}`}
                              />
                              <span>{org.name}</span>
                            </label>
                            {canAssignCompanyRoles ? (
                              <select
                                className="admin-employees-company-role-select"
                                value={entry.role}
                                disabled={!entry.canAccess || busy}
                                aria-label={`Role at ${org.name}`}
                                onChange={(e) =>
                                  setAddCompanyAccess((prev) => ({
                                    ...prev,
                                    [org.id]: {
                                      canAccess: prev[org.id]?.canAccess ?? true,
                                      role: normalizeOrganizationRole(e.target.value),
                                    },
                                  }))
                                }
                              >
                                {ORGANIZATION_ROLE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </fieldset>
              ) : null}
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
