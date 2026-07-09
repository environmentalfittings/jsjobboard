import type { ItpPartOperationId } from './itpProcessSteps'
import type { ValvePartProfile } from './itpValveParts'

const GATE_STEM_INSPECT = `Visual and Dimensional Checks

• Inspect the stem for straightness and any damage to threads, backseat, and tee-head.
• Examine the portion of the stem that passes through the packing for corrosion, pitting, wear, and taper.
• Ensure the stem has a surface finish of 32 microinches (Ra) or smoother in the area contacting the packing during stroking.
• Out-of-straightness must not exceed 0.001 inch per inch of length.
• Stem threads must properly engage the internal threads of the stem nut per ASME B1.5 and B1.8.
• The backseat surface finish must also be 32 microinches (Ra) or smoother.
• The tee-head must be checked for proper engagement with the wedge.
• Minimum stem diameter must comply with OEM design; permitted under-tolerance is specified in the manual.`

function defaultKey(profileId: ValvePartProfile['id'], partKey: string, operationId: ItpPartOperationId): string {
  return `${profileId}:${partKey}:${operationId}`
}

/** Built-in inspection / work instruction text for valve part operations. */
const ITP_PART_OPERATION_DEFAULTS: Record<string, string> = {
  [defaultKey('gate_valve', 'stem', 'inspect')]: GATE_STEM_INSPECT,
  [defaultKey('pressure_seal_gate', 'stem', 'inspect')]: GATE_STEM_INSPECT,
  [defaultKey('globe_valve', 'stem', 'inspect')]: GATE_STEM_INSPECT,
  [defaultKey('pressure_seal_globe', 'stem', 'inspect')]: GATE_STEM_INSPECT,
  [defaultKey('gate_valve', 'stem', 'machine_1')]:
    'Record stem diameters (A–F), pitch, lead, and thread hand below. Technician signs off when complete; QA/QC verifies before weld / machine 2.',
  [defaultKey('pressure_seal_gate', 'stem', 'machine_1')]:
    'Record stem diameters (A–F), pitch, lead, and thread hand below. Technician signs off when complete; QA/QC verifies before weld / machine 2.',
  [defaultKey('globe_valve', 'stem', 'machine_1')]:
    'Record stem diameters (A–F), pitch, lead, and thread hand below. Technician signs off when complete; QA/QC verifies before weld / machine 2.',
  [defaultKey('pressure_seal_globe', 'stem', 'machine_1')]:
    'Record stem diameters (A–F), pitch, lead, and thread hand below. Technician signs off when complete; QA/QC verifies before weld / machine 2.',
}

export function getDefaultPartOperationInstructions(
  profileId: ValvePartProfile['id'],
  partKey: string,
  operationId: ItpPartOperationId,
): string | null {
  return ITP_PART_OPERATION_DEFAULTS[defaultKey(profileId, partKey, operationId)] ?? null
}

export function applyDefaultPartOperationInstructions(
  profileId: ValvePartProfile['id'],
  partKey: string,
  operationId: ItpPartOperationId,
  currentInstructions: string,
): string {
  if (currentInstructions.trim()) return currentInstructions
  if (operationId === 'na') {
    return 'Not applicable — no shop work on this part for this job.'
  }
  if (operationId === 'acceptable') {
    return 'Part is acceptable as-is. No machine, weld, grind, or PT work required on this part.'
  }
  return getDefaultPartOperationInstructions(profileId, partKey, operationId) ?? currentInstructions
}
