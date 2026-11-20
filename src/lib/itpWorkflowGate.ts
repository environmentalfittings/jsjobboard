import type { ItpProcessSectionDef } from '../constants/itpProcessSections'
import type { CompanyWorkflowKey } from '../constants/companyWorkflows'
import { normalizeShopAreaValue } from '../constants/itpShopAreas'
import {
  allScopeItems,
  getExec,
  type ItpLibraryPlanPayload,
  type ItpLibraryScopeItem,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'
import { extractLibraryPlanFromItpData } from './valveItpStorage'
import { loadItpMasterCatalog, resolveItpItemShopArea } from './itpMasterCatalog'
import { supabase } from './supabase'
import {
  getWorkflowStages,
  isBackwardStatusMove,
  workflowStageIndex,
} from './statusWorkflow'
import { isItpGateBypassed } from './itpGateBypass'

export type ItpWorkflowGateResult =
  | { ok: true }
  | {
      ok: false
      message: string
      stageLabel: string
      sectionTitles: string[]
      incompleteItemNames: string[]
    }

let processSectionsCache: { at: number; sections: ItpProcessSectionDef[] } | null = null
const PROCESS_SECTIONS_TTL_MS = 30_000

export async function loadProcessSectionsForGate(): Promise<ItpProcessSectionDef[]> {
  const now = Date.now()
  if (processSectionsCache && now - processSectionsCache.at < PROCESS_SECTIONS_TTL_MS) {
    return processSectionsCache.sections
  }
  const state = await loadItpMasterCatalog()
  processSectionsCache = { at: now, sections: state.processSections }
  return state.processSections
}

export function invalidateItpWorkflowGateCache() {
  processSectionsCache = null
}

async function loadPersistedLibraryPlan(valveRowId: number): Promise<ItpLibraryPlanPayload | null> {
  const { data, error } = await supabase
    .from('valve_itp')
    .select('itp_data,content')
    .eq('valve_row_id', valveRowId)
    .maybeSingle()
  if (error || !data) return null
  const fromJsonb = extractLibraryPlanFromItpData(data.itp_data)
  if (fromJsonb) return fromJsonb
  const raw = String(data.content ?? '').trim()
  if (!raw) return null
  try {
    return extractLibraryPlanFromItpData(JSON.parse(raw))
  } catch {
    return null
  }
}

function stageKeysBeingLeft(
  fromStatus: string,
  toStatus: string,
  companyKey: CompanyWorkflowKey,
): string[] {
  const fromIdx = workflowStageIndex(fromStatus, companyKey)
  const toIdx = workflowStageIndex(toStatus, companyKey)
  if (fromIdx == null || toIdx == null || toIdx <= fromIdx) return []
  const stages = getWorkflowStages(companyKey)
  const keys: string[] = []
  for (let i = fromIdx; i < toIdx; i += 1) {
    const key = stages[i]?.key?.trim()
    if (key) keys.push(key)
  }
  return keys
}

/** Job-card station labels that belong to the workflow stages being left. */
function stationLabelsForLeavingStages(
  leavingKeys: string[],
  companyKey: CompanyWorkflowKey,
): Set<string> {
  const stages = getWorkflowStages(companyKey)
  const labels = new Set<string>()
  for (const key of leavingKeys) {
    const stage = stages.find((row) => row.key === key)
    if (!stage) continue
    for (const status of stage.statuses) {
      const normalized = normalizeShopAreaValue(status)
      if (normalized) labels.add(normalized.toLowerCase())
    }
    const label = normalizeShopAreaValue(stage.label)
    if (label) labels.add(label.toLowerCase())
  }
  return labels
}

function itemStationLabel(item: ItpLibraryScopeItem): string {
  return resolveItpItemShopArea(item.sel.shopArea, item.secId)
}

function incompleteItemsForStations(
  plan: ItpLibraryPlanPayload | null,
  leavingStations: Set<string>,
): { sectionTitles: string[]; incompleteItemNames: string[]; stationLabels: string[] } {
  if (!plan || leavingStations.size === 0) {
    return { sectionTitles: [], incompleteItemNames: [], stationLabels: [] }
  }
  const incomplete = allScopeItems(plan).filter((item) => {
    if (getExec(plan, item.id).done) return false
    const station = normalizeShopAreaValue(itemStationLabel(item)).toLowerCase()
    return Boolean(station && leavingStations.has(station))
  })
  const stationLabels = [
    ...new Set(incomplete.map((item) => itemStationLabel(item)).filter(Boolean)),
  ]
  const sectionTitles = [...new Set(incomplete.map((item) => item.secTitle).filter(Boolean))]
  return {
    sectionTitles,
    incompleteItemNames: incomplete.map((item) => item.name),
    stationLabels,
  }
}

/**
 * Forward leave of one or more Shop Workflow stages is blocked until every
 * included ITP item stationed at those stages is marked done.
 * Item Station (shopArea) controls the gate — not the section Shop workflow header.
 * Neutral / same-stage / backward moves are not gated.
 */
export function evaluateItpWorkflowGate(options: {
  fromStatus: string
  toStatus: string
  companyKey: CompanyWorkflowKey
  /** Kept for callers; section workflowStageKey no longer drives the leave gate. */
  processSections: ItpProcessSectionDef[]
  plan: ItpLibraryPlanPayload | null
}): ItpWorkflowGateResult {
  const { fromStatus, toStatus, companyKey, plan } = options
  if (!fromStatus || !toStatus || fromStatus === toStatus) return { ok: true }
  if (isBackwardStatusMove(fromStatus, toStatus, companyKey)) return { ok: true }

  const leavingKeys = stageKeysBeingLeft(fromStatus, toStatus, companyKey)
  if (leavingKeys.length === 0) return { ok: true }

  const stages = getWorkflowStages(companyKey)
  const stageLabel = leavingKeys
    .map((key) => stages.find((stage) => stage.key === key)?.label ?? key)
    .join(', ')
  const leavingStations = stationLabelsForLeavingStages(leavingKeys, companyKey)
  if (leavingStations.size === 0) return { ok: true }

  // No ITP yet → nothing stationed at this stage to complete.
  if (!plan) return { ok: true }

  const { incompleteItemNames, sectionTitles, stationLabels } = incompleteItemsForStations(
    plan,
    leavingStations,
  )
  if (incompleteItemNames.length === 0) return { ok: true }

  const stationHint = stationLabels.length ? stationLabels.join(', ') : stageLabel
  const preview = incompleteItemNames.slice(0, 4).join(', ')
  const more =
    incompleteItemNames.length > 4 ? ` (+${incompleteItemNames.length - 4} more)` : ''
  return {
    ok: false,
    message: `Complete ITP items stationed at ${stationHint} before leaving ${stageLabel}: ${preview}${more}.`,
    stageLabel,
    sectionTitles,
    incompleteItemNames,
  }
}

/** Load master section→workflow maps + valve ITP, then evaluate the gate. */
export async function assertItpCompleteForStatusLeave(options: {
  valve: Valve
  nextStatus: string
  companyKey: CompanyWorkflowKey
}): Promise<ItpWorkflowGateResult> {
  const fromStatus = options.valve.status
  const toStatus = options.nextStatus
  if (!fromStatus || !toStatus || fromStatus === toStatus) return { ok: true }
  if (isItpGateBypassed(options.valve.id)) return { ok: true }
  if (isBackwardStatusMove(fromStatus, toStatus, options.companyKey)) return { ok: true }
  if (stageKeysBeingLeft(fromStatus, toStatus, options.companyKey).length === 0) {
    return { ok: true }
  }

  const [processSections, plan] = await Promise.all([
    loadProcessSectionsForGate(),
    loadPersistedLibraryPlan(options.valve.id),
  ])
  return evaluateItpWorkflowGate({
    fromStatus,
    toStatus,
    companyKey: options.companyKey,
    processSections,
    plan,
  })
}
