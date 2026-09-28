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
  const localIds = localValveIdsForCompany(workflowKey)
  const otherLocalIds = new Set<number>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localValveIdsForCompany(key)) otherLocalIds.add(id)
  }

  return valves.filter((valve) => {
    const orgId = valveOrganizationId(valve)
    if (orgId) {
      if (!activeOrganization?.id) return workflowKey === 'js-valve'
      return orgId === activeOrganization.id
    }

    // Local / pre-migration tagging
    if (localIds.has(valve.id)) return true
    if (otherLocalIds.has(valve.id)) return false

    // Untagged historical rows stay on JS Valve so VSI starts empty.
    return workflowKey === 'js-valve'
  })
}
