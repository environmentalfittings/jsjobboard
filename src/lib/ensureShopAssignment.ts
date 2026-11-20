import { supabase } from './supabase'
import type { OrganizationRole } from '../types/organizations'

export type ShopAppRole = 'admin' | 'manager' | 'supervisor' | 'technician' | 'sales'

export type EnsureShopAssignmentInput = {
  fullName: string
  employeeNo: string
  username: string
  authUserId?: string | null
  /** Prefer VSI when the hire is primarily a VSI employee. */
  groupTeam?: string | null
  role?: ShopAppRole
  active?: boolean
}

export type EnsureShopAssignmentResult =
  | { ok: true; technicianId: number; created: boolean }
  | { ok: false; error: string }

/** Map company (organization) role → Shop assignment App role. */
export function shopRoleFromOrganizationRole(role: OrganizationRole | null | undefined): ShopAppRole {
  if (role === 'super_admin' || role === 'admin') return 'admin'
  if (role === 'manager') return 'manager'
  return 'technician'
}

/** Pick the strongest company role among granted orgs. */
export function strongestShopRoleFromOrgRoles(roles: OrganizationRole[]): ShopAppRole {
  const order: OrganizationRole[] = ['super_admin', 'admin', 'manager', 'technician', 'viewer']
  let best: OrganizationRole | null = null
  for (const role of roles) {
    if (!best || order.indexOf(role) < order.indexOf(best)) best = role
  }
  return shopRoleFromOrganizationRole(best)
}

function shopLoginEmail(username: string) {
  return `${username.trim().toLowerCase()}@users.jsvalve.local`
}

/**
 * Ensure a Shop assignment (`technicians`) row exists for a roster employee.
 * Matches by login_username (preferred) or employee_id; inserts when missing.
 * Does not overwrite an existing App role unless `role` is provided and the row was just created.
 */
export async function ensureShopAssignmentForEmployee(
  input: EnsureShopAssignmentInput,
): Promise<EnsureShopAssignmentResult> {
  const username = input.username.trim().toLowerCase()
  const employeeNo = input.employeeNo.trim()
  const name = input.fullName.trim()
  if (!username || !name) {
    return { ok: false, error: 'Username and name are required for shop assignment' }
  }

  const role = input.role ?? 'technician'
  const active = input.active ?? true
  const groupTeam = input.groupTeam?.trim() || null
  const loginEmail = shopLoginEmail(username)
  const userId = input.authUserId ?? null

  const { data: byUsername, error: byUsernameError } = await supabase
    .from('technicians')
    .select('id,role,user_id,employee_id,active,group_team')
    .eq('login_username', username)
    .maybeSingle()

  if (byUsernameError) {
    return { ok: false, error: byUsernameError.message }
  }

  let existing = byUsername
  if (!existing && employeeNo) {
    const { data: byEmployeeNo, error: byEmployeeNoError } = await supabase
      .from('technicians')
      .select('id,role,user_id,employee_id,active,group_team')
      .eq('employee_id', employeeNo)
      .maybeSingle()
    if (byEmployeeNoError) {
      return { ok: false, error: byEmployeeNoError.message }
    }
    existing = byEmployeeNo
  }

  if (existing) {
    const patch: Record<string, unknown> = {
      name,
      employee_id: employeeNo || existing.employee_id,
      login_username: username,
      login_email: loginEmail,
      active,
      updated_at: new Date().toISOString(),
    }
    if (userId && !existing.user_id) {
      patch.user_id = userId
    }
    if (groupTeam && !existing.group_team) {
      patch.group_team = groupTeam
    }
    // Keep an existing elevated role; only fill role when missing/null.
    if (!existing.role) {
      patch.role = role
    }

    const { error: updateError } = await supabase.from('technicians').update(patch).eq('id', existing.id)
    if (updateError) {
      return { ok: false, error: updateError.message }
    }
    return { ok: true, technicianId: existing.id as number, created: false }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('technicians')
    .insert({
      name,
      employee_id: employeeNo || null,
      login_username: username,
      login_email: loginEmail,
      role,
      active,
      work_cell_specialties: [],
      group_team: groupTeam,
      user_id: userId,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Could not create shop assignment' }
  }

  return { ok: true, technicianId: inserted.id as number, created: true }
}

/**
 * Create Shop assignment rows for every active employee missing one.
 * Safe to run repeatedly (idempotent).
 */
export async function syncMissingShopAssignmentsFromRoster(): Promise<{
  created: number
  updated: number
  failed: number
  errors: string[]
}> {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('id,full_name,username,employee_no,company,is_active,auth_user_id')
    .eq('is_active', true)
    .order('full_name')

  if (error || !employees) {
    return { created: 0, updated: 0, failed: 1, errors: [error?.message ?? 'Could not load employees'] }
  }

  let created = 0
  let updated = 0
  let failed = 0
  const errors: string[] = []

  for (const employee of employees) {
    const company = String(employee.company ?? '')
    const groupTeam = /vsi/i.test(company) ? 'VSI' : null
    const result = await ensureShopAssignmentForEmployee({
      fullName: String(employee.full_name ?? ''),
      employeeNo: String(employee.employee_no ?? ''),
      username: String(employee.username ?? ''),
      authUserId: employee.auth_user_id ? String(employee.auth_user_id) : null,
      groupTeam,
      role: 'technician',
      active: true,
    })
    if (!result.ok) {
      failed += 1
      errors.push(`${employee.full_name}: ${result.error}`)
      continue
    }
    if (result.created) created += 1
    else updated += 1
  }

  return { created, updated, failed, errors }
}
