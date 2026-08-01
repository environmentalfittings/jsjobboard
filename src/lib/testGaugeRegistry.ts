import { supabase } from './supabase'
import { technicianInitials } from './technicianInitials'
import {
  resolveGaugeDepartment,
  resolveGaugeType,
  type TestGauge,
  type TestGaugeCalibrationEvent,
  type TestGaugeFormState,
} from '../types/testGauge'

export const TEST_GAUGE_CERT_BUCKET = 'valve-attachments'
const MAX_CERT_BYTES = 20 * 1024 * 1024

const GAUGE_SELECT =
  'id,gauge_number,manufacturer,gauge_type,department,notes,calibration_frequency,last_calibration_date,next_calibration_date,certificate_storage_path,certificate_file_name,certificate_mime_type,certificate_number,active,created_at,updated_at'

const EVENT_SELECT =
  'id,gauge_id,calibrated_at,next_due_at,tech_initials,technician_id,technician_name,signed_off_at,procedure_ref,result,notes,certificate_number,certificate_storage_path,certificate_file_name,created_at'

function extFromName(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function testGaugeCertificateUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const { data } = supabase.storage.from(TEST_GAUGE_CERT_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export function formatTestGaugeOptionLabel(gauge: TestGauge): string {
  const parts = [gauge.gauge_number]
  const meta = [gauge.manufacturer, gauge.gauge_type].filter(Boolean).join(' · ')
  if (meta) parts.push(`— ${meta}`)
  return parts.join(' ')
}

/** Gauges assigned to the PRV department (or labeled PRV in type/notes). */
export function isPrvGauge(gauge: TestGauge): boolean {
  const haystack = [gauge.department, gauge.gauge_type, gauge.notes, gauge.gauge_number]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
  return /\bprv\b/.test(haystack)
}

/** Keep original order within groups, but lift PRV gauges to the top. */
export function sortGaugesWithPrvFirst(gauges: TestGauge[]): TestGauge[] {
  const prv: TestGauge[] = []
  const rest: TestGauge[] = []
  for (const gauge of gauges) {
    if (isPrvGauge(gauge)) prv.push(gauge)
    else rest.push(gauge)
  }
  return [...prv, ...rest]
}

/** Chart recorders are registered in test_gauges with type “Chart recorder”. */
export function isChartRecorderGauge(gauge: TestGauge): boolean {
  return /chart\s*recorder/i.test(String(gauge.gauge_type ?? ''))
}

/** Types allowed on the Test gauges registry (not shop measuring tools). */
export const SUGGESTED_GAUGE_TYPES = [
  'Pressure',
  'Load Cell',
  'Chart recorder',
  'Dead Weight Tester',
] as const

export type SuggestedGaugeType = (typeof SUGGESTED_GAUGE_TYPES)[number]

export function normalizeSuggestedGaugeType(value: string | null | undefined): SuggestedGaugeType | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const matched = SUGGESTED_GAUGE_TYPES.find((opt) => opt.toLowerCase() === raw.toLowerCase())
  if (matched) return matched
  if (/chart\s*recorder/i.test(raw)) return 'Chart recorder'
  if (/load\s*cell/i.test(raw)) return 'Load Cell'
  if (/dead\s*weight/i.test(raw)) return 'Dead Weight Tester'
  if (/^pressure$/i.test(raw) || /pressure\s*(gauge|transducer)/i.test(raw)) return 'Pressure'
  return null
}

export function isAllowedTestGaugeType(gauge: TestGauge): boolean {
  return normalizeSuggestedGaugeType(gauge.gauge_type) != null
}

export function filterAllowedTestGauges(gauges: TestGauge[]): TestGauge[] {
  return gauges.filter(isAllowedTestGaugeType)
}

export function filterPressureTestGauges(gauges: TestGauge[]): TestGauge[] {
  return filterAllowedTestGauges(gauges).filter((g) => !isChartRecorderGauge(g))
}

export function filterChartRecorderGauges(gauges: TestGauge[]): TestGauge[] {
  return filterAllowedTestGauges(gauges).filter(isChartRecorderGauge)
}

/** Orange warning when calibration is within ~3 months (MTE KPI cards). */
export const GAUGE_CALIBRATION_WARNING_DAYS = 90

/** Dashboard alert when an active MTE gauge is this many days from expiring (or already past due). */
export const GAUGE_CALIBRATION_DASHBOARD_ALERT_DAYS = 14

export type GaugeCalibrationStatus = 'ok' | 'expiring' | 'due' | 'critical'

/** Days until `next_calibration_date` (negative if past due). Null when no due date. */
export function daysUntilGaugeCalibrationDue(gauge: TestGauge, today = new Date()): number | null {
  if (!gauge.next_calibration_date) return null
  const due = new Date(`${gauge.next_calibration_date}T12:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const t = new Date(today)
  t.setHours(12, 0, 0, 0)
  return Math.floor((due.getTime() - t.getTime()) / (24 * 60 * 60 * 1000))
}

/** Days past `next_calibration_date` (0 if not yet due). Null when no due date. */
export function daysPastGaugeCalibrationDue(gauge: TestGauge, today = new Date()): number | null {
  const daysUntil = daysUntilGaugeCalibrationDue(gauge, today)
  if (daysUntil === null) return null
  return daysUntil < 0 ? -daysUntil : 0
}

export function formatGaugeCalibrationDueDate(gauge: TestGauge): string | null {
  if (!gauge.next_calibration_date) return null
  const due = new Date(`${gauge.next_calibration_date}T12:00:00`)
  if (Number.isNaN(due.getTime())) return gauge.next_calibration_date
  return due.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * - `expiring` — due within 90 days (orange)
 * - `critical` / `due` — past due (red / expired)
 */
export function getGaugeCalibrationStatus(gauge: TestGauge, today = new Date()): GaugeCalibrationStatus {
  const daysUntil = daysUntilGaugeCalibrationDue(gauge, today)
  if (daysUntil === null) return 'ok'
  if (daysUntil < 0) return 'critical'
  if (daysUntil <= GAUGE_CALIBRATION_WARNING_DAYS) return 'expiring'
  return 'ok'
}

export function isGaugeCalibrationOverdue(gauge: TestGauge, today = new Date()): boolean {
  const daysPast = daysPastGaugeCalibrationDue(gauge, today)
  return daysPast !== null && daysPast > 0
}

/**
 * Dashboard alert: active MTE gauge is within 14 days of expiring, or already past due.
 * Clears automatically only when `next_calibration_date` is updated past that window.
 */
export function isGaugeCalibrationDashboardAlert(gauge: TestGauge, today = new Date()): boolean {
  const daysUntil = daysUntilGaugeCalibrationDue(gauge, today)
  if (daysUntil === null) return false
  return daysUntil <= GAUGE_CALIBRATION_DASHBOARD_ALERT_DAYS
}

/** @deprecated Prefer isGaugeCalibrationOverdue / isGaugeCalibrationDashboardAlert */
export function isGaugeCalibrationCriticallyOverdue(gauge: TestGauge, today = new Date()): boolean {
  return isGaugeCalibrationOverdue(gauge, today)
}

export function formatGaugeCalibrationStatusLabel(gauge: TestGauge, today = new Date()): string {
  const status = getGaugeCalibrationStatus(gauge, today)
  const daysUntil = daysUntilGaugeCalibrationDue(gauge, today)
  const daysPast = daysPastGaugeCalibrationDue(gauge, today)

  if (status === 'expiring' && daysUntil !== null) {
    if (daysUntil === 0) return 'Due today'
    return `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
  }
  if ((status === 'due' || status === 'critical') && daysPast !== null) {
    if (daysPast === 0) return 'Expired'
    return daysPast === 1 ? 'Expired · 1 day past due' : `Expired · ${daysPast} days past due`
  }
  return ''
}

/** @deprecated Use formatGaugeCalibrationStatusLabel */
export function formatGaugeCalibrationAlert(gauge: TestGauge, today = new Date()): string {
  return formatGaugeCalibrationStatusLabel(gauge, today)
}

export async function loadTestGauges(includeInactive = true): Promise<TestGauge[]> {
  let query = supabase.from('test_gauges').select(GAUGE_SELECT).order('gauge_number', { ascending: true })
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as TestGauge[]) ?? []
}

export async function loadActiveTestGauges(): Promise<TestGauge[]> {
  return loadTestGauges(false)
}

export async function createTestGauge(form: TestGaugeFormState): Promise<{ row: TestGauge | null; error: string | null }> {
  const gauge_number = form.gauge_number.trim()
  if (!gauge_number) return { row: null, error: 'Gauge number is required.' }

  const { data, error } = await supabase
    .from('test_gauges')
    .insert({
      gauge_number,
      gauge_id: gauge_number,
      manufacturer: form.manufacturer.trim() || null,
      gauge_type: resolveGaugeType(form),
      department: resolveGaugeDepartment(form),
      notes: form.notes.trim() || null,
      calibration_frequency: form.calibration_frequency.trim() || 'annually',
      last_calibration_date: form.last_calibration_date || null,
      next_calibration_date: form.next_calibration_date || null,
      certificate_number: form.certificate_number.trim() || null,
      active: form.active,
    })
    .select(GAUGE_SELECT)
    .single()

  if (error) return { row: null, error: error.message }
  return { row: data as TestGauge, error: null }
}

export async function updateTestGauge(
  id: string,
  form: TestGaugeFormState,
  previous?: TestGauge | null,
): Promise<{ error: string | null }> {
  const gauge_number = form.gauge_number.trim()
  if (!gauge_number) return { error: 'Gauge number is required.' }

  if (previous) {
    const nextCal = form.last_calibration_date || null
    const nextExp = form.next_calibration_date || null
    const nextCert = form.certificate_number.trim() || null
    const changing =
      (previous.last_calibration_date ?? null) !== nextCal ||
      (previous.next_calibration_date ?? null) !== nextExp ||
      (previous.certificate_number ?? null) !== nextCert
    if (changing) {
      const { error: archiveError } = await archivePriorTestGaugeCalibration(previous, {
        procedureRef: 'Manual edit (archived)',
        reason: 'Archived when calibration dates or certificate number were edited.',
      })
      if (archiveError) return { error: archiveError }
    }
  }

  const { error } = await supabase
    .from('test_gauges')
    .update({
      gauge_number,
      gauge_id: gauge_number,
      manufacturer: form.manufacturer.trim() || null,
      gauge_type: resolveGaugeType(form),
      department: resolveGaugeDepartment(form),
      notes: form.notes.trim() || null,
      calibration_frequency: form.calibration_frequency.trim() || 'annually',
      last_calibration_date: form.last_calibration_date || null,
      next_calibration_date: form.next_calibration_date || null,
      certificate_number: form.certificate_number.trim() || null,
      active: form.active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return { error: error?.message ?? null }
}

export async function updateTestGaugeType(
  id: string,
  gauge_type: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('test_gauges')
    .update({
      gauge_type: gauge_type?.trim() ? gauge_type.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function updateTestGaugeDepartment(
  id: string,
  department: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('test_gauges')
    .update({
      department: department?.trim() ? department.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function updateTestGaugeFrequency(
  id: string,
  calibration_frequency: string,
  next_calibration_date: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('test_gauges')
    .update({
      calibration_frequency: calibration_frequency.trim() || 'annually',
      next_calibration_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function updateTestGaugeNotes(
  id: string,
  notes: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('test_gauges')
    .update({
      notes: notes?.trim() ? notes.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function updateTestGaugeActive(
  id: string,
  active: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('test_gauges')
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteTestGauge(row: TestGauge): Promise<{ error: string | null }> {
  if (row.certificate_storage_path) {
    await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).remove([row.certificate_storage_path])
  }
  const { error } = await supabase.from('test_gauges').delete().eq('id', row.id)
  return { error: error?.message ?? null }
}

export async function uploadTestGaugeCertificate(
  gaugeId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  if (file.size > MAX_CERT_BYTES) return { path: null, error: 'Certificate file is too large (max 20 MB).' }

  const allowed =
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name)
  if (!allowed) return { path: null, error: 'Upload a PDF or image file.' }

  const storagePath = `test-gauge-certificates/${gaugeId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) return { path: null, error: uploadError.message || 'Upload failed.' }
  return { path: storagePath, error: null }
}

export async function attachTestGaugeCertificate(
  gauge: TestGauge,
  file: File,
): Promise<{ row: TestGauge | null; error: string | null }> {
  const { path, error: uploadError } = await uploadTestGaugeCertificate(gauge.id, file)
  if (uploadError || !path) return { row: null, error: uploadError ?? 'Upload failed.' }

  // Keep prior file if present — callers that replace calibrations should archive first.
  const { data, error } = await supabase
    .from('test_gauges')
    .update({
      certificate_storage_path: path,
      certificate_file_name: file.name.slice(0, 500),
      certificate_mime_type: file.type || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gauge.id)
    .select(GAUGE_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).remove([path])
    return { row: null, error: error.message }
  }
  return { row: data as TestGauge, error: null }
}

export async function removeTestGaugeCertificate(gauge: TestGauge): Promise<{ error: string | null }> {
  if (gauge.certificate_storage_path) {
    await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).remove([gauge.certificate_storage_path])
  }
  const { error } = await supabase
    .from('test_gauges')
    .update({
      certificate_storage_path: null,
      certificate_file_name: null,
      certificate_mime_type: null,
      certificate_number: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gauge.id)
  return { error: error?.message ?? null }
}

function todayFallback() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mapGaugeEvent(row: Record<string, unknown>): TestGaugeCalibrationEvent {
  return {
    id: String(row.id),
    gauge_id: String(row.gauge_id),
    calibrated_at: String(row.calibrated_at),
    next_due_at: String(row.next_due_at),
    tech_initials: String(row.tech_initials ?? ''),
    technician_id:
      row.technician_id === null || row.technician_id === undefined ? null : Number(row.technician_id),
    technician_name: row.technician_name == null ? null : String(row.technician_name),
    signed_off_at: row.signed_off_at == null ? null : String(row.signed_off_at),
    procedure_ref: String(row.procedure_ref ?? 'External lab certificate'),
    result: row.result === 'fail' ? 'fail' : 'pass',
    notes: row.notes == null ? null : String(row.notes),
    certificate_number: row.certificate_number == null ? null : String(row.certificate_number),
    certificate_storage_path:
      row.certificate_storage_path == null ? null : String(row.certificate_storage_path),
    certificate_file_name: row.certificate_file_name == null ? null : String(row.certificate_file_name),
    created_at: String(row.created_at),
  }
}

export function testGaugeHasCalibrationRecord(gauge: TestGauge): boolean {
  return Boolean(
    gauge.last_calibration_date ||
      gauge.next_calibration_date ||
      gauge.certificate_storage_path ||
      gauge.certificate_number,
  )
}

export async function loadTestGaugeCalibrationEvents(
  gaugeId: string,
): Promise<{ events: TestGaugeCalibrationEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('test_gauge_calibration_events')
    .select(EVENT_SELECT)
    .eq('gauge_id', gaugeId)
    .order('calibrated_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return { events: [], error: error.message }
  return { events: (data ?? []).map((row) => mapGaugeEvent(row as Record<string, unknown>)), error: null }
}

export async function archivePriorTestGaugeCalibration(
  gauge: TestGauge,
  options?: { procedureRef?: string; reason?: string },
): Promise<{ archived: boolean; error: string | null }> {
  if (!testGaugeHasCalibrationRecord(gauge)) return { archived: false, error: null }

  const { events, error: loadError } = await loadTestGaugeCalibrationEvents(gauge.id)
  if (loadError) return { archived: false, error: loadError }

  const latest = events[0]
  const alreadyRecorded =
    latest &&
    latest.calibrated_at === (gauge.last_calibration_date ?? '') &&
    latest.next_due_at === (gauge.next_calibration_date ?? '') &&
    (latest.certificate_number ?? null) === (gauge.certificate_number ?? null) &&
    (latest.certificate_storage_path ?? null) === (gauge.certificate_storage_path ?? null)

  if (alreadyRecorded) return { archived: false, error: null }

  const { error } = await supabase.from('test_gauge_calibration_events').insert({
    gauge_id: gauge.id,
    calibrated_at: gauge.last_calibration_date || todayFallback(),
    next_due_at: gauge.next_calibration_date || gauge.last_calibration_date || todayFallback(),
    tech_initials: 'ARCH',
    technician_name: 'Archived prior calibration',
    signed_off_at: gauge.last_calibration_date,
    procedure_ref: options?.procedureRef ?? 'Prior calibration (archived)',
    result: 'pass',
    notes: [
      options?.reason ?? 'Archived when a new calibration was recorded.',
      gauge.certificate_number ? `Prior cert # ${gauge.certificate_number}` : null,
      gauge.certificate_file_name ? `Prior file: ${gauge.certificate_file_name}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    certificate_number: gauge.certificate_number,
    certificate_storage_path: gauge.certificate_storage_path,
    certificate_file_name: gauge.certificate_file_name,
  })

  return { archived: !error, error: error?.message ?? null }
}

/** Outside-lab calibration for test gauges: archive prior, attach cert, update dates. */
export async function recordExternalTestGaugeCalibration(
  gauge: TestGauge,
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
): Promise<{ row: TestGauge | null; error: string | null }> {
  if (!input.calibratedAt.trim()) return { row: null, error: 'Calibration date is required.' }
  if (!input.nextDueAt.trim()) return { row: null, error: 'Next due date is required.' }
  const techName = input.technicianName.trim()
  if (!techName) return { row: null, error: 'Select the technician who signed off.' }
  if (!input.signedOffAt.trim()) return { row: null, error: 'Sign-off date is required.' }
  const certNumber = input.certificateNumber.trim()
  if (!certNumber) return { row: null, error: 'Certificate number is required.' }

  const { path, error: uploadError } = await uploadTestGaugeCertificate(gauge.id, input.file)
  if (uploadError || !path) return { row: null, error: uploadError ?? 'Upload failed.' }

  const { error: archiveError } = await archivePriorTestGaugeCalibration(gauge, {
    procedureRef: 'External lab certificate (archived)',
    reason: 'Archived when a new certificate was uploaded.',
  })
  if (archiveError) {
    await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).remove([path])
    return { row: null, error: archiveError }
  }

  const notes = input.notes?.trim()
  const frequency = input.frequency?.trim() || gauge.calibration_frequency || 'annually'
  const { data, error } = await supabase
    .from('test_gauges')
    .update({
      last_calibration_date: input.calibratedAt,
      next_calibration_date: input.nextDueAt,
      calibration_frequency: frequency,
      notes: notes ? notes : gauge.notes,
      active: true,
      certificate_storage_path: path,
      certificate_file_name: input.file.name.slice(0, 500),
      certificate_mime_type: input.file.type || null,
      certificate_number: certNumber,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gauge.id)
    .select(GAUGE_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).remove([path])
    return { row: null, error: error.message }
  }

  await supabase.from('test_gauge_calibration_events').insert({
    gauge_id: gauge.id,
    calibrated_at: input.calibratedAt,
    next_due_at: input.nextDueAt,
    tech_initials: technicianInitials(techName),
    technician_id: input.technicianId,
    technician_name: techName,
    signed_off_at: input.signedOffAt,
    procedure_ref: 'External lab certificate',
    result: 'pass',
    notes: notes || `Certificate # ${certNumber}`,
    certificate_number: certNumber,
    certificate_storage_path: path,
    certificate_file_name: input.file.name.slice(0, 500),
  })

  return { row: data as TestGauge, error: null }
}

/** Resolve gauge id + number for test log blocks (supports legacy text-only saves). */
export function resolveGaugeSelection(
  gaugeId: string,
  gaugeNumber: string,
  options: TestGauge[],
): { gaugeId: string; gauge: string } {
  if (gaugeId) {
    const match = options.find((g) => g.id === gaugeId)
    return { gaugeId, gauge: match?.gauge_number ?? gaugeNumber }
  }
  if (gaugeNumber) {
    const match = options.find((g) => g.gauge_number === gaugeNumber)
    return { gaugeId: match?.id ?? '', gauge: gaugeNumber }
  }
  return { gaugeId: '', gauge: '' }
}
