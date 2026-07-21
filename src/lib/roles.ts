import type { UserRole } from '../pages/LoginPage'

/** Shop app roles — Admin, Manager, Technician only. */
export const APP_ROLES = ['admin', 'manager', 'technician'] as const

export type AppPermission =
  | 'createJob'
  | 'copyJob'
  | 'editJobDetails'
  | 'junkOrCloseJob'
  | 'manageLists'
  | 'manageTechnicians'
  | 'manageEmployeeAccounts'
  | 'viewReports'
  | 'feedbackInbox'
  | 'openAdminTools'
  /** Any shop data mutation (status, assignments, logs, traveler, etc.). Technicians: view only. */
  | 'shopWrite'

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<AppPermission>> = {
  admin: new Set([
    'createJob',
    'copyJob',
    'editJobDetails',
    'junkOrCloseJob',
    'manageLists',
    'manageTechnicians',
    'manageEmployeeAccounts',
    'viewReports',
    'feedbackInbox',
    'openAdminTools',
    'shopWrite',
  ]),
  manager: new Set([
    'createJob',
    'copyJob',
    'editJobDetails',
    'junkOrCloseJob',
    'viewReports',
    'openAdminTools',
    'shopWrite',
  ]),
  technician: new Set([]),
}

/** Map legacy DB / metadata roles onto the three app roles. */
export function normalizeAppRole(role: string | null | undefined): UserRole {
  const value = String(role ?? '')
    .trim()
    .toLowerCase()
  if (value === 'admin') return 'admin'
  if (value === 'manager' || value === 'supervisor') return 'manager'
  if (value === 'technician' || value === 'tech' || value === 'sales') return 'technician'
  return 'technician'
}

export function can(role: UserRole | null | undefined, permission: AppPermission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[normalizeAppRole(role)]?.has(permission) ?? false
}

/** Technicians are view-only. Admin and Manager may change shop data. */
export function canWriteShop(role: UserRole | null | undefined): boolean {
  return can(role, 'shopWrite')
}

/** Any signed-in shop role can open the shared app shell. */
export function isShopRole(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'technician'
}

/** @deprecated Prefer `can(role, …)`. Kept for older call sites during migration. */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return can(role, 'editJobDetails')
}

/** Profile `role === 'admin'` — create accounts and reset other users' passwords. */
export function isProfileAdmin(profileRole: string | null | undefined): boolean {
  return profileRole === 'admin'
}

export function canManageAccounts(role: UserRole | null | undefined, profileRole?: string | null): boolean {
  return can(role, 'manageEmployeeAccounts') || isProfileAdmin(profileRole)
}

/** Employee roster page (view for all shop staff; admin actions gated separately). */
export function canAccessEmployeesPage(role: UserRole | null | undefined): boolean {
  return isShopRole(role)
}

/** Test log entry — available to all shop roles. */
export function canAccessTestLog(role: UserRole | null | undefined): boolean {
  return isShopRole(role)
}

export function defaultHomePath(role: UserRole | null | undefined): string {
  if (isShopRole(role)) return '/dashboard'
  return '/login'
}

export function formatRolePillLabel(role: UserRole): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  return 'Technician'
}

export function permissionDeniedReason(permission: AppPermission): string {
  switch (permission) {
    case 'createJob':
      return 'Only Admin and Manager can create jobs'
    case 'copyJob':
      return 'Only Admin and Manager can copy jobs'
    case 'editJobDetails':
      return 'Only Admin and Manager can edit job details'
    case 'junkOrCloseJob':
      return 'Only Admin and Manager can junk or close jobs'
    case 'manageLists':
      return 'Only Admin can manage lists'
    case 'manageTechnicians':
      return 'Only Admin can manage technicians'
    case 'manageEmployeeAccounts':
      return 'Only Admin can manage employee accounts'
    case 'viewReports':
      return 'Only Admin and Manager can open reports'
    case 'feedbackInbox':
      return 'Only Admin can open the feedback inbox'
    case 'openAdminTools':
      return 'Only Admin and Manager can open admin tools'
    case 'shopWrite':
      return 'View only — ask an Admin or Manager to make changes'
    default:
      return 'You do not have permission for this action'
  }
}
