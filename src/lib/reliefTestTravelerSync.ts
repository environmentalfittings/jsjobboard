import {
  isReliefValveType,
  type ReliefValveTestFields,
  type ReliefValveTestStage,
} from './reliefValveTest'
import { loadItpLibraryPlan, saveItpLibraryPlan } from './itpLibraryStorage'
import {
  getMeasValue,
  patchMeasValue,
  resolvedMeasFields,
  toggleItemExecDone,
} from './itpItemRequirements'
import { planHasValveKeepFields, valveKeepKeyFromFieldId } from './valveKeepFields'
import { supabase } from './supabase'
import { parseTestLogTestingDetails } from '../types/testLog'
import {
  allScopeItems,
  emptyItemExec,
  getExec,
  getSel,
  type ItpLibraryItemExec,
  type ItpLibraryPlanPayload,
  type ItpMeasValueSource,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'

const PRE_TEST_STEP_NAME = 'Pre-test'
const FINAL_TEST_STEP_NAME = 'Set and test'

export type ReliefTravelerSyncInput = {
  valveId: string
  valveType: string | null | undefined
  testedOn: string
  tester: string
  relief: ReliefValveTestFields
  signerUserId: string | null
  canSignOffHold?: boolean
}

export type ReliefTravelerSyncResult =
  | { status: 'skipped'; reason: 'not_relief' | 'no_plan' | 'not_valvekeep' | 'no_step' }
  | { status: 'saved'; stepName: string; completed: boolean; completeBlockedReason: string | null }
  | { status: 'error'; message: string }

/** True when this valve already has a saved relief test log entry (optionally excluding one id). */
export async function valveHasPriorReliefTestEntry(
  valveId: string,
  options?: { excludeId?: number | null },
): Promise<boolean> {
  const trimmed = String(valveId ?? '').trim()
  if (!trimmed) return false
  const { data, error } = await supabase
    .from('test_logs')
    .select('id,testing_details')
    .eq('valve_id', trimmed)
    .order('id', { ascending: false })
    .limit(25)
  if (error || !data?.length) return false
  const excludeId = options?.excludeId ?? null
  for (const row of data) {
    if (excludeId != null && Number(row.id) === Number(excludeId)) continue
    const details = parseTestLogTestingDetails(row.testing_details)
    const relief = details?.reliefValve
    if (!relief) continue
    if (
      relief.test1?.trim() ||
      relief.testType?.trim() ||
      relief.setPressure?.trim() ||
      relief.stage?.trim()
    ) {
      return true
    }
  }
  return false
}

export function defaultReliefTestStage(hasPriorReliefEntry: boolean): ReliefValveTestStage {
  return hasPriorReliefEntry ? 'Final test' : 'Pre-test'
}

/** Map relief test media onto ValveKeep Test Media dropdown values. */
export function mapReliefMediaToValveKeep(fields: ReliefValveTestFields): string {
  const media = fields.media.trim().toLowerCase()
  if (media === 'air/gas' || media === 'air') return 'Air'
  if (media === 'liquid' || media === 'water') return 'Water'
  if (media === 'steam') return 'Steam'
  if (media === 'other') return fields.mediaOther.trim()
  if (media === 'n2' || media === 'nitrogen') return 'N2'
  return fields.media.trim()
}

function buildPretestComments(fields: ReliefValveTestFields): string {
  const parts: string[] = []
  if (fields.reason.trim()) parts.push(fields.reason.trim())
  const pops: string[] = []
  if (fields.test2.trim()) pops.push(`Pop 2: ${fields.test2.trim()}`)
  if (fields.test3.trim()) pops.push(`Pop 3: ${fields.test3.trim()}`)
  if (pops.length) parts.push(pops.join(', '))
  return parts.join(parts.length > 1 && fields.reason.trim() ? '. ' : '')
}

function valuesForStage(
  stage: ReliefValveTestStage,
  relief: ReliefValveTestFields,
  tester: string,
  testedOn: string,
): Record<string, string> {
  if (stage === 'Pre-test') {
    return {
      vk_pretest: 'Yes',
      vk_popped_at: relief.test1.trim(),
      vk_pretest_by: tester.trim(),
      vk_back_pressure_test: relief.backPressureTest.trim(),
      vk_bellows_test: relief.bellowsTest.trim(),
      vk_leak_test: relief.leakTest.trim(),
      vk_leak_test_at: relief.leakTestAt.trim(),
      vk_leak_rate: relief.leakRate.trim(),
      vk_pretest_comments: buildPretestComments(relief),
    }
  }
  return {
    vk_test_set_pressure: relief.setPressure.trim(),
    vk_test_media: mapReliefMediaToValveKeep(relief),
    vk_gauge1_sn: relief.gauge.trim(),
    vk_test1_press: relief.test1.trim(),
    vk_test2_press: relief.test2.trim(),
    vk_test3_press: relief.test3.trim(),
    vk_test1_reseat: relief.reseat1.trim(),
    vk_test2_reseat: relief.reseat2.trim(),
    vk_test3_reseat: relief.reseat3.trim(),
    vk_date_tested: testedOn.trim(),
    vk_tested_by: tester.trim(),
  }
}

function findStepItemId(plan: ItpLibraryPlanPayload, stepName: string): string | null {
  const target = stepName.trim().toLowerCase()
  const match = allScopeItems(plan).find((item) => item.name.trim().toLowerCase() === target)
  return match?.id ?? null
}

function fieldIdForVkKey(sel: ReturnType<typeof getSel>, vkKey: string): string | null {
  for (const field of resolvedMeasFields(sel)) {
    const key = valveKeepKeyFromFieldId(field.id)
    if (key === vkKey) return field.id
  }
  return null
}

function applyMappedValues(
  sel: ReturnType<typeof getSel>,
  exec: ItpLibraryItemExec,
  mapped: Record<string, string>,
  source: ItpMeasValueSource,
): ItpLibraryItemExec {
  let next = { ...exec, measSources: { ...(exec.measSources ?? {}) } }
  for (const [vkKey, rawValue] of Object.entries(mapped)) {
    const value = String(rawValue ?? '').trim()
    if (!value) continue
    const fieldId = fieldIdForVkKey(sel, vkKey)
    if (!fieldId) continue
    next = {
      ...next,
      ...patchMeasValue(next, fieldId, value),
      measSources: {
        ...next.measSources,
        [fieldId]: source,
      },
    }
  }
  return next
}

function shouldAttemptComplete(stage: ReliefValveTestStage, relief: ReliefValveTestFields): boolean {
  if (stage === 'Pre-test') return true
  return relief.result === 'pass'
}

/**
 * After a relief valve test log save, copy mapped fields into the ValveKeep traveler
 * and attempt to check off the matching hold-point step (without unchecking).
 */
export async function syncReliefTestToTraveler(
  input: ReliefTravelerSyncInput,
): Promise<ReliefTravelerSyncResult> {
  if (!isReliefValveType(input.valveType)) {
    return { status: 'skipped', reason: 'not_relief' }
  }
  const stage = input.relief.stage
  if (stage !== 'Pre-test' && stage !== 'Final test') {
    return { status: 'skipped', reason: 'not_relief' }
  }

  const valveId = String(input.valveId ?? '').trim()
  if (!valveId) return { status: 'skipped', reason: 'no_plan' }

  const { data: valveRow, error: valveError } = await supabase
    .from('valves')
    .select('*')
    .or(`valve_id.eq.${valveId}`)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (valveError || !valveRow) {
    return { status: 'skipped', reason: 'no_plan' }
  }

  const valve = valveRow as Valve

  let loaded: Awaited<ReturnType<typeof loadItpLibraryPlan>>
  try {
    loaded = await loadItpLibraryPlan(valve)
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not load traveler plan',
    }
  }

  if (loaded.isNew) {
    return { status: 'skipped', reason: 'no_plan' }
  }

  const reportItems = allScopeItems(loaded.plan).map((item) => ({
    fields: resolvedMeasFields(getSel(loaded.plan, item.id)),
  }))
  if (!planHasValveKeepFields(reportItems)) {
    return { status: 'skipped', reason: 'not_valvekeep' }
  }

  const stepName = stage === 'Pre-test' ? PRE_TEST_STEP_NAME : FINAL_TEST_STEP_NAME
  const itemId = findStepItemId(loaded.plan, stepName)
  if (!itemId) {
    return { status: 'skipped', reason: 'no_step' }
  }

  const sel = getSel(loaded.plan, itemId)
  const source: ItpMeasValueSource = {
    kind: 'test_log',
    testedOn: input.testedOn.trim(),
    tester: input.tester.trim(),
  }
  const mapped = valuesForStage(stage, input.relief, input.tester, input.testedOn)
  let exec = applyMappedValues(sel, getExec(loaded.plan, itemId) ?? emptyItemExec(), mapped, source)

  let completed = false
  let completeBlockedReason: string | null = null

  if (shouldAttemptComplete(stage, input.relief)) {
    if (exec.done || exec.holdPending) {
      // Editing a later test never un-checks the step.
      completed = exec.done || exec.holdPending
    } else {
      const toggled = toggleItemExecDone(sel, exec, {
        canSignOffHold: Boolean(input.canSignOffHold),
        signerName: input.tester.trim() || 'Tester',
        signerUserId: input.signerUserId,
      })
      if (toggled.error) {
        completeBlockedReason = toggled.error
      } else {
        exec = toggled.exec
        completed = exec.done || exec.holdPending
      }
    }
  }

  // Ensure tech stamp is present when we filled values even if not completing.
  if (!exec.techInitials.trim() && input.tester.trim()) {
    exec = { ...exec, techInitials: input.tester.trim() }
  }

  const nextPlan: ItpLibraryPlanPayload = {
    ...loaded.plan,
    exec: { ...loaded.plan.exec, [itemId]: exec },
  }

  try {
    await saveItpLibraryPlan(valve, nextPlan)
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not save traveler plan',
    }
  }

  return {
    status: 'saved',
    stepName,
    completed,
    completeBlockedReason,
  }
}

/** Debug helper: which mapped keys exist on a step selection. */
export function unresolvedMappedKeys(
  sel: ReturnType<typeof getSel>,
  mappedKeys: string[],
): string[] {
  return mappedKeys.filter((vkKey) => !fieldIdForVkKey(sel, vkKey))
}

/** Expose current value for tests / UI that need to know a field was synced. */
export function getMeasSourceNote(exec: ItpLibraryItemExec, fieldId: string): string | null {
  const source = exec.measSources?.[fieldId]
  if (!source || source.kind !== 'test_log') return null
  const date = source.testedOn.trim()
  const tester = source.tester.trim()
  if (!date && !tester) return null
  if (date && tester) return `From test log ${date}, ${tester}`
  if (date) return `From test log ${date}`
  return `From test log, ${tester}`
}

/** Kept for callers that inspect whether a field still holds the synced value. */
export function syncedMeasValue(exec: ItpLibraryItemExec, fieldId: string): string {
  return getMeasValue(exec, fieldId)
}
