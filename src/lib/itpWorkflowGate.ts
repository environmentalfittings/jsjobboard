import type { ItpProcessSectionDef } from '../constants/itpProcessSections'
import type { CompanyWorkflowKey } from '../constants/companyWorkflows'
import {
  allScopeItems,
  getExec,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'
import { extractLibraryPlanFromItpData } from './valveItpStorage'
import { loadItpMasterCatalog } from './itpMasterCatalog'
import { supabase } from './supabase'
import {
  getWorkflowStages,
  isBackwardStatusMove,
  workflowStageIndex,
} from './statusWorkflow'

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

function incompleteItemsForSections(
  plan: ItpLibraryPlanPayload | null,
  sectionIds: Set<string>,
): { sectionTitles: string[]; incompleteItemNames: string[] } {
  if (!plan || sectionIds.size === 0) {
    return { sectionTitles: [], incompleteItemNames: [] }
  }
  const items = allScopeItems(plan).filter((item) => sectionIds.has(item.secId))
  const incomplete = items.filter((item) => !getExec(plan, item.id).done)
  const sectionTitles = [
    ...new Set(items.map((item) => item.secTitle).filter(Boolean)),
  ]
  return {
    sectionTitles,
    incompleteItemNames: incomplete.map((item) => item.name),
  }
}

/**
 * Forward leave of one or more Shop Workflow stages is blocked until every ITP
 * process section mapped to those stages has its included items marked done.
 * Neutral / same-stage / backward moves are not gated.
 */
export function evaluateItpWorkflowGate(options: {
  fromStatus: string
  toStatus: string
  companyKey: CompanyWorkflowKey
  processSections: ItpProcessSectionDef[]
  plan: ItpLibraryPlanPayload | null
}): ItpWorkflowGateResult {
  const { fromStatus, toStatus, companyKey, processSections, plan } = options
  if (!fromStatus || !toStatus || fromStatus === toStatus) return { ok: true }
  if (isBackwardStatusMove(fromStatus, toStatus, companyKey)) return { ok: true }

  const leavingKeys = stageKeysBeingLeft(fromStatus, toStatus, companyKey)
  if (leavingKeys.length === 0) return { ok: true }

  const leavingKeySet = new Set(leavingKeys)
  const linkedSections = processSections.filter((section) => {
    const key = section.workflowStageKey?.trim()
    return Boolean(key && leavingKeySet.has(key))
  })
  if (linkedSections.length === 0) return { ok: true }

  const stages = getWorkflowStages(companyKey)
  const stageLabel = leavingKeys
    .map((key) => stages.find((stage) => stage.key === key)?.label ?? key)
    .join(', ')
  const sectionTitles = linkedSections.map((section) => section.title)
  const sectionIds = new Set(linkedSections.map((section) => section.id))

  if (!plan) {
    return {
      ok: false,
      message: `Start the ITP and complete ${sectionTitles.join(', ')} before leaving ${stageLabel}.`,
      stageLabel,
      sectionTitles,
      incompleteItemNames: [],
    }
  }

  const { incompleteItemNames } = incompleteItemsForSections(plan, sectionIds)
  if (incompleteItemNames.length === 0) return { ok: true }

  const preview = incompleteItemNames.slice(0, 4).join(', ')
  const more =
    incompleteItemNames.length > 4 ? ` (+${incompleteItemNames.length - 4} more)` : ''
  return {
    ok: false,
    message: `Complete ITP items for ${sectionTitles.join(', ')} before leaving ${stageLabel}: ${preview}${more}.`,
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
