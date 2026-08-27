/** Layer 1 — source document metadata (promoted from resource_documents). */
export type SpecDocumentType =
  | 'spring_chart'
  | 'catalog'
  | 'maintenance_manual'
  | 'critical_dimensions'
  | 'code'
  | 'national_board'
  | 'bulletin'

export type SpecDocumentStatus = 'active' | 'superseded'

export type SpecDocumentRow = {
  id: string
  manufacturer_id: string
  resource_document_id: number | null
  title: string
  doc_type: SpecDocumentType
  edition_label: string | null
  revision_label: string | null
  effective_date: string | null
  superseded_by_id: string | null
  page_count: number | null
  external_url: string | null
  notes: string | null
  status: SpecDocumentStatus
  created_at: string
  updated_at: string
  /** Joined from resource_documents when loaded for resolver / proxy. */
  storage_path?: string | null
}

/** Shared provenance columns on every Layer 2 spec table. */
export type SpecProvenance = {
  source_document_id: string | null
  source_page: number | null
  printed_page_label: string | null
  source_quote: string | null
  source_bbox: { x: number; y: number; w: number; h: number } | null
  extraction_method: 'manual' | 'ai_assisted' | 'imported'
  confidence: number | null
  status: 'draft' | 'in_review' | 'approved' | 'superseded'
  verified_by: string | null
  verified_at: string | null
  superseded_by_id: string | null
}

export type ManufacturerRow = {
  id: string
  name: string
  slug: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ManufacturerAliasRow = {
  id: string
  manufacturer_id: string
  alias_text: string
  normalized_alias: string
  notes: string | null
  created_at: string
}

export type ValveSeriesRow = {
  id: string
  manufacturer_id: string
  name: string
  design_code_basis: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type OrificeRow = SpecProvenance & {
  id: string
  manufacturer_id: string | null
  designation: string
  effective_area_sq_in: number | null
  is_api_standard: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type OrificeCapacityRow = SpecProvenance & {
  id: string
  manufacturer_id: string
  valve_series_id: string | null
  orifice_id: string
  kd: number | null
  api_area_sq_in: number | null
  rated_capacity_air_scfm: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type NomenclatureSegmentMap = Record<
  string,
  {
    field:
      | 'orifice'
      | 'spring_code'
      | 'spring_material_code'
      | 'size_code'
      | 'bonnet'
      | 'options'
      | 'lookup_key'
      | string
    label?: string
  }
>

export type ModelNomenclatureRuleRow = SpecProvenance & {
  id: string
  valve_series_id: string
  pattern: string
  segment_map: NomenclatureSegmentMap
  notes: string | null
  created_at: string
  updated_at: string
}

export type SpringService = 'section_I' | 'section_VIII' | 'both'

export type SpringSpecRow = SpecProvenance & {
  id: string
  manufacturer_id: string
  valve_series_id: string | null
  orifice_id: string | null
  spring_part_number: string | null
  spring_material_code: string | null
  set_pressure_min: number
  set_pressure_max: number
  pressure_unit: string
  reference_temp_f: number
  material: string | null
  color_code: string | null
  inlet_size_constraint: string | null
  service: SpringService
  notes: string | null
  created_at: string
  updated_at: string
}

export type SpringTempCorrectionKind = 'factor' | 'delta_psi'

export type SpringTempCorrectionRow = SpecProvenance & {
  id: string
  valve_series_id: string
  temp_low_f: number
  temp_high_f: number
  correction_kind: SpringTempCorrectionKind
  correction_value: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type SpecDocumentPageViewRow = {
  id: string
  spec_document_id: string
  user_id: string | null
  source_page: number
  printed_page_label: string | null
  viewed_at: string
}
