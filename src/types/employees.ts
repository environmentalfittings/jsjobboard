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
  auth_user_id: string | null
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
