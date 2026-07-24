import { supabase } from './supabase'
import { createTestGauge, loadTestGauges } from './testGaugeRegistry'
import { loadToolCalibrations } from './toolCalibrationRegistry'
import type { ToolCalibration } from '../types/toolCalibration'

const MOVE_CATEGORIES = new Set(['gauges', 'load cells'])

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
  const hay = `${tool.tool_type ?? ''} ${tool.model ?? ''}`.toLowerCase()
  if (/helium/.test(hay)) return 'Helium'
  if (/chart\s*recorder/.test(hay)) return 'Chart recorder'
  if (/pressure/.test(hay)) return 'Pressure'
  return (tool.tool_type ?? '').trim() || 'Pressure'
}

function isMoveCategory(tool: ToolCalibration): boolean {
  return MOVE_CATEGORIES.has((tool.category ?? '').trim().toLowerCase())
}

export type MoveToolGaugesResult = {
  moved: number
  skippedDuplicates: number
  skippedInvalid: number
  removedFromToolLog: number
  error: string | null
}

/**
 * Move tool_calibrations rows with category Gauges or Load Cells into test_gauges.
 * Skips inserts when gauge_number / serial / js_id already exists on a test gauge,
 * then removes successfully processed source rows from the tool log.
 */
export async function moveGaugeCategoryToolsToTestGauges(): Promise<MoveToolGaugesResult> {
  const empty: MoveToolGaugesResult = {
    moved: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
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

  const candidates = tools.filter(isMoveCategory)
  if (candidates.length === 0) {
    return { ...empty, error: null }
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

    const { error } = await createTestGauge({
      gauge_number: gaugeNumber,
      manufacturer: tool.manufacturer ?? '',
      gauge_type: resolveGaugeType(tool),
      last_calibration_date: tool.calibration_date ?? '',
      next_calibration_date: tool.expiration_date ?? '',
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
    removedFromToolLog,
    error: null,
  }
}
