import { supabase } from './supabase'
import {
  normalizeOrganizationRole,
  type Organization,
  type OrganizationMember,
  type OrganizationMembership,
  type OrganizationRole,
} from '../types/organizations'

export const ACTIVE_ORG_STORAGE_KEY = 'js-job-board-active-org'

function isMissingOrgRelation(message: string) {
  return /relation .*organizations.* does not exist|relation .*organization_members.* does not exist|Could not find the table|schema cache/i.test(
    message,
  )
}

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? '').trim() || 'Company',
    slug: String(row.slug ?? '').trim(),
    logo_url: typeof row.logo_url === 'string' && row.logo_url.trim() ? row.logo_url.trim() : null,
    is_active: row.is_active !== false,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  }
}

function mapMember(row: Record<string, unknown>): OrganizationMember {
  return {
    id: String(row.id ?? ''),
    organization_id: String(row.organization_id ?? ''),
    user_id: typeof row.user_id === 'string' ? row.user_id : null,
    employee_id: typeof row.employee_id === 'string' ? row.employee_id : null,
    role: normalizeOrganizationRole(row.role),
    can_access: row.can_access !== false,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  }
}

/** Soft probe — false when migration has not been run yet. */
export async function detectOrganizationsEnabled(): Promise<boolean> {
  const { error } = await supabase.from('organizations').select('id').limit(1)
  if (!error) return true
  if (isMissingOrgRelation(error.message)) return false
  // Other errors (RLS, network): treat as disabled so the live app keeps working.
  return false
}

export async function listOrganizations(): Promise<{ data: Organization[]; error: string | null; enabled: boolean }> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id,name,slug,logo_url,is_active,created_at,updated_at')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    if (isMissingOrgRelation(error.message)) return { data: [], error: null, enabled: false }
    return { data: [], error: error.message, enabled: true }
  }

  return {
    data: (data ?? []).map((row) => mapOrganization(row as Record<string, unknown>)),
    error: null,
    enabled: true,
  }
}

export async function listMembershipsForUser(
  userId: string,
): Promise<{ data: OrganizationMembership[]; error: string | null; enabled: boolean }> {
  if (!userId) return { data: [], error: null, enabled: false }

  const { data, error } = await supabase
    .from('organization_members')
    .select(
      'id,organization_id,user_id,employee_id,role,can_access,created_at,updated_at,organization:organizations(id,name,slug,logo_url,is_active,created_at,updated_at)',
    )
    .eq('user_id', userId)
    .eq('can_access', true)

  if (error) {
    if (isMissingOrgRelation(error.message)) return { data: [], error: null, enabled: false }
    return { data: [], error: error.message, enabled: true }
  }

  const rows: OrganizationMembership[] = []
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>
    const orgRaw = row.organization
    const orgObj = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
    if (!orgObj || typeof orgObj !== 'object') continue
    const organization = mapOrganization(orgObj as Record<string, unknown>)
    if (!organization.is_active || !organization.id) continue
    rows.push({
      ...mapMember(row),
      organization,
    })
  }

  rows.sort((a, b) => a.organization.name.localeCompare(b.organization.name))
  return { data: rows, error: null, enabled: true }
}

export async function listOrganizationMembersForEmployees(
  employeeIds: string[],
): Promise<{ data: OrganizationMember[]; error: string | null; enabled: boolean }> {
  if (!employeeIds.length) return { data: [], error: null, enabled: true }

  const { data, error } = await supabase
    .from('organization_members')
    .select('id,organization_id,user_id,employee_id,role,can_access,created_at,updated_at')
    .in('employee_id', employeeIds)

  if (error) {
    if (isMissingOrgRelation(error.message)) return { data: [], error: null, enabled: false }
    return { data: [], error: error.message, enabled: true }
  }

  return {
    data: (data ?? []).map((row) => mapMember(row as Record<string, unknown>)),
    error: null,
    enabled: true,
  }
}

export async function setEmployeeOrganizationAccess(input: {
  employeeId: string
  organizationId: string
  canAccess: boolean
  role?: OrganizationRole | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_employee_organization_access', {
    p_employee_id: input.employeeId,
    p_organization_id: input.organizationId,
    p_can_access: input.canAccess,
    p_role: input.role ?? null,
  })
  if (error) {
    if (isMissingOrgRelation(error.message)) {
      return { error: 'Multi-company is not enabled yet. Run migration-organizations-foundation.sql when ready.' }
    }
    return { error: error.message }
  }
  return { error: null }
}

export async function createOrganization(input: {
  name: string
  slug: string
  logoUrl?: string | null
}): Promise<{ data: Organization | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_organization', {
    p_name: input.name,
    p_slug: input.slug,
    p_logo_url: input.logoUrl ?? null,
  })
  if (error) {
    if (isMissingOrgRelation(error.message)) {
      return {
        data: null,
        error: 'Multi-company is not enabled yet. Run migration-organizations-foundation.sql when ready.',
      }
    }
    return { data: null, error: error.message }
  }
  if (!data || typeof data !== 'object') return { data: null, error: 'Could not create company' }
  return { data: mapOrganization(data as Record<string, unknown>), error: null }
}

export function readStoredActiveOrganizationId(): string | null {
  try {
    const value = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)?.trim()
    return value || null
  } catch {
    return null
  }
}

export function writeStoredActiveOrganizationId(organizationId: string | null) {
  try {
    if (!organizationId) window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY)
    else window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, organizationId)
  } catch {
    // ignore storage failures
  }
}

export function pickActiveOrganization(
  memberships: OrganizationMembership[],
  preferredId?: string | null,
): Organization | null {
  if (!memberships.length) return null
  if (preferredId) {
    const match = memberships.find((row) => row.organization_id === preferredId)
    if (match) return match.organization
  }
  const stored = readStoredActiveOrganizationId()
  if (stored) {
    const match = memberships.find((row) => row.organization_id === stored)
    if (match) return match.organization
  }
  return memberships[0]?.organization ?? null
}

export function membershipIsSuperAdmin(memberships: OrganizationMembership[]) {
  return memberships.some((row) => row.can_access && row.role === 'super_admin')
}
