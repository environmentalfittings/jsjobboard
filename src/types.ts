export interface Valve {
  id: number
  valve_id: string
  customer: string | null
  cell: string | null
  size: string | null
  status: string
  received_status?: string | null
  job_type?: string | null
  /** Shop workflow step within the job (see `JOB_SUB_STATUSES`). */
  sub_status?: string | null
  /** Technician row ids assigned to this job (JSON array of integers in Supabase). */
  assigned_technician_ids?: unknown
  assigned_technician_id?: number | null
  assigned_by?: number | null
  assigned_at?: string | null
  assignment_notes?: string | null
  needs_attention?: boolean | null
  test_type: string | null
  valve_type: string | null
  /** Drives ITP checklist layout (twin stem, plug, four-way diverter, …). */
  bowl_type?: string | null
  order_type: string | null
  due_date: string | null
  date_closed: string | null
  date_tested: string | null
  description: string | null
  notes: string | null
  material_spec?: string | null
  drawing_po_number?: string | null
  /** Customer turnaround — use for status updates and turnaround reports. */
  is_turnaround?: boolean | null
  pressure_class?: string | null
}

export interface ValveItp {
  id: number
  valve_row_id: number
  content: string
  /** Structured inspection sections (tabs / items / fields). Omit until DB migration if needed. */
  itp_data?: unknown
  created_at: string
  updated_at: string
}

export interface ValveAttachment {
  id: number
  valve_row_id: number
  storage_path: string
  file_name: string
  mime_type: string | null
  kind: 'photo' | 'file'
  created_at: string
}

export interface Technician {
  id: number
  name: string
  employee_id: string | null
  work_cell_specialties: string[] | null
  group_team: string | null
  active: boolean
  user_id?: string | null
  login_username?: string | null
  login_email?: string | null
  role?: 'admin' | 'manager' | 'supervisor' | 'technician' | null
  supervisor_id?: number | null
  manager_id?: number | null
  created_at: string
  updated_at: string
}

export interface TestLogEntry {
  id: number
  tested_on: string
  valve_id: string
  size: string | null
  pressure: string | null
  manufacturer: string | null
  valve_type: string | null
  test_type: string | null
  worked: string | null
  pass_fail: string | null
  action_taken: string | null
  tester: string | null
  created_at: string
}
