import { supabase } from './supabase'
import {
  resolveToolCategory,
  type ToolCalibration,
  type ToolCalibrationFormState,
} from '../types/toolCalibration'
import {
  GAUGE_CALIBRATION_WARNING_DAYS,
  type GaugeCalibrationStatus,
} from './testGaugeRegistry'

const TOOL_SELECT =
  'id,js_id,manufacturer,model,tool_type,category,serial_number,calibration_date,expiration_date,department,status,notes,active,created_at,updated_at'

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function formPayload(form: ToolCalibrationFormState) {
  return {
    js_id: nullIfBlank(form.js_id),
    manufacturer: nullIfBlank(form.manufacturer),
    model: nullIfBlank(form.model),
    tool_type: nullIfBlank(form.tool_type),
    category: resolveToolCategory(form),
    serial_number: nullIfBlank(form.serial_number),
    calibration_date: nullIfBlank(form.calibration_date),
    expiration_date: nullIfBlank(form.expiration_date),
    department: nullIfBlank(form.department),
    status: form.status,
    notes: nullIfBlank(form.notes),
    active: form.active,
    updated_at: new Date().toISOString(),
  }
}

export function daysUntilToolExpiration(row: ToolCalibration, today = new Date()): number | null {
  if (!row.expiration_date) return null
  const due = new Date(`${row.expiration_date}T12:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const t = new Date(today)
  t.setHours(12, 0, 0, 0)
  return Math.floor((due.getTime() - t.getTime()) / (24 * 60 * 60 * 1000))
}

export function getToolCalibrationDueStatus(
  row: ToolCalibration,
  today = new Date(),
): GaugeCalibrationStatus {
  const daysUntil = daysUntilToolExpiration(row, today)
  if (daysUntil === null) return 'ok'
  if (daysUntil < 0) return 'critical'
  if (daysUntil <= GAUGE_CALIBRATION_WARNING_DAYS) return 'expiring'
  return 'ok'
}

export function formatToolDueAlert(row: ToolCalibration, today = new Date()): string {
  const daysUntil = daysUntilToolExpiration(row, today)
  if (daysUntil === null) return ''
  if (daysUntil < 0) return `${-daysUntil}d overdue`
  if (daysUntil === 0) return 'Due today'
  return `Due in ${daysUntil}d`
}

export async function loadToolCalibrations(includeInactive = true): Promise<ToolCalibration[]> {
  let query = supabase.from('tool_calibrations').select(TOOL_SELECT).order('js_id', { ascending: true })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as ToolCalibration[]
}

export async function createToolCalibration(
  form: ToolCalibrationFormState,
): Promise<{ row: ToolCalibration | null; error: string | null }> {
  const { data, error } = await supabase
    .from('tool_calibrations')
    .insert(formPayload(form))
    .select(TOOL_SELECT)
    .single()
  if (error) return { row: null, error: error.message }
  return { row: data as ToolCalibration, error: null }
}

export async function updateToolCalibration(
  id: number,
  form: ToolCalibrationFormState,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tool_calibrations').update(formPayload(form)).eq('id', id)
  return { error: error?.message ?? null }
}

export async function updateToolCalibrationCategory(
  id: number,
  category: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tool_calibrations')
    .update({
      category: category?.trim() ? category.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteToolCalibration(id: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from('tool_calibrations').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export type ToolCalibrationSeedRow = {
  js_id: string | null
  manufacturer: string | null
  model: string | null
  tool_type: string | null
  category: string | null
  serial_number: string | null
  calibration_date: string | null
  expiration_date: string | null
  department: string | null
  status: 'active' | 'out_of_service'
  notes: string | null
  active: boolean
}

/** Replace table contents with the Excel seed (Calibration Log + Out of Service). */
export async function importAllToolCalibrationsFromSeed(
  seed: ToolCalibrationSeedRow[],
): Promise<{ imported: number; error: string | null }> {
  if (!seed.length) return { imported: 0, error: 'Seed is empty.' }

  const { error: deleteError } = await supabase
    .from('tool_calibrations')
    .delete()
    .gte('id', 0)
  if (deleteError) return { imported: 0, error: deleteError.message }

  const chunkSize = 100
  let imported = 0
  for (let i = 0; i < seed.length; i += chunkSize) {
    const chunk = seed.slice(i, i + chunkSize).map((row) => ({
      js_id: row.js_id,
      manufacturer: row.manufacturer,
      model: row.model,
      tool_type: row.tool_type,
      category: row.category,
      serial_number: row.serial_number,
      calibration_date: row.calibration_date,
      expiration_date: row.expiration_date,
      department: row.department,
      status: row.status,
      notes: row.notes,
      active: row.active,
    }))
    const { error } = await supabase.from('tool_calibrations').insert(chunk)
    if (error) return { imported, error: error.message }
    imported += chunk.length
  }
  return { imported, error: null }
}
