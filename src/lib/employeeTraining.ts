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

export type TrainingFileKind = 'material' | 'test' | 'completed_test' | 'signoff' | 'other'

export type TrainingSkillLevel = '' | 'in_training' | 'trained' | 'C' | 'A' | 'M' | 'NEW' | 'Pending'

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

export const TRAINING_FILE_KINDS: { value: TrainingFileKind; label: string }[] = [
  { value: 'material', label: 'Training material' },
  { value: 'test', label: 'Test (blank)' },
  { value: 'completed_test', label: 'Completed test' },
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
  status: TrainingStatus
  reason: TrainingReason
  departments: string
  car_number: string
  trainer_name: string
  scheduled_date: string | null
  completed_date: string | null
  notes: string
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

export type EmployeeTrainingFile = {
  id: number
  training_id: number | null
  employee_id: string | null
  kind: TrainingFileKind
  title: string
  notes: string
  storage_path: string
  file_name: string
  mime_type: string | null
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
  status: TrainingStatus
  reason: TrainingReason
  departments: string
  car_number: string
  trainer_name: string
  scheduled_date: string | null
  completed_date: string | null
  notes: string
}

const TRAINING_SELECT =
  'id,record_no,title,status,reason,departments,car_number,trainer_name,scheduled_date,completed_date,notes,created_at,updated_at'

const ATTENDEE_SELECT =
  'id,training_id,employee_id,employee_name,signed_off,signed_off_at,notes,created_at'

const FILE_SELECT =
  'id,training_id,employee_id,kind,title,notes,storage_path,file_name,mime_type,created_at'

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
    status: 'scheduled',
    reason: '',
    departments: '',
    car_number: '',
    trainer_name: '',
    scheduled_date: null,
    completed_date: null,
    notes: '',
  }
}

export function inputFromTraining(row: EmployeeTraining): EmployeeTrainingInput {
  return {
    title: row.title,
    status: row.status,
    reason: row.reason,
    departments: row.departments,
    car_number: row.car_number,
    trainer_name: row.trainer_name,
    scheduled_date: row.scheduled_date,
    completed_date: row.completed_date,
    notes: row.notes,
  }
}

export function trainingStatusLabel(status: TrainingStatus): string {
  return TRAINING_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function trainingFilePublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(RESOURCE_DOCS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
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
  let query = supabase.from('employee_trainings').select(TRAINING_SELECT)
  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }
  const { data, error } = await query
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('completed_date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(500)
  throwDbError(error)
  return (data ?? []) as EmployeeTraining[]
}

export async function getEmployeeTraining(id: number): Promise<EmployeeTraining | null> {
  const { data, error } = await supabase
    .from('employee_trainings')
    .select(TRAINING_SELECT)
    .eq('id', id)
    .maybeSingle()
  throwDbError(error)
  return (data as EmployeeTraining | null) ?? null
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
    status: input.status,
    reason: input.reason || '',
    departments: input.departments.trim(),
    car_number: input.car_number.trim() || 'N/A',
    trainer_name: input.trainer_name.trim(),
    scheduled_date: emptyToNull(input.scheduled_date),
    completed_date: emptyToNull(input.completed_date),
    notes: input.notes.trim(),
  }

  const { data, error } = await supabase
    .from('employee_trainings')
    .insert(payload)
    .select(TRAINING_SELECT)
    .single()
  throwDbError(error)
  return data as EmployeeTraining
}

export async function updateEmployeeTraining(
  id: number,
  input: EmployeeTrainingInput,
): Promise<EmployeeTraining> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')

  const payload = {
    title,
    status: input.status,
    reason: input.reason || '',
    departments: input.departments.trim(),
    car_number: input.car_number.trim() || 'N/A',
    trainer_name: input.trainer_name.trim(),
    scheduled_date: emptyToNull(input.scheduled_date),
    completed_date: emptyToNull(input.completed_date),
    notes: input.notes.trim(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('employee_trainings')
    .update(payload)
    .eq('id', id)
    .select(TRAINING_SELECT)
    .single()
  throwDbError(error)
  return data as EmployeeTraining
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

export async function listTrainingFiles(opts?: {
  trainingId?: number | null
  kind?: TrainingFileKind | 'all'
  libraryOnly?: boolean
}): Promise<EmployeeTrainingFile[]> {
  let query = supabase.from('employee_training_files').select(FILE_SELECT)
  if (opts?.trainingId != null) query = query.eq('training_id', opts.trainingId)
  if (opts?.libraryOnly) query = query.is('training_id', null)
  if (opts?.kind && opts.kind !== 'all') query = query.eq('kind', opts.kind)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(400)
  throwDbError(error)
  return (data ?? []) as EmployeeTrainingFile[]
}

export async function uploadTrainingFile(args: {
  file: File
  kind: TrainingFileKind
  title?: string
  notes?: string
  trainingId?: number | null
  employeeId?: string | null
}): Promise<EmployeeTrainingFile> {
  const { file, kind } = args
  if (file.size > MAX_BYTES) throw new Error('File is too large (max 40 MB).')

  const title = (args.title ?? file.name).trim() || file.name
  const folder = args.trainingId != null ? `training-${args.trainingId}` : 'library'
  const storagePath = `resources/employee-training/${folder}/${crypto.randomUUID()}${fileExt(file.name)}`

  const { error: uploadErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadErr) throw new Error(uploadErr.message || 'Upload failed.')

  const { data, error } = await supabase
    .from('employee_training_files')
    .insert({
      training_id: args.trainingId ?? null,
      employee_id: args.employeeId ?? null,
      kind,
      title,
      notes: (args.notes ?? '').trim(),
      storage_path: storagePath,
      file_name: file.name.slice(0, 500),
      mime_type: file.type || null,
    })
    .select(FILE_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([storagePath])
    throwDbError(error)
  }
  return data as EmployeeTrainingFile
}

export async function deleteTrainingFile(row: EmployeeTrainingFile): Promise<void> {
  const { error: storageErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([row.storage_path])
  if (storageErr) throw new Error(storageErr.message || 'Could not remove file.')
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
