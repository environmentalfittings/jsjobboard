import type { CompanyWorkflowKey } from '../constants/companyWorkflows'
import type { Organization } from '../types/organizations'
import type { Valve } from '../types'

/** Valve row ids created while local VSI was active (no org column in DB yet). */
export const LOCAL_COMPANY_VALVE_IDS_KEY = 'js-job-board-local-company-valve-ids'

type LocalCompanyValveMap = Partial<Record<CompanyWorkflowKey, number[]>>

function readLocalCompanyValveMap(): LocalCompanyValveMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPANY_VALVE_IDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyValveMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyValveMap(map: LocalCompanyValveMap) {
  try {
    window.localStorage.setItem(LOCAL_COMPANY_VALVE_IDS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function rememberValveForCompany(companyKey: CompanyWorkflowKey, valveRowId: number) {
  if (!Number.isFinite(valveRowId)) return
  const map = readLocalCompanyValveMap()
  const list = new Set(map[companyKey] ?? [])
  list.add(valveRowId)
  map[companyKey] = [...list]
  writeLocalCompanyValveMap(map)
}

export function localValveIdsForCompany(companyKey: CompanyWorkflowKey): Set<number> {
  return new Set(readLocalCompanyValveMap()[companyKey] ?? [])
}

function valveOrganizationId(valve: Valve): string | null {
  const raw = (valve as Valve & { organization_id?: string | null }).organization_id
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function otherLocalValveIds(workflowKey: CompanyWorkflowKey): Set<number> {
  const otherLocalIds = new Set<number>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localValveIdsForCompany(key)) otherLocalIds.add(id)
  }
  return otherLocalIds
}

/**
 * Whether a valve row id belongs to the active company (local / pre-migration rules).
 * Untagged historical ids stay on JS Valve; VSI-only ids are local-tracked creates.
 */
export function valveRowBelongsToCompany(
  valveRowId: number,
  options: {
    workflowKey: CompanyWorkflowKey
    /** Optional org id from valves.organization_id when present. */
    valveOrganizationId?: string | null
    activeOrganization: Organization | null
  },
): boolean {
  const { workflowKey, activeOrganization } = options
  const orgId = options.valveOrganizationId?.trim() || null
  if (orgId) {
    if (!activeOrganization?.id) return workflowKey === 'js-valve'
    return orgId === activeOrganization.id
  }

  const localIds = localValveIdsForCompany(workflowKey)
  if (localIds.has(valveRowId)) return true
  if (otherLocalValveIds(workflowKey).has(valveRowId)) return false
  return workflowKey === 'js-valve'
}

/**
 * Scope shop valves to the active company.
 * - If `organization_id` exists on a row, match it to the active org.
 * - Until migration: untagged rows belong to JS Valve; VSI uses local create tracking
 *   (and otherwise starts empty).
 */
export function filterValvesForCompany(
  valves: Valve[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): Valve[] {
  const { workflowKey, activeOrganization } = options
  return valves.filter((valve) =>
    valveRowBelongsToCompany(valve.id, {
      workflowKey,
      activeOrganization,
      valveOrganizationId: valveOrganizationId(valve),
    }),
  )
}

/** Scope rework / change-log style rows that only carry valve_row_id. */
export function filterRowsByCompanyValveId<T extends { valve_row_id: number }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) =>
    valveRowBelongsToCompany(row.valve_row_id, {
      workflowKey: options.workflowKey,
      activeOrganization: options.activeOrganization,
    }),
  )
}
