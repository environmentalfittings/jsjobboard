import { RESOURCE_DOCS_BUCKET } from './resourceDocuments'
import { supabase } from './supabase'

function throwDbError(error: { message?: string } | null): asserts error is null {
  if (error) throw new Error(error.message || 'Database request failed')
}

export type TrainingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export type TrainingReason =
  | ''
  | 'Annual'
  | 'Corrective Action'
  | 'Preventative Action'
  | 'Cross training'
  | 'Other'

export type TrainingFileKind = 'material' | 'agenda' | 'test' | 'completed_test' | 'signoff' | 'certificate' | 'other'

export type TrainingSkillLevel = '' | 'in_training' | 'trained' | 'C' | 'A' | 'M' | 'NEW' | 'Pending'

export type TrainingRecertInterval =
  | ''
  | '6_months'
  | '1_year'
  | '2_year'
  | '3_year'
  | '4_year'
  | '5_year'
  | '6_year'
  | '7_year'
  | '8_year'
  | '9_year'
  | '10_year'

export const TRAINING_STATUSES: { value: TrainingStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const TRAINING_REASONS: { value: Exclude<TrainingReason, ''>; label: string }[] = [
  { value: 'Annual', label: 'Annual' },
  { value: 'Corrective Action', label: 'Corrective Action' },
  { value: 'Preventative Action', label: 'Preventative Action' },
  { value: 'Cross training', label: 'Cross training' },
  { value: 'Other', label: 'Other' },
]

export const TRAINING_RECERT_INTERVALS: { value: TrainingRecertInterval; label: string }[] = [
  { value: '', label: 'None' },
  { value: '6_months', label: '6 months' },
  { value: '1_year', label: 'Annual (1 year)' },
  { value: '2_year', label: '2 years' },
  { value: '3_year', label: '3 years' },
  { value: '4_year', label: '4 years' },
  { value: '5_year', label: '5 years' },
  { value: '6_year', label: '6 years' },
  { value: '7_year', label: '7 years' },
  { value: '8_year', label: '8 years' },
  { value: '9_year', label: '9 years' },
  { value: '10_year', label: '10 years' },
]

export const TRAINING_FILE_KINDS: { value: TrainingFileKind; label: string }[] = [
  { value: 'material', label: 'Training material' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'test', label: 'Test (blank)' },
  { value: 'completed_test', label: 'Completed test' },
  { value: 'signoff', label: 'Sign-off sheet' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'other', label: 'Other' },
]

/** Sections used when building a reusable course package in the Library. */
export const TRAINING_COURSE_SECTION_KINDS: { value: TrainingFileKind; label: string }[] = [
  { value: 'material', label: 'Training materials' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'test', label: 'Test (blank)' },
  { value: 'signoff', label: 'Sign-off sheet' },
  { value: 'other', label: 'Other' },
]

/** GTC / shop skill columns from L-0010 Employee Training Log. */
export const TRAINING_SKILL_KEYS = [
  { key: 'disassemble', label: 'Disassemble' },
  { key: 'inspect', label: 'Inspect' },
  { key: 'assemble', label: 'Assemble' },
  { key: 'set', label: 'Set' },
  { key: 'field_service', label: 'Field service' },
  { key: 'plate', label: 'Plate' },
  { key: 'non_critical_machine', label: 'Non-critical machine' },
  { key: 'critical_machine', label: 'Critical machine' },
  { key: 'final_insp', label: 'Final insp' },
  { key: 'ci', label: 'CI' },
  { key: 'ship_receive', label: 'Ship / receive' },
  { key: 'gtc_training', label: 'GTC training' },
] as const

export const TRAINING_SKILL_LEVELS: { value: TrainingSkillLevel; label: string }[] = [
  { value: '', label: '—' },
  { value: 'in_training', label: 'In training' },
  { value: 'trained', label: 'Trained' },
  { value: 'NEW', label: 'NEW' },
  { value: 'Pending', label: 'Pending' },
  { value: 'C', label: 'C — Certified' },
  { value: 'A', label: 'A — Advanced' },
  { value: 'M', label: 'M — Master' },
]

export type EmployeeTraining = {
  id: number
  record_no: string
  title: string
  course_id: number | null
  status: TrainingStatus
  reason: TrainingReason
  departments: string
  car_number: string
  trainer_name: string
  scheduled_date: string | null
  completed_date: string | null
  notes: string
  recert_interval: TrainingRecertInterval
  recert_due_date: string | null
  created_at: string
  updated_at: string
}

export type EmployeeTrainingAttendee = {
  id: number
  training_id: number
  employee_id: string | null
  employee_name: string
  signed_off: boolean
  signed_off_at: string | null
  notes: string
  created_at: string
}

export type EmployeeTrainingHourEntry = {
  id: number
  attendee_id: number
  training_id: number
  employee_id: string | null
  session_date: string
  hours: number
  notes: string
  created_at: string
}

export type EmployeeTrainingCourse = {
  id: number
  title: string
  description: string
  created_at: string
  updated_at: string
}

export type EmployeeTrainingFile = {
  id: number
  training_id: number | null
  course_id: number | null
  employee_id: string | null
  kind: TrainingFileKind
  title: string
  /** Optional description shown in the library / file lists. */
  notes: string
  storage_path: string | null
  file_name: string
  mime_type: string | null
  /** When set, opens this URL instead of a storage file. */
  external_url: string | null
  created_at: string
}

export type EmployeeTrainingSkill = {
  id: number
  employee_id: string
  skill_key: string
  level: TrainingSkillLevel
  shop_location: string
  notes: string
  updated_at: string
}

export type EmployeeTrainingInput = {
  title: string
  course_id: number | null
  status: TrainingStatus
  reason: TrainingReason
  departments: string
  car_number: string
  trainer_name: string
  scheduled_date: string | null
  completed_date: string | null
  notes: string
  recert_interval: TrainingRecertInterval
  recert_due_date: string | null
}

const TRAINING_SELECT =
  'id,record_no,title,course_id,status,reason,departments,car_number,trainer_name,scheduled_date,completed_date,notes,recert_interval,recert_due_date,created_at,updated_at'
const TRAINING_SELECT_LEGACY =
  'id,record_no,title,status,reason,departments,car_number,trainer_name,scheduled_date,completed_date,notes,recert_interval,recert_due_date,created_at,updated_at'

const ATTENDEE_SELECT =
  'id,training_id,employee_id,employee_name,signed_off,signed_off_at,notes,created_at'

const HOUR_ENTRY_SELECT =
  'id,attendee_id,training_id,employee_id,session_date,hours,notes,created_at'

const COURSE_SELECT = 'id,title,description,created_at,updated_at'

const FILE_SELECT =
  'id,training_id,course_id,employee_id,kind,title,notes,storage_path,file_name,mime_type,external_url,created_at'
const FILE_SELECT_LEGACY =
  'id,training_id,employee_id,kind,title,notes,storage_path,file_name,mime_type,created_at'
const FILE_SELECT_NO_COURSE =
  'id,training_id,employee_id,kind,title,notes,storage_path,file_name,mime_type,external_url,created_at'

const SKILL_SELECT = 'id,employee_id,skill_key,level,shop_location,notes,updated_at'

const MAX_BYTES = 40 * 1024 * 1024

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function fileExt(name: string) {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  const ext = name.slice(idx).toLowerCase()
  return ext.length <= 12 ? ext : ''
}

export function emptyTrainingInput(): EmployeeTrainingInput {
  return {
    title: '',
    course_id: null,
    status: 'scheduled',
    reason: '',
    departments: '',
    car_number: '',
    trainer_name: '',
    scheduled_date: null,
    completed_date: null,
    notes: '',
    recert_interval: '',
    recert_due_date: null,
  }
}

export function inputFromTraining(row: EmployeeTraining): EmployeeTrainingInput {
  return {
    title: row.title,
    course_id: row.course_id ?? null,
    status: row.status,
    reason: row.reason,
    departments: row.departments,
    car_number: row.car_number,
    trainer_name: row.trainer_name,
    scheduled_date: row.scheduled_date,
    completed_date: row.completed_date,
    notes: row.notes,
    recert_interval: row.recert_interval || '',
    recert_due_date: row.recert_due_date,
  }
}

export function formatTrainingHours(hours: number | null | undefined): string {
  const value = Number(hours ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

export function sumTrainingHours(entries: Pick<EmployeeTrainingHourEntry, 'hours'>[]): number {
  return entries.reduce((total, entry) => total + Number(entry.hours ?? 0), 0)
}

export function trainingHoursByAttendeeId(
  entries: EmployeeTrainingHourEntry[],
): Map<number, number> {
  const totals = new Map<number, number>()
  for (const entry of entries) {
    totals.set(entry.attendee_id, (totals.get(entry.attendee_id) ?? 0) + Number(entry.hours ?? 0))
  }
  return totals
}

function parseTrainingHoursInput(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Enter training hours')
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) throw new Error('Hours must be greater than 0')
  if (value > 9999) throw new Error('Hours must be 9999 or less')
  return Math.round(value * 100) / 100
}

function mapTrainingHourEntryRow(row: Record<string, unknown>): EmployeeTrainingHourEntry {
  return {
    id: Number(row.id),
    attendee_id: Number(row.attendee_id),
    training_id: Number(row.training_id),
    employee_id: row.employee_id == null ? null : String(row.employee_id),
    session_date: String(row.session_date ?? ''),
    hours: Number(row.hours ?? 0),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

function isMissingHourEntriesTable(message: string | null | undefined) {
  return /employee_training_hour_entries/i.test(String(message ?? '')) &&
    /relation|table|schema|does not exist/i.test(String(message ?? ''))
}

export function trainingRecertIntervalLabel(interval: TrainingRecertInterval | string | null | undefined): string {
  return TRAINING_RECERT_INTERVALS.find((i) => i.value === interval)?.label ?? (interval || '—')
}

/** Add months/years to an ISO date (YYYY-MM-DD), clamping day-of-month. */
export function computeRecertDueDate(
  completedDate: string | null | undefined,
  interval: TrainingRecertInterval | string | null | undefined,
): string | null {
  const start = String(completedDate ?? '').trim()
  const key = String(interval ?? '').trim() as TrainingRecertInterval
  if (!start || !key) return null

  const base = new Date(`${start}T12:00:00`)
  if (Number.isNaN(base.getTime())) return null

  if (key === '6_months') {
    base.setMonth(base.getMonth() + 6)
  } else {
    const match = /^(\d+)_year$/.exec(key)
    if (!match) return null
    base.setFullYear(base.getFullYear() + Number(match[1]))
  }

  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function trainingStatusLabel(status: TrainingStatus): string {
  return TRAINING_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function trainingFilePublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(RESOURCE_DOCS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export function isTrainingFileLink(row: Pick<EmployeeTrainingFile, 'external_url' | 'storage_path'>): boolean {
  return Boolean(String(row.external_url ?? '').trim())
}

export function normalizeTrainingExternalUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Enter a URL')
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new Error('Enter a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must start with http:// or https://')
  }
  return parsed.toString()
}

export function trainingFileHref(row: Pick<EmployeeTrainingFile, 'external_url' | 'storage_path'>): string {
  const external = String(row.external_url ?? '').trim()
  if (external) return external
  const path = String(row.storage_path ?? '').trim()
  if (!path) return '#'
  return trainingFilePublicUrl(path)
}

export function trainingFileLabel(row: Pick<EmployeeTrainingFile, 'title' | 'file_name' | 'external_url'>): string {
  const title = row.title.trim()
  if (title) return title
  const name = row.file_name.trim()
  if (name) return name
  const external = String(row.external_url ?? '').trim()
  if (external) {
    try {
      return new URL(external).hostname || external
    } catch {
      return external
    }
  }
  return 'Untitled resource'
}

function isMissingExternalUrlColumn(message: string | null | undefined) {
  return /external_url/i.test(String(message ?? '')) && /column|schema|does not exist/i.test(String(message ?? ''))
}

function isMissingCourseIdColumn(message: string | null | undefined) {
  return /course_id/i.test(String(message ?? '')) && /column|schema|does not exist/i.test(String(message ?? ''))
}

function isMissingTrainingCourseIdColumn(message: string | null | undefined) {
  return /course_id/i.test(String(message ?? '')) && /column|schema|does not exist/i.test(String(message ?? ''))
}

function isMissingCoursesTable(message: string | null | undefined) {
  return /employee_training_courses/i.test(String(message ?? '')) &&
    /relation|table|schema|does not exist/i.test(String(message ?? ''))
}

function mapTrainingRow(row: Record<string, unknown>): EmployeeTraining {
  return {
    id: Number(row.id),
    record_no: String(row.record_no ?? ''),
    title: String(row.title ?? ''),
    course_id: row.course_id == null ? null : Number(row.course_id),
    status: row.status as TrainingStatus,
    reason: row.reason as TrainingReason,
    departments: String(row.departments ?? ''),
    car_number: String(row.car_number ?? ''),
    trainer_name: String(row.trainer_name ?? ''),
    scheduled_date: row.scheduled_date == null ? null : String(row.scheduled_date),
    completed_date: row.completed_date == null ? null : String(row.completed_date),
    notes: String(row.notes ?? ''),
    recert_interval: (row.recert_interval ?? '') as TrainingRecertInterval,
    recert_due_date: row.recert_due_date == null ? null : String(row.recert_due_date),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

async function selectTrainings(select: string, opts?: { status?: TrainingStatus | 'all' }) {
  let query = supabase.from('employee_trainings').select(select)
  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }
  return query
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('completed_date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(500)
}

async function readTrainingRow(id: number): Promise<EmployeeTraining | null> {
  const primary = await supabase.from('employee_trainings').select(TRAINING_SELECT).eq('id', id).maybeSingle()
  if (!primary.error && primary.data) return mapTrainingRow(primary.data as Record<string, unknown>)
  if (primary.error && !isMissingTrainingCourseIdColumn(primary.error.message)) throwDbError(primary.error)

  const legacy = await supabase.from('employee_trainings').select(TRAINING_SELECT_LEGACY).eq('id', id).maybeSingle()
  throwDbError(legacy.error)
  if (!legacy.data) return null
  return mapTrainingRow(legacy.data as Record<string, unknown>)
}

function mapTrainingFileRow(row: Record<string, unknown>): EmployeeTrainingFile {
  return {
    id: Number(row.id),
    training_id: row.training_id == null ? null : Number(row.training_id),
    course_id: row.course_id == null ? null : Number(row.course_id),
    employee_id: row.employee_id == null ? null : String(row.employee_id),
    kind: row.kind as TrainingFileKind,
    title: String(row.title ?? ''),
    notes: String(row.notes ?? ''),
    storage_path: row.storage_path == null ? null : String(row.storage_path),
    file_name: String(row.file_name ?? ''),
    mime_type: row.mime_type == null ? null : String(row.mime_type),
    external_url: row.external_url == null ? null : String(row.external_url),
    created_at: String(row.created_at ?? ''),
  }
}

export async function countEmployeeTrainings(): Promise<number> {
  const { count, error } = await supabase
    .from('employee_trainings')
    .select('id', { count: 'exact', head: true })
  if (error) return 0
  return count ?? 0
}

export async function listEmployeeTrainings(opts?: {
  status?: TrainingStatus | 'all'
}): Promise<EmployeeTraining[]> {
  const primary = await selectTrainings(TRAINING_SELECT, opts)
  if (!primary.error) {
    const rows = Array.isArray(primary.data) ? primary.data : []
    return rows.map((row) => mapTrainingRow(row as unknown as Record<string, unknown>))
  }
  if (!isMissingTrainingCourseIdColumn(primary.error.message)) throwDbError(primary.error)

  const legacy = await selectTrainings(TRAINING_SELECT_LEGACY, opts)
  throwDbError(legacy.error)
  const rows = Array.isArray(legacy.data) ? legacy.data : []
  return rows.map((row) => mapTrainingRow(row as unknown as Record<string, unknown>))
}

export async function getEmployeeTraining(id: number): Promise<EmployeeTraining | null> {
  return readTrainingRow(id)
}

async function allocateRecordNo(): Promise<string> {
  const { data, error } = await supabase.rpc('allocate_training_record_no')
  throwDbError(error)
  const value = String(data ?? '').trim()
  if (!/^TR-\d{6}$/.test(value)) {
    throw new Error('Could not allocate training record number')
  }
  return value
}

export async function createEmployeeTraining(input: EmployeeTrainingInput): Promise<EmployeeTraining> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')

  const recordNo = await allocateRecordNo()
  const payload = {
    record_no: recordNo,
    title,
    course_id: input.course_id ?? null,
    status: input.status,
    reason: input.reason || '',
    departments: input.departments.trim(),
    car_number: input.car_number.trim() || 'N/A',
    trainer_name: input.trainer_name.trim(),
    scheduled_date: emptyToNull(input.scheduled_date),
    completed_date: emptyToNull(input.completed_date),
    notes: input.notes.trim(),
    recert_interval: input.recert_interval || '',
    recert_due_date:
      emptyToNull(input.recert_due_date) ||
      computeRecertDueDate(input.completed_date, input.recert_interval),
  }

  const { data, error } = await supabase
    .from('employee_trainings')
    .insert(payload)
    .select(TRAINING_SELECT)
    .single()
  if (!error) return mapTrainingRow(data as Record<string, unknown>)

  if (isMissingTrainingCourseIdColumn(error.message)) {
    const { course_id: _drop, ...legacyPayload } = payload
    const legacy = await supabase
      .from('employee_trainings')
      .insert(legacyPayload)
      .select(TRAINING_SELECT_LEGACY)
      .single()
    throwDbError(legacy.error)
    return mapTrainingRow(legacy.data as Record<string, unknown>)
  }
  throwDbError(error)
  throw new Error('Could not create training')
}

export async function updateEmployeeTraining(
  id: number,
  input: EmployeeTrainingInput,
): Promise<EmployeeTraining> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')

  const payload = {
    title,
    course_id: input.course_id ?? null,
    status: input.status,
    reason: input.reason || '',
    departments: input.departments.trim(),
    car_number: input.car_number.trim() || 'N/A',
    trainer_name: input.trainer_name.trim(),
    scheduled_date: emptyToNull(input.scheduled_date),
    completed_date: emptyToNull(input.completed_date),
    notes: input.notes.trim(),
    recert_interval: input.recert_interval || '',
    recert_due_date:
      emptyToNull(input.recert_due_date) ||
      computeRecertDueDate(input.completed_date, input.recert_interval),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('employee_trainings')
    .update(payload)
    .eq('id', id)
    .select(TRAINING_SELECT)
    .single()
  if (!error) return mapTrainingRow(data as Record<string, unknown>)

  if (isMissingTrainingCourseIdColumn(error.message)) {
    const { course_id: _drop, ...legacyPayload } = payload
    const legacy = await supabase
      .from('employee_trainings')
      .update(legacyPayload)
      .eq('id', id)
      .select(TRAINING_SELECT_LEGACY)
      .single()
    throwDbError(legacy.error)
    return mapTrainingRow(legacy.data as Record<string, unknown>)
  }
  throwDbError(error)
  throw new Error('Could not update training')
}

export async function deleteEmployeeTraining(id: number): Promise<void> {
  const { error } = await supabase.from('employee_trainings').delete().eq('id', id)
  throwDbError(error)
}

export async function listTrainingAttendees(trainingId: number): Promise<EmployeeTrainingAttendee[]> {
  const { data, error } = await supabase
    .from('employee_training_attendees')
    .select(ATTENDEE_SELECT)
    .eq('training_id', trainingId)
    .order('employee_name', { ascending: true })
  throwDbError(error)
  return (data ?? []) as EmployeeTrainingAttendee[]
}

export async function listAttendeeTrainingsForEmployee(employeeId: string): Promise<
  Array<EmployeeTrainingAttendee & { training?: EmployeeTraining | null }>
> {
  const { data, error } = await supabase
    .from('employee_training_attendees')
    .select(`${ATTENDEE_SELECT},employee_trainings(${TRAINING_SELECT})`)
    .eq('employee_id', employeeId)
    .order('id', { ascending: false })
    .limit(200)
  throwDbError(error)
  return ((data ?? []) as unknown as Array<
    EmployeeTrainingAttendee & { employee_trainings?: EmployeeTraining | EmployeeTraining[] | null }
  >).map((row) => {
    const linked = row.employee_trainings
    const training = Array.isArray(linked) ? (linked[0] ?? null) : (linked ?? null)
    return { ...row, training }
  })
}

export async function listAllAttendeeTrainings(): Promise<
  Array<EmployeeTrainingAttendee & { training?: EmployeeTraining | null }>
> {
  const { data, error } = await supabase
    .from('employee_training_attendees')
    .select(`${ATTENDEE_SELECT},employee_trainings(${TRAINING_SELECT})`)
    .order('id', { ascending: false })
    .limit(2000)
  throwDbError(error)
  return ((data ?? []) as unknown as Array<
    EmployeeTrainingAttendee & { employee_trainings?: EmployeeTraining | EmployeeTraining[] | null }
  >).map((row) => {
    const linked = row.employee_trainings
    const training = Array.isArray(linked) ? (linked[0] ?? null) : (linked ?? null)
    return { ...row, training }
  })
}

export async function upsertTrainingAttendee(args: {
  trainingId: number
  employeeId?: string | null
  employeeName: string
  signedOff?: boolean
  signedOffAt?: string | null
  notes?: string
}): Promise<EmployeeTrainingAttendee> {
  const employeeName = args.employeeName.trim()
  if (!employeeName) throw new Error('Employee name is required')

  const payload = {
    training_id: args.trainingId,
    employee_id: args.employeeId || null,
    employee_name: employeeName,
    signed_off: Boolean(args.signedOff),
    signed_off_at: args.signedOff ? emptyToNull(args.signedOffAt) || new Date().toISOString().slice(0, 10) : null,
    notes: (args.notes ?? '').trim(),
  }

  if (args.employeeId) {
    const { data, error } = await supabase
      .from('employee_training_attendees')
      .upsert(payload, { onConflict: 'training_id,employee_id' })
      .select(ATTENDEE_SELECT)
      .single()
    throwDbError(error)
    return data as EmployeeTrainingAttendee
  }

  const { data, error } = await supabase
    .from('employee_training_attendees')
    .insert(payload)
    .select(ATTENDEE_SELECT)
    .single()
  throwDbError(error)
  return data as EmployeeTrainingAttendee
}

export async function updateTrainingAttendee(
  id: number,
  patch: Partial<Pick<EmployeeTrainingAttendee, 'signed_off' | 'signed_off_at' | 'notes' | 'employee_name'>>,
): Promise<EmployeeTrainingAttendee> {
  const payload: Record<string, unknown> = { ...patch }
  if (typeof patch.employee_name === 'string') payload.employee_name = patch.employee_name.trim()
  if (typeof patch.notes === 'string') payload.notes = patch.notes.trim()
  if (patch.signed_off === false) payload.signed_off_at = null
  if (patch.signed_off === true && !patch.signed_off_at) {
    payload.signed_off_at = new Date().toISOString().slice(0, 10)
  }

  const { data, error } = await supabase
    .from('employee_training_attendees')
    .update(payload)
    .eq('id', id)
    .select(ATTENDEE_SELECT)
    .single()
  throwDbError(error)
  return data as EmployeeTrainingAttendee
}

export async function deleteTrainingAttendee(id: number): Promise<void> {
  const { error } = await supabase.from('employee_training_attendees').delete().eq('id', id)
  throwDbError(error)
}

export async function listTrainingHourEntries(opts: {
  trainingId?: number
  attendeeId?: number
  employeeId?: string
}): Promise<EmployeeTrainingHourEntry[]> {
  let query = supabase.from('employee_training_hour_entries').select(HOUR_ENTRY_SELECT)
  if (opts.trainingId != null) query = query.eq('training_id', opts.trainingId)
  if (opts.attendeeId != null) query = query.eq('attendee_id', opts.attendeeId)
  if (opts.employeeId) query = query.eq('employee_id', opts.employeeId)
  const { data, error } = await query
    .order('session_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000)
  if (error) {
    if (isMissingHourEntriesTable(error.message)) {
      throw new Error('Run migration-employee-training-hours.sql in Supabase to enable hour logging')
    }
    throwDbError(error)
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapTrainingHourEntryRow)
}

export async function createTrainingHourEntry(args: {
  attendeeId: number
  trainingId: number
  employeeId?: string | null
  sessionDate?: string | null
  hours: string | number
  notes?: string
}): Promise<EmployeeTrainingHourEntry> {
  const hours = typeof args.hours === 'number' ? args.hours : parseTrainingHoursInput(args.hours)
  const { data, error } = await supabase
    .from('employee_training_hour_entries')
    .insert({
      attendee_id: args.attendeeId,
      training_id: args.trainingId,
      employee_id: args.employeeId ?? null,
      session_date: emptyToNull(args.sessionDate) || new Date().toISOString().slice(0, 10),
      hours,
      notes: (args.notes ?? '').trim(),
    })
    .select(HOUR_ENTRY_SELECT)
    .single()
  if (error) {
    if (isMissingHourEntriesTable(error.message)) {
      throw new Error('Run migration-employee-training-hours.sql in Supabase to enable hour logging')
    }
    throwDbError(error)
  }
  return mapTrainingHourEntryRow(data as Record<string, unknown>)
}

export async function deleteTrainingHourEntry(id: number): Promise<void> {
  const { error } = await supabase.from('employee_training_hour_entries').delete().eq('id', id)
  if (error) {
    if (isMissingHourEntriesTable(error.message)) {
      throw new Error('Run migration-employee-training-hours.sql in Supabase to enable hour logging')
    }
    throwDbError(error)
  }
}

export async function listTrainingCourses(): Promise<EmployeeTrainingCourse[]> {
  const { data, error } = await supabase
    .from('employee_training_courses')
    .select(COURSE_SELECT)
    .order('title', { ascending: true })
    .limit(500)
  if (error) {
    if (isMissingCoursesTable(error.message)) {
      throw new Error('Run migration-employee-training-courses.sql in Supabase to enable training courses')
    }
    throwDbError(error)
  }
  return (data ?? []) as EmployeeTrainingCourse[]
}

export async function createTrainingCourse(args: {
  title: string
  description?: string
}): Promise<EmployeeTrainingCourse> {
  const title = args.title.trim()
  if (!title) throw new Error('Course title is required')
  const { data, error } = await supabase
    .from('employee_training_courses')
    .insert({
      title,
      description: (args.description ?? '').trim(),
    })
    .select(COURSE_SELECT)
    .single()
  if (error) {
    if (isMissingCoursesTable(error.message)) {
      throw new Error('Run migration-employee-training-courses.sql in Supabase to enable training courses')
    }
    throwDbError(error)
  }
  return data as EmployeeTrainingCourse
}

export async function updateTrainingCourse(
  id: number,
  patch: { title?: string; description?: string },
): Promise<EmployeeTrainingCourse> {
  const payload: Record<string, string> = {}
  if (typeof patch.title === 'string') {
    const title = patch.title.trim()
    if (!title) throw new Error('Course title is required')
    payload.title = title
  }
  if (typeof patch.description === 'string') payload.description = patch.description.trim()
  if (Object.keys(payload).length === 0) throw new Error('Nothing to update')

  const { data, error } = await supabase
    .from('employee_training_courses')
    .update(payload)
    .eq('id', id)
    .select(COURSE_SELECT)
    .single()
  if (error) {
    if (isMissingCoursesTable(error.message)) {
      throw new Error('Run migration-employee-training-courses.sql in Supabase to enable training courses')
    }
    throwDbError(error)
  }
  return data as EmployeeTrainingCourse
}

export async function deleteTrainingCourse(id: number): Promise<void> {
  const { error } = await supabase.from('employee_training_courses').delete().eq('id', id)
  if (error) {
    if (isMissingCoursesTable(error.message)) {
      throw new Error('Run migration-employee-training-courses.sql in Supabase to enable training courses')
    }
    throwDbError(error)
  }
}

export function groupTrainingFilesBySection(
  files: EmployeeTrainingFile[],
  sectionKinds: { value: TrainingFileKind; label: string }[] = TRAINING_COURSE_SECTION_KINDS,
): Array<{ kind: TrainingFileKind; label: string; files: EmployeeTrainingFile[] }> {
  const grouped = new Map<TrainingFileKind, EmployeeTrainingFile[]>()
  for (const section of sectionKinds) grouped.set(section.value, [])
  for (const file of files) {
    const bucket = grouped.get(file.kind)
    if (bucket) bucket.push(file)
    else grouped.set(file.kind, [file])
  }
  const ordered = sectionKinds.map((section) => ({
    kind: section.value,
    label: section.label,
    files: grouped.get(section.value) ?? [],
  }))
  for (const [kind, bucket] of grouped.entries()) {
    if (sectionKinds.some((section) => section.value === kind)) continue
    if (bucket.length === 0) continue
    ordered.push({
      kind,
      label: TRAINING_FILE_KINDS.find((item) => item.value === kind)?.label ?? kind,
      files: bucket,
    })
  }
  return ordered
}

export async function listTrainingFiles(opts?: {
  trainingId?: number | null
  courseId?: number | null
  employeeId?: string | null
  kind?: TrainingFileKind | 'all'
  libraryOnly?: boolean
  generalLibraryOnly?: boolean
}): Promise<EmployeeTrainingFile[]> {
  const applyFilters = (select: string) => {
    let query = supabase.from('employee_training_files').select(select)
    if (opts?.trainingId != null) query = query.eq('training_id', opts.trainingId)
    if (opts?.courseId != null) query = query.eq('course_id', opts.courseId)
    if (opts?.employeeId) query = query.eq('employee_id', opts.employeeId)
    if (opts?.libraryOnly) query = query.is('training_id', null)
    if (opts?.generalLibraryOnly) {
      query = query.is('training_id', null).is('course_id', null)
    }
    if (opts?.kind && opts.kind !== 'all') query = query.eq('kind', opts.kind)
    return query.order('created_at', { ascending: false }).limit(400)
  }

  const primary = await applyFilters(FILE_SELECT)
  if (!primary.error) {
    const rows = Array.isArray(primary.data) ? primary.data : []
    return rows.map((row) => mapTrainingFileRow(row as unknown as Record<string, unknown>))
  }
  if (isMissingCourseIdColumn(primary.error.message)) {
    const withoutCourse = await applyFilters(FILE_SELECT_NO_COURSE)
    if (!withoutCourse.error) {
      const rows = Array.isArray(withoutCourse.data) ? withoutCourse.data : []
      return rows.map((row) => mapTrainingFileRow(row as unknown as Record<string, unknown>))
    }
    if (!isMissingExternalUrlColumn(withoutCourse.error.message)) throwDbError(withoutCourse.error)
  } else if (!isMissingExternalUrlColumn(primary.error.message)) {
    throwDbError(primary.error)
  }

  const legacy = await applyFilters(FILE_SELECT_LEGACY)
  throwDbError(legacy.error)
  const legacyRows = Array.isArray(legacy.data) ? legacy.data : []
  return legacyRows.map((row) => mapTrainingFileRow(row as unknown as Record<string, unknown>))
}

export async function uploadTrainingFile(args: {
  file: File
  kind: TrainingFileKind
  title?: string
  notes?: string
  trainingId?: number | null
  courseId?: number | null
  employeeId?: string | null
}): Promise<EmployeeTrainingFile> {
  const { file, kind } = args
  if (file.size > MAX_BYTES) throw new Error('File is too large (max 40 MB).')

  const title = (args.title ?? file.name).trim() || file.name
  const notes = (args.notes ?? '').trim()
  const folder =
    args.trainingId != null && args.employeeId
      ? `training-${args.trainingId}/employee-${args.employeeId}`
      : args.trainingId != null
        ? `training-${args.trainingId}`
        : args.courseId != null
          ? `courses/course-${args.courseId}`
          : args.employeeId
            ? `employee-${args.employeeId}`
            : 'library'
  const storagePath = `resources/employee-training/${folder}/${crypto.randomUUID()}${fileExt(file.name)}`

  const { error: uploadErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadErr) throw new Error(uploadErr.message || 'Upload failed.')

  const insertPayload = {
    training_id: args.trainingId ?? null,
    course_id: args.courseId ?? null,
    employee_id: args.employeeId ?? null,
    kind,
    title,
    notes,
    storage_path: storagePath,
    file_name: file.name.slice(0, 500),
    mime_type: file.type || null,
    external_url: null as string | null,
  }

  const primary = await supabase.from('employee_training_files').insert(insertPayload).select(FILE_SELECT).single()
  if (!primary.error) return mapTrainingFileRow(primary.data as Record<string, unknown>)

  if (isMissingCourseIdColumn(primary.error.message)) {
    const { course_id: _drop, ...withoutCourse } = insertPayload
    const next = await supabase.from('employee_training_files').insert(withoutCourse).select(FILE_SELECT_NO_COURSE).single()
    if (!next.error) return mapTrainingFileRow(next.data as Record<string, unknown>)
    if (!isMissingExternalUrlColumn(next.error.message)) {
      await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([storagePath])
      throwDbError(next.error)
    }
  }

  if (isMissingExternalUrlColumn(primary.error.message)) {
    const { external_url: _drop, course_id: _course, ...legacyPayload } = insertPayload
    const legacy = await supabase
      .from('employee_training_files')
      .insert(legacyPayload)
      .select(FILE_SELECT_LEGACY)
      .single()
    if (legacy.error) {
      await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([storagePath])
      throwDbError(legacy.error)
    }
    return mapTrainingFileRow(legacy.data as Record<string, unknown>)
  }

  await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([storagePath])
  throwDbError(primary.error)
  throw new Error('Upload failed.')
}

export async function createTrainingLibraryLink(args: {
  url: string
  kind: TrainingFileKind
  title?: string
  notes?: string
  trainingId?: number | null
  courseId?: number | null
  employeeId?: string | null
}): Promise<EmployeeTrainingFile> {
  const externalUrl = normalizeTrainingExternalUrl(args.url)
  let host = externalUrl
  try {
    host = new URL(externalUrl).hostname || externalUrl
  } catch {
    /* keep raw */
  }
  const title = (args.title ?? '').trim() || host
  const notes = (args.notes ?? '').trim()

  const insertPayload = {
    training_id: args.trainingId ?? null,
    course_id: args.courseId ?? null,
    employee_id: args.employeeId ?? null,
    kind: args.kind,
    title,
    notes,
    storage_path: null,
    file_name: host.slice(0, 500),
    mime_type: 'text/uri-list',
    external_url: externalUrl,
  }

  const primary = await supabase.from('employee_training_files').insert(insertPayload).select(FILE_SELECT).single()
  if (!primary.error) return mapTrainingFileRow(primary.data as Record<string, unknown>)

  if (isMissingCourseIdColumn(primary.error.message)) {
    throw new Error('Run migration-employee-training-courses.sql in Supabase to enable training courses')
  }
  if (isMissingExternalUrlColumn(primary.error.message)) {
    throw new Error('Run migration-employee-training-library-links.sql in Supabase to enable URL links')
  }
  throwDbError(primary.error)
  throw new Error('Could not add link')
}

export async function updateTrainingFileMeta(
  id: number,
  patch: { title?: string; notes?: string; external_url?: string | null },
): Promise<EmployeeTrainingFile> {
  const payload: Record<string, string | null> = {}
  if (typeof patch.title === 'string') payload.title = patch.title.trim()
  if (typeof patch.notes === 'string') payload.notes = patch.notes.trim()
  if (patch.external_url !== undefined) {
    payload.external_url =
      patch.external_url == null || !String(patch.external_url).trim()
        ? null
        : normalizeTrainingExternalUrl(String(patch.external_url))
    if (payload.external_url) {
      try {
        payload.file_name = new URL(payload.external_url).hostname.slice(0, 500)
      } catch {
        payload.file_name = payload.external_url.slice(0, 500)
      }
    }
  }
  if (Object.keys(payload).length === 0) {
    throw new Error('Nothing to update')
  }

  const primary = await supabase
    .from('employee_training_files')
    .update(payload)
    .eq('id', id)
    .select(FILE_SELECT)
    .single()
  if (!primary.error) return mapTrainingFileRow(primary.data as Record<string, unknown>)

  if (isMissingExternalUrlColumn(primary.error.message) && 'external_url' in payload) {
    throw new Error('Run migration-employee-training-library-links.sql in Supabase to enable URL links')
  }
  if (isMissingExternalUrlColumn(primary.error.message)) {
    const { external_url: _drop, file_name: _file, ...legacyPayload } = payload
    const legacy = await supabase
      .from('employee_training_files')
      .update(legacyPayload)
      .eq('id', id)
      .select(FILE_SELECT_LEGACY)
      .single()
    throwDbError(legacy.error)
    return mapTrainingFileRow(legacy.data as Record<string, unknown>)
  }
  throwDbError(primary.error)
  throw new Error('Could not update resource')
}

export async function deleteTrainingFile(row: EmployeeTrainingFile): Promise<void> {
  const path = String(row.storage_path ?? '').trim()
  if (path && !isTrainingFileLink(row)) {
    const { error: storageErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([path])
    if (storageErr) throw new Error(storageErr.message || 'Could not remove file.')
  }
  const { error } = await supabase.from('employee_training_files').delete().eq('id', row.id)
  throwDbError(error)
}

export async function listEmployeeSkills(employeeId?: string): Promise<EmployeeTrainingSkill[]> {
  let query = supabase.from('employee_training_skills').select(SKILL_SELECT)
  if (employeeId) query = query.eq('employee_id', employeeId)
  const { data, error } = await query.order('skill_key', { ascending: true }).limit(2000)
  throwDbError(error)
  return (data ?? []) as EmployeeTrainingSkill[]
}

export async function upsertEmployeeSkill(args: {
  employeeId: string
  skillKey: string
  level: TrainingSkillLevel
  shopLocation?: string
  notes?: string
}): Promise<EmployeeTrainingSkill> {
  const payload = {
    employee_id: args.employeeId,
    skill_key: args.skillKey,
    level: args.level,
    shop_location: (args.shopLocation ?? '').trim(),
    notes: (args.notes ?? '').trim(),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('employee_training_skills')
    .upsert(payload, { onConflict: 'employee_id,skill_key' })
    .select(SKILL_SELECT)
    .single()
  throwDbError(error)
  return data as EmployeeTrainingSkill
}

export function formatTrainingDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

/** True when expiration/recert due date is before today (local). */
export function isTrainingExpired(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false
  const due = new Date(`${dueDate}T12:00:00`)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime()
}

/** Signed day difference: negative = overdue, 0 = due today, positive = days until due. */
export function daysUntilTrainingExpiration(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null
  const due = new Date(`${dueDate}T12:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

export function trainingExpirationStatusLabel(daysUntil: number | null): string {
  if (daysUntil == null) return '—'
  if (daysUntil < 0) return `Overdue ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'}`
  if (daysUntil === 0) return 'Due today'
  return `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
}
