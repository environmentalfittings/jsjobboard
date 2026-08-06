/**
 * Forward shop workflow for rework detection.
 * Cards may skip stages; moving to a lower stage index is a backward/rework move.
 * Neutral statuses (waiting/hold/outsourced/terminal scrap) do not count as forward or reverse.
 *
 * Defaults ship in code; Manage Lists can override via status_workflow_config in Supabase.
 */

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

/** @deprecated Use getWorkflowStages() — kept for callers that expect the constant name. */
export const FORWARD_WORKFLOW_STAGES = DEFAULT_FORWARD_WORKFLOW_STAGES

let cachedConfig: StatusWorkflowConfig = cloneConfig(DEFAULT_STATUS_WORKFLOW)
let statusToStageIndex = buildStatusIndex(cachedConfig)
let neutralSet = new Set(cachedConfig.neutrals)
let loadPromise: Promise<StatusWorkflowConfig> | null = null

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
  const map = new Map<string, number>()
  config.stages.forEach((stage, index) => {
    for (const status of stage.statuses) map.set(status, index)
  })
  return map
}

function applyConfig(config: StatusWorkflowConfig): StatusWorkflowConfig {
  const next = normalizeConfig(config)
  cachedConfig = next
  statusToStageIndex = buildStatusIndex(next)
  neutralSet = new Set(next.neutrals)
  return next
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
    stages.push({
      key: stage.key?.trim() || slugKey(label, index),
      label,
      statuses,
    })
  })
  const neutrals = config.neutrals
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s))
  // de-dupe neutrals
  const uniqueNeutrals = [...new Set(neutrals)]
  return { stages, neutrals: uniqueNeutrals }
}

export function getStatusWorkflowConfig(): StatusWorkflowConfig {
  return cloneConfig(cachedConfig)
}

export function getWorkflowStages(): WorkflowStage[] {
  return cachedConfig.stages
}

export function getNeutralWorkflowStatuses(): string[] {
  return [...cachedConfig.neutrals]
}

export function setStatusWorkflowConfigLocal(config: StatusWorkflowConfig): StatusWorkflowConfig {
  return applyConfig(config)
}

export function workflowStageIndex(status: string | null | undefined): number | null {
  if (!status) return null
  if (neutralSet.has(status)) return null
  return statusToStageIndex.has(status) ? (statusToStageIndex.get(status) as number) : null
}

export function workflowStageLabel(status: string | null | undefined): string {
  const idx = workflowStageIndex(status)
  if (idx == null) return status?.trim() || '—'
  return cachedConfig.stages[idx]?.label ?? status ?? '—'
}

/** True when moving from a later workflow stage back to an earlier one. */
export function isBackwardStatusMove(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): boolean {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return false
  const from = workflowStageIndex(fromStatus)
  const to = workflowStageIndex(toStatus)
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

export async function loadStatusWorkflowConfig(): Promise<StatusWorkflowConfig> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const { data, error } = await supabase
      .from('status_workflow_config')
      .select('stages,neutrals')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) {
      // Table missing or empty — keep defaults; admin can seed on first save.
      return applyConfig(DEFAULT_STATUS_WORKFLOW)
    }

    const parsed = parseRemoteConfig({
      stages: data.stages,
      neutrals: data.neutrals,
    })
    return applyConfig(parsed ?? DEFAULT_STATUS_WORKFLOW)
  })().finally(() => {
    loadPromise = null
  })
  return loadPromise
}

export async function saveStatusWorkflowConfig(
  config: StatusWorkflowConfig,
): Promise<{ error: Error | null }> {
  const normalized = normalizeConfig(config)
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
  applyConfig(normalized)
  return { error: null }
}

/** @deprecated Use getNeutralWorkflowStatuses() */
export const NEUTRAL_WORKFLOW_STATUSES = new Set(DEFAULT_NEUTRAL_WORKFLOW_STATUSES)
