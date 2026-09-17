type AppRole = 'admin' | 'manager' | 'technician' | 'viewer'

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  technician: 'Technician',
  viewer: 'Read-only',
}

const ROLE_CLASS: Record<AppRole, string> = {
  admin: 'role-badge role-badge-admin',
  manager: 'role-badge role-badge-manager',
  technician: 'role-badge role-badge-technician',
  viewer: 'role-badge role-badge-viewer',
}

function normalizeBadgeRole(role: string | null | undefined): AppRole {
  const value = String(role ?? '')
    .trim()
    .toLowerCase()
  if (value === 'admin') return 'admin'
  if (value === 'manager' || value === 'supervisor') return 'manager'
  if (value === 'viewer' || value === 'readonly' || value === 'read-only') return 'viewer'
  return 'technician'
}

export function RoleBadge({ role }: { role: string | null | undefined }) {
  const safe = normalizeBadgeRole(role)
  return <span className={ROLE_CLASS[safe]}>{ROLE_LABEL[safe]}</span>
}
