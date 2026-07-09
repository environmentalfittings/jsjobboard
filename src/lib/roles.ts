import type { UserRole } from '../pages/LoginPage'

/** Admin dashboard, valves menu, reports, technicians, etc. */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

/** Profile `role === 'admin'` — create accounts and reset other users' passwords. */
export function isProfileAdmin(profileRole: string | null | undefined): boolean {
  return profileRole === 'admin'
}

/** Employee roster page (view for all shop staff; admin actions gated separately). */
export function canAccessEmployeesPage(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'technician'
}

/** Test log entry — shop testing workflow (not limited to admin dashboard users). */
export function canAccessTestLog(role: UserRole | null | undefined): boolean {
  return hasAdminAccess(role) || role === 'supervisor' || role === 'technician'
}

export function defaultHomePath(role: UserRole | null | undefined): string {
  if (role === 'admin' || role === 'manager') return '/dashboard'
  if (role === 'technician') return '/my-work'
  if (role === 'sales') return '/job-board'
  if (role === 'supervisor') return '/supervisor-dashboard'
  return '/login'
}

export function formatRolePillLabel(role: UserRole): string {
  if (role === 'admin') return 'Admin'
  if (role === 'technician') return 'Technician'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'sales') return 'Sales'
  return 'Technician'
}
