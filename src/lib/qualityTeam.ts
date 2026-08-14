import { isClosedWorkOrder } from './jobDisplayStatus'
import { normalizeEmployeeUsername } from './employeeAuth'
import { supabase } from './supabase'
import { extractLibraryPlanFromItpData } from './valveItpStorage'
import { VALVE_LIST_SELECT } from './valveSelect'
import { findLibraryItem } from '../constants/itpLibrary'
import {
  normalizeQualityTeamLevel,
  qualityTeamLevelLabel,
  type Employee,
  type QualityTeamLevel,
} from '../types/employees'
import {
  allScopeItems,
  getExec,
  getSel,
  normalizeItpLibraryPlan,
  type ItpLibraryAttachment,
  type ItpLibraryPlanPayload,
  type ItpQcReviewStatus,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'

export function isQualityTeamMember(level: QualityTeamLevel | null | undefined): boolean {
  return Boolean(level && level !== 'none')
}

/** Flag ticket owners / ITP Accept & scope editors: Admin, Manager, or Supervisor. */
export function isQualityTeamFlagOwner(level: QualityTeamLevel | null | undefined): boolean {
  return level === 'admin' || level === 'manager' || level === 'supervisor'
}

/**
 * Resolve the signed-in user's Quality Team level from Employees.
 * Prefers auth_user_id, then username (covers roster rows not yet linked to Auth).
 */
export async function loadCurrentUserQualityTeamLevel(options: {
  userId: string | null | undefined
  username?: string | null
}): Promise<QualityTeamLevel> {
  const userId = options.userId?.trim()
  const username = normalizeEmployeeUsername(options.username ?? '')

  if (userId) {
    const { data } = await supabase
      .from('employees')
      .select('quality_team_level')
      .eq('auth_user_id', userId)
      .maybeSingle()
    const level = normalizeQualityTeamLevel(data?.quality_team_level)
    if (level !== 'none') return level
  }

  if (username) {
    const { data } = await supabase
      .from('employees')
      .select('quality_team_level,auth_user_id')
      .ilike('username', username)
      .maybeSingle()
    if (data) {
      return normalizeQualityTeamLevel(data.quality_team_level)
    }
  }

  return 'none'
}

export function canEditItpBuildScope(options: {
  readOnly: boolean
  isPersisted: boolean
  plan: ItpLibraryPlanPayload
  qualityTeamLevel: QualityTeamLevel | null | undefined
  /** Shop Admin app role — can edit scope after lock (same as QC Admin/Mgr/Sup). */
  isShopAdmin?: boolean
}): boolean {
  if (options.readOnly) return false
  if (!options.isPersisted) return true
  // Accepted ITPs must be Reopened before scope can be edited again.
  if (options.plan.qcReview.status === 'accepted') return false
  return isQualityTeamFlagOwner(options.qualityTeamLevel) || Boolean(options.isShopAdmin)
}

export function canReopenItp(options: {
  readOnly: boolean
  isPersisted: boolean
  plan: ItpLibraryPlanPayload
  qualityTeamLevel: QualityTeamLevel | null | undefined
  isShopAdmin?: boolean
}): boolean {
  if (options.readOnly || !options.isPersisted) return false
  if (options.plan.qcReview.status !== 'accepted') return false
  return isQualityTeamFlagOwner(options.qualityTeamLevel) || Boolean(options.isShopAdmin)
}

export function canAcceptItp(options: {
  readOnly: boolean
  isPersisted: boolean
  plan: ItpLibraryPlanPayload
  qualityTeamLevel: QualityTeamLevel | null | undefined
  /** Shop Admin app role — can Accept pending ITPs. */
  isShopAdmin?: boolean
}): boolean {
  if (options.readOnly || !options.isPersisted) return false
  if (!isQualityTeamFlagOwner(options.qualityTeamLevel) && !options.isShopAdmin) return false
  return options.plan.qcReview.status === 'pending_review'
}

/** Resolve QT level from the Employees roster already loaded in the app. */
export function resolveQualityTeamLevelFromEmployees(
  employees: Employee[],
  options: { userId?: string | null; username?: string | null },
): QualityTeamLevel {
  const userId = options.userId?.trim()
  const username = normalizeEmployeeUsername(options.username ?? '')
  if (userId) {
    const byAuth = employees.find((row) => row.auth_user_id === userId)
    if (byAuth) return normalizeQualityTeamLevel(byAuth.quality_team_level)
  }
  if (username) {
    const byUser = employees.find(
      (row) => normalizeEmployeeUsername(row.username) === username,
    )
    if (byUser) return normalizeQualityTeamLevel(byUser.quality_team_level)
  }
  return 'none'
}

export function qcReviewStatusLabel(status: ItpQcReviewStatus): string {
  if (status === 'pending_review') return 'Pending review'
  if (status === 'accepted') return 'Accepted'
  return 'Draft'
}

/** Stable fingerprint of Build Scope (not checklist exec) for change detection. */
export function itpScopeFingerprint(plan: ItpLibraryPlanPayload): string {
  const custom = plan.custom
    .map((c) => `${c.id}|${c.secId}|${c.name.trim()}`)
    .sort()
  const selKeys = Object.keys(plan.sel).sort()
  const sel = selKeys.map((id) => {
    const s = getSel(plan, id)
    return [
      id,
      s.included ? 1 : 0,
      s.holdPoint ? 1 : 0,
      s.beforeMeas ? 1 : 0,
      s.afterMeas ? 1 : 0,
      s.measVerify ? 1 : 0,
      s.requirePicture ? 1 : 0,
      s.minPhotos || 1,
      s.pictureLabel.trim(),
      s.blockNext ? 1 : 0,
      s.measFields.map((f) => `${f.id}:${f.label.trim()}`).join(';'),
      [...s.subReqs].map((x) => x.trim()).filter(Boolean).sort().join(';'),
    ].join('|')
  })
  return JSON.stringify({ custom, sel })
}

/** Human-readable summary of Build Scope differences between two plans. */
export function diffItpScopeSummary(
  before: ItpLibraryPlanPayload,
  after: ItpLibraryPlanPayload,
): string | null {
  if (itpScopeFingerprint(before) === itpScopeFingerprint(after)) return null

  const beforeIds = new Set(allScopeItems(before).map((i) => i.id))
  const afterIds = new Set(allScopeItems(after).map((i) => i.id))
  let added = 0
  let removed = 0
  for (const id of afterIds) if (!beforeIds.has(id)) added += 1
  for (const id of beforeIds) if (!afterIds.has(id)) removed += 1

  let holdChanged = 0
  let measChanged = 0
  let subChanged = 0
  const ids = new Set([...beforeIds, ...afterIds])
  for (const id of ids) {
    const a = getSel(before, id)
    const b = getSel(after, id)
    if (a.holdPoint !== b.holdPoint) holdChanged += 1
    if (a.beforeMeas !== b.beforeMeas || a.afterMeas !== b.afterMeas || a.measVerify !== b.measVerify) {
      measChanged += 1
    }
    const aSubs = [...a.subReqs].map((x) => x.trim()).filter(Boolean).sort().join('\n')
    const bSubs = [...b.subReqs].map((x) => x.trim()).filter(Boolean).sort().join('\n')
    if (aSubs !== bSubs) subChanged += 1
  }

  const beforeCustom = new Set(before.custom.map((c) => c.id))
  const afterCustom = new Set(after.custom.map((c) => c.id))
  let customChanged = 0
  for (const id of afterCustom) if (!beforeCustom.has(id)) customChanged += 1
  for (const id of beforeCustom) if (!afterCustom.has(id)) customChanged += 1
  for (const c of after.custom) {
    const prev = before.custom.find((x) => x.id === c.id)
    if (prev && prev.name.trim() !== c.name.trim()) customChanged += 1
  }

  const parts: string[] = []
  if (added) parts.push(`Added ${added} item${added === 1 ? '' : 's'}`)
  if (removed) parts.push(`Removed ${removed} item${removed === 1 ? '' : 's'}`)
  if (holdChanged) parts.push(`Updated hold points (${holdChanged})`)
  if (measChanged) parts.push(`Updated measurement flags (${measChanged})`)
  if (subChanged) parts.push(`Updated sub-requirements (${subChanged})`)
  if (customChanged) parts.push(`Updated custom items (${customChanged})`)
  if (parts.length === 0) parts.push('Updated Build Scope')
  return parts.join(', ')
}

function mapEmployeeRow(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id),
    employee_no: String(row.employee_no ?? ''),
    first_name: String(row.first_name ?? ''),
    last_name: String(row.last_name ?? ''),
    full_name: String(row.full_name ?? ''),
    username: String(row.username ?? ''),
    initials: String(row.initials ?? ''),
    company: String(row.company ?? ''),
    is_active: Boolean(row.is_active),
    is_tester: Boolean(row.is_tester),
    quality_team_level: normalizeQualityTeamLevel(row.quality_team_level),
    auth_user_id: row.auth_user_id == null ? null : String(row.auth_user_id),
  }
}

/** Prefer this when Employees page data is already loaded — same source of truth. */
export function qualityTeamMembersFromEmployees(employees: Employee[]): Employee[] {
  return employees
    .filter((row) => row.is_active && isQualityTeamMember(row.quality_team_level))
    .slice()
    .sort((a, b) => {
      const byLast = a.last_name.localeCompare(b.last_name)
      if (byLast !== 0) return byLast
      return a.first_name.localeCompare(b.first_name)
    })
}

/** People eligible to own a flagged QA/QC ticket. */
export function qualityTeamFlagOwnersFromEmployees(employees: Employee[]): Employee[] {
  return qualityTeamMembersFromEmployees(employees).filter((row) =>
    isQualityTeamFlagOwner(row.quality_team_level),
  )
}

export async function loadQualityTeamMembers(): Promise<{
  members: Employee[]
  error: string | null
}> {
  // Load the full roster (same as Employees page), then filter client-side.
  // Server-side .neq('quality_team_level','none') was returning an empty list for some sessions.
  const fullSelect =
    'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,is_tester,quality_team_level,auth_user_id'
  const withoutTester =
    'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,quality_team_level,auth_user_id'
  const baseSelect =
    'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,auth_user_id'

  let rows: Record<string, unknown>[] | null = null
  let errorMessage: string | null = null

  const full = await supabase
    .from('employees')
    .select(fullSelect)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (!full.error) {
    rows = (full.data as Record<string, unknown>[] | null) ?? []
  } else if (/quality_team_level/i.test(full.error.message)) {
    return {
      members: [],
      error: 'Run migration-employee-quality-team.sql in Supabase to enable Quality Team',
    }
  } else if (/is_tester/i.test(full.error.message)) {
    const next = await supabase
      .from('employees')
      .select(withoutTester)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
    if (!next.error) {
      rows = (next.data as Record<string, unknown>[] | null) ?? []
    } else if (/quality_team_level/i.test(next.error.message)) {
      return {
        members: [],
        error: 'Run migration-employee-quality-team.sql in Supabase to enable Quality Team',
      }
    } else if (/is_tester/i.test(next.error.message)) {
      const base = await supabase
        .from('employees')
        .select(baseSelect)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
      if (base.error) {
        errorMessage = base.error.message
      } else {
        rows = (base.data as Record<string, unknown>[] | null) ?? []
      }
    } else {
      errorMessage = next.error.message
    }
  } else {
    errorMessage = full.error.message
  }

  if (errorMessage) {
    return { members: [], error: errorMessage }
  }

  const employees = (rows ?? []).map(mapEmployeeRow)
  return { members: qualityTeamMembersFromEmployees(employees), error: null }
}

export type QualityTeamItpRow = {
  valveRowId: number
  valveId: string
  customer: string | null
  cell: string | null
  jobType: string | null
  status: ItpQcReviewStatus
  statusLabel: string
  itemCount: number
  revisionCount: number
  generatedAt: string | null
  generatedByName: string | null
  acceptedAt: string | null
  acceptedByName: string | null
  acceptedByLevelLabel: string | null
  updatedAt: string | null
  valve: Valve
  plan: ItpLibraryPlanPayload
}

function planHasOpenFlags(plan: ItpLibraryPlanPayload): boolean {
  return Object.values(plan.exec ?? {}).some((ex) => Boolean(ex?.flagged) && !String(ex.flagResolution ?? '').trim())
}

async function fetchAllValveItpRows(): Promise<{
  rows: Array<{ valve_row_id: unknown; itp_data: unknown; updated_at: unknown }>
  error: string | null
}> {
  const pageSize = 1000
  const rows: Array<{ valve_row_id: unknown; itp_data: unknown; updated_at: unknown }> = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('valve_itp')
      .select('valve_row_id,itp_data,updated_at')
      .order('updated_at', { ascending: false })
      .range(from, to)
    if (error) return { rows: [], error: error.message }
    const batch = (data as typeof rows | null) ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { rows, error: null }
}

async function fetchValvesByIds(valveIds: number[]): Promise<{ valves: Valve[]; error: string | null }> {
  const valves: Valve[] = []
  const chunkSize = 150
  for (let i = 0; i < valveIds.length; i += chunkSize) {
    const chunk = valveIds.slice(i, i + chunkSize)
    const { data, error } = await supabase.from('valves').select(VALVE_LIST_SELECT).in('id', chunk)
    if (error) return { valves: [], error: error.message }
    valves.push(...(((data as Valve[] | null) ?? []) as Valve[]))
  }
  return { valves, error: null }
}

export async function loadActiveQualityTeamItps(): Promise<{
  rows: QualityTeamItpRow[]
  error: string | null
}> {
  const { rows: itpRows, error: itpError } = await fetchAllValveItpRows()
  if (itpError) return { rows: [], error: itpError }

  const withPlans: Array<{
    valveRowId: number
    updatedAt: string | null
    plan: ItpLibraryPlanPayload
  }> = []

  for (const row of itpRows) {
    const valveRowId = Number(row.valve_row_id)
    if (!Number.isFinite(valveRowId)) continue
    const libraryPlan = extractLibraryPlanFromItpData(row.itp_data)
    if (!libraryPlan) continue
    // Normalize needs a valve; use a stub then replace snapshot after valve load.
    const stubValve = { id: valveRowId, valve_id: String(valveRowId) } as Valve
    const plan = normalizeItpLibraryPlan(libraryPlan, stubValve)
    withPlans.push({
      valveRowId,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      plan,
    })
  }

  if (withPlans.length === 0) return { rows: [], error: null }

  const valveIds = [...new Set(withPlans.map((row) => row.valveRowId))]
  const { valves, error: valveError } = await fetchValvesByIds(valveIds)
  if (valveError) return { rows: [], error: valveError }

  const valveById = new Map<number, Valve>()
  for (const valve of valves) {
    valveById.set(valve.id, valve)
  }

  const rows: QualityTeamItpRow[] = []
  for (const item of withPlans) {
    const valve = valveById.get(item.valveRowId)
    if (!valve) continue
    const plan = normalizeItpLibraryPlan(item.plan, valve)
    // Keep closed jobs that still have open QA flags so tickets remain visible.
    if (isClosedWorkOrder(valve) && !planHasOpenFlags(plan)) continue
    const level = normalizeQualityTeamLevel(plan.qcReview.acceptedByLevel)
    rows.push({
      valveRowId: valve.id,
      valveId: valve.valve_id,
      customer: valve.customer ?? null,
      cell: valve.cell ?? null,
      jobType: valve.job_type ?? null,
      status: plan.qcReview.status,
      statusLabel: qcReviewStatusLabel(plan.qcReview.status),
      itemCount: allScopeItems(plan).length,
      revisionCount: (plan.qcReview.changeLog ?? []).filter((e) => e.summary !== 'Accepted').length,
      generatedAt: plan.qcReview.generatedAt,
      generatedByName: plan.qcReview.generatedByName?.trim() || null,
      acceptedAt: plan.qcReview.acceptedAt,
      acceptedByName: plan.qcReview.acceptedByName,
      acceptedByLevelLabel:
        plan.qcReview.acceptedByLevel && level !== 'none' ? qualityTeamLevelLabel(level) : null,
      updatedAt: item.updatedAt ?? plan.updatedAt,
      valve,
      plan,
    })
  }

  rows.sort((a, b) => {
    const aPending = a.status === 'pending_review' ? 0 : a.status === 'draft' ? 1 : 2
    const bPending = b.status === 'pending_review' ? 0 : b.status === 'draft' ? 1 : 2
    if (aPending !== bPending) return aPending - bPending
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
  })

  return { rows, error: null }
}

export type QualityTeamFlaggedItem = {
  key: string
  valveRowId: number
  valveId: string
  customer: string | null
  cell: string | null
  itemId: string
  itemName: string
  flagReason: string
  flagPhotos: ItpLibraryAttachment[]
  flaggedAt: string | null
  flaggedByUserId: string | null
  flaggedByName: string | null
  flagOwnerEmployeeId: string | null
  flagOwnerUserId: string | null
  flagOwnerName: string | null
  flagResolution: string
  flagResolvedAt: string | null
  flagResolvedByName: string | null
  isResolved: boolean
  valve: Valve
  plan: ItpLibraryPlanPayload
}

export function collectFlaggedItemsFromItps(rows: QualityTeamItpRow[]): QualityTeamFlaggedItem[] {
  const out: QualityTeamFlaggedItem[] = []
  for (const row of rows) {
    const scopeById = new Map(allScopeItems(row.plan).map((item) => [item.id, item]))
    const itemIds = new Set<string>([...scopeById.keys(), ...Object.keys(row.plan.exec ?? {})])
    for (const itemId of itemIds) {
      const ex = getExec(row.plan, itemId)
      if (!ex.flagged) continue
      const scopeItem = scopeById.get(itemId)
      const custom = row.plan.custom.find((c) => c.id === itemId)
      const found = findLibraryItem(itemId)
      const itemName =
        scopeItem?.name?.trim() ||
        custom?.name?.trim() ||
        found?.item.name?.trim() ||
        itemId
      const resolution = ex.flagResolution?.trim() ?? ''
      out.push({
        key: `${row.valveRowId}:${itemId}`,
        valveRowId: row.valveRowId,
        valveId: row.valveId,
        customer: row.customer,
        cell: row.cell,
        itemId,
        itemName,
        flagReason: ex.flagReason?.trim() || '—',
        flagPhotos: ex.flagPhotos ?? [],
        flaggedAt: ex.flaggedAt,
        flaggedByUserId: ex.flaggedByUserId,
        flaggedByName: ex.flaggedByName,
        flagOwnerEmployeeId: ex.flagOwnerEmployeeId,
        flagOwnerUserId: ex.flagOwnerUserId,
        flagOwnerName: ex.flagOwnerName,
        flagResolution: resolution,
        flagResolvedAt: ex.flagResolvedAt,
        flagResolvedByName: ex.flagResolvedByName,
        isResolved: Boolean(resolution),
        valve: row.valve,
        plan: row.plan,
      })
    }
  }

  out.sort((a, b) => {
    if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1
    return String(b.flaggedAt ?? '').localeCompare(String(a.flaggedAt ?? ''))
  })
  return out
}
