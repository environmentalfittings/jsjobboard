import type { ItpLibraryItemExec, ItpLibraryScopeItem } from '../types/itpLibraryPlan'
import type { ItpMeasFieldDef } from '../types/itpMeasFields'
import { getMeasValue } from './itpItemRequirements'
import type { Valve } from '../types'

/** Standard nameplate / basic-info fields for traveler steps like “Check nameplate data”. */
export const NAMEPLATE_TRAVELER_FIELDS: ItpMeasFieldDef[] = [
  { id: 'np_valve_id', label: 'Valve Id', type: 'text', options: [], required: true },
  { id: 'np_type', label: 'Type', type: 'text', options: [], required: true },
  { id: 'np_customer', label: 'Customer', type: 'text', options: [], required: false },
  { id: 'np_po', label: 'PO Number', type: 'text', options: [], required: false },
  { id: 'np_size', label: 'Size', type: 'text', options: [], required: true },
  { id: 'np_pressure', label: 'Pressure', type: 'text', options: [], required: true },
  { id: 'np_material', label: 'Material / body', type: 'text', options: [], required: true },
  { id: 'np_trim', label: 'Trim', type: 'text', options: [], required: false },
  { id: 'np_manufacturer', label: 'Manufacturer', type: 'text', options: [], required: false },
  { id: 'np_figure', label: 'Figure Number', type: 'text', options: [], required: false },
  { id: 'np_end_connection', label: 'End Connection', type: 'text', options: [], required: false },
  { id: 'np_due_date', label: 'Due Date', type: 'text', options: [], required: false },
]

/** Required before the nameplate step can be marked complete. */
export const NAMEPLATE_REQUIRED_FIELD_IDS = [
  'np_valve_id',
  'np_type',
  'np_size',
  'np_pressure',
  'np_material',
] as const

export function isNameplateTravelerStep(item: {
  id?: string | null
  name?: string | null
  ref?: string | null
  requireNameplate?: boolean | null
}): boolean {
  if (item.requireNameplate) return true
  const id = String(item.id ?? '').trim().toLowerCase()
  if (id === 'r2') return true
  const text = `${item.name ?? ''} ${item.ref ?? ''}`.toLowerCase()
  return /\bnameplate\b/.test(text)
}

export function mergeNameplateMeasFields(existing: ItpMeasFieldDef[]): ItpMeasFieldDef[] {
  const byId = new Map(existing.map((field) => [field.id, field]))
  for (const field of NAMEPLATE_TRAVELER_FIELDS) {
    if (!byId.has(field.id)) byId.set(field.id, field)
  }
  // Prefer nameplate field order first, then any extra configured fields.
  const ordered: ItpMeasFieldDef[] = []
  const seen = new Set<string>()
  for (const field of NAMEPLATE_TRAVELER_FIELDS) {
    const row = byId.get(field.id)
    if (row) {
      ordered.push(row)
      seen.add(row.id)
    }
  }
  for (const field of existing) {
    if (!seen.has(field.id)) ordered.push(field)
  }
  return ordered
}

export type JobCardNameplateSource = Pick<
  Valve,
  | 'valve_id'
  | 'valve_type'
  | 'customer'
  | 'size'
  | 'pressure_class'
  | 'body_material'
  | 'material_spec'
  | 'manufacturer'
  | 'netsuite_po_number'
  | 'drawing_po_number'
  | 'due_date'
> & {
  end_connection?: string | null
  figure_number?: string | null
  trim?: string | null
}

/** Map job-card / valve fields onto nameplate traveler field ids. */
export function nameplateValuesFromJobCard(valve: JobCardNameplateSource): Record<string, string> {
  const material = String(valve.body_material ?? valve.material_spec ?? '').trim()
  const po = String(valve.netsuite_po_number ?? valve.drawing_po_number ?? '').trim()
  return {
    np_valve_id: String(valve.valve_id ?? '').trim(),
    np_type: String(valve.valve_type ?? '').trim(),
    np_customer: String(valve.customer ?? '').trim(),
    np_po: po,
    np_size: String(valve.size ?? '').trim(),
    np_pressure: String(valve.pressure_class ?? '').trim(),
    np_material: material,
    np_trim: String(valve.trim ?? '').trim(),
    np_manufacturer: String(valve.manufacturer ?? '').trim(),
    np_figure: String(valve.figure_number ?? '').trim(),
    np_end_connection: String(valve.end_connection ?? '').trim(),
    np_due_date: String(valve.due_date ?? '').trim().slice(0, 10),
  }
}

export function nameplateFieldsComplete(exec: ItpLibraryItemExec): boolean {
  return NAMEPLATE_REQUIRED_FIELD_IDS.every((id) => getMeasValue(exec, id).trim().length > 0)
}

export function nameplateIncompleteReason(exec: ItpLibraryItemExec): string | null {
  if (nameplateFieldsComplete(exec)) return null
  const missing = NAMEPLATE_REQUIRED_FIELD_IDS.filter((id) => !getMeasValue(exec, id).trim()).map((id) => {
    const field = NAMEPLATE_TRAVELER_FIELDS.find((row) => row.id === id)
    return field?.label ?? id
  })
  return `Fill or transfer nameplate data before completing (${missing.join(', ')})`
}

export function scopeItemIsNameplate(item: Pick<ItpLibraryScopeItem, 'id' | 'name' | 'ref'>): boolean {
  return isNameplateTravelerStep(item)
}
