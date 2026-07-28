import { supabase } from './supabase'
import { createTestGauge, deleteTestGauge, loadTestGauges } from './testGaugeRegistry'
import { createToolCalibration, loadToolCalibrations } from './toolCalibrationRegistry'
import {
  emptyToolCalibrationForm,
  inferToolCategory,
  isPresetToolCategory,
  TOOL_CATEGORY_OTHER,
  type ToolCalibration,
  type ToolCalibrationFormState,
} from '../types/toolCalibration'
import type { TestGauge } from '../types/testGauge'

const MOVE_CATEGORIES = new Set(['gauges', 'load cells', 'dead weight tester'])

/** Shop measuring tools that belong on the tool log, even if category was set to Gauges. */
function isShopMeasuringTool(tool: ToolCalibration): boolean {
  const hay = `${tool.tool_type ?? ''} ${tool.model ?? ''}`.toLowerCase()
  return /depth\s*ga(?:u)?ge|surface\s*roughness|roughness\s*ga(?:u)?ge|caliper|micrometer|\bmic\b|dial\s*indicator|thickness\s*tester|torque\s*wrench/.test(
    hay,
  )
}

export function isDeadWeightTesterTool(tool: ToolCalibration): boolean {
  const hay = `${tool.category ?? ''} ${tool.tool_type ?? ''} ${tool.model ?? ''}`.toLowerCase()
  return /dead\s*weight/.test(hay)
}

/** Tools that belong on Test gauges, not the shop tool calibration log. */
export function belongsOnTestGaugesList(tool: ToolCalibration): boolean {
  if (isDeadWeightTesterTool(tool)) return true
  const category = (tool.category ?? '').trim().toLowerCase()
  if (category === 'load cells') return true
  if (category === 'gauges' && !isShopMeasuringTool(tool)) return true
  return false
}

function normalizeGaugeKey(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw || /^n\/?a$/i.test(raw)) return null
  return raw.toLowerCase().replace(/[\s_-]+/g, '')
}

function collectToolKeys(tool: ToolCalibration): string[] {
  const keys = new Set<string>()
  for (const value of [tool.serial_number, tool.js_id, resolveGaugeNumber(tool)]) {
    const key = normalizeGaugeKey(value)
    if (key) keys.add(key)
  }
  return [...keys]
}

/** Prefer serial when present; otherwise JS ID. */
export function resolveGaugeNumber(tool: ToolCalibration): string | null {
  const serial = String(tool.serial_number ?? '').trim()
  if (serial && !/^n\/?a$/i.test(serial)) return serial
  const jsId = String(tool.js_id ?? '').trim()
  return jsId || null
}

function resolveGaugeType(tool: ToolCalibration): string {
  if ((tool.category ?? '').trim().toLowerCase() === 'load cells') return 'Load Cell'
  const hay = `${tool.tool_type ?? ''} ${tool.model ?? ''} ${tool.category ?? ''}`.toLowerCase()
  if (/dead\s*weight/.test(hay)) return 'Dead Weight Tester'
  if (/chart\s*recorder/.test(hay)) return 'Chart recorder'
  if (/load\s*cell/.test(hay)) return 'Load Cell'
  if (/pressure|transducer/.test(hay)) return 'Pressure'
  return (tool.tool_type ?? '').trim() || 'Pressure'
}

/** Pressure / load-cell / dead-weight style items — not depth gauges, SRGs, etc. */
function isMoveCandidate(tool: ToolCalibration): boolean {
  if (isDeadWeightTesterTool(tool)) return true
  const category = (tool.category ?? '').trim().toLowerCase()
  if (!MOVE_CATEGORIES.has(category)) return false
  if (category === 'load cells') return true
  if (isShopMeasuringTool(tool)) return false
  return true
}

function toolFormFromTestGauge(gauge: TestGauge): ToolCalibrationFormState {
  const gaugeType = (gauge.gauge_type ?? '').trim()
  const inferred = inferToolCategory(gaugeType) ?? (gaugeType.toLowerCase() === 'load cell' ? 'Load Cells' : null)
  const form = emptyToolCalibrationForm()
  form.manufacturer = gauge.manufacturer ?? ''
  form.tool_type = gaugeType
  form.serial_number = gauge.gauge_number
  form.calibration_date = gauge.last_calibration_date ?? ''
  form.expiration_date = gauge.next_calibration_date ?? ''
  form.calibration_frequency = gauge.calibration_frequency ?? 'annually'
  form.certificate_number = gauge.certificate_number ?? ''
  form.notes = gauge.notes ?? ''
  form.department = gauge.department ?? ''
  form.status = gauge.active ? 'active' : 'out_of_service'
  form.active = gauge.active
  if (inferred && isPresetToolCategory(inferred)) {
    form.categorySelect = inferred
    form.categoryOther = ''
  } else if (gaugeType) {
    form.categorySelect = TOOL_CATEGORY_OTHER
    form.categoryOther = gaugeType
  }
  return form
}

export type MoveToolGaugesResult = {
  moved: number
  skippedDuplicates: number
  skippedInvalid: number
  skippedShopTools: number
  removedFromToolLog: number
  error: string | null
}

/**
 * Move tool_calibrations rows with category Gauges, Load Cells, or Dead Weight Tester into test_gauges.
 * Skips shop measuring tools (depth gauges, surface roughness, etc.).
 * Skips inserts when gauge_number / serial / js_id already exists on a test gauge,
 * then removes successfully processed source rows from the tool log.
 */
export async function moveGaugeCategoryToolsToTestGauges(): Promise<MoveToolGaugesResult> {
  const empty: MoveToolGaugesResult = {
    moved: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    skippedShopTools: 0,
    removedFromToolLog: 0,
    error: null,
  }

  let tools: ToolCalibration[]
  let gauges
  try {
    ;[tools, gauges] = await Promise.all([loadToolCalibrations(true), loadTestGauges(true)])
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : 'Could not load tools or test gauges',
    }
  }

  const gaugeCategoryTools = tools.filter(
    (tool) =>
      MOVE_CATEGORIES.has((tool.category ?? '').trim().toLowerCase()) || isDeadWeightTesterTool(tool),
  )
  const skippedShopTools = gaugeCategoryTools.filter(
    (tool) => !isDeadWeightTesterTool(tool) && isShopMeasuringTool(tool),
  ).length
  const candidates = gaugeCategoryTools.filter(isMoveCandidate)
  if (candidates.length === 0) {
    return { ...empty, skippedShopTools, error: null }
  }

  const existingKeys = new Set<string>()
  for (const gauge of gauges) {
    const key = normalizeGaugeKey(gauge.gauge_number)
    if (key) existingKeys.add(key)
  }

  const removeIds: number[] = []
  let moved = 0
  let skippedDuplicates = 0
  let skippedInvalid = 0

  for (const tool of candidates) {
    const gaugeNumber = resolveGaugeNumber(tool)
    if (!gaugeNumber) {
      skippedInvalid += 1
      continue
    }

    const toolKeys = collectToolKeys(tool)
    const alreadyExists = toolKeys.some((key) => existingKeys.has(key))
    if (alreadyExists) {
      skippedDuplicates += 1
      removeIds.push(tool.id)
      continue
    }

    const gaugeType = resolveGaugeType(tool)
    const department = (tool.department ?? '').trim()
    const presetDepts = new Set([
      'MACHINE SHOP',
      'TESTING',
      'TOOL ROOM',
      'CALIBRATION',
      'DURCO/TWIN SEAL',
      'FIELD SERVICE',
      'FITTING',
      'WELDING',
      'INSPECTION',
      'TEARDOWN',
      'ACTUATION',
      'BALL VALVE',
      'PRV',
    ])
    const typePresets = new Set(['Pressure', 'Load Cell', 'Chart recorder', 'Dead Weight Tester'])

    const { error } = await createTestGauge({
      gauge_number: gaugeNumber,
      manufacturer: tool.manufacturer ?? '',
      typeSelect: typePresets.has(gaugeType) ? gaugeType : gaugeType ? 'Other' : '',
      typeOther: typePresets.has(gaugeType) ? '' : gaugeType,
      departmentSelect: presetDepts.has(department) ? department : department ? 'Other' : '',
      departmentOther: presetDepts.has(department) ? '' : department,
      notes: tool.notes ?? '',
      calibration_frequency: tool.calibration_frequency ?? 'annually',
      last_calibration_date: tool.calibration_date ?? '',
      next_calibration_date: tool.expiration_date ?? '',
      certificate_number: tool.certificate_number ?? '',
      active: tool.active && tool.status === 'active',
    })

    if (error) {
      if (/duplicate|unique/i.test(error)) {
        skippedDuplicates += 1
        for (const key of toolKeys) existingKeys.add(key)
        removeIds.push(tool.id)
        continue
      }
      return {
        moved,
        skippedDuplicates,
        skippedInvalid,
        skippedShopTools,
        removedFromToolLog: 0,
        error,
      }
    }

    for (const key of toolKeys) existingKeys.add(key)
    existingKeys.add(normalizeGaugeKey(gaugeNumber)!)
    moved += 1
    removeIds.push(tool.id)
  }

  let removedFromToolLog = 0
  if (removeIds.length > 0) {
    const chunkSize = 50
    for (let i = 0; i < removeIds.length; i += chunkSize) {
      const chunk = removeIds.slice(i, i + chunkSize)
      const { error, count } = await supabase
        .from('tool_calibrations')
        .delete({ count: 'exact' })
        .in('id', chunk)
      if (error) {
        return {
          moved,
          skippedDuplicates,
          skippedInvalid,
          skippedShopTools,
          removedFromToolLog,
          error: `Moved gauges, but failed removing some from tool log: ${error.message}`,
        }
      }
      removedFromToolLog += count ?? chunk.length
    }
  }

  return {
    moved,
    skippedDuplicates,
    skippedInvalid,
    skippedShopTools,
    removedFromToolLog,
    error: null,
  }
}

/**
 * Move a test gauge back onto the tool calibrations log (e.g. depth gauges).
 * Creates the tool row first, then deletes the test gauge.
 */
export async function moveTestGaugeToToolLog(gauge: TestGauge): Promise<{ error: string | null }> {
  const form = toolFormFromTestGauge(gauge)
  const { error: createError } = await createToolCalibration(form)
  if (createError) return { error: createError }
  const { error: deleteError } = await deleteTestGauge(gauge)
  if (deleteError) {
    return {
      error: `Added to tool log, but could not remove from Test gauges: ${deleteError}`,
    }
  }
  return { error: null }
}
