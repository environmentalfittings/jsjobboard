export type ToolCalibrationStatus = 'active' | 'out_of_service'

/** Preset MTE categories (plus free-text via Other). */
export const TOOL_CATEGORY_OPTIONS = [
  'Gauges',
  'Torque Wrenches',
  'Calipers',
  'Load Cells',
  'Micrometer',
  'Dial Indicator',
  'Thickness Tester',
  'Dead Weight Tester',
  'Helium Leak Standard',
  'Gauge Block Standard',
  'Heat Treat Chart Recorder',
  'Welder Load Test',
] as const

export type ToolCategoryOption = (typeof TOOL_CATEGORY_OPTIONS)[number]

export const TOOL_CATEGORY_OTHER = 'Other'

/** Categories calibrated by an outside lab — upload certificate instead of in-house SOP form. */
export const EXTERNAL_CALIBRATION_CATEGORIES: readonly ToolCategoryOption[] = [
  'Torque Wrenches',
  'Dead Weight Tester',
  'Gauge Block Standard',
]

export function isExternalCalibrationCategory(category: string | null | undefined): boolean {
  const value = (category ?? '').trim()
  return (EXTERNAL_CALIBRATION_CATEGORIES as readonly string[]).includes(value)
}

export type ToolCalibration = {
  id: number
  js_id: string | null
  manufacturer: string | null
  model: string | null
  tool_type: string | null
  category: string | null
  serial_number: string | null
  calibration_date: string | null
  expiration_date: string | null
  department: string | null
  status: ToolCalibrationStatus
  notes: string | null
  active: boolean
  certificate_storage_path: string | null
  certificate_file_name: string | null
  certificate_mime_type: string | null
  certificate_number: string | null
  created_at: string
  updated_at: string
}

export type ToolCalibrationFormState = {
  js_id: string
  manufacturer: string
  model: string
  tool_type: string
  /** Preset option or Other */
  categorySelect: ToolCategoryOption | typeof TOOL_CATEGORY_OTHER | ''
  /** Used when categorySelect is Other */
  categoryOther: string
  serial_number: string
  calibration_date: string
  expiration_date: string
  department: string
  status: ToolCalibrationStatus
  notes: string
  certificate_number: string
  active: boolean
}

export function isPresetToolCategory(value: string | null | undefined): value is ToolCategoryOption {
  return Boolean(value && (TOOL_CATEGORY_OPTIONS as readonly string[]).includes(value))
}

export function resolveToolCategory(form: ToolCalibrationFormState): string | null {
  if (form.categorySelect === TOOL_CATEGORY_OTHER) {
    const other = form.categoryOther.trim()
    return other || null
  }
  const selected = form.categorySelect.trim()
  return selected || null
}

export function emptyToolCalibrationForm(): ToolCalibrationFormState {
  return {
    js_id: '',
    manufacturer: '',
    model: '',
    tool_type: '',
    categorySelect: '',
    categoryOther: '',
    serial_number: '',
    calibration_date: '',
    expiration_date: '',
    department: '',
    status: 'active',
    notes: '',
    certificate_number: '',
    active: true,
  }
}

export function toolCalibrationToForm(row: ToolCalibration): ToolCalibrationFormState {
  const category = (row.category ?? '').trim()
  const isPreset = isPresetToolCategory(category)
  return {
    js_id: row.js_id ?? '',
    manufacturer: row.manufacturer ?? '',
    model: row.model ?? '',
    tool_type: row.tool_type ?? '',
    categorySelect: isPreset ? category : category ? TOOL_CATEGORY_OTHER : '',
    categoryOther: isPreset ? '' : category,
    serial_number: row.serial_number ?? '',
    calibration_date: row.calibration_date ?? '',
    expiration_date: row.expiration_date ?? '',
    department: row.department ?? '',
    status: row.status,
    notes: row.notes ?? '',
    certificate_number: row.certificate_number ?? '',
    active: row.active,
  }
}

/** Infer a preset category from Excel tool_type / model for seeding. */
export function inferToolCategory(toolType: string | null | undefined, model?: string | null): string | null {
  const hay = `${toolType ?? ''} ${model ?? ''}`.toLowerCase()
  if (/caliper/.test(hay)) return 'Calipers'
  if (/depth\s*ga(?:u)?ge|micrometer|\bmic\b/.test(hay)) return 'Micrometer'
  if (/dial\s*indicator/.test(hay)) return 'Dial Indicator'
  if (/torque/.test(hay)) return 'Torque Wrenches'
  if (/load\s*cell/.test(hay)) return 'Load Cells'
  if (/thickness|surface\s*roughness|roughness\s*ga(?:u)?ge/.test(hay)) return 'Thickness Tester'
  if (/dead\s*weight/.test(hay)) return 'Dead Weight Tester'
  if (/helium/.test(hay)) return 'Helium Leak Standard'
  if (/gauge\s*block/.test(hay)) return 'Gauge Block Standard'
  if (/chart\s*recorder|heat\s*treat/.test(hay)) return 'Heat Treat Chart Recorder'
  if (/welder\s*load/.test(hay)) return 'Welder Load Test'
  if (/pressure|transducer|digital\s*(test\s*)?gauge|\bgauge\b/.test(hay)) return 'Gauges'
  return null
}
