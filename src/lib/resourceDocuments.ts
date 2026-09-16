import { supabase } from './supabase'

export const RESOURCE_DOCS_BUCKET = 'valve-attachments'

export type ResourceDocumentScope = 'general' | 'valve_type'
export type ResourceDocumentCategory =
  | 'general'
  | 'weld_procedure'
  | 'quality_control'
  | 'iom'
  | 'maintenance_manual'
  | 'employee_training'
  | 'relief_valve_spec_book'
  | 'mtr'
  | 'other'

export const MTR_KINDS = [
  { value: 'valve', label: 'Valves' },
  { value: 'filler_metal', label: 'Filler Metals' },
  { value: 'material', label: 'Material' },
] as const
export type MtrKind = (typeof MTR_KINDS)[number]['value']

export function mtrKindLabel(kind: string | null | undefined): string {
  const found = MTR_KINDS.find((row) => row.value === kind)
  return found?.label ?? (String(kind ?? '').trim() || '—')
}

/** Normalize typed MTR numbers. `47` and `mtr-47` become `MTR-000047`. */
export function normalizeMtrNumber(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  const match = /^(?:mtr[\s-]*)?(\d+)$/i.exec(trimmed)
  if (match) return `MTR-${match[1].padStart(6, '0')}`
  return trimmed.replace(/\s+/g, ' ')
}

export function parseMtrSequence(raw: string | null | undefined): number | null {
  const normalized = normalizeMtrNumber(raw)
  const match = /^MTR-(\d+)$/i.exec(normalized)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

export function nextMtrNumber(existing: Array<string | null | undefined>): string {
  let max = 0
  for (const value of existing) {
    const n = parseMtrSequence(value)
    if (n != null && n > max) max = n
  }
  return `MTR-${String(max + 1).padStart(6, '0')}`
}

export async function allocateMtrNumber(
  manual?: string | null,
  options?: { excludeId?: number | string },
): Promise<{ number: string; error: string | null }> {
  const typed = normalizeMtrNumber(manual)
  const { data, error } = await supabase
    .from('resource_documents')
    .select('id,mtr_number')
    .eq('category', 'mtr')
    .limit(2000)
  if (error) {
    if (/mtr_number|schema cache|column/i.test(error.message)) {
      return {
        number: '',
        error: 'Run supabase/migration-resource-documents-mtr-numbers.sql in Supabase SQL Editor first.',
      }
    }
    return { number: '', error: error.message }
  }
  const rows = (data ?? []) as Array<{ id?: number | string; mtr_number?: string | null }>
  const existing = rows
    .filter((row) => String(row.id ?? '') !== String(options?.excludeId ?? ''))
    .map((row) => String(row.mtr_number ?? ''))
  if (typed) {
    const clash = existing.some((value) => {
      const other = normalizeMtrNumber(value)
      return Boolean(other) && other.toLowerCase() === typed.toLowerCase()
    })
    if (clash) return { number: '', error: `${typed} is already used.` }
    return { number: typed, error: null }
  }
  return { number: nextMtrNumber(existing), error: null }
}

export function compareMtrDocuments(
  a: { mtr_number?: string | null; title: string },
  b: { mtr_number?: string | null; title: string },
): number {
  const aSeq = parseMtrSequence(a.mtr_number)
  const bSeq = parseMtrSequence(b.mtr_number)
  if (aSeq != null && bSeq != null && aSeq !== bSeq) return aSeq - bSeq
  if (aSeq != null && bSeq == null) return -1
  if (aSeq == null && bSeq != null) return 1
  const byNumber = String(a.mtr_number ?? '').localeCompare(String(b.mtr_number ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (byNumber !== 0) return byNumber
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

export type MtrDetailFields = {
  size?: string | null
  pressure?: string | null
  bodyHeat?: string | null
  bonnetHeat?: string | null
  material?: string | null
  length?: string | null
  od?: string | null
  insideDia?: string | null
  fillerClassification?: string | null
  valveType?: string | null
}

export function buildMtrColumnPayload(kind: MtrKind | '' | null | undefined, fields: MtrDetailFields) {
  const size = trimOrNull(fields.size)
  const pressure = trimOrNull(fields.pressure)
  const bodyHeat = trimOrNull(fields.bodyHeat)
  const bonnetHeat = trimOrNull(fields.bonnetHeat)
  const material = trimOrNull(fields.material)
  const length = trimOrNull(fields.length)
  const od = trimOrNull(fields.od)
  const insideDia = trimOrNull(fields.insideDia)
  const fillerClassification = trimOrNull(fields.fillerClassification)
  const valveType = trimOrNull(fields.valveType)

  if (kind === 'valve') {
    return {
      product_valve_type: valveType,
      filler_metal: null as string | null,
      heat_lot: bodyHeat,
      mtr_size: size,
      mtr_pressure: pressure,
      mtr_body_heat: bodyHeat,
      mtr_bonnet_heat: bonnetHeat,
      mtr_material: null as string | null,
      mtr_length: null as string | null,
      mtr_od: null as string | null,
      mtr_inside_dia: null as string | null,
    }
  }
  if (kind === 'filler_metal') {
    return {
      product_valve_type: null as string | null,
      filler_metal: fillerClassification,
      heat_lot: null as string | null,
      mtr_size: size,
      mtr_pressure: null as string | null,
      mtr_body_heat: null as string | null,
      mtr_bonnet_heat: null as string | null,
      mtr_material: material,
      mtr_length: null as string | null,
      mtr_od: null as string | null,
      mtr_inside_dia: null as string | null,
    }
  }
  if (kind === 'material') {
    return {
      product_valve_type: null as string | null,
      filler_metal: material,
      heat_lot: null as string | null,
      mtr_size: null as string | null,
      mtr_pressure: null as string | null,
      mtr_body_heat: null as string | null,
      mtr_bonnet_heat: null as string | null,
      mtr_material: material,
      mtr_length: length,
      mtr_od: od,
      mtr_inside_dia: insideDia,
    }
  }
  return {
    product_valve_type: null as string | null,
    filler_metal: null as string | null,
    heat_lot: null as string | null,
    mtr_size: null as string | null,
    mtr_pressure: null as string | null,
    mtr_body_heat: null as string | null,
    mtr_bonnet_heat: null as string | null,
    mtr_material: null as string | null,
    mtr_length: null as string | null,
    mtr_od: null as string | null,
    mtr_inside_dia: null as string | null,
  }
}

export function validateMtrDetails(kind: MtrKind | '' | null | undefined, fields: MtrDetailFields): string | null {
  if (!kind) return 'Choose a material type'
  if (kind === 'valve') {
    if (
      !trimOrNull(fields.size) ||
      !trimOrNull(fields.pressure) ||
      !trimOrNull(fields.valveType) ||
      !trimOrNull(fields.bodyHeat) ||
      !trimOrNull(fields.bonnetHeat)
    ) {
      return 'Valve MTRs need size, pressure, type, body heat number, and bonnet heat number'
    }
    return null
  }
  if (kind === 'material') {
    if (!trimOrNull(fields.material) || !trimOrNull(fields.length) || !trimOrNull(fields.od) || !trimOrNull(fields.insideDia)) {
      return 'Material MTRs need material type, length, OD, and ID'
    }
    return null
  }
  if (kind === 'filler_metal') {
    if (!trimOrNull(fields.fillerClassification) || !trimOrNull(fields.material) || !trimOrNull(fields.size)) {
      return 'Filler metal MTRs need filler classification, material, and size'
    }
    return null
  }
  return 'Choose a material type'
}

export function formatMtrDetails(
  row: Pick<
    ResourceDocumentRow,
    | 'mtr_kind'
    | 'product_valve_type'
    | 'filler_metal'
    | 'heat_lot'
    | 'mtr_size'
    | 'mtr_pressure'
    | 'mtr_body_heat'
    | 'mtr_bonnet_heat'
    | 'mtr_material'
    | 'mtr_length'
    | 'mtr_od'
    | 'mtr_inside_dia'
  >,
): string {
  if (row.mtr_kind === 'valve') {
    const parts = [
      row.mtr_size,
      row.mtr_pressure,
      row.product_valve_type,
      row.mtr_body_heat ? `body ${row.mtr_body_heat}` : row.heat_lot ? `heat ${row.heat_lot}` : '',
      row.mtr_bonnet_heat ? `bonnet ${row.mtr_bonnet_heat}` : '',
    ]
    return parts.filter((value) => String(value ?? '').trim()).join(' · ') || '—'
  }
  if (row.mtr_kind === 'material') {
    const grade = row.mtr_material || row.filler_metal
    const parts = [
      grade,
      row.mtr_length ? `L ${row.mtr_length}` : '',
      row.mtr_od ? `OD ${row.mtr_od}` : '',
      row.mtr_inside_dia ? `ID ${row.mtr_inside_dia}` : '',
    ]
    return parts.filter((value) => String(value ?? '').trim()).join(' · ') || '—'
  }
  if (row.mtr_kind === 'filler_metal') {
    const parts = [row.filler_metal, row.mtr_material, row.mtr_size]
    return parts.filter((value) => String(value ?? '').trim()).join(' · ') || '—'
  }
  return '—'
}

export const WPS_TYPES = ['Joint', 'Corrosion Resistant Overlay', 'Hardface Overlay'] as const
export type WpsType = (typeof WPS_TYPES)[number]

export const WELD_PROCESSES = ['GTAW', 'GMAW', 'SMAW', 'SAW', 'FCAW'] as const
export type WeldProcess = (typeof WELD_PROCESSES)[number]

export const WELD_MODES = ['Manual', 'Machine'] as const
export type WeldMode = (typeof WELD_MODES)[number]

export const BASE_METAL_CATEGORIES = [
  'Carbon/P1',
  'P4/F11',
  'P4A/F22',
  'P5/C5',
  'P5B/C12',
  'P15E/F91',
  'P8/300 Series Stainless',
  'P6/400 Series Stainless',
  'Other',
] as const
export type BaseMetalCategory = (typeof BASE_METAL_CATEGORIES)[number]

export type ResourceDocumentRow = {
  id: number
  scope: ResourceDocumentScope
  valve_type: string | null
  category: ResourceDocumentCategory
  title: string
  notes: string
  storage_path: string
  file_name: string
  mime_type: string | null
  created_at: string
  updated_at: string
  // Weld procedure fields
  wps_type: WpsType | null
  weld_processes: WeldProcess[]
  weld_modes: WeldMode[]
  filler_metal: string | null
  base_metal_category: BaseMetalCategory | null
  manufacturer: string | null
  product_valve_type: string | null
  base_metal_thickness_qualified: string | null
  filler_metal_thickness_qualified: string | null
  post_weld_heat_treat_required: boolean
  pwht_temperature: string | null
  pwht_time: string | null
  hf_approved: boolean
  // Procedure fields
  sop_number: string | null
  revision_number: string | null
  date_updated: string | null
  proc_category: 'Valve-Specific' | 'NDE' | 'Other' | 'Test' | 'Answer Key' | null
  mtr_kind: MtrKind | null
  heat_lot: string | null
  mtr_number: string | null
  mtr_size: string | null
  mtr_pressure: string | null
  mtr_body_heat: string | null
  mtr_bonnet_heat: string | null
  mtr_material: string | null
  mtr_length: string | null
  mtr_od: string | null
  mtr_inside_dia: string | null
}

/** Title / file / notes / manufacturer / SOP search used on Resources lists. */
export function resourceDocumentMatchesQuery(
  row: Pick<
    ResourceDocumentRow,
    | 'title'
    | 'notes'
    | 'file_name'
    | 'manufacturer'
    | 'product_valve_type'
    | 'sop_number'
    | 'revision_number'
    | 'proc_category'
    | 'valve_type'
    | 'mtr_kind'
    | 'heat_lot'
    | 'filler_metal'
    | 'mtr_number'
    | 'mtr_size'
    | 'mtr_pressure'
    | 'mtr_body_heat'
    | 'mtr_bonnet_heat'
    | 'mtr_material'
    | 'mtr_length'
    | 'mtr_od'
    | 'mtr_inside_dia'
  >,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const compactQ = q.replace(/\s+/g, '')
  const hay = [
    row.title,
    row.notes,
    row.file_name,
    row.manufacturer,
    row.product_valve_type,
    row.sop_number,
    row.revision_number,
    row.proc_category,
    row.valve_type,
    row.mtr_kind,
    mtrKindLabel(row.mtr_kind),
    row.heat_lot,
    row.filler_metal,
    row.mtr_number,
    row.mtr_size,
    row.mtr_pressure,
    row.mtr_body_heat,
    row.mtr_bonnet_heat,
    row.mtr_material,
    row.mtr_length,
    row.mtr_od,
    row.mtr_inside_dia,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
  const compactTitle = row.title.replace(/\s+/g, '').toLowerCase()
  return hay.includes(q) || (compactQ.length >= 2 && compactTitle.includes(compactQ))
}

const MAX_BYTES = 40 * 1024 * 1024

function safePathToken(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fileExt(name: string) {
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  const ext = name.slice(idx).toLowerCase()
  return ext.length <= 12 ? ext : ''
}

export function resourceDocumentPublicUrl(storagePath: string) {
  const { data } = supabase.storage.from(RESOURCE_DOCS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function uploadResourceDocument(args: {
  file: File
  scope: ResourceDocumentScope
  valveType?: string | null
  category: ResourceDocumentCategory
  title: string
  notes?: string
  wpsType?: WpsType | null
  weldProcesses?: WeldProcess[]
  weldModes?: WeldMode[]
  fillerMetal?: string
  baseMetalCategory?: BaseMetalCategory | null
  manufacturer?: string | null
  productValveType?: string | null
  baseMetalThicknessQualified?: string
  fillerMetalThicknessQualified?: string
  postWeldHeatTreatRequired?: boolean
  pwhtTemperature?: string
  pwhtTime?: string
  hfApproved?: boolean
  // Procedure fields
  sopNumber?: string
  revisionNumber?: string
  dateUpdated?: string | null
  procCategory?: 'Valve-Specific' | 'NDE' | 'Other' | 'Test' | 'Answer Key' | null
  mtrKind?: MtrKind | null
  heatLot?: string | null
  mtrNumber?: string | null
  mtrDetails?: MtrDetailFields
}): Promise<{ error: string | null }> {
  const { file, scope, category } = args
  const title = args.title.trim()
  const valveType = (args.valveType ?? '').trim()
  const notes = (args.notes ?? '').trim()

  if (file.size > MAX_BYTES) return { error: 'File is too large (max 40 MB).' }
  if (!title) return { error: 'Title is required.' }
  if (scope === 'valve_type' && !valveType) return { error: 'Choose a valve type.' }

  const scopeFolder = scope === 'general' ? 'general' : `valve-type/${safePathToken(valveType) || 'unknown'}`
  const storagePath = `resources/${scopeFolder}/${crypto.randomUUID()}${fileExt(file.name)}`

  const { error: uploadErr } = await supabase.storage.from(RESOURCE_DOCS_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadErr) return { error: uploadErr.message || 'Upload failed.' }

  const isWeld = category === 'weld_procedure'
  const isProc = category === 'general' || category === 'quality_control'
  const isMtr = category === 'mtr'
  const mtrColumns = isMtr ? buildMtrColumnPayload(args.mtrKind, args.mtrDetails ?? {}) : null
  const { error: rowErr } = await supabase.from('resource_documents').insert({
    scope,
    valve_type: scope === 'general' ? null : valveType,
    category,
    title,
    notes,
    storage_path: storagePath,
    file_name: file.name.slice(0, 500),
    mime_type: file.type || null,
    wps_type: isWeld ? (args.wpsType ?? null) : null,
    weld_processes: isWeld ? (args.weldProcesses ?? []) : [],
    weld_modes: isWeld ? (args.weldModes ?? []) : [],
    filler_metal: isWeld ? ((args.fillerMetal ?? '').trim() || null) : (mtrColumns?.filler_metal ?? null),
    base_metal_category: isWeld ? (args.baseMetalCategory ?? null) : null,
    manufacturer: args.manufacturer ?? null,
    product_valve_type: isMtr ? (mtrColumns?.product_valve_type ?? null) : (args.productValveType ?? null),
    base_metal_thickness_qualified: isWeld ? ((args.baseMetalThicknessQualified ?? '').trim() || null) : null,
    filler_metal_thickness_qualified: isWeld ? ((args.fillerMetalThicknessQualified ?? '').trim() || null) : null,
    post_weld_heat_treat_required: isWeld ? (args.postWeldHeatTreatRequired ?? false) : false,
    pwht_temperature: isWeld && args.postWeldHeatTreatRequired ? ((args.pwhtTemperature ?? '').trim() || null) : null,
    pwht_time: isWeld && args.postWeldHeatTreatRequired ? ((args.pwhtTime ?? '').trim() || null) : null,
    hf_approved: isWeld ? (args.hfApproved ?? false) : false,
    sop_number: isProc ? ((args.sopNumber ?? '').trim() || null) : null,
    revision_number: isProc ? ((args.revisionNumber ?? '').trim() || null) : null,
    date_updated: isProc ? (args.dateUpdated || null) : null,
    proc_category: isProc ? (args.procCategory ?? null) : null,
    mtr_kind: isMtr ? (args.mtrKind ?? null) : null,
    heat_lot: isMtr ? (mtrColumns?.heat_lot ?? ((args.heatLot ?? '').trim() || null)) : null,
    mtr_number: isMtr ? ((args.mtrNumber ?? '').trim() || null) : null,
    mtr_size: isMtr ? (mtrColumns?.mtr_size ?? null) : null,
    mtr_pressure: isMtr ? (mtrColumns?.mtr_pressure ?? null) : null,
    mtr_body_heat: isMtr ? (mtrColumns?.mtr_body_heat ?? null) : null,
    mtr_bonnet_heat: isMtr ? (mtrColumns?.mtr_bonnet_heat ?? null) : null,
    mtr_material: isMtr ? (mtrColumns?.mtr_material ?? null) : null,
    mtr_length: isMtr ? (mtrColumns?.mtr_length ?? null) : null,
    mtr_od: isMtr ? (mtrColumns?.mtr_od ?? null) : null,
    mtr_inside_dia: isMtr ? (mtrColumns?.mtr_inside_dia ?? null) : null,
  })

  if (rowErr) {
    await supabase.storage.from(RESOURCE_DOCS_BUCKET).remove([storagePath])
    const isdup = rowErr.code === '23505' || /duplicate|unique/i.test(rowErr.message)
    if (/mtr_kind|heat_lot|mtr_number|mtr_size|mtr_pressure|mtr_body_heat|mtr_bonnet_heat|mtr_material|mtr_length|mtr_od|mtr_inside_dia|resource_documents_category_check|uq_resource_documents_mtr_number/i.test(rowErr.message)) {
      if (/uq_resource_documents_mtr_number/i.test(rowErr.message) || (/mtr_number/i.test(rowErr.message) && isdup)) {
        return { error: `${((args.mtrNumber ?? '').trim() || 'That MTR number')} is already used.` }
      }
      if (/mtr_size|mtr_pressure|mtr_body_heat|mtr_bonnet_heat|mtr_material|mtr_length|mtr_od|mtr_inside_dia/i.test(rowErr.message)) {
        return { error: 'Run supabase/migration-resource-documents-mtr-details.sql in Supabase SQL Editor first.' }
      }
      return {
        error: /mtr_number/i.test(rowErr.message)
          ? 'Run supabase/migration-resource-documents-mtr-numbers.sql in Supabase SQL Editor first.'
          : 'Run supabase/migration-resource-documents-mtrs.sql in Supabase SQL Editor first.',
      }
    }
    return { error: isdup ? `A document named "${title}" already exists in this section. Each title must be unique.` : rowErr.message || 'Could not save document record.' }
  }

  return { error: null }
}

/** Layer 2 / traveler tables that cite a catalogued spec_documents row. */
const SPEC_DOCUMENT_CITATION_TABLES = [
  'orifices',
  'orifice_capacities',
  'model_nomenclature_rules',
  'spring_specs',
  'spring_temp_corrections',
  'traveler_spec_snapshot',
  'traveler_spec_snapshots',
  'prv_spec_snapshot',
] as const

function isMissingRelationError(message: string | undefined): boolean {
  if (!message) return false
  return (
    /relation .* does not exist/i.test(message) ||
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message)
  )
}

async function findSpecDocumentCitationLabels(specDocumentId: string): Promise<{
  labels: string[]
  error: string | null
}> {
  const labels: string[] = []

  for (const table of SPEC_DOCUMENT_CITATION_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', specDocumentId)

    if (error) {
      if (isMissingRelationError(error.message)) continue
      // traveler snapshot tables may use a different FK column name later
      if (/column .* does not exist/i.test(error.message)) {
        const alt = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('spec_document_id', specDocumentId)
        if (alt.error) {
          if (isMissingRelationError(alt.error.message) || /column .* does not exist/i.test(alt.error.message)) {
            continue
          }
          return { labels: [], error: alt.error.message }
        }
        if ((alt.count ?? 0) > 0) labels.push(`${table} (${alt.count})`)
        continue
      }
      return { labels: [], error: error.message }
    }

    if ((count ?? 0) > 0) labels.push(`${table} (${count})`)
  }

  return { labels, error: null }
}

export async function deleteResourceDocument(row: {
  id: number
  storage_path: string
  /** Defaults to valve-attachments; use for relief_valve_spec_book → spec-documents. */
  storage_bucket?: string
}): Promise<{ error: string | null }> {
  const bucket = row.storage_bucket?.trim() || RESOURCE_DOCS_BUCKET

  const { data: linkedSpecs, error: linkedErr } = await supabase
    .from('spec_documents')
    .select('id, title')
    .eq('resource_document_id', row.id)

  if (linkedErr && !isMissingRelationError(linkedErr.message)) {
    return { error: linkedErr.message || 'Could not check linked spec catalog rows.' }
  }

  const specs = linkedSpecs ?? []
  for (const spec of specs) {
    const { labels, error: citeErr } = await findSpecDocumentCitationLabels(String(spec.id))
    if (citeErr) return { error: citeErr }
    if (labels.length > 0) {
      const title = (spec.title ?? 'this document').trim() || 'this document'
      return {
        error:
          `Cannot delete “${title}”: it is catalogued and still cited by ${labels.join(', ')}. ` +
          'Remove or reassign those citations before deleting.',
      }
    }
  }

  // Cascade: catalog row(s) → library row → storage object
  if (specs.length > 0) {
    const { error: specDelErr } = await supabase
      .from('spec_documents')
      .delete()
      .eq('resource_document_id', row.id)
    if (specDelErr) {
      return { error: specDelErr.message || 'Could not remove linked spec catalog row.' }
    }
  }

  const { error: dbErr } = await supabase.from('resource_documents').delete().eq('id', row.id)
  if (dbErr) return { error: dbErr.message || 'Could not remove document row.' }

  const { error: storageErr } = await supabase.storage.from(bucket).remove([row.storage_path])
  if (storageErr) {
    return {
      error:
        `Document record deleted, but the file could not be removed from storage: ${storageErr.message}`,
    }
  }

  return { error: null }
}
