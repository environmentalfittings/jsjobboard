/**
 * Forward shop workflow for rework detection.
 * Cards may skip stages; moving to a lower stage index is a backward/rework move.
 * Neutral statuses (waiting/hold/outsourced/terminal scrap) do not count as forward or reverse.
 *
 * Defaults ship in code per company. JS Valve can override via status_workflow_config in Supabase.
 * VSI uses localStorage in the multi-company demo until org-scoped DB config exists.
 */

import type { CompanyWorkflowKey, CompanyWorkflowProfile } from '../constants/companyWorkflows'
import { VSI_STATUS_ORDER } from '../constants/companyWorkflows'
import { supabase } from './supabase'

export type WorkflowStage = {
  key: string
  label: string
  statuses: string[]
}

export type StatusWorkflowConfig = {
  stages: WorkflowStage[]
  neutrals: string[]
}

export const DEFAULT_FORWARD_WORKFLOW_STAGES: WorkflowStage[] = [
  {
    key: 'pull',
    label: 'Pull / incoming',
    statuses: [
      'Pull from Customer Yard',
      'Pull from Warehouse',
      'Pull from JS Yard',
      'Coming in from Vendor',
      'Coming in from Customer',
      'Not Arrived',
      'Arrived - Not Started',
    ],
  },
  { key: 'teardown', label: 'Teardown', statuses: ['Teardown', 'PRV Teardown'] },
  { key: 'machine_1', label: 'Machine 1', statuses: ['Machine 1'] },
  { key: 'welding', label: 'Welding', statuses: ['Welding'] },
  { key: 'machine_2', label: 'Machine 2', statuses: ['Machine 2', 'Water Jet', 'Grinding'] },
  { key: 'fitting', label: 'Fitting', statuses: ['Fitting'] },
  { key: 'assembly', label: 'Assembly', statuses: ['Assembly', 'PRV Assembly'] },
  { key: 'adaption', label: 'Adaption', statuses: ['Adaption'] },
  { key: 'actuation', label: 'Actuation', statuses: ['Actuation'] },
  { key: 'testing', label: 'Testing', statuses: ['Testing'] },
  { key: 'painting', label: 'Painting', statuses: ['Painting'] },
  { key: 'warehouse_rts', label: 'Warehouse RTS', statuses: ['Warehouse RTS'] },
  { key: 'completed', label: 'Completed', statuses: ['Completed'] },
]

export const DEFAULT_NEUTRAL_WORKFLOW_STATUSES = [
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Outsourced',
  'On Hold',
  'Replaced',
  'Junked',
]

export const DEFAULT_STATUS_WORKFLOW: StatusWorkflowConfig = {
  stages: DEFAULT_FORWARD_WORKFLOW_STAGES,
  neutrals: DEFAULT_NEUTRAL_WORKFLOW_STATUSES,
}

/** VSI hold/waiting — do not count as forward or reverse for rework. */
export const VSI_NEUTRAL_WORKFLOW_STATUSES = ['Staging Area', 'Hold', 'Quarantine'] as const

/** VSI shop workflow stages matching the partner outline (RV / CV / UL departments). */
export const DEFAULT_VSI_STATUS_WORKFLOW: StatusWorkflowConfig = {
  stages: VSI_STATUS_ORDER.map((label, index) => ({
    key: slugKey(label, index),
    label,
    statuses: [label],
  })),
  neutrals: [...VSI_NEUTRAL_WORKFLOW_STATUSES],
}

export function defaultStatusWorkflowForCompany(companyKey: CompanyWorkflowKey): StatusWorkflowConfig {
  return companyKey === 'vsi' ? DEFAULT_VSI_STATUS_WORKFLOW : DEFAULT_STATUS_WORKFLOW
}

/** @deprecated Use getWorkflowStages() — kept for callers that expect the constant name. */
export const FORWARD_WORKFLOW_STAGES = DEFAULT_FORWARD_WORKFLOW_STAGES

const LOCAL_VSI_WORKFLOW_KEY = 'js-job-board-status-workflow-vsi'

type CompanyWorkflowCache = {
  config: StatusWorkflowConfig
  statusToStageIndex: Map<string, number>
  neutralSet: Set<string>
}

const caches = new Map<CompanyWorkflowKey, CompanyWorkflowCache>()
const loadPromises = new Map<CompanyWorkflowKey, Promise<StatusWorkflowConfig>>()
const workflowListeners = new Set<() => void>()

export function subscribeStatusWorkflow(listener: () => void): () => void {
  workflowListeners.add(listener)
  return () => {
    workflowListeners.delete(listener)
  }
}

function notifyStatusWorkflowListeners() {
  for (const listener of workflowListeners) listener()
}

function getCache(companyKey: CompanyWorkflowKey): CompanyWorkflowCache {
  let cache = caches.get(companyKey)
  if (!cache) {
    cache = buildCache(defaultStatusWorkflowForCompany(companyKey))
    caches.set(companyKey, cache)
  }
  return cache
}

function buildCache(config: StatusWorkflowConfig): CompanyWorkflowCache {
  const next = normalizeConfig(config)
  return {
    config: next,
    statusToStageIndex: buildStatusIndex(next),
    neutralSet: new Set(next.neutrals),
  }
}

function slugKey(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return base || `stage_${index + 1}`
}

export function cloneConfig(config: StatusWorkflowConfig): StatusWorkflowConfig {
  return {
    stages: config.stages.map((s, index) => ({
      key: s.key || slugKey(s.label, index),
      label: s.label,
      statuses: [...s.statuses],
    })),
    neutrals: [...config.neutrals],
  }
}

function buildStatusIndex(config: StatusWorkflowConfig): Map<string, number> {
  const neutrals = new Set(config.neutrals)
  const map = new Map<string, number>()
  config.stages.forEach((stage, index) => {
    for (const status of stage.statuses) {
      // Neutrals may also appear as stages in the admin list; they still do not count for rework.
      if (neutrals.has(status)) continue
      map.set(status, index)
    }
  })
  return map
}

function applyConfig(companyKey: CompanyWorkflowKey, config: StatusWorkflowConfig): StatusWorkflowConfig {
  const cache = buildCache(config)
  caches.set(companyKey, cache)
  notifyStatusWorkflowListeners()
  return cloneConfig(cache.config)
}

export function normalizeConfig(config: StatusWorkflowConfig): StatusWorkflowConfig {
  const seen = new Set<string>()
  const stages: WorkflowStage[] = []
  config.stages.forEach((stage, index) => {
    const label = stage.label.trim() || `Stage ${index + 1}`
    const statuses: string[] = []
    for (const raw of stage.statuses) {
      const status = raw.trim()
      if (!status || seen.has(status)) continue
      seen.add(status)
      statuses.push(status)
    }
    // Empty stage (Add stage → name it) still becomes a selectable shop status.
    if (statuses.length === 0 && label && !seen.has(label)) {
      seen.add(label)
      statuses.push(label)
    }
    stages.push({
      key: stage.key?.trim() || slugKey(label, index),
      label,
      statuses,
    })
  })
  // Keep neutrals even when they also appear as stages (VSI Staging Area / Hold / Quarantine).
  const uniqueNeutrals = [...new Set(config.neutrals.map((s) => s.trim()).filter(Boolean))]
  return { stages, neutrals: uniqueNeutrals }
}

export function getStatusWorkflowConfig(companyKey: CompanyWorkflowKey = 'js-valve'): StatusWorkflowConfig {
  return cloneConfig(getCache(companyKey).config)
}

export function getWorkflowStages(companyKey: CompanyWorkflowKey = 'js-valve'): WorkflowStage[] {
  return getCache(companyKey).config.stages
}

export function getNeutralWorkflowStatuses(companyKey: CompanyWorkflowKey = 'js-valve'): string[] {
  return [...getCache(companyKey).config.neutrals]
}

export function setStatusWorkflowConfigLocal(
  config: StatusWorkflowConfig,
  companyKey: CompanyWorkflowKey = 'js-valve',
): StatusWorkflowConfig {
  return applyConfig(companyKey, config)
}

export function workflowStageIndex(
  status: string | null | undefined,
  companyKey: CompanyWorkflowKey = 'js-valve',
): number | null {
  if (!status) return null
  const cache = getCache(companyKey)
  if (cache.neutralSet.has(status)) return null
  return cache.statusToStageIndex.has(status) ? (cache.statusToStageIndex.get(status) as number) : null
}

export function workflowStageLabel(
  status: string | null | undefined,
  companyKey: CompanyWorkflowKey = 'js-valve',
): string {
  const idx = workflowStageIndex(status, companyKey)
  if (idx == null) return status?.trim() || '—'
  return getCache(companyKey).config.stages[idx]?.label ?? status ?? '—'
}

/** True when moving from a later workflow stage back to an earlier one. */
export function isBackwardStatusMove(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
  companyKey: CompanyWorkflowKey = 'js-valve',
): boolean {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return false
  const from = workflowStageIndex(fromStatus, companyKey)
  const to = workflowStageIndex(toStatus, companyKey)
  if (from == null || to == null) return false
  return to < from
}

function parseRemoteConfig(raw: unknown): StatusWorkflowConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { stages?: unknown; neutrals?: unknown }
  if (!Array.isArray(obj.stages)) return null
  const stages: WorkflowStage[] = []
  for (const [index, item] of obj.stages.entries()) {
    if (!item || typeof item !== 'object') continue
    const row = item as { key?: unknown; label?: unknown; statuses?: unknown }
    const label = typeof row.label === 'string' ? row.label : `Stage ${index + 1}`
    const statuses = Array.isArray(row.statuses)
      ? row.statuses.filter((s): s is string => typeof s === 'string')
      : []
    stages.push({
      key: typeof row.key === 'string' ? row.key : slugKey(label, index),
      label,
      statuses,
    })
  }
  const neutrals = Array.isArray(obj.neutrals)
    ? obj.neutrals.filter((s): s is string => typeof s === 'string')
    : [...DEFAULT_NEUTRAL_WORKFLOW_STATUSES]
  return normalizeConfig({ stages, neutrals })
}

function readLocalVsiWorkflow(): StatusWorkflowConfig | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_VSI_WORKFLOW_KEY)
    if (!raw) return null
    return parseRemoteConfig(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function writeLocalVsiWorkflow(config: StatusWorkflowConfig) {
  try {
    window.localStorage.setItem(LOCAL_VSI_WORKFLOW_KEY, JSON.stringify(config))
  } catch {
    // ignore
  }
}

export async function loadStatusWorkflowConfig(
  companyKey: CompanyWorkflowKey = 'js-valve',
): Promise<StatusWorkflowConfig> {
  const existing = loadPromises.get(companyKey)
  if (existing) return existing

  const promise = (async () => {
    if (companyKey === 'vsi') {
      const local = readLocalVsiWorkflow()
      return applyConfig('vsi', local ?? DEFAULT_VSI_STATUS_WORKFLOW)
    }

    const { data, error } = await supabase
      .from('status_workflow_config')
      .select('stages,neutrals')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) {
      // Table missing or empty — keep defaults; admin can seed on first save.
      return applyConfig('js-valve', DEFAULT_STATUS_WORKFLOW)
    }

    const parsed = parseRemoteConfig({
      stages: data.stages,
      neutrals: data.neutrals,
    })
    return applyConfig('js-valve', parsed ?? DEFAULT_STATUS_WORKFLOW)
  })().finally(() => {
    loadPromises.delete(companyKey)
  })

  loadPromises.set(companyKey, promise)
  return promise
}

export async function saveStatusWorkflowConfig(
  config: StatusWorkflowConfig,
  companyKey: CompanyWorkflowKey = 'js-valve',
): Promise<{ error: Error | null }> {
  const normalized = normalizeConfig(config)

  if (companyKey === 'vsi') {
    writeLocalVsiWorkflow(normalized)
    applyConfig('vsi', normalized)
    return { error: null }
  }

  const { error } = await supabase.from('status_workflow_config').upsert(
    {
      id: 1,
      stages: normalized.stages,
      neutrals: normalized.neutrals,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) return { error: new Error(error.message) }
  applyConfig('js-valve', normalized)
  return { error: null }
}

/** Shop statuses in workflow order: each stage's assigned statuses, or the stage name. */
export function statusOrderFromConfig(config: StatusWorkflowConfig): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  const add = (raw: string) => {
    const status = raw.trim()
    if (!status || seen.has(status)) return
    seen.add(status)
    order.push(status)
  }
  for (const stage of config.stages) {
    if (stage.statuses.length) stage.statuses.forEach(add)
    else add(stage.label)
  }
  for (const status of config.neutrals) add(status)
  return order
}

function classifyUnmappedStatus(
  status: string,
  profile: CompanyWorkflowProfile,
): 'incoming' | 'in-shop' | 'testing' | 'waiting' | 'done' {
  if (profile.incomingStatuses.has(status)) return 'incoming'
  if (profile.inShopStatuses.has(status)) return 'in-shop'
  if (profile.testingStatuses.has(status)) return 'testing'
  if (profile.waitingStatuses.has(status)) return 'waiting'
  if (profile.doneStatuses.has(status) || profile.terminalStatuses.has(status)) return 'done'
  if (/wait|hold|quarantine|staging/i.test(status)) return 'waiting'
  if (/test/i.test(status)) return 'testing'
  if (/incoming|receiving|not arrived|new valve/i.test(status)) return 'incoming'
  if (/ship|complete|warehouse rts|junked|replaced/i.test(status)) return 'done'
  return 'in-shop'
}

/** Overlay Admin → Shop workflow onto the company profile (Status dropdown, kanban phases). */
export function overlayWorkflowProfile(profile: CompanyWorkflowProfile): CompanyWorkflowProfile {
  const config = getStatusWorkflowConfig(profile.key)
  const statusOrder = statusOrderFromConfig(config)
  if (statusOrder.length === 0) return profile

  const incoming = new Set(profile.incomingStatuses)
  const inShop = new Set(profile.inShopStatuses)
  const testing = new Set(profile.testingStatuses)
  const waiting = new Set(profile.waitingStatuses)
  const done = new Set(profile.doneStatuses)
  const terminal = new Set(profile.terminalStatuses)
  const neutrals = new Set(config.neutrals)

  for (const status of statusOrder) {
    if (
      incoming.has(status) ||
      inShop.has(status) ||
      testing.has(status) ||
      waiting.has(status) ||
      done.has(status)
    ) {
      continue
    }
    const bucket = neutrals.has(status) ? 'waiting' : classifyUnmappedStatus(status, profile)
    if (bucket === 'incoming') incoming.add(status)
    else if (bucket === 'testing') testing.add(status)
    else if (bucket === 'waiting') waiting.add(status)
    else if (bucket === 'done') {
      done.add(status)
      terminal.add(status)
    } else inShop.add(status)
  }

  const phases = profile.phases.map((phase) => {
    if (phase.key === 'incoming') return { ...phase, statuses: incoming }
    if (phase.key === 'in-shop') return { ...phase, statuses: inShop }
    if (phase.key === 'testing') return { ...phase, statuses: testing }
    if (phase.key === 'waiting') return { ...phase, statuses: waiting }
    if (phase.key === 'done') return { ...phase, statuses: done }
    return phase
  })

  return {
    ...profile,
    statusOrder,
    incomingStatuses: incoming,
    inShopStatuses: inShop,
    testingStatuses: testing,
    waitingStatuses: waiting,
    doneStatuses: done,
    terminalStatuses: terminal,
    phases,
  }
}

/** @deprecated Use getNeutralWorkflowStatuses() */
export const NEUTRAL_WORKFLOW_STATUSES = new Set(DEFAULT_NEUTRAL_WORKFLOW_STATUSES)
