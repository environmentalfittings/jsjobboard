import type {
  Organization,
  OrganizationMember,
  OrganizationMembership,
  OrganizationRole,
} from '../types/organizations'

/** localStorage-backed multi-company demo for Vite DEV when SQL is not applied. */
export const LOCAL_ORGS_STORAGE_KEY = 'js-job-board-local-organizations'
export const LOCAL_ORG_MEMBERS_STORAGE_KEY = 'js-job-board-local-organization-members'
export const LOCAL_DEV_ADMIN_USER_ID = 'local-dev-admin'

export const LOCAL_ORG_JS_VALVE_ID = 'local-org-js-valve'
export const LOCAL_ORG_PARTNER_ID = 'local-org-partner'

function nowIso() {
  return new Date().toISOString()
}

function defaultOrganizations(): Organization[] {
  const ts = nowIso()
  return [
    {
      id: LOCAL_ORG_JS_VALVE_ID,
      name: 'JS Valve',
      slug: 'js-valve',
      logo_url: null,
      is_active: true,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: LOCAL_ORG_PARTNER_ID,
      name: 'Partner Shop',
      slug: 'partner-shop',
      logo_url: null,
      is_active: true,
      created_at: ts,
      updated_at: ts,
    },
  ]
}

function defaultMembers(): OrganizationMember[] {
  const ts = nowIso()
  return [
    {
      id: 'local-member-js-valve-admin',
      organization_id: LOCAL_ORG_JS_VALVE_ID,
      user_id: LOCAL_DEV_ADMIN_USER_ID,
      employee_id: null,
      role: 'super_admin',
      can_access: true,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: 'local-member-partner-admin',
      organization_id: LOCAL_ORG_PARTNER_ID,
      user_id: LOCAL_DEV_ADMIN_USER_ID,
      employee_id: null,
      role: 'super_admin',
      can_access: true,
      created_at: ts,
      updated_at: ts,
    },
  ]
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage failures
  }
}

export function isLocalOrganizationsDevMode() {
  return Boolean(import.meta.env.DEV)
}

export function ensureLocalOrganizationsSeeded() {
  if (!isLocalOrganizationsDevMode()) return
  const existing = readJson<Organization[] | null>(LOCAL_ORGS_STORAGE_KEY, null)
  if (!existing?.length) {
    writeJson(LOCAL_ORGS_STORAGE_KEY, defaultOrganizations())
  }
  const members = readJson<OrganizationMember[] | null>(LOCAL_ORG_MEMBERS_STORAGE_KEY, null)
  if (!members?.length) {
    writeJson(LOCAL_ORG_MEMBERS_STORAGE_KEY, defaultMembers())
  }
}

export function listLocalOrganizations(): Organization[] {
  ensureLocalOrganizationsSeeded()
  return readJson<Organization[]>(LOCAL_ORGS_STORAGE_KEY, defaultOrganizations()).filter(
    (org) => org.is_active !== false,
  )
}

export function listLocalMembers(): OrganizationMember[] {
  ensureLocalOrganizationsSeeded()
  return readJson<OrganizationMember[]>(LOCAL_ORG_MEMBERS_STORAGE_KEY, defaultMembers())
}

function writeLocalMembers(rows: OrganizationMember[]) {
  writeJson(LOCAL_ORG_MEMBERS_STORAGE_KEY, rows)
}

function writeLocalOrganizations(rows: Organization[]) {
  writeJson(LOCAL_ORGS_STORAGE_KEY, rows)
}

export function listLocalMembershipsForUser(userId: string): OrganizationMembership[] {
  const orgs = listLocalOrganizations()
  const orgById = new Map(orgs.map((org) => [org.id, org]))
  const rows: OrganizationMembership[] = []
  for (const member of listLocalMembers()) {
    if (!member.can_access || member.user_id !== userId) continue
    const organization = orgById.get(member.organization_id)
    if (!organization) continue
    rows.push({ ...member, organization })
  }
  rows.sort((a, b) => a.organization.name.localeCompare(b.organization.name))
  return rows
}

export function listLocalMembersForEmployees(employeeIds: string[]): OrganizationMember[] {
  if (!employeeIds.length) return []
  const wanted = new Set(employeeIds)
  return listLocalMembers().filter((row) => row.employee_id && wanted.has(row.employee_id))
}

export function setLocalEmployeeOrganizationAccess(input: {
  employeeId: string
  organizationId: string
  canAccess: boolean
  role?: OrganizationRole | null
}): { error: string | null } {
  const orgs = listLocalOrganizations()
  if (!orgs.some((org) => org.id === input.organizationId)) {
    return { error: 'Company not found' }
  }
  const role: OrganizationRole = input.role ?? 'technician'
  const members = listLocalMembers()
  const idx = members.findIndex(
    (row) => row.employee_id === input.employeeId && row.organization_id === input.organizationId,
  )
  const ts = nowIso()
  if (idx >= 0) {
    members[idx] = {
      ...members[idx],
      can_access: input.canAccess,
      role: members[idx].role === 'super_admin' ? 'super_admin' : role,
      updated_at: ts,
    }
  } else {
    members.push({
      id: `local-member-${input.organizationId}-${input.employeeId}`,
      organization_id: input.organizationId,
      user_id: null,
      employee_id: input.employeeId,
      role,
      can_access: input.canAccess,
      created_at: ts,
      updated_at: ts,
    })
  }
  writeLocalMembers(members)
  return { error: null }
}

export function createLocalOrganization(input: {
  name: string
  slug: string
  logoUrl?: string | null
}): { data: Organization | null; error: string | null } {
  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()
  if (!name) return { data: null, error: 'Company name is required' }
  if (!slug) return { data: null, error: 'Company slug is required' }

  const orgs = listLocalOrganizations()
  if (orgs.some((org) => org.slug === slug)) {
    return { data: null, error: 'Company slug already exists' }
  }

  const ts = nowIso()
  const org: Organization = {
    id: `local-org-${slug}-${Date.now().toString(36)}`,
    name,
    slug,
    logo_url: input.logoUrl?.trim() || null,
    is_active: true,
    created_at: ts,
    updated_at: ts,
  }
  writeLocalOrganizations([...orgs, org])

  const members = listLocalMembers()
  members.push({
    id: `local-member-${org.id}-${LOCAL_DEV_ADMIN_USER_ID}`,
    organization_id: org.id,
    user_id: LOCAL_DEV_ADMIN_USER_ID,
    employee_id: null,
    role: 'super_admin',
    can_access: true,
    created_at: ts,
    updated_at: ts,
  })
  writeLocalMembers(members)
  return { data: org, error: null }
}
