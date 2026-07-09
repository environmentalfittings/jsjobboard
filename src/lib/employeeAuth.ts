/** Login email domain for employee accounts (username@domain). */
export const EMPLOYEE_LOGIN_EMAIL_DOMAIN =
  String(import.meta.env.VITE_EMPLOYEE_LOGIN_EMAIL_DOMAIN ?? 'jsvalve.com').trim() || 'jsvalve.com'

export function normalizeEmployeeUsername(username: string) {
  return username.trim().toLowerCase()
}

/** Build the Supabase auth email from a roster username (e.g. ghensley → ghensley@jsvalve.com). */
export function employeeLoginEmail(username: string) {
  return `${normalizeEmployeeUsername(username)}@${EMPLOYEE_LOGIN_EMAIL_DOMAIN}`
}

export type EmployeeInitialsLookupRow = {
  employee_no: string
  full_name: string
  initials: string
}
