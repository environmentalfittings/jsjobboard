type AppRole = 'admin' | 'manager' | 'supervisor' | 'technician'

const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  technician: 'Technician',
}

const ROLE_CLASS: Record<AppRole, string> = {
  admin: 'role-badge role-badge-admin',
  manager: 'role-badge role-badge-manager',
  supervisor: 'role-badge role-badge-supervisor',
  technician: 'role-badge role-badge-technician',
}

export function RoleBadge({ role }: { role: string | null | undefined }) {
  const normalized = (role ?? 'technician').toLowerCase() as AppRole
  const safe: AppRole = normalized in ROLE_LABEL ? normalized : 'technician'
  return <span className={ROLE_CLASS[safe]}>{ROLE_LABEL[safe]}</span>
}
