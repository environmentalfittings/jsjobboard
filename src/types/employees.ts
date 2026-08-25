export interface Employee {
  id: string
  employee_no: string
  first_name: string
  last_name: string
  full_name: string
  username: string
  initials: string
  company: string
  is_active: boolean
  /** When true, employee appears in Test Log tester multi-select. */
  is_tester: boolean
  /** When true, employee appears in Inventory / Lists salesman dropdowns. */
  is_salesman: boolean
  /**
   * Quality Team hierarchy. `none` = not on the team.
   * Access differences by level will be wired later.
   */
  quality_team_level: QualityTeamLevel
  auth_user_id: string | null
}

export type QualityTeamLevel = 'none' | 'admin' | 'manager' | 'supervisor' | 'technician'

export const QUALITY_TEAM_LEVEL_OPTIONS: { value: QualityTeamLevel; label: string }[] = [
  { value: 'none', label: '—' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'technician', label: 'Technician' },
]

export function normalizeQualityTeamLevel(value: unknown): QualityTeamLevel {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'admin' || raw === 'manager' || raw === 'supervisor' || raw === 'technician') return raw
  return 'none'
}

export function qualityTeamLevelLabel(level: QualityTeamLevel): string {
  return QUALITY_TEAM_LEVEL_OPTIONS.find((opt) => opt.value === level)?.label ?? '—'
}

export interface Profile {
  id: string
  employee_id: string | null
  role: 'admin' | 'viewer' | 'customer'
  full_name: string | null
}

export type EmployeeAuthStatus = 'active' | 'no_account' | 'inactive'

export type EmployeeAccountStatus = {
  employee_id: string
  last_sign_in_at: string | null
}
