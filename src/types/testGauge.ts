export type TestGauge = {
  id: string
  gauge_number: string
  manufacturer: string | null
  gauge_type: string | null
  department: string | null
  notes: string | null
  calibration_frequency: string | null
  last_calibration_date: string | null
  next_calibration_date: string | null
  certificate_storage_path: string | null
  certificate_file_name: string | null
  certificate_mime_type: string | null
  certificate_number: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** Shared shop departments used by tool calibrations and test gauges. */
export const SUGGESTED_DEPARTMENTS = [
  'MACHINE SHOP',
  'TESTING',
  'TOOL ROOM',
  'CALIBRATION',
  'DURCO/TWIN SEAL',
  'FIELD SERVICE',
  'FITTING',
  'WELDING',
  'INSPECTION',
  'TEARDOWN',
  'ACTUATION',
  'BALL VALVE',
  'PRV',
] as const

export const GAUGE_TYPE_OTHER = 'Other'
export const GAUGE_DEPARTMENT_OTHER = 'Other'

export type TestGaugeFormState = {
  gauge_number: string
  manufacturer: string
  /** Preset type or Other */
  typeSelect: string
  /** Used when typeSelect is Other */
  typeOther: string
  /** Preset department or Other */
  departmentSelect: string
  /** Used when departmentSelect is Other */
  departmentOther: string
  notes: string
  calibration_frequency: string
  last_calibration_date: string
  next_calibration_date: string
  certificate_number: string
  active: boolean
}

export type TestGaugeCalibrationEvent = {
  id: string
  gauge_id: string
  calibrated_at: string
  next_due_at: string
  tech_initials: string
  technician_id: number | null
  technician_name: string | null
  signed_off_at: string | null
  procedure_ref: string
  result: 'pass' | 'fail'
  notes: string | null
  certificate_number: string | null
  certificate_storage_path: string | null
  certificate_file_name: string | null
  created_at: string
}

export function resolveGaugeType(form: TestGaugeFormState): string | null {
  if (form.typeSelect === GAUGE_TYPE_OTHER) {
    const other = form.typeOther.trim()
    return other || null
  }
  const selected = form.typeSelect.trim()
  return selected || null
}

export function resolveGaugeDepartment(form: TestGaugeFormState): string | null {
  if (form.departmentSelect === GAUGE_DEPARTMENT_OTHER) {
    const other = form.departmentOther.trim()
    return other || null
  }
  const selected = form.departmentSelect.trim()
  return selected || null
}

export function emptyTestGaugeForm(): TestGaugeFormState {
  return {
    gauge_number: '',
    manufacturer: '',
    typeSelect: '',
    typeOther: '',
    departmentSelect: '',
    departmentOther: '',
    notes: '',
    calibration_frequency: 'annually',
    last_calibration_date: '',
    next_calibration_date: '',
    certificate_number: '',
    active: true,
  }
}

export function testGaugeToForm(row: TestGauge): TestGaugeFormState {
  const gaugeType = (row.gauge_type ?? '').trim()
  const department = (row.department ?? '').trim()
  const typeIsPreset = (SUGGESTED_GAUGE_TYPES_SET as Set<string>).has(gaugeType)
  const deptIsPreset = (SUGGESTED_DEPARTMENTS as readonly string[]).includes(department)
  const frequency = (row.calibration_frequency ?? '').trim() || 'annually'

  return {
    gauge_number: row.gauge_number,
    manufacturer: row.manufacturer ?? '',
    typeSelect: typeIsPreset ? gaugeType : gaugeType ? GAUGE_TYPE_OTHER : '',
    typeOther: typeIsPreset ? '' : gaugeType,
    departmentSelect: deptIsPreset ? department : department ? GAUGE_DEPARTMENT_OTHER : '',
    departmentOther: deptIsPreset ? '' : department,
    notes: row.notes ?? '',
    calibration_frequency: frequency,
    last_calibration_date: row.last_calibration_date ?? '',
    next_calibration_date: row.next_calibration_date ?? '',
    certificate_number: row.certificate_number ?? '',
    active: row.active,
  }
}

/** Imported below after SUGGESTED_GAUGE_TYPES is defined in registry — keep local set for form helpers. */
const SUGGESTED_GAUGE_TYPES_SET = new Set([
  'Pressure',
  'Load Cell',
  'Chart recorder',
  'Dead Weight Tester',
])
