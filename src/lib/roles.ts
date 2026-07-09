import type { UserRole } from '../pages/LoginPage'

/** Admin dashboard, valves menu, reports, technicians, etc. */
export function hasAdminAccess(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
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
