import { buildPartOperationStepNumbers as buildPartWorkflowStepNumbers } from '../lib/itpPartWorkflow'

export type ItpPartOperationId = 'inspect' | 'machine_1' | 'machine_2' | 'weld' | 'pt' | 'grind' | 'acceptable' | 'na'

/** Overall-valve process steps (assembly, test, shipping, etc.). */
export type ItpOverallStepId =
  | 'receive'
  | 'disassembly'
  | 'clean_blast'
  | 'inspect'
  | 'pre_assembly_check'
  | 'assembly'
  | 'torque'
  | 'test'
  | 'paint'
  | 'shipping'
  | 'final_qc'

export type ItpCustomOverallStep = {
  id: string
  label: string
}

export function createItpCustomOverallStep(label: string): ItpCustomOverallStep {
  return { id: `custom_overall_${crypto.randomUUID()}`, label: label.trim() }
}

export function isCustomOverallStepId(stepId: string): boolean {
  return stepId.startsWith('custom_overall_')
}

/** @deprecated Use ItpOverallStepId — kept for stored payloads. */
export type ItpProcessStepId = ItpOverallStepId | ItpPartOperationId

/** Always the first row on every ITP; not toggled via checkbox. */
export type ItpMandatoryStepId = 'traveler_started'

export type ItpPlanStepId = ItpMandatoryStepId | ItpOverallStepId

export type ItpPlanStepDef<T extends string = string> = {
  id: T
  label: string
  hint?: string
  requiresSignOff?: boolean
  alwaysIncluded?: boolean
}

export const ITP_MANDATORY_STEP: ItpPlanStepDef<ItpMandatoryStepId> = {
  id: 'traveler_started',
  label: 'Traveler started',
  hint: 'Traveler opened and job is active in the shop',
  requiresSignOff: true,
  alwaysIncluded: true,
}

/** Operations that apply to the whole valve (not individual parts). */
export const ITP_OVERALL_VALVE_STEPS: ItpPlanStepDef<ItpOverallStepId>[] = [
  { id: 'receive', label: 'Receive & log in', hint: 'Valve arrived, tagged, and logged on the board', requiresSignOff: true },
  { id: 'disassembly', label: 'Disassembly', requiresSignOff: true },
  { id: 'clean_blast', label: 'Clean & blast', requiresSignOff: true },
  { id: 'inspect', label: 'Inspect (overall)', hint: 'Overall valve inspection' },
  { id: 'pre_assembly_check', label: 'Pre-assembly check', hint: 'Verify parts and clearances before assembly' },
  { id: 'assembly', label: 'Assembly' },
  { id: 'torque', label: 'Torque', hint: 'Bolt torque per procedure / spec' },
  { id: 'test', label: 'Test', hint: 'Bench, hydro, or seat test' },
  { id: 'paint', label: 'Paint / coat' },
  { id: 'shipping', label: 'Shipping / pack out' },
  { id: 'final_qc', label: 'Final QC' },
]

/** Operations that can be assigned per valve part (stem, disc, body, etc.). */
export const ITP_PART_OPERATIONS: ItpPlanStepDef<ItpPartOperationId>[] = [
  { id: 'inspect', label: 'Inspect', hint: 'Visual / dimensional inspection' },
  { id: 'machine_1', label: 'Machine 1' },
  { id: 'weld', label: 'Weld' },
  { id: 'machine_2', label: 'Machine 2' },
  { id: 'pt', label: 'PT', hint: 'Liquid penetrant examination' },
  { id: 'grind', label: 'Grind' },
  { id: 'acceptable', label: 'Acceptable', hint: 'Part acceptable as-is — no machine, weld, or rework' },
  { id: 'na', label: 'N/A', hint: 'No work required for this part' },
]

/** Display / process order for part operations (machine 1 → weld → machine 2). */
export function orderedSelectedPartOperations(selected: ItpPartOperationId[]): ItpPartOperationId[] {
  const picked = new Set(selected)
  return ITP_PART_OPERATIONS.filter((op) => picked.has(op.id)).map((op) => op.id)
}

/** Short labels for the compact parts grid. */
export const ITP_PART_OPERATION_SHORT: Record<ItpPartOperationId, string> = {
  inspect: 'In',
  machine_1: 'M1',
  machine_2: 'M2',
  weld: 'W',
  pt: 'PT',
  grind: 'G',
  acceptable: 'OK',
  na: 'N/A',
}

const ITP_PART_WORK_OPERATION_IDS: ItpPartOperationId[] = ['machine_1', 'machine_2', 'weld', 'pt', 'grind']

/** Machine, weld, grind, PT — cleared when Acceptable or N/A is selected. */
export function isItpPartWorkOperation(operationId: ItpPartOperationId): boolean {
  return ITP_PART_WORK_OPERATION_IDS.includes(operationId)
}

/** N/A is exclusive — no other operations apply when selected. */
export function isItpPartOperationNa(operationId: ItpPartOperationId): boolean {
  return operationId === 'na'
}

/** Acceptable — part OK as-is; exclusive with work ops and N/A, but may pair with Inspect. */
export function isItpPartOperationAcceptable(operationId: ItpPartOperationId): boolean {
  return operationId === 'acceptable'
}

export { buildPartWorkflowStepNumbers as buildPartOperationStepNumbers }

/** @deprecated Use ITP_OVERALL_VALVE_STEPS */
export const ITP_PROCESS_STEPS = ITP_OVERALL_VALVE_STEPS

export const ITP_OVERALL_STEP_IDS = new Set(ITP_OVERALL_VALVE_STEPS.map((s) => s.id))
export const ITP_PART_OPERATION_IDS = new Set(ITP_PART_OPERATIONS.map((s) => s.id))

export function getItpPlanStepDef(
  stepId: string,
  customOverallSteps?: ItpCustomOverallStep[],
): ItpPlanStepDef {
  if (stepId === 'traveler_started') return ITP_MANDATORY_STEP
  const custom = customOverallSteps?.find((s) => s.id === stepId)
  if (custom) return { id: custom.id, label: custom.label }
  const overall = ITP_OVERALL_VALVE_STEPS.find((s) => s.id === stepId)
  if (overall) return overall
  const partOp = ITP_PART_OPERATIONS.find((s) => s.id === stepId)
  if (partOp) return partOp
  if (isCustomOverallStepId(stepId)) return { id: stepId, label: 'Custom step' }
  throw new Error(`Unknown ITP step: ${stepId}`)
}

export function itpStepRequiresSignOff(stepId: string): boolean {
  if (isCustomOverallStepId(stepId)) return false
  const overall = ITP_OVERALL_VALVE_STEPS.find((s) => s.id === stepId)
  if (overall) return Boolean(overall.requiresSignOff)
  if (stepId === 'traveler_started') return Boolean(ITP_MANDATORY_STEP.requiresSignOff)
  return false
}

export function isItpOverallStepId(stepId: string): stepId is ItpOverallStepId {
  return ITP_OVERALL_STEP_IDS.has(stepId as ItpOverallStepId)
}

/** Ordered overall-valve steps that appear in the populated ITP body. */
export function getActiveItpPlanStepIds(
  selectedSteps: ItpOverallStepId[],
  customOverallSteps: ItpCustomOverallStep[] = [],
  selectedCustomOverallSteps: string[] = [],
): string[] {
  const selected = new Set(selectedSteps.filter(isItpOverallStepId))
  const orderedOptional = ITP_OVERALL_VALVE_STEPS.filter((s) => selected.has(s.id as ItpOverallStepId)).map(
    (s) => s.id,
  )
  const selectedCustom = new Set(selectedCustomOverallSteps)
  const orderedCustom = customOverallSteps.filter((s) => selectedCustom.has(s.id)).map((s) => s.id)
  return [ITP_MANDATORY_STEP.id, ...orderedOptional, ...orderedCustom]
}
