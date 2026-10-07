/** Supported technician input controls on an ITP / traveler line. */
import { LOOKUP_CATEGORY_DEFS, isLookupCategory, type LookupCategory } from '../constants/lookupCategories'

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
export type ItpMeasOptionSource = 'custom' | 'manufacturers' | 'lookup'

/** Job-card / valve field used to prefill this traveler input. */
export type ItpJobCardFieldKey =
  | 'customer'
  | 'size'
  | 'pressure_class'
  | 'body_material'
  | 'due_date'
  | 'valve_type'
  | 'valve_id'
  | 'manufacturer'
  | 'po_number'

export const ITP_JOB_CARD_FIELD_OPTIONS: { value: ItpJobCardFieldKey; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'size', label: 'Size' },
  { value: 'pressure_class', label: 'Pressure class' },
  { value: 'body_material', label: 'Body material' },
  { value: 'due_date', label: 'Due date' },
  { value: 'valve_type', label: 'Valve type' },
  { value: 'valve_id', label: 'Valve ID' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'po_number', label: 'PO number' },
]

const JOB_CARD_KEY_SET = new Set<string>(ITP_JOB_CARD_FIELD_OPTIONS.map((row) => row.value))

export function normalizeStoredJobCardField(raw: unknown): ItpJobCardFieldKey | 'none' | undefined {
  const value = String(raw ?? '').trim()
  if (value === 'none') return 'none'
  if (JOB_CARD_KEY_SET.has(value)) return value as ItpJobCardFieldKey
  return undefined
}

export function inferJobCardField(label: string): ItpJobCardFieldKey | undefined {
  const text = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
  if (!text) return undefined
  if (/due\s*date/.test(text)) return 'due_date'
  if (/pressure/.test(text)) return 'pressure_class'
  if (/body\s*mat|material spec|^material$|body material|material/.test(text)) return 'body_material'
  if (/^customer$|customer name/.test(text)) return 'customer'
  if (/^size$|valve size/.test(text)) return 'size'
  if (/valve\s*type|^type$/.test(text)) return 'valve_type'
  if (/manufactur|^mfr$/.test(text)) return 'manufacturer'
  if (/valve\s*id|\bwo\b|work order/.test(text)) return 'valve_id'
  if (/\bpo\b|purchase order/.test(text)) return 'po_number'
  return undefined
}

export type ItpMeasFieldDef = {
  id: string
  label: string
  /** Input control type. Defaults to text when missing (legacy rows). */
  type: ItpMeasFieldType
  /** Dropdown choices (ignored for other types). */
  options: string[]
  /** When false, step can complete without this field. Default true. */
  required: boolean
  /**
   * Where dropdown choices come from.
   * Unset = infer (Manufacturer-labeled dropdowns use the manufacturers table).
   */
  optionSource?: ItpMeasOptionSource
  /**
   * Prefill this input from the job card.
   * Unset = infer from the label (Size, Customer, Due Date, …).
   * `'none'` disables prefill even when the label matches.
   */
  jobCardField?: ItpJobCardFieldKey | 'none'
  /**
   * Picture fields: how many photos the technician may attach.
   * Optional fields can still be left empty. Required fields need at least one.
   */
  maxPhotos?: number
  /** When optionSource is `lookup`, which Admin → Job field list to use. */
  lookupCategory?: LookupCategory
  /**
   * Dropdown follow-up: when the selected value matches (e.g. BWE), require another input.
   */
  followUpWhen?: string
  followUpLabel?: string
  /** When set, the follow-up is a dropdown from this Job field list. Otherwise a text box. */
  followUpLookupCategory?: LookupCategory
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

export const MEAS_PICTURE_MAX = 20
export const DEFAULT_PICTURE_FIELD_MAX = 4

export function pictureFieldMax(field: Pick<ItpMeasFieldDef, 'type' | 'maxPhotos'> | undefined): number {
  if (!field || field.type !== 'picture') return 1
  const n = Number(field.maxPhotos)
  if (Number.isFinite(n) && n > 0) return Math.min(MEAS_PICTURE_MAX, Math.floor(n))
  return DEFAULT_PICTURE_FIELD_MAX
}

export function measFieldTypePatch(
  field: Pick<ItpMeasFieldDef, 'maxPhotos'>,
  type: ItpMeasFieldType,
): Partial<ItpMeasFieldDef> {
  if (type === 'picture') {
    return { type, maxPhotos: pictureFieldMax({ type: 'picture', maxPhotos: field.maxPhotos }) }
  }
  return { type }
}

export function clampPictureFieldMax(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PICTURE_FIELD_MAX
  return Math.min(MEAS_PICTURE_MAX, Math.floor(n))
}

export function clampLinePhotoMin(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(MEAS_PICTURE_MAX, Math.floor(n))
}

/** Line-level photo cap. Missing values default to 4, and never go below the required count. */
export function clampLinePhotoMax(raw: unknown, minPhotos: unknown = 1): number {
  const min = clampLinePhotoMin(minPhotos)
  const n = Number(raw)
  const max =
    raw == null || raw === '' || !Number.isFinite(n) || n < 1
      ? DEFAULT_PICTURE_FIELD_MAX
      : Math.min(MEAS_PICTURE_MAX, Math.floor(n))
  return Math.max(min, max)
}

export function normalizeLinePhotoCounts(
  minRaw: unknown,
  maxRaw: unknown,
): { minPhotos: number; maxPhotos: number } {
  const minPhotos = clampLinePhotoMin(minRaw)
  return { minPhotos, maxPhotos: clampLinePhotoMax(maxRaw, minPhotos) }
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

function dropdownPersistPatch(partial?: Partial<ItpMeasFieldDef>): Partial<ItpMeasFieldDef> {
  const type = normalizeMeasFieldType(partial?.type)
  if (type !== 'dropdown') return {}
  const lookupCategory = fieldLookupCategory(partial)
  const optionSource = dropdownOptionSource({
    type: 'dropdown',
    label: String(partial?.label ?? ''),
    optionSource: partial?.optionSource,
    lookupCategory,
  })
  const followUpWhen = String(partial?.followUpWhen ?? '').trim()
  const followUpLabel = String(partial?.followUpLabel ?? '').trim()
  const followUpLookupCategory = isLookupCategory(partial?.followUpLookupCategory)
    ? partial!.followUpLookupCategory
    : undefined
  return {
    optionSource,
    ...(optionSource === 'lookup' && lookupCategory ? { lookupCategory } : {}),
    ...(followUpWhen
      ? {
          followUpWhen,
          followUpLabel: followUpLabel || 'Details',
          ...(followUpLookupCategory ? { followUpLookupCategory } : {}),
        }
      : {}),
  }
}

export function emptyMeasField(partial?: Partial<ItpMeasFieldDef>): ItpMeasFieldDef {
  const jobCardField = normalizeStoredJobCardField(partial?.jobCardField)
  const type = normalizeMeasFieldType(partial?.type)
  return {
    id: partial?.id?.trim() || newMeasFieldId(),
    label: String(partial?.label ?? ''),
    type,
    options: Array.isArray(partial?.options)
      ? partial!.options.map((opt) => String(opt).trim()).filter(Boolean)
      : [],
    required: partial?.required !== false,
    ...(jobCardField ? { jobCardField } : {}),
    ...(type === 'picture' ? { maxPhotos: clampPictureFieldMax(partial?.maxPhotos) } : {}),
    ...dropdownPersistPatch(partial),
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
    out.push(
      emptyMeasField({
        ...o,
        id: String(o.id ?? '').trim() || newMeasFieldId(),
        label,
        options,
        required: o.required !== false,
      }),
    )
  }
  return out
}

export function measFieldTypeLabel(type: ItpMeasFieldType): string {
  return ITP_MEAS_FIELD_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? 'Text box'
}

export function looksLikeManufacturerLabel(label: string): boolean {
  return /manufactur/i.test(String(label ?? '').trim())
}

export function fieldLookupCategory(
  field: Pick<ItpMeasFieldDef, 'optionSource' | 'lookupCategory'> | undefined,
): LookupCategory | undefined {
  if (!field) return undefined
  if (isLookupCategory(field.lookupCategory)) return field.lookupCategory
  if (isLookupCategory(field.optionSource)) return field.optionSource
  return undefined
}

/** Resolve where a dropdown should get its choices. */
export function dropdownOptionSource(
  field: Pick<ItpMeasFieldDef, 'label' | 'type' | 'optionSource' | 'lookupCategory'>,
): ItpMeasOptionSource {
  if (field.type !== 'dropdown') return 'custom'
  if (field.optionSource === 'manufacturers') return 'manufacturers'
  if (field.optionSource === 'lookup' || fieldLookupCategory(field)) return 'lookup'
  if (field.optionSource === 'custom') return 'custom'
  return looksLikeManufacturerLabel(field.label) ? 'manufacturers' : 'custom'
}

export function dropdownSourceSelectValue(field: ItpMeasFieldDef): string {
  const src = dropdownOptionSource(field)
  if (src === 'lookup') {
    const cat = fieldLookupCategory(field)
    return cat ? `lookup:${cat}` : 'custom'
  }
  return src
}

export function patchFromDropdownSourceSelect(value: string): Partial<ItpMeasFieldDef> {
  if (value === 'manufacturers') {
    return { optionSource: 'manufacturers', lookupCategory: undefined, options: [] }
  }
  if (value.startsWith('lookup:')) {
    const lookupCategory = value.slice('lookup:'.length)
    if (isLookupCategory(lookupCategory)) {
      return { optionSource: 'lookup', lookupCategory, options: [] }
    }
  }
  return { optionSource: 'custom', lookupCategory: undefined }
}

export function lookupListLabel(category: LookupCategory | undefined): string {
  if (!category) return 'Job field list'
  return LOOKUP_CATEGORY_DEFS.find((row) => row.key === category)?.label ?? category
}

export function resolveDropdownChoices(
  field: ItpMeasFieldDef,
  lists: { manufacturers?: string[]; lookups?: Partial<Record<LookupCategory, string[]>> },
): string[] {
  const src = dropdownOptionSource(field)
  if (src === 'manufacturers') return (lists.manufacturers ?? []).map((name) => name.trim()).filter(Boolean)
  const cat = src === 'lookup' ? fieldLookupCategory(field) : undefined
  if (cat) {
    const fromList = lists.lookups?.[cat]
    if (fromList && fromList.length > 0) return fromList.map((opt) => String(opt).trim()).filter(Boolean)
    return [...(LOOKUP_CATEGORY_DEFS.find((row) => row.key === cat)?.fallback ?? [])]
  }
  return (field.options ?? []).map((opt) => String(opt).trim()).filter(Boolean)
}

export function followUpFieldId(fieldId: string): string {
  return `${fieldId}__followup`
}

export function followUpApplies(field: Pick<ItpMeasFieldDef, 'followUpWhen'>, value: string): boolean {
  const when = String(field.followUpWhen ?? '').trim()
  if (!when) return false
  return String(value ?? '').trim().toLowerCase() === when.toLowerCase()
}

export function followUpLabelOf(field: Pick<ItpMeasFieldDef, 'followUpLabel' | 'followUpWhen'>): string {
  return String(field.followUpLabel ?? '').trim() || String(field.followUpWhen ?? '').trim() || 'Details'
}

export function resolveJobCardField(
  field: Pick<ItpMeasFieldDef, 'label' | 'jobCardField'>,
): ItpJobCardFieldKey | undefined {
  if (field.jobCardField === 'none') return undefined
  if (field.jobCardField) return field.jobCardField
  return inferJobCardField(field.label)
}

/** Persist an explicit mapping (or 'none') so fill-out can prefill from the job card. */
export function withPersistedJobCardField(field: ItpMeasFieldDef): ItpMeasFieldDef {
  if (field.jobCardField === 'none') return { ...field, jobCardField: 'none' }
  const resolved = resolveJobCardField(field)
  if (resolved) return { ...field, jobCardField: resolved }
  if (!field.jobCardField) return field
  const next = { ...field }
  delete next.jobCardField
  return next
}
