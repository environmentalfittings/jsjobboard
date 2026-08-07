import type { StatusReworkRecord } from '../types'
import { getPriorityDepartment } from '../constants/priorityDepartments'
import {
  emptyQualityIncrForm,
  type QualityIncr,
  type QualityIncrFormState,
} from '../types/qualityIncr'
import { loadJobTechnicianIdsByValveRowId } from './jobTechnicianAssignments'
import { departmentIdForShopStatus } from './statusPriorityQueue'
import { supabase } from './supabase'
import { parseAssignedTechnicianIds } from './valveTechnicianIds'

const INCR_SELECT =
  'id,incr_number,status,rework_log_id,valve_row_id,valve_id,customer_name,date_rejected,wo_so,sequence_no,po_number,customer_code,serial_no,ovation_ncmr_no,part_number,part_description,employee_name,dept_responsible,location,quantity,work_cell,item,reason_code,discrepancy_code,nonconformance_details,discrepancy_description,disposition,final_disposition,labor_cost,material_cost,code_violation_article,root_cause_corrective_action,qc_approval_name,qc_approval_date,initiator_name,initiator_date,final_approval_name,final_approval_date,customer_signature_required,customer_signature_date,notes,created_by_user_id,created_by_name,created_at,updated_at'

type ValveIncrSource = {
  id: number
  valve_id: string
  customer: string | null
  cell: string | null
  size: string | null
  status: string | null
  job_type: string | null
  valve_type: string | null
  description: string | null
  notes: string | null
  material_spec: string | null
  pressure_class: string | null
  body_material: string | null
  assigned_technician_id: number | null
  assigned_technician_ids: unknown
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function formToPayload(form: QualityIncrFormState) {
  return {
    status: form.status,
    customer_name: emptyToNull(form.customer_name),
    date_rejected: emptyToNull(form.date_rejected),
    wo_so: emptyToNull(form.wo_so),
    part_description: emptyToNull(form.part_description),
    employee_name: emptyToNull(form.employee_name),
    dept_responsible: emptyToNull(form.dept_responsible),
    work_cell: emptyToNull(form.work_cell),
    item: emptyToNull(form.item),
    nonconformance_details: emptyToNull(form.nonconformance_details),
    discrepancy_description: emptyToNull(form.discrepancy_description),
    disposition: form.disposition || null,
    final_disposition: emptyToNull(form.final_disposition),
    labor_cost: emptyToNull(form.labor_cost),
    material_cost: emptyToNull(form.material_cost),
    root_cause_corrective_action: emptyToNull(form.root_cause_corrective_action),
    qc_approval_name: emptyToNull(form.qc_approval_name),
    qc_approval_date: emptyToNull(form.qc_approval_date),
    initiator_name: emptyToNull(form.initiator_name),
    initiator_date: emptyToNull(form.initiator_date),
    final_approval_name: emptyToNull(form.final_approval_name),
    final_approval_date: emptyToNull(form.final_approval_date),
    customer_signature_required: Boolean(form.customer_signature_required),
    customer_signature_date: emptyToNull(form.customer_signature_date),
    notes: emptyToNull(form.notes),
    updated_at: new Date().toISOString(),
  }
}

function toLocalDateString(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ''
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function deptLabelForStatus(status: string): string {
  const trimmed = status.trim()
  if (!trimmed) return ''
  const deptId = departmentIdForShopStatus(trimmed)
  return getPriorityDepartment(deptId)?.label ?? trimmed
}

function sizeClassLabel(size: string | null | undefined, pressureClass: string | null | undefined): string {
  const sizeToken = (size ?? '').trim().replace(/"/g, '')
  const cls = (pressureClass ?? '').trim()
  if (sizeToken && cls) return `${sizeToken} in ${cls}`
  if (sizeToken) return `${sizeToken} in`
  if (cls) return cls
  return ''
}

async function technicianNamesForIds(ids: number[]): Promise<string> {
  if (!ids.length) return ''
  const { data, error } = await supabase.from('technicians').select('id,name').in('id', ids)
  if (error || !data?.length) return ''
  const byId = new Map(
    (data as { id: number; name: string | null }[]).map((row) => [row.id, (row.name ?? '').trim()]),
  )
  return ids
    .map((id) => byId.get(id) || '')
    .filter(Boolean)
    .join(', ')
}

async function fetchValveForIncr(valveRowId: number): Promise<ValveIncrSource | null> {
  const { data, error } = await supabase
    .from('valves')
    .select(
      'id,valve_id,customer,cell,size,status,job_type,valve_type,description,notes,material_spec,pressure_class,body_material,assigned_technician_id,assigned_technician_ids',
    )
    .eq('id', valveRowId)
    .maybeSingle()
  if (error || !data) return null
  return data as ValveIncrSource
}

/** Prefill INCR fields from a job-card valve row. */
export async function applyValveToIncrForm(
  form: QualityIncrFormState,
  valve: ValveIncrSource,
): Promise<QualityIncrFormState> {
  const next = { ...form }
  next.wo_so = valve.valve_id || next.wo_so
  next.customer_name = (valve.customer ?? '').trim() || next.customer_name
  next.work_cell = (valve.cell ?? '').trim() || next.work_cell
  next.part_description = (valve.description ?? '').trim() || next.part_description
  next.notes = (valve.notes ?? '').trim() || next.notes

  const valveType = (valve.valve_type ?? '').trim()
  const sizeClass = sizeClassLabel(valve.size, valve.pressure_class)
  const jobType = (valve.job_type ?? '').trim()

  next.item =
    [sizeClass, valveType].filter(Boolean).join(' · ') ||
    valveType ||
    next.item

  // Prefer job-card technicians; fall back to valve summary ids.
  const fromJoin = await loadJobTechnicianIdsByValveRowId([valve.id])
  const fromValve = parseAssignedTechnicianIds(valve.assigned_technician_ids)
  if (
    valve.assigned_technician_id != null &&
    Number.isInteger(valve.assigned_technician_id) &&
    valve.assigned_technician_id > 0 &&
    !fromValve.includes(valve.assigned_technician_id)
  ) {
    fromValve.push(valve.assigned_technician_id)
  }
  const techIds = fromJoin[valve.id]?.length ? fromJoin[valve.id]! : fromValve
  const techNames = await technicianNamesForIds(techIds)
  if (techNames) next.employee_name = techNames

  if (!next.dept_responsible && valve.status) {
    next.dept_responsible = deptLabelForStatus(valve.status)
  }

  // Keep job type visible in notes if present and not already included.
  if (jobType && !next.notes.toLowerCase().includes(jobType.toLowerCase())) {
    next.notes = next.notes ? `${next.notes}\nJob type: ${jobType}` : `Job type: ${jobType}`
  }

  return next
}

async function allocateIncrNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('quality_incrs')
    .select('incr_number')
    .order('id', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  let max = 0
  for (const row of data ?? []) {
    const match = /^INCR-(\d+)$/i.exec(String((row as { incr_number?: string }).incr_number ?? ''))
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return `INCR-${String(max + 1).padStart(6, '0')}`
}

export async function listQualityIncrs(limit = 200): Promise<{ data: QualityIncr[]; error: string | null }> {
  const { data, error } = await supabase
    .from('quality_incrs')
    .select(INCR_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (/quality_incrs|schema cache|does not exist/i.test(error.message)) {
      return {
        data: [],
        error: 'Run supabase/migration-quality-incrs.sql in Supabase SQL Editor first.',
      }
    }
    return { data: [], error: error.message }
  }
  return { data: (data ?? []) as QualityIncr[], error: null }
}

export async function getQualityIncr(id: number): Promise<{ data: QualityIncr | null; error: string | null }> {
  const { data, error } = await supabase.from('quality_incrs').select(INCR_SELECT).eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as QualityIncr | null) ?? null, error: null }
}

export async function getStatusReworkById(
  id: number,
): Promise<{ data: StatusReworkRecord | null; error: string | null }> {
  const { data, error } = await supabase
    .from('status_rework_log')
    .select('id,valve_row_id,valve_id,previous_status,new_status,reason,changed_by_name,changed_at,qa_disposition,incr_id')
    .eq('id', id)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as StatusReworkRecord | null) ?? null, error: null }
}

export async function markReworkDispositionNa(
  reworkLogId: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('status_rework_log')
    .update({ qa_disposition: 'na', incr_id: null })
    .eq('id', reworkLogId)
  if (error) {
    if (/qa_disposition|schema cache|does not exist/i.test(error.message)) {
      return { error: 'Run supabase/migration-quality-incrs.sql in Supabase SQL Editor first.' }
    }
    return { error: error.message }
  }
  return { error: null }
}

export async function buildIncrFormFromRework(
  rework: StatusReworkRecord,
  options?: { initiatorName?: string | null },
): Promise<QualityIncrFormState> {
  let form = emptyQualityIncrForm()
  form.wo_so = rework.valve_id
  form.nonconformance_details = rework.reason
  form.discrepancy_description = `Rework move: ${rework.previous_status} → ${rework.new_status}`
  form.initiator_name = options?.initiatorName?.trim() || rework.changed_by_name || ''
  form.employee_name = rework.changed_by_name || ''
  form.date_rejected = toLocalDateString(rework.changed_at) || form.date_rejected
  // Department where the issue was found (status before the backward move).
  form.dept_responsible = deptLabelForStatus(rework.previous_status)

  if (rework.valve_row_id) {
    const valve = await fetchValveForIncr(rework.valve_row_id)
    if (valve) {
      form = await applyValveToIncrForm(form, valve)
      // Keep dept from the rework move when available (more specific than current status).
      if (rework.previous_status?.trim()) {
        form.dept_responsible = deptLabelForStatus(rework.previous_status)
      }
      // If no job-card techs, keep the person who logged the rework.
      if (!form.employee_name.trim()) {
        form.employee_name = rework.changed_by_name || options?.initiatorName?.trim() || ''
      }
    }
  }
  return form
}

export async function createQualityIncr(options: {
  form: QualityIncrFormState
  reworkLogId?: number | null
  valveRowId?: number | null
  valveId?: string | null
  createdByUserId?: string | null
  createdByName?: string | null
}): Promise<{ data: QualityIncr | null; error: string | null }> {
  const incrNumber = await allocateIncrNumber()
  const payload = {
    ...formToPayload(options.form),
    incr_number: incrNumber,
    rework_log_id: options.reworkLogId ?? null,
    valve_row_id: options.valveRowId ?? null,
    valve_id: options.valveId?.trim() || emptyToNull(options.form.wo_so),
    created_by_user_id: options.createdByUserId ?? null,
    created_by_name: options.createdByName?.trim() || null,
  }
  const { data, error } = await supabase.from('quality_incrs').insert(payload).select(INCR_SELECT).single()
  if (error) {
    if (/quality_incrs|schema cache|does not exist/i.test(error.message)) {
      return { data: null, error: 'Run supabase/migration-quality-incrs.sql in Supabase SQL Editor first.' }
    }
    return { data: null, error: error.message }
  }
  const created = data as QualityIncr
  if (options.reworkLogId) {
    const { error: linkError } = await supabase
      .from('status_rework_log')
      .update({ qa_disposition: 'incr', incr_id: created.id })
      .eq('id', options.reworkLogId)
    if (linkError) {
      return {
        data: created,
        error: `INCR saved, but rework link failed: ${linkError.message}`,
      }
    }
  }
  return { data: created, error: null }
}

export async function updateQualityIncr(
  id: number,
  form: QualityIncrFormState,
): Promise<{ data: QualityIncr | null; error: string | null }> {
  const { data, error } = await supabase
    .from('quality_incrs')
    .update(formToPayload(form))
    .eq('id', id)
    .select(INCR_SELECT)
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as QualityIncr, error: null }
}
