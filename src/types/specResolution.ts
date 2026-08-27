import type {
  ModelNomenclatureRuleRow,
  OrificeRow,
  SpecDocumentRow,
  SpringSpecRow,
  ValveSeriesRow,
} from './manufacturerSpec'

/** Citation attached to every resolved value. */
export type SpecFieldSource = {
  documentId: string
  documentTitle: string
  edition: string | null
  /** Physical PDF page (1-based) — used by proxy deep links. */
  sourcePage: number
  /** Label printed on the page (e.g. "C-12") for human navigation. */
  printedPageLabel: string | null
  /** Stable auditable proxy URL (Edge Function), not a raw signed URL. */
  citationUrl: string | null
  externalUrl: string | null
  specTable: string
  specRowId: string
}

export type ResolvedSpecField<T = string | number | null> = {
  value: T
  unit: string | null
  source: SpecFieldSource | null
  confidence: number | null
  needsReview: boolean
  reviewReason?: string
}

export type SpecResolutionInput = {
  manufacturerId: string
  modelCode?: string | null
  /** Separate size code e.g. "2.5J4" when not embedded in modelCode. */
  sizeCode?: string | null
  seriesId?: string | null
  orificeDesignation?: string | null
  sizeInlet?: string | null
  /** Cold Differential Test Pressure — primary spring lookup input. */
  cdtp: number
  /** Hot set pressure — used only when CDTP must be derived via temp correction. */
  setPressure?: number | null
  asmeSection: 'I' | 'VIII' | string
  operatingTempF?: number | null
  backpressure?: number | null
  seatType?: 'metal' | 'soft' | string | null
}

export type DecodedModelFields = {
  seriesId: string | null
  orificeDesignation: string | null
  /** Parsed spring material suffix e.g. "121", "151", "921". */
  springMaterialCode: string | null
  /** Separate inlet x orifice x outlet code e.g. "2.5J4". */
  sizeCode: string | null
  /** AG pilot configs like "2730546/S1" — lookup key, not regex-parsed. */
  lookupKey: string | null
  rawSegments: Record<string, string>
  ruleId: string | null
}

/** Phase 1 resolver output — spring only; other fields added in later phases. */
export type SpecResolution = {
  resolverVersion: string
  resolvedAt: string
  manufacturerId: string
  decoded: DecodedModelFields
  series: ResolvedSpecField<string> | null
  orifice: ResolvedSpecField<string> | null
  springPartNumber: ResolvedSpecField<string> | null
  /** All matching spring rows when genuinely ambiguous (ties after ranking). */
  springCandidates: SpringSpecRow[]
  /** Full spring row id when a single winner is selected (for snapshot FK). */
  springSpecRowId: string | null
  needsReview: boolean
  reviewNotes: string[]
}

export type SpecResolutionContext = {
  series: ValveSeriesRow[]
  orifices: OrificeRow[]
  nomenclatureRules: ModelNomenclatureRuleRow[]
  springSpecs: SpringSpecRow[]
  documentsById: Map<string, SpecDocumentRow>
  /** Base URL for spec-doc-page Edge Function (no trailing slash). */
  specDocProxyBaseUrl?: string | null
}
