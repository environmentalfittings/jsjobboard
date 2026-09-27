export type OrganizationRole = 'super_admin' | 'admin' | 'manager' | 'technician' | 'viewer'

export type Organization = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type OrganizationMember = {
  id: string
  organization_id: string
  user_id: string | null
  employee_id: string | null
  role: OrganizationRole
  can_access: boolean
  created_at?: string
  updated_at?: string
}

export type OrganizationMembership = OrganizationMember & {
  organization: Organization
}

export function normalizeOrganizationRole(value: unknown): OrganizationRole {
  const role = String(value ?? '')
    .trim()
    .toLowerCase()
  if (role === 'super_admin') return 'super_admin'
  if (role === 'admin') return 'admin'
  if (role === 'manager' || role === 'supervisor') return 'manager'
  if (role === 'viewer' || role === 'readonly' || role === 'read-only' || role === 'guest') return 'viewer'
  return 'technician'
}

export function organizationRoleLabel(role: OrganizationRole) {
  if (role === 'super_admin') return 'Super admin'
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'viewer') return 'Viewer'
  return 'Technician'
}
