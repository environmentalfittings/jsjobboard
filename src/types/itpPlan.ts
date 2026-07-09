import type { Valve } from '../types'
import type { ValvePartProfile } from '../constants/itpValveParts'
import { applyDefaultPartOperationInstructions } from '../constants/itpPartInspectionDefaults'
import { getValvePartProfile, resolveValvePartsProfileId } from '../constants/itpValveParts'
import type { ItpOverallStepId, ItpPartOperationId } from '../constants/itpProcessSteps'
import type { ItpCustomOverallStep } from '../constants/itpProcessSteps'
import { getActiveItpPlanStepIds, isItpOverallStepId } from '../constants/itpProcessSteps'
import {
  migratePartWorkflowFields,
  syncPartSelectedOperations,
  type ItpOptionalReworkOp,
  type ItpPartDisposition,
  type ItpPartInspectOutcome,
} from '../lib/itpPartWorkflow'

export const ITP_PLAN_SCHEMA_VERSION = 3 as const

export type ItpPlanValveSnapshot = {
  valveId: string
  customer: string | null
  size: string | null
  pressureClass: string | null
  valveType: string | null
  jobType: string | null
  cell: string | null
  testType: string | null
  description: string | null
  dueDate: string | null
}

export type ItpPlanStepSignOff = {
  techInitials: string
  signedAt: string
}

export type ItpStemMeasurements = {
  diameterA: string
  diameterB: string
  diameterC: string
  diameterD: string
  diameterE: string
  diameterF: string
  stemPitch: string
  stemLead: 'double' | 'single' | ''
  threads: 'left_hand' | 'right_hand' | ''
}

export type ItpWpsQcSignOff = {
  techInitials: string
  wpsReference: string
  signedAt: string
}

export type ItpPlanStepState = {
  workInstructions: string
  inspectionNotes?: string
  otherChecked?: boolean
  otherNotes?: string
  signOff: ItpPlanStepSignOff | null
  qcSignOff?: ItpPlanStepSignOff | null
  stemMeasurements?: ItpStemMeasurements
  /** @deprecated Migrated to qcSignOff on load */
  wpsQcSignOff?: ItpWpsQcSignOff | null
}

export function emptyStemMeasurements(): ItpStemMeasurements {
  return {
    diameterA: '',
    diameterB: '',
    diameterC: '',
    diameterD: '',
    diameterE: '',
    diameterF: '',
    stemPitch: '',
    stemLead: '',
    threads: '',
  }
}

export type ItpPlanPartPhoto = {
  id: string
  fileName: string
  url: string
  storagePath: string
  uploadedAt: string
}

export type ItpPlanValvePart = {
  id: string
  label: string
  isCustom: boolean
  partDisposition: ItpPartDisposition
  inspectOutcome: ItpPartInspectOutcome
  optionalReworkOps: ItpOptionalReworkOp[]
  /** Synced from workflow fields on save/load */
  selectedOperations: ItpPartOperationId[]
  operationDetails: Partial<Record<ItpPartOperationId, ItpPlanStepState>>
  photos: ItpPlanPartPhoto[]
}

export type ItpProcessPlanPayload = {
  v: typeof ITP_PLAN_SCHEMA_VERSION
  kind: 'process_plan'
  valveSnapshot: ItpPlanValveSnapshot
  selectedSteps: ItpOverallStepId[]
  selectedCustomOverallSteps: string[]
  customOverallSteps: ItpCustomOverallStep[]
  stepDetails: Partial<Record<string, ItpPlanStepState>>
  valvePartsProfileId: ValvePartProfile['id']
  valveParts: ItpPlanValvePart[]
  notes: string
  updatedAt: string
}

export function emptyItpPlanStepState(): ItpPlanStepState {
  return {
    workInstructions: '',
    inspectionNotes: '',
    otherChecked: false,
    otherNotes: '',
    signOff: null,
    qcSignOff: null,
  }
}

export function ensureStemMachine1State(state: ItpPlanStepState | undefined): ItpPlanStepState {
  const base = state ?? emptyItpPlanStepState()
  const qcSignOff =
    base.qcSignOff ??
    (base.wpsQcSignOff
      ? { techInitials: base.wpsQcSignOff.techInitials, signedAt: base.wpsQcSignOff.signedAt }
      : null)
  const legacy = base.stemMeasurements as
    | (ItpStemMeasurements & { stemLength?: string; footDiameter?: string })
    | undefined
  const stemMeasurements: ItpStemMeasurements = {
    ...emptyStemMeasurements(),
    ...(legacy ?? {}),
    diameterE: legacy?.diameterE || legacy?.stemLength || '',
    diameterF: legacy?.diameterF || legacy?.footDiameter || '',
  }
  return {
    ...base,
    stemMeasurements,
    qcSignOff,
  }
}

export function createItpPlanValvePart(def: { id: string; label: string; isCustom?: boolean }): ItpPlanValvePart {
  return {
    id: def.id,
    label: def.label,
    isCustom: def.isCustom ?? false,
    partDisposition: '',
    inspectOutcome: '',
    optionalReworkOps: [],
    selectedOperations: [],
    operationDetails: {},
    photos: [],
  }
}

export function buildDefaultValveParts(profileId: ValvePartProfile['id']): ItpPlanValvePart[] {
  const profile = getValvePartProfile(profileId)
  return profile.parts.map((part) =>
    createItpPlanValvePart({ id: part.key, label: part.label, isCustom: false }),
  )
}

export function mergeValvePartsWithProfile(
  existing: ItpPlanValvePart[] | undefined,
  profileId: ValvePartProfile['id'],
): ItpPlanValvePart[] {
  const defaults = buildDefaultValveParts(profileId)
  const byId = new Map((existing ?? []).map((part) => [part.id, part]))
  const mergedDefaults = defaults.map((part) => {
    const saved = byId.get(part.id)
    if (!saved) return part
    return {
      ...part,
      partDisposition: saved.partDisposition ?? '',
      inspectOutcome: saved.inspectOutcome ?? '',
      optionalReworkOps: saved.optionalReworkOps ?? [],
      selectedOperations: saved.selectedOperations,
      operationDetails: saved.operationDetails,
      photos: saved.photos ?? [],
    }
  })
  const custom = (existing ?? []).filter((part) => part.isCustom)
  return [...mergedDefaults, ...custom]
}

export function valveToItpSnapshot(valve: Valve): ItpPlanValveSnapshot {
  return {
    valveId: valve.valve_id,
    customer: valve.customer?.trim() || null,
    size: valve.size?.trim() || null,
    pressureClass: valve.pressure_class?.trim() || null,
    valveType: valve.valve_type?.trim() || null,
    jobType: valve.job_type?.trim() || null,
    cell: valve.cell?.trim() || null,
    testType: valve.test_type?.trim() || null,
    description: valve.description?.trim() || null,
    dueDate: valve.due_date?.trim() || null,
  }
}

export function createEmptyItpProcessPlan(valve: Valve): ItpProcessPlanPayload {
  const profileId = resolveValvePartsProfileId(valve.bowl_type, valve.valve_type)
  return normalizeItpProcessPlan(
    {
      v: ITP_PLAN_SCHEMA_VERSION,
      kind: 'process_plan',
      valveSnapshot: valveToItpSnapshot(valve),
      selectedSteps: [],
      selectedCustomOverallSteps: [],
      customOverallSteps: [],
      stepDetails: {},
      valvePartsProfileId: profileId,
      valveParts: buildDefaultValveParts(profileId),
      notes: '',
      updatedAt: new Date().toISOString(),
    },
    valve,
  )
}

function normalizeValvePart(part: ItpPlanValvePart, profileId: ValvePartProfile['id']): ItpPlanValvePart {
  const migrated = migratePartWorkflowFields(part)
  const syncedOps = syncPartSelectedOperations(migrated)
  const operationDetails = { ...(migrated.operationDetails ?? {}) }
  for (const opId of syncedOps) {
    const existing = operationDetails[opId]
    const workInstructions = applyDefaultPartOperationInstructions(
      profileId,
      part.id,
      opId,
      existing?.workInstructions ?? '',
    )
    const next: ItpPlanStepState = {
      workInstructions,
      inspectionNotes: existing?.inspectionNotes ?? '',
      otherChecked: existing?.otherChecked ?? false,
      otherNotes: existing?.otherNotes ?? '',
      signOff: existing?.signOff ?? null,
      qcSignOff: existing?.qcSignOff ?? null,
    }
    if (part.id === 'stem' && opId === 'machine_1') {
      operationDetails[opId] = ensureStemMachine1State({ ...next, stemMeasurements: existing?.stemMeasurements })
    } else {
      operationDetails[opId] = next
    }
  }
  return {
    ...migrated,
    selectedOperations: syncedOps,
    operationDetails,
    photos: [...(migrated.photos ?? [])],
  }
}

/** Ensure mandatory step, part records, and step detail records exist after load or edit. */
export function normalizeItpProcessPlan(plan: ItpProcessPlanPayload, valve?: Valve): ItpProcessPlanPayload {
  const profileId =
    valve != null
      ? resolveValvePartsProfileId(valve.bowl_type, valve.valve_type)
      : plan.valvePartsProfileId ?? 'generic'

  const selectedSteps = (plan.selectedSteps ?? []).filter(isItpOverallStepId)
  const customOverallSteps = [...(plan.customOverallSteps ?? [])]
  const customIds = new Set(customOverallSteps.map((s) => s.id))
  const selectedCustomOverallSteps = (plan.selectedCustomOverallSteps ?? []).filter((id) => customIds.has(id))

  const stepDetails = { ...(plan.stepDetails ?? {}) }
  for (const stepId of getActiveItpPlanStepIds(selectedSteps, customOverallSteps, selectedCustomOverallSteps)) {
    if (!stepDetails[stepId]) stepDetails[stepId] = emptyItpPlanStepState()
  }

  const valveParts = mergeValvePartsWithProfile(plan.valveParts, profileId).map((part) =>
    normalizeValvePart(part, profileId),
  )

  return {
    ...plan,
    selectedSteps,
    customOverallSteps,
    selectedCustomOverallSteps,
    stepDetails,
    valvePartsProfileId: profileId,
    valveParts,
  }
}

export function isItpProcessPlanPayload(value: unknown): value is ItpProcessPlanPayload {
  if (!value || typeof value !== 'object') return false
  const o = value as Partial<ItpProcessPlanPayload>
  return o.v === ITP_PLAN_SCHEMA_VERSION && o.kind === 'process_plan' && Array.isArray(o.selectedSteps)
}

export function countActivePartOperations(valveParts: ItpPlanValvePart[]): number {
  return valveParts.reduce((sum, part) => sum + syncPartSelectedOperations(part).length, 0)
}
