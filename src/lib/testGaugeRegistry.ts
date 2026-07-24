import { supabase } from './supabase'
import type { TestGauge, TestGaugeFormState } from '../types/testGauge'

export const TEST_GAUGE_CERT_BUCKET = 'valve-attachments'
const MAX_CERT_BYTES = 20 * 1024 * 1024

const GAUGE_SELECT =
  'id,gauge_number,manufacturer,gauge_type,last_calibration_date,next_calibration_date,certificate_storage_path,certificate_file_name,certificate_mime_type,active,created_at,updated_at'

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

/** Chart recorders are registered in test_gauges with type “Chart recorder”. */
export function isChartRecorderGauge(gauge: TestGauge): boolean {
  return /chart\s*recorder/i.test(String(gauge.gauge_type ?? ''))
}

export function filterPressureTestGauges(gauges: TestGauge[]): TestGauge[] {
  return gauges.filter((g) => !isChartRecorderGauge(g))
}

export function filterChartRecorderGauges(gauges: TestGauge[]): TestGauge[] {
  return gauges.filter(isChartRecorderGauge)
}

export const SUGGESTED_GAUGE_TYPES = ['Pressure', 'Helium', 'Load Cell', 'Chart recorder'] as const

/** Orange warning when calibration is within ~3 months. */
export const GAUGE_CALIBRATION_WARNING_DAYS = 90

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
      gauge_type: form.gauge_type.trim() || null,
      last_calibration_date: form.last_calibration_date || null,
      next_calibration_date: form.next_calibration_date || null,
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
): Promise<{ error: string | null }> {
  const gauge_number = form.gauge_number.trim()
  if (!gauge_number) return { error: 'Gauge number is required.' }

  const { error } = await supabase
    .from('test_gauges')
    .update({
      gauge_number,
      gauge_id: gauge_number,
      manufacturer: form.manufacturer.trim() || null,
      gauge_type: form.gauge_type.trim() || null,
      last_calibration_date: form.last_calibration_date || null,
      next_calibration_date: form.next_calibration_date || null,
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

  if (gauge.certificate_storage_path) {
    await supabase.storage.from(TEST_GAUGE_CERT_BUCKET).remove([gauge.certificate_storage_path])
  }

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
      updated_at: new Date().toISOString(),
    })
    .eq('id', gauge.id)
  return { error: error?.message ?? null }
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
