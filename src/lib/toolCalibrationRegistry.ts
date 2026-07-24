import { supabase } from './supabase'
import {
  resolveToolCategory,
  type ToolCalibration,
  type ToolCalibrationFormState,
} from '../types/toolCalibration'
import type {
  ToolCalibrationEvent,
  ToolRecalibrationInput,
} from '../types/toolCalibrationEvent'
import type { ToolCalibrationMeasurement } from './toolCalibrationSopPoints'
import { technicianInitials } from './technicianInitials'
import {
  GAUGE_CALIBRATION_WARNING_DAYS,
  type GaugeCalibrationStatus,
} from './testGaugeRegistry'

const TOOL_SELECT =
  'id,js_id,manufacturer,model,tool_type,category,serial_number,calibration_date,expiration_date,department,status,notes,active,certificate_storage_path,certificate_file_name,certificate_mime_type,created_at,updated_at'

const EVENT_SELECT =
  'id,tool_id,calibrated_at,next_due_at,tech_initials,technician_id,technician_name,signed_off_at,ambient_temp_f,gauge_block_serial,gauge_block_next_due,procedure_ref,result,notes,measurements,created_at'

export const TOOL_CERT_BUCKET = 'valve-attachments'
const MAX_CERT_BYTES = 20 * 1024 * 1024

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function extFromName(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function toolCalibrationCertificateUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const { data } = supabase.storage.from(TOOL_CERT_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

function parseMeasurements(raw: unknown): ToolCalibrationMeasurement[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = item as Partial<ToolCalibrationMeasurement>
    return {
      pointId: String(row.pointId ?? ''),
      label: String(row.label ?? ''),
      nominal: row.nominal == null || row.nominal === '' ? null : String(row.nominal),
      kind: row.kind === 'visual' || row.kind === 'passfail' ? row.kind : 'measurement',
      asFound: String(row.asFound ?? ''),
      asLeft: String(row.asLeft ?? ''),
      passed: Boolean(row.passed),
    }
  })
}

function mapEvent(row: Record<string, unknown>): ToolCalibrationEvent {
  return {
    id: String(row.id),
    tool_id: Number(row.tool_id),
    calibrated_at: String(row.calibrated_at),
    next_due_at: String(row.next_due_at),
    tech_initials: String(row.tech_initials ?? ''),
    technician_id:
      row.technician_id === null || row.technician_id === undefined ? null : Number(row.technician_id),
    technician_name: row.technician_name == null ? null : String(row.technician_name),
    signed_off_at: row.signed_off_at == null ? null : String(row.signed_off_at),
    ambient_temp_f:
      row.ambient_temp_f === null || row.ambient_temp_f === undefined
        ? null
        : Number(row.ambient_temp_f),
    gauge_block_serial: row.gauge_block_serial == null ? null : String(row.gauge_block_serial),
    gauge_block_next_due: row.gauge_block_next_due == null ? null : String(row.gauge_block_next_due),
    procedure_ref: String(row.procedure_ref ?? 'SOP 2010'),
    result: row.result === 'fail' ? 'fail' : 'pass',
    notes: row.notes == null ? null : String(row.notes),
    measurements: parseMeasurements(row.measurements),
    created_at: String(row.created_at),
  }
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

export async function deleteToolCalibration(row: ToolCalibration): Promise<{ error: string | null }> {
  if (row.certificate_storage_path) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([row.certificate_storage_path])
  }
  const { error } = await supabase.from('tool_calibrations').delete().eq('id', row.id)
  return { error: error?.message ?? null }
}

export async function uploadToolCalibrationCertificate(
  toolId: number,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  if (file.size > MAX_CERT_BYTES) return { path: null, error: 'Certificate file is too large (max 20 MB).' }

  const allowed =
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name)
  if (!allowed) return { path: null, error: 'Upload a PDF or image file.' }

  const storagePath = `tool-calibration-certificates/${toolId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(TOOL_CERT_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) return { path: null, error: uploadError.message || 'Upload failed.' }
  return { path: storagePath, error: null }
}

export async function attachToolCalibrationCertificate(
  tool: ToolCalibration,
  file: File,
): Promise<{ row: ToolCalibration | null; error: string | null }> {
  const { path, error: uploadError } = await uploadToolCalibrationCertificate(tool.id, file)
  if (uploadError || !path) return { row: null, error: uploadError ?? 'Upload failed.' }

  if (tool.certificate_storage_path) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([tool.certificate_storage_path])
  }

  const { data, error } = await supabase
    .from('tool_calibrations')
    .update({
      certificate_storage_path: path,
      certificate_file_name: file.name.slice(0, 500),
      certificate_mime_type: file.type || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tool.id)
    .select(TOOL_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([path])
    return { row: null, error: error.message }
  }
  return { row: data as ToolCalibration, error: null }
}

export async function removeToolCalibrationCertificate(
  tool: ToolCalibration,
): Promise<{ error: string | null }> {
  if (tool.certificate_storage_path) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([tool.certificate_storage_path])
  }
  const { error } = await supabase
    .from('tool_calibrations')
    .update({
      certificate_storage_path: null,
      certificate_file_name: null,
      certificate_mime_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tool.id)
  return { error: error?.message ?? null }
}

/** Record an outside-lab calibration: update dates and attach the certificate PDF/image. */
export async function recordExternalToolCalibration(
  tool: ToolCalibration,
  input: {
    calibratedAt: string
    nextDueAt: string
    technicianId: number | null
    technicianName: string
    signedOffAt: string
    notes?: string
    file: File
  },
): Promise<{ row: ToolCalibration | null; error: string | null }> {
  if (!input.calibratedAt.trim()) return { row: null, error: 'Calibration date is required.' }
  if (!input.nextDueAt.trim()) return { row: null, error: 'Next due date is required.' }
  const techName = input.technicianName.trim()
  if (!techName) return { row: null, error: 'Select the technician who signed off.' }
  if (!input.signedOffAt.trim()) return { row: null, error: 'Sign-off date is required.' }

  const { path, error: uploadError } = await uploadToolCalibrationCertificate(tool.id, input.file)
  if (uploadError || !path) return { row: null, error: uploadError ?? 'Upload failed.' }

  if (tool.certificate_storage_path) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([tool.certificate_storage_path])
  }

  const notes = input.notes?.trim()
  const { data, error } = await supabase
    .from('tool_calibrations')
    .update({
      calibration_date: input.calibratedAt,
      expiration_date: input.nextDueAt,
      status: 'active',
      active: true,
      notes: notes ? notes : tool.notes,
      certificate_storage_path: path,
      certificate_file_name: input.file.name.slice(0, 500),
      certificate_mime_type: input.file.type || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tool.id)
    .select(TOOL_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([path])
    return { row: null, error: error.message }
  }

  // Best-effort history row (ignore if events table / sign-off columns missing).
  await supabase.from('tool_calibration_events').insert({
    tool_id: tool.id,
    calibrated_at: input.calibratedAt,
    next_due_at: input.nextDueAt,
    tech_initials: technicianInitials(techName),
    technician_id: input.technicianId,
    technician_name: techName,
    signed_off_at: input.signedOffAt,
    procedure_ref: 'External lab certificate',
    result: 'pass',
    notes: notes || `Certificate: ${input.file.name}`,
    measurements: [],
  })

  return { row: data as ToolCalibration, error: null }
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

export async function loadToolCalibrationEvents(
  toolId: number,
): Promise<{ events: ToolCalibrationEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('tool_calibration_events')
    .select(EVENT_SELECT)
    .eq('tool_id', toolId)
    .order('calibrated_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return { events: [], error: error.message }
  return { events: (data ?? []).map((row) => mapEvent(row as Record<string, unknown>)), error: null }
}

/**
 * Record an in-house recalibration (SOP 2010), update the tool's dates/status,
 * and return the saved event for certificate printing.
 */
export async function completeToolRecalibration(
  tool: ToolCalibration,
  input: ToolRecalibrationInput,
): Promise<{ event: ToolCalibrationEvent | null; error: string | null }> {
  const techName = input.technicianName.trim()
  if (!techName) return { event: null, error: 'Select the technician who signed off.' }
  if (!input.signedOffAt.trim()) return { event: null, error: 'Sign-off date is required.' }
  if (!input.calibratedAt.trim()) return { event: null, error: 'Calibration date is required.' }
  if (!input.nextDueAt.trim()) return { event: null, error: 'Next due date is required.' }
  if (!input.gaugeBlockSerial.trim()) {
    return { event: null, error: 'Gauge block set serial number is required.' }
  }
  if (!input.gaugeBlockNextDue.trim()) {
    return { event: null, error: 'Gauge block set next calibration due date is required.' }
  }

  const passed = input.result === 'pass'
  const failNote = input.notes.trim()
  const nextNotes =
    passed
      ? tool.notes
      : [tool.notes?.trim(), failNote || 'Failed in-house calibration (SOP 2010) — Non-Compliance.']
          .filter(Boolean)
          .join('\n')

  const { data, error } = await supabase
    .from('tool_calibration_events')
    .insert({
      tool_id: tool.id,
      calibrated_at: input.calibratedAt,
      next_due_at: input.nextDueAt,
      tech_initials: technicianInitials(techName),
      technician_id: input.technicianId,
      technician_name: techName,
      signed_off_at: input.signedOffAt,
      ambient_temp_f: input.ambientTempF,
      gauge_block_serial: input.gaugeBlockSerial.trim(),
      gauge_block_next_due: input.gaugeBlockNextDue,
      procedure_ref: input.procedureRef?.trim() || 'SOP 2010',
      result: input.result,
      notes: nullIfBlank(input.notes),
      measurements: input.measurements,
    })
    .select(EVENT_SELECT)
    .single()

  if (error) return { event: null, error: error.message }

  const { error: updateError } = await supabase
    .from('tool_calibrations')
    .update({
      calibration_date: input.calibratedAt,
      expiration_date: input.nextDueAt,
      status: passed ? 'active' : 'out_of_service',
      active: passed,
      notes: nextNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tool.id)

  if (updateError) {
    return {
      event: mapEvent(data as Record<string, unknown>),
      error: `Saved calibration record, but failed updating tool: ${updateError.message}`,
    }
  }

  return { event: mapEvent(data as Record<string, unknown>), error: null }
}
