import { companyWorkflowKeyFromOrganization, type CompanyWorkflowKey } from '../constants/companyWorkflows'
import {
  createLocalOrganization,
  ensureLocalJsValveAccessForEmployees,
  isLocalOrganizationsDevMode,
  listLocalMembershipsForUser,
  listLocalOrganizations,
  LOCAL_DEV_ADMIN_USER_ID,
  setLocalEmployeeOrganizationAccess,
} from './localOrganizations'
import { supabase } from './supabase'
import {
  normalizeOrganizationRole,
  type Organization,
  type OrganizationMember,
  type OrganizationMembership,
  type OrganizationRole,
} from '../types/organizations'

export const ACTIVE_ORG_STORAGE_KEY = 'js-job-board-active-org'
export { LOCAL_DEV_ADMIN_USER_ID }

export type OrganizationsBackend = 'remote' | 'local' | 'none'

/**
 * Prefer live Supabase companies when the current session can actually read them.
 *
 * Local Superadmin is not a Supabase user (signed out), so RLS returns zero
 * organization rows even though the tables exist. Treat that as the Vite DEV
 * localStorage JS / VSI demo so the header switcher still works.
 *
 * Production / Vercel stays single-company JS Valve unless both are true:
 * 1) `organizations` tables exist, and
 * 2) `VITE_ENABLE_MULTI_COMPANY=true` is set in the deployment env.
 * SQL migrations in /supabase are never auto-applied by Vercel.
 */
export async function resolveOrganizationsBackend(): Promise<OrganizationsBackend> {
  const { data, error } = await supabase.from('organizations').select('id').limit(1)
  const canSeeCompanies = !error && (data?.length ?? 0) > 0
  if (canSeeCompanies) {
    if (isLocalOrganizationsDevMode()) return 'remote'
    const prodFlag =
      String(import.meta.env.VITE_ENABLE_MULTI_COMPANY ?? '')
        .trim()
        .toLowerCase() === 'true'
    return prodFlag ? 'remote' : 'none'
  }
  if (isLocalOrganizationsDevMode()) return 'local'
  return 'none'
}

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

const JS_STATUS_HINT = /^(on[-\s]?hold|not arrived|machine [12]|water jet|prv |warehouse rts|arrived - not started)$/i
const VSI_STATUS_HINT = /^(hold|quarantine|staging area|receiving|tear down|pre-test|final test|tagging|qc|test\/failure analysis|new valve)$/i

let inferredLiveOrgIdsPromise: Promise<Map<CompanyWorkflowKey, string>> | null = null

/** Local Superadmin cannot read `organizations` (RLS). Infer JS vs VSI from tagged jobs. */
async function inferLiveOrganizationIdsByWorkflowKey(): Promise<Map<CompanyWorkflowKey, string>> {
  if (!inferredLiveOrgIdsPromise) {
    inferredLiveOrgIdsPromise = (async () => {
      const map = new Map<CompanyWorkflowKey, string>()
      const { data, error } = await supabase
        .from('valves')
        .select('organization_id,status')
        .not('organization_id', 'is', null)
        .limit(4000)
      if (error || !data?.length) return map

      const byOrg = new Map<string, { js: number; vsi: number; n: number }>()
      for (const row of data) {
        const id = String((row as { organization_id?: string | null }).organization_id ?? '').trim()
        if (!id || id.startsWith('local-org-')) continue
        const rec = byOrg.get(id) ?? { js: 0, vsi: 0, n: 0 }
        rec.n += 1
        const status = String((row as { status?: string | null }).status ?? '').trim()
        if (VSI_STATUS_HINT.test(status)) rec.vsi += 1
        if (JS_STATUS_HINT.test(status)) rec.js += 1
        byOrg.set(id, rec)
      }

      const ranked = [...byOrg.entries()].sort((a, b) => b[1].n - a[1].n)
      for (const [id, rec] of ranked) {
        if (rec.vsi > rec.js && !map.has('vsi')) map.set('vsi', id)
        else if (rec.js >= rec.vsi && !map.has('js-valve')) map.set('js-valve', id)
      }
      if (!map.has('js-valve') && ranked[0]) map.set('js-valve', ranked[0][0])
      if (!map.has('vsi')) {
        const leftover = ranked.find(([id]) => id !== map.get('js-valve'))
        if (leftover) map.set('vsi', leftover[0])
      }
      return map
    })()
  }
  return inferredLiveOrgIdsPromise
}

async function listLocalOrganizationsAlignedToLiveIds(): Promise<Organization[]> {
  const rows = listLocalOrganizations()
  const inferred = await inferLiveOrganizationIdsByWorkflowKey()
  return rows.map((org) => {
    const liveId = inferred.get(companyWorkflowKeyFromOrganization(org))
    return liveId ? { ...org, id: liveId } : org
  })
}

export async function listOrganizations(): Promise<{ data: Organization[]; error: string | null; enabled: boolean }> {
  const backend = await resolveOrganizationsBackend()
  if (backend === 'none') return { data: [], error: null, enabled: false }
  if (backend === 'local') {
    return { data: await listLocalOrganizationsAlignedToLiveIds(), error: null, enabled: true }
  }

  const { data, error } = await supabase
    .from('organizations')
    .select('id,name,slug,logo_url,is_active,created_at,updated_at')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    if (isMissingOrgRelation(error.message)) {
      if (isLocalOrganizationsDevMode()) {
        return { data: listLocalOrganizations(), error: null, enabled: true }
      }
      return { data: [], error: null, enabled: false }
    }
    return { data: [], error: error.message, enabled: true }
  }

  return {
    data: (data ?? []).map((row) => mapOrganization(row as Record<string, unknown>)),
    error: null,
    enabled: true,
  }
}

async function resolveEmployeeIdForAuthUser(userId: string): Promise<string | null> {
  if (!userId || userId === LOCAL_DEV_ADMIN_USER_ID) return null
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (error || !data?.id) return null
  return String(data.id)
}

function membershipsForAllOrganizations(
  userId: string,
  organizations: Organization[],
): OrganizationMembership[] {
  return organizations
    .filter((organization) => organization.is_active !== false && organization.id)
    .map((organization) => ({
      id: `local-dev-member-${organization.id}`,
      organization_id: organization.id,
      user_id: userId,
      employee_id: null,
      role: 'super_admin' as const,
      can_access: true,
      organization,
    }))
    .sort((a, b) => a.organization.name.localeCompare(b.organization.name))
}

export async function listMembershipsForUser(
  userId: string,
  options?: { employeeId?: string | null },
): Promise<{ data: OrganizationMembership[]; error: string | null; enabled: boolean }> {
  if (!userId) return { data: [], error: null, enabled: false }

  const employeeId = options?.employeeId ?? (await resolveEmployeeIdForAuthUser(userId))
  const backend = await resolveOrganizationsBackend()
  if (backend === 'none') return { data: [], error: null, enabled: false }

  // Local Superadmin bypass is not a Supabase user, so it has no organization_members
  // rows. Grant every company (live UUIDs when they can be inferred) so localhost
  // can switch JS / VSI like production.
  if (userId === LOCAL_DEV_ADMIN_USER_ID) {
    const orgs = await listOrganizations()
    if (!orgs.enabled) return { data: [], error: null, enabled: false }
    return { data: membershipsForAllOrganizations(userId, orgs.data), error: null, enabled: true }
  }

  if (backend === 'local') {
    return { data: listLocalMembershipsForUser(userId, employeeId), error: null, enabled: true }
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select(
      'id,organization_id,user_id,employee_id,role,can_access,created_at,updated_at,organization:organizations(id,name,slug,logo_url,is_active,created_at,updated_at)',
    )
    .eq('user_id', userId)
    .eq('can_access', true)

  if (error) {
    if (isMissingOrgRelation(error.message)) {
      if (isLocalOrganizationsDevMode()) {
        return { data: listLocalMembershipsForUser(userId, employeeId), error: null, enabled: true }
      }
      return { data: [], error: null, enabled: false }
    }
    return { data: [], error: error.message, enabled: true }
  }

  // Also pick up memberships stored by employee_id only (before auth link).
  if (employeeId && !(data ?? []).length) {
    const byEmployee = await supabase
      .from('organization_members')
      .select(
        'id,organization_id,user_id,employee_id,role,can_access,created_at,updated_at,organization:organizations(id,name,slug,logo_url,is_active,created_at,updated_at)',
      )
      .eq('employee_id', employeeId)
      .eq('can_access', true)
    if (!byEmployee.error && byEmployee.data?.length) {
      const rows: OrganizationMembership[] = []
      for (const raw of byEmployee.data) {
        const row = raw as Record<string, unknown>
        const orgRaw = row.organization
        const orgObj = Array.isArray(orgRaw) ? orgRaw[0] : orgRaw
        if (!orgObj || typeof orgObj !== 'object') continue
        const organization = mapOrganization(orgObj as Record<string, unknown>)
        if (!organization.is_active || !organization.id) continue
        rows.push({ ...mapMember(row), organization })
      }
      rows.sort((a, b) => a.organization.name.localeCompare(b.organization.name))
      return { data: rows, error: null, enabled: true }
    }
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

  const backend = await resolveOrganizationsBackend()
  if (backend === 'none') return { data: [], error: null, enabled: false }
  if (backend === 'local') {
    return { data: ensureLocalJsValveAccessForEmployees(employeeIds), error: null, enabled: true }
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('id,organization_id,user_id,employee_id,role,can_access,created_at,updated_at')
    .in('employee_id', employeeIds)

  if (error) {
    if (isMissingOrgRelation(error.message)) {
      if (isLocalOrganizationsDevMode()) {
        return { data: ensureLocalJsValveAccessForEmployees(employeeIds), error: null, enabled: true }
      }
      return { data: [], error: null, enabled: false }
    }
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
  userId?: string | null
}): Promise<{ error: string | null }> {
  const backend = await resolveOrganizationsBackend()
  if (backend === 'local') return setLocalEmployeeOrganizationAccess(input)
  if (backend === 'none') {
    return { error: 'Multi-company is not enabled yet. Run migration-organizations-foundation.sql when ready.' }
  }

  const { error } = await supabase.rpc('set_employee_organization_access', {
    p_employee_id: input.employeeId,
    p_organization_id: input.organizationId,
    p_can_access: input.canAccess,
    p_role: input.role ?? null,
  })
  if (error) {
    if (isMissingOrgRelation(error.message)) {
      if (isLocalOrganizationsDevMode()) return setLocalEmployeeOrganizationAccess(input)
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
  const backend = await resolveOrganizationsBackend()
  if (backend === 'local') return createLocalOrganization(input)
  if (backend === 'none') {
    return {
      data: null,
      error: 'Multi-company is not enabled yet. Run migration-organizations-foundation.sql when ready.',
    }
  }

  const { data, error } = await supabase.rpc('create_organization', {
    p_name: input.name,
    p_slug: input.slug,
    p_logo_url: input.logoUrl ?? null,
  })
  if (error) {
    if (isMissingOrgRelation(error.message)) {
      if (isLocalOrganizationsDevMode()) return createLocalOrganization(input)
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
  _options?: { organizations?: Organization[]; isSuperAdmin?: boolean },
): Organization | null {
  // Only companies the user is explicitly granted (Companies checkboxes) — never every
  // org just because they are Superadmin on one company.
  const candidates = memberships
    .filter((row) => row.can_access && row.organization)
    .map((row) => row.organization)

  if (!candidates.length) return null
  if (preferredId) {
    const match = candidates.find((org) => org.id === preferredId)
    if (match) return match
  }
  const stored = readStoredActiveOrganizationId()
  if (stored) {
    const match = candidates.find((org) => org.id === stored)
    if (match) return match
  }
  return candidates[0] ?? null
}

export function membershipIsSuperAdmin(memberships: OrganizationMembership[]) {
  return memberships.some((row) => row.can_access && row.role === 'super_admin')
}

/**
 * Companies shown in the header switcher.
 * Only orgs with can_access (Companies checkboxes). Superadmin on JS alone does not
 * unlock VSI — both must be checked to switch between them.
 */
export function switchableOrganizations(
  memberships: OrganizationMembership[],
  _organizations: Organization[],
  _isSuperAdmin: boolean,
): Organization[] {
  const seen = new Set<string>()
  const list: Organization[] = []
  for (const row of memberships) {
    if (!row.can_access || seen.has(row.organization_id)) continue
    seen.add(row.organization_id)
    list.push(row.organization)
  }
  return list
}

/** True when the user may use the multi-company header switcher (2+ granted companies). */
export function canSwitchCompanies(memberships: OrganizationMembership[]) {
  return switchableOrganizations(memberships, [], false).length >= 2
}
