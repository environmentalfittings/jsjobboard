import type { ItpPartOperationId } from '../constants/itpProcessSteps'
import { orderedSelectedPartOperations } from '../constants/itpProcessSteps'
import type { ItpPlanValvePart } from '../types/itpPlan'

export type ItpPartDisposition = '' | 'na' | 'present'
export type ItpPartInspectOutcome = '' | 'acceptable' | 'rework'
export type ItpOptionalReworkOp = 'pt' | 'grind'

const REWORK_CORE_OPS: ItpPartOperationId[] = ['machine_1', 'weld', 'machine_2']

export function isInspectSigned(part: ItpPlanValvePart): boolean {
  return Boolean(part.operationDetails.inspect?.signOff)
}

/** Migrate legacy flat selectedOperations into disposition workflow fields. */
export function migratePartWorkflowFields(part: ItpPlanValvePart): ItpPlanValvePart {
  const hasWorkflow =
    part.partDisposition === 'na' ||
    part.partDisposition === 'present' ||
    Boolean(part.inspectOutcome) ||
    (part.optionalReworkOps?.length ?? 0) > 0

  if (hasWorkflow) {
    return {
      ...part,
      partDisposition: part.partDisposition ?? '',
      inspectOutcome: part.inspectOutcome ?? '',
      optionalReworkOps: part.optionalReworkOps ?? [],
    }
  }

  const ops = part.selectedOperations ?? []
  if (ops.length === 0) {
    return { ...part, partDisposition: '', inspectOutcome: '', optionalReworkOps: [] }
  }

  if (ops.includes('na') && !ops.includes('inspect')) {
    return { ...part, partDisposition: 'na', inspectOutcome: '', optionalReworkOps: [] }
  }

  let outcome: ItpPartInspectOutcome = ''
  if (ops.includes('acceptable')) outcome = 'acceptable'
  else if (ops.some((id) => REWORK_CORE_OPS.includes(id) || id === 'pt' || id === 'grind')) {
    outcome = 'rework'
  }

  const optionalReworkOps = ops.filter((id): id is ItpOptionalReworkOp => id === 'pt' || id === 'grind')

  return {
    ...part,
    partDisposition: 'present',
    inspectOutcome: outcome,
    optionalReworkOps,
  }
}

/** Full operation list stored on the part (for normalization and save). */
export function syncPartSelectedOperations(part: ItpPlanValvePart): ItpPartOperationId[] {
  if (!part.partDisposition) return []
  if (part.partDisposition === 'na') return ['na']

  const ops: ItpPartOperationId[] = ['inspect']
  if (part.inspectOutcome === 'acceptable') ops.push('acceptable')
  if (part.inspectOutcome === 'rework') {
    ops.push(...REWORK_CORE_OPS, ...(part.optionalReworkOps ?? []))
  }
  return ops
}

/** Operations to render as step cards (rework unlocks after inspect sign-off). */
export function getVisiblePartOperations(part: ItpPlanValvePart): ItpPartOperationId[] {
  if (!part.partDisposition) return []
  if (part.partDisposition === 'na') return ['na']

  const ops: ItpPartOperationId[] = ['inspect']
  if (!part.inspectOutcome) return ops

  if (part.inspectOutcome === 'acceptable') {
    ops.push('acceptable')
    return orderedSelectedPartOperations(ops)
  }

  if (part.inspectOutcome === 'rework' && isInspectSigned(part)) {
    ops.push(...REWORK_CORE_OPS, ...(part.optionalReworkOps ?? []))
  }

  return orderedSelectedPartOperations(ops)
}

export function countVisiblePartOperations(valveParts: ItpPlanValvePart[]): number {
  return valveParts.reduce((sum, part) => sum + getVisiblePartOperations(part).length, 0)
}

export function buildPartOperationStepNumbers(
  valveParts: ItpPlanValvePart[],
  afterStepNumber: number,
): Map<string, number> {
  const map = new Map<string, number>()
  let n = afterStepNumber
  for (const part of valveParts) {
    for (const opId of getVisiblePartOperations(part)) {
      n += 1
      map.set(`${part.id}:${opId}`, n)
    }
  }
  return map
}

export function partHasWorkflow(part: ItpPlanValvePart): boolean {
  return Boolean(part.partDisposition)
}
