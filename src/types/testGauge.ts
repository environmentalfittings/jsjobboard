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
  active: boolean
}

export function emptyTestGaugeForm(): TestGaugeFormState {
  return {
    gauge_number: '',
    manufacturer: '',
    gauge_type: '',
    last_calibration_date: '',
    next_calibration_date: '',
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
    active: row.active,
  }
}
