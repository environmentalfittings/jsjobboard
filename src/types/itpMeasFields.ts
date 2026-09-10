/** Supported technician input controls on an ITP / traveler line. */
export type ItpMeasFieldType = 'text' | 'textarea' | 'dropdown' | 'yes_no' | 'number' | 'picture'

export const ITP_MEAS_FIELD_TYPE_OPTIONS: { value: ItpMeasFieldType; label: string }[] = [
  { value: 'text', label: 'Text box' },
  { value: 'textarea', label: 'Notes box' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'picture', label: 'Picture' },
]

/** One configurable measurement / nameplate / technician field on an ITP line. */
export type ItpMeasFieldDef = {
  id: string
  label: string
  /** Input control type. Defaults to text when missing (legacy rows). */
  type: ItpMeasFieldType
  /** Dropdown choices (ignored for other types). */
  options: string[]
  /** When false, step can complete without this field. Default true. */
  required: boolean
}

/** Classic Body/bonnet triple — used as the default when enabling measurements. */
export const DEFAULT_ITP_MEAS_FIELDS: ItpMeasFieldDef[] = [
  { id: 'before', label: 'Before Measurement', type: 'text', options: [], required: true },
  { id: 'after', label: 'After Measurement', type: 'text', options: [], required: true },
  { id: 'verify', label: 'Verification / Acceptance', type: 'text', options: [], required: true },
]

export function newMeasFieldId(): string {
  return `mf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function normalizeMeasFieldType(raw: unknown): ItpMeasFieldType {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'textarea' || value === 'notes') return 'textarea'
  if (value === 'dropdown' || value === 'select') return 'dropdown'
  if (value === 'yes_no' || value === 'yesno' || value === 'boolean') return 'yes_no'
  if (value === 'number' || value === 'numeric') return 'number'
  if (value === 'picture' || value === 'photo' || value === 'image') return 'picture'
  return 'text'
}

export function emptyMeasField(partial?: Partial<ItpMeasFieldDef>): ItpMeasFieldDef {
  return {
    id: partial?.id?.trim() || newMeasFieldId(),
    label: String(partial?.label ?? '').trim(),
    type: normalizeMeasFieldType(partial?.type),
    options: Array.isArray(partial?.options)
      ? partial!.options.map((opt) => String(opt).trim()).filter(Boolean)
      : [],
    required: partial?.required !== false,
  }
}

export function normalizeMeasFields(raw: unknown): ItpMeasFieldDef[] {
  if (!Array.isArray(raw)) return []
  const out: ItpMeasFieldDef[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Partial<ItpMeasFieldDef> & { options?: unknown; required?: unknown }
    const label = String(o.label ?? '').trim()
    if (!label) continue
    const options = Array.isArray(o.options)
      ? o.options.map((opt) => String(opt ?? '').trim()).filter(Boolean)
      : typeof o.options === 'string'
        ? String(o.options)
            .split(/[\n,]/)
            .map((opt) => opt.trim())
            .filter(Boolean)
        : []
    out.push({
      id: String(o.id ?? '').trim() || newMeasFieldId(),
      label,
      type: normalizeMeasFieldType(o.type),
      options,
      required: o.required !== false,
    })
  }
  return out
}

export function measFieldTypeLabel(type: ItpMeasFieldType): string {
  return ITP_MEAS_FIELD_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? 'Text box'
}
