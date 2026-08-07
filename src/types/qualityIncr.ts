export type QualityIncrStatus = 'open' | 'closed' | 'void'

export type QualityIncrDisposition =
  | 'accept_as_is_review'
  | 'scrap'
  | 'rework_new_wo'
  | 'rework_same_wo'

export const QUALITY_INCR_DISPOSITION_OPTIONS: { value: QualityIncrDisposition; label: string }[] = [
  { value: 'accept_as_is_review', label: 'Accept as Is, Review' },
  { value: 'scrap', label: 'Scrap' },
  { value: 'rework_new_wo', label: 'Rework, New WO' },
  { value: 'rework_same_wo', label: 'Rework, Same WO' },
]

export type QualityIncr = {
  id: number
  incr_number: string
  status: QualityIncrStatus
  rework_log_id: number | null
  valve_row_id: number | null
  valve_id: string | null
  customer_name: string | null
  date_rejected: string | null
  wo_so: string | null
  sequence_no: string | null
  po_number: string | null
  customer_code: string | null
  serial_no: string | null
  ovation_ncmr_no: string | null
  part_number: string | null
  part_description: string | null
  employee_name: string | null
  dept_responsible: string | null
  location: string | null
  quantity: string | null
  work_cell: string | null
  item: string | null
  reason_code: string | null
  discrepancy_code: string | null
  nonconformance_details: string | null
  discrepancy_description: string | null
  disposition: QualityIncrDisposition | null
  final_disposition: string | null
  labor_cost: string | null
  material_cost: string | null
  code_violation_article: string | null
  root_cause_corrective_action: string | null
  qc_approval_name: string | null
  qc_approval_date: string | null
  initiator_name: string | null
  initiator_date: string | null
  final_approval_name: string | null
  final_approval_date: string | null
  customer_signature_required: boolean
  customer_signature_date: string | null
  notes: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export type QualityIncrFormState = {
  customer_name: string
  date_rejected: string
  wo_so: string
  part_description: string
  employee_name: string
  dept_responsible: string
  work_cell: string
  item: string
  nonconformance_details: string
  discrepancy_description: string
  disposition: QualityIncrDisposition | ''
  final_disposition: string
  labor_cost: string
  material_cost: string
  root_cause_corrective_action: string
  qc_approval_name: string
  qc_approval_date: string
  initiator_name: string
  initiator_date: string
  final_approval_name: string
  final_approval_date: string
  customer_signature_required: boolean
  customer_signature_date: string
  notes: string
  status: QualityIncrStatus
}

export function emptyQualityIncrForm(): QualityIncrFormState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    customer_name: '',
    date_rejected: today,
    wo_so: '',
    part_description: '',
    employee_name: '',
    dept_responsible: '',
    work_cell: '',
    item: '',
    nonconformance_details: '',
    discrepancy_description: '',
    disposition: '',
    final_disposition: '',
    labor_cost: '',
    material_cost: '',
    root_cause_corrective_action: '',
    qc_approval_name: '',
    qc_approval_date: '',
    initiator_name: '',
    initiator_date: today,
    final_approval_name: '',
    final_approval_date: '',
    customer_signature_required: false,
    customer_signature_date: '',
    notes: '',
    status: 'open',
  }
}

export function qualityIncrToForm(row: QualityIncr): QualityIncrFormState {
  return {
    customer_name: row.customer_name ?? '',
    date_rejected: row.date_rejected ?? '',
    wo_so: row.wo_so ?? '',
    part_description: row.part_description ?? '',
    employee_name: row.employee_name ?? '',
    dept_responsible: row.dept_responsible ?? '',
    work_cell: row.work_cell ?? '',
    item: row.item ?? '',
    nonconformance_details: row.nonconformance_details ?? '',
    discrepancy_description: row.discrepancy_description ?? '',
    disposition: row.disposition ?? '',
    final_disposition: row.final_disposition ?? '',
    labor_cost: row.labor_cost ?? '',
    material_cost: row.material_cost ?? '',
    root_cause_corrective_action: row.root_cause_corrective_action ?? '',
    qc_approval_name: row.qc_approval_name ?? '',
    qc_approval_date: row.qc_approval_date ?? '',
    initiator_name: row.initiator_name ?? '',
    initiator_date: row.initiator_date ?? '',
    final_approval_name: row.final_approval_name ?? '',
    final_approval_date: row.final_approval_date ?? '',
    customer_signature_required: Boolean(row.customer_signature_required),
    customer_signature_date: row.customer_signature_date ?? '',
    notes: row.notes ?? '',
    status: row.status,
  }
}
