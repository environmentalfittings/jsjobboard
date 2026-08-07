import type { StatusReworkRecord } from '../types'
import {
  emptyQualityIncrForm,
  type QualityIncr,
  type QualityIncrFormState,
} from '../types/qualityIncr'
import { supabase } from './supabase'

const INCR_SELECT =
  'id,incr_number,status,rework_log_id,valve_row_id,valve_id,customer_name,date_rejected,wo_so,sequence_no,po_number,customer_code,serial_no,ovation_ncmr_no,part_number,part_description,employee_name,dept_responsible,location,quantity,work_cell,item,reason_code,discrepancy_code,nonconformance_details,discrepancy_description,disposition,final_disposition,labor_cost,material_cost,code_violation_article,root_cause_corrective_action,qc_approval_name,qc_approval_date,initiator_name,initiator_date,final_approval_name,final_approval_date,customer_signature_required,customer_signature_date,notes,created_by_user_id,created_by_name,created_at,updated_at'

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
    sequence_no: emptyToNull(form.sequence_no),
    po_number: emptyToNull(form.po_number),
    customer_code: emptyToNull(form.customer_code),
    serial_no: emptyToNull(form.serial_no),
    ovation_ncmr_no: emptyToNull(form.ovation_ncmr_no),
    part_number: emptyToNull(form.part_number),
    part_description: emptyToNull(form.part_description),
    employee_name: emptyToNull(form.employee_name),
    dept_responsible: emptyToNull(form.dept_responsible),
    location: emptyToNull(form.location),
    quantity: emptyToNull(form.quantity),
    work_cell: emptyToNull(form.work_cell),
    item: emptyToNull(form.item),
    reason_code: emptyToNull(form.reason_code),
    discrepancy_code: emptyToNull(form.discrepancy_code),
    nonconformance_details: emptyToNull(form.nonconformance_details),
    discrepancy_description: emptyToNull(form.discrepancy_description),
    disposition: form.disposition || null,
    final_disposition: emptyToNull(form.final_disposition),
    labor_cost: emptyToNull(form.labor_cost),
    material_cost: emptyToNull(form.material_cost),
    code_violation_article: emptyToNull(form.code_violation_article),
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
  const form = emptyQualityIncrForm()
  form.wo_so = rework.valve_id
  form.nonconformance_details = rework.reason
  form.discrepancy_description = `Rework move: ${rework.previous_status} → ${rework.new_status}`
  form.initiator_name = options?.initiatorName?.trim() || rework.changed_by_name || ''
  form.employee_name = rework.changed_by_name || ''

  if (rework.valve_row_id) {
    const { data } = await supabase
      .from('valves')
      .select('customer,cell,description,valve_type,drawing_po_number')
      .eq('id', rework.valve_row_id)
      .maybeSingle()
    if (data) {
      form.customer_name = String((data as { customer?: string | null }).customer ?? '')
      form.work_cell = String((data as { cell?: string | null }).cell ?? '')
      form.part_description = String((data as { description?: string | null }).description ?? '')
      form.item = String((data as { valve_type?: string | null }).valve_type ?? '')
      form.po_number = String((data as { drawing_po_number?: string | null }).drawing_po_number ?? '')
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
        error: `INCR saved, but could not link rework row: ${linkError.message}`,
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
