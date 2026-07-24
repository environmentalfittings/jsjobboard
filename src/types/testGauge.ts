export type TestGauge = {
  id: string
  gauge_number: string
  manufacturer: string | null
  gauge_type: string | null
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

export type TestGaugeFormState = {
  gauge_number: string
  manufacturer: string
  gauge_type: string
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

export function emptyTestGaugeForm(): TestGaugeFormState {
  return {
    gauge_number: '',
    manufacturer: '',
    gauge_type: '',
    last_calibration_date: '',
    next_calibration_date: '',
    certificate_number: '',
    active: true,
  }
}

export function testGaugeToForm(row: TestGauge): TestGaugeFormState {
  return {
    gauge_number: row.gauge_number,
    manufacturer: row.manufacturer ?? '',
    gauge_type: row.gauge_type ?? '',
    last_calibration_date: row.last_calibration_date ?? '',
    next_calibration_date: row.next_calibration_date ?? '',
    certificate_number: row.certificate_number ?? '',
    active: row.active,
  }
}
