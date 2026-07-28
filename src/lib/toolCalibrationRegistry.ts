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
  'id,js_id,manufacturer,model,tool_type,category,serial_number,calibration_date,expiration_date,calibration_frequency,department,status,notes,active,certificate_storage_path,certificate_file_name,certificate_mime_type,certificate_number,created_at,updated_at'

const EVENT_SELECT =
  'id,tool_id,calibrated_at,next_due_at,tech_initials,technician_id,technician_name,signed_off_at,ambient_temp_f,gauge_block_serial,gauge_block_next_due,procedure_ref,result,notes,measurements,certificate_number,certificate_storage_path,certificate_file_name,created_at'

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
    certificate_number: row.certificate_number == null ? null : String(row.certificate_number),
    certificate_storage_path:
      row.certificate_storage_path == null ? null : String(row.certificate_storage_path),
    certificate_file_name: row.certificate_file_name == null ? null : String(row.certificate_file_name),
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
    calibration_frequency: nullIfBlank(form.calibration_frequency) || 'annually',
    department: nullIfBlank(form.department),
    status: form.status,
    notes: nullIfBlank(form.notes),
    certificate_number: nullIfBlank(form.certificate_number),
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
  previous?: ToolCalibration | null,
): Promise<{ error: string | null }> {
  if (previous) {
    const nextCal = nullIfBlank(form.calibration_date)
    const nextExp = nullIfBlank(form.expiration_date)
    const nextCert = nullIfBlank(form.certificate_number)
    const datesOrCertChanging =
      (previous.calibration_date ?? null) !== nextCal ||
      (previous.expiration_date ?? null) !== nextExp ||
      (previous.certificate_number ?? null) !== nextCert
    if (datesOrCertChanging) {
      const { error: archiveError } = await archivePriorToolCalibration(previous, {
        procedureRef: 'Manual edit (archived)',
        reason: 'Archived when calibration dates or certificate number were edited.',
      })
      if (archiveError) return { error: archiveError }
    }
  }
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

export async function updateToolCalibrationFrequency(
  id: number,
  calibration_frequency: string,
  expiration_date: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tool_calibrations')
    .update({
      calibration_frequency: calibration_frequency.trim() || 'annually',
      expiration_date,
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

/** Record an outside-lab calibration: archive prior cert/dates, attach new certificate, update tool. */
export async function recordExternalToolCalibration(
  tool: ToolCalibration,
  input: {
    calibratedAt: string
    nextDueAt: string
    technicianId: number | null
    technicianName: string
    signedOffAt: string
    certificateNumber: string
    notes?: string
    frequency?: string
    file: File
  },
): Promise<{ row: ToolCalibration | null; error: string | null }> {
  if (!input.calibratedAt.trim()) return { row: null, error: 'Calibration date is required.' }
  if (!input.nextDueAt.trim()) return { row: null, error: 'Next due date is required.' }
  const techName = input.technicianName.trim()
  if (!techName) return { row: null, error: 'Select the technician who signed off.' }
  if (!input.signedOffAt.trim()) return { row: null, error: 'Sign-off date is required.' }
  const certNumber = input.certificateNumber.trim()
  if (!certNumber) return { row: null, error: 'Certificate number is required.' }

  const { path, error: uploadError } = await uploadToolCalibrationCertificate(tool.id, input.file)
  if (uploadError || !path) return { row: null, error: uploadError ?? 'Upload failed.' }

  const { error: archiveError } = await archivePriorToolCalibration(tool, {
    procedureRef: 'External lab certificate (archived)',
    reason: 'Archived when a new certificate was uploaded.',
  })
  if (archiveError) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([path])
    return { row: null, error: archiveError }
  }

  const notes = input.notes?.trim()
  const frequency = input.frequency?.trim() || tool.calibration_frequency || 'annually'
  const { data, error } = await supabase
    .from('tool_calibrations')
    .update({
      calibration_date: input.calibratedAt,
      expiration_date: input.nextDueAt,
      calibration_frequency: frequency,
      status: 'active',
      active: true,
      notes: notes ? notes : tool.notes,
      certificate_storage_path: path,
      certificate_file_name: input.file.name.slice(0, 500),
      certificate_mime_type: input.file.type || null,
      certificate_number: certNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tool.id)
    .select(TOOL_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(TOOL_CERT_BUCKET).remove([path])
    return { row: null, error: error.message }
  }

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
    notes: notes || `Certificate # ${certNumber}`,
    measurements: [],
    certificate_number: certNumber,
    certificate_storage_path: path,
    certificate_file_name: input.file.name.slice(0, 500),
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

export function toolHasCalibrationRecord(tool: ToolCalibration): boolean {
  return Boolean(
    tool.calibration_date ||
      tool.expiration_date ||
      tool.certificate_storage_path ||
      tool.certificate_number,
  )
}

/**
 * Snapshot the tool's current calibration into history when that state is not
 * already the latest event (covers seeded / manually edited records).
 */
export async function archivePriorToolCalibration(
  tool: ToolCalibration,
  options?: { procedureRef?: string; reason?: string },
): Promise<{ archived: boolean; error: string | null }> {
  if (!toolHasCalibrationRecord(tool)) return { archived: false, error: null }

  const { events, error: loadError } = await loadToolCalibrationEvents(tool.id)
  if (loadError) return { archived: false, error: loadError }

  const latest = events[0]
  const alreadyRecorded =
    latest &&
    latest.calibrated_at === (tool.calibration_date ?? '') &&
    latest.next_due_at === (tool.expiration_date ?? '') &&
    (latest.certificate_number ?? null) === (tool.certificate_number ?? null) &&
    (latest.certificate_storage_path ?? null) === (tool.certificate_storage_path ?? null)

  if (alreadyRecorded) return { archived: false, error: null }

  const { error } = await supabase.from('tool_calibration_events').insert({
    tool_id: tool.id,
    calibrated_at: tool.calibration_date || todayFallback(),
    next_due_at: tool.expiration_date || tool.calibration_date || todayFallback(),
    tech_initials: 'ARCH',
    technician_name: 'Archived prior calibration',
    signed_off_at: tool.calibration_date,
    procedure_ref: options?.procedureRef ?? 'Prior calibration (archived)',
    result: 'pass',
    notes: [
      options?.reason ?? 'Archived when a new calibration was recorded.',
      tool.certificate_number ? `Prior cert # ${tool.certificate_number}` : null,
      tool.certificate_file_name ? `Prior file: ${tool.certificate_file_name}` : null,
      tool.notes?.trim() || null,
    ]
      .filter(Boolean)
      .join('\n'),
    measurements: [],
    certificate_number: tool.certificate_number,
    certificate_storage_path: tool.certificate_storage_path,
    certificate_file_name: tool.certificate_file_name,
  })

  return { archived: !error, error: error?.message ?? null }
}

function todayFallback() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

  const { error: archiveError } = await archivePriorToolCalibration(tool, {
    procedureRef: 'SOP 2010 (archived)',
    reason: 'Archived when a new in-house calibration was recorded.',
  })
  if (archiveError) return { event: null, error: archiveError }

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
      certificate_number: tool.certificate_number,
      certificate_storage_path: tool.certificate_storage_path,
      certificate_file_name: tool.certificate_file_name,
    })
    .select(EVENT_SELECT)
    .single()

  if (error) return { event: null, error: error.message }

  const { error: updateError } = await supabase
    .from('tool_calibrations')
    .update({
      calibration_date: input.calibratedAt,
      expiration_date: input.nextDueAt,
      calibration_frequency: input.frequency?.trim() || tool.calibration_frequency || 'annually',
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
