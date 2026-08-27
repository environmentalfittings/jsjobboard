import type {
  ModelNomenclatureRuleRow,
  OrificeRow,
  SpecDocumentRow,
  SpringSpecRow,
  SpringService,
} from '../types/manufacturerSpec'
import type {
  DecodedModelFields,
  ResolvedSpecField,
  SpecResolution,
  SpecResolutionContext,
  SpecResolutionInput,
  SpecFieldSource,
} from '../types/specResolution'

function needsReviewField<T>(
  reviewReason: string,
  value: T = null as T,
): ResolvedSpecField<T> {
  return {
    value,
    unit: null,
    source: null,
    confidence: null,
    needsReview: true,
    reviewReason,
  }
}

function mapAsmeSectionToService(section: string): SpringService {
  const normalized = section.trim().toUpperCase()
  if (normalized.includes('VIII') || normalized === '8') return 'section_VIII'
  if (normalized.includes('I') && !normalized.includes('VIII')) return 'section_I'
  return 'both'
}

function buildCitationUrl(
  proxyBase: string | null | undefined,
  documentId: string,
  sourcePage: number,
): string | null {
  if (!proxyBase?.trim()) return null
  const base = proxyBase.replace(/\/+$/, '')
  return `${base}/doc/${documentId}/page/${sourcePage}`
}

function buildSource(
  row: SpringSpecRow | ModelNomenclatureRuleRow,
  table: string,
  doc: SpecDocumentRow | undefined,
  proxyBase: string | null | undefined,
): SpecFieldSource | null {
  if (!row.source_document_id || !row.source_page || !doc) return null
  return {
    documentId: doc.id,
    documentTitle: doc.title,
    edition: doc.edition_label,
    sourcePage: row.source_page,
    printedPageLabel: row.printed_page_label ?? null,
    citationUrl: buildCitationUrl(proxyBase, doc.id, row.source_page),
    externalUrl: doc.external_url,
    specTable: table,
    specRowId: row.id,
  }
}

function decodeModelCode(
  modelCode: string,
  rules: ModelNomenclatureRuleRow[],
): { decoded: DecodedModelFields; rule: ModelNomenclatureRuleRow | null } {
  const trimmed = modelCode.trim()
  const empty: DecodedModelFields = {
    seriesId: null,
    orificeDesignation: null,
    springMaterialCode: null,
    sizeCode: null,
    lookupKey: null,
    rawSegments: {},
    ruleId: null,
  }
  if (!trimmed) return { decoded: empty, rule: null }

  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern)
      const match = trimmed.match(re)
      if (!match?.groups) continue

      const rawSegments: Record<string, string> = {}
      let orificeDesignation: string | null = null
      let springMaterialCode: string | null = null
      let sizeCode: string | null = null
      let lookupKey: string | null = null

      for (const [groupName, groupValue] of Object.entries(match.groups)) {
        if (!groupValue) continue
        rawSegments[groupName] = groupValue
        const mapping = rule.segment_map[groupName]
        if (!mapping) continue
        if (mapping.field === 'orifice') orificeDesignation = groupValue
        if (mapping.field === 'spring_code' || mapping.field === 'spring_material_code') {
          springMaterialCode = groupValue
        }
        if (mapping.field === 'size_code') sizeCode = groupValue
        if (mapping.field === 'lookup_key') lookupKey = groupValue
      }

      return {
        rule,
        decoded: {
          seriesId: rule.valve_series_id,
          orificeDesignation,
          springMaterialCode,
          sizeCode,
          lookupKey,
          rawSegments,
          ruleId: rule.id,
        },
      }
    } catch {
      continue
    }
  }

  return { decoded: empty, rule: null }
}

function resolveOrifice(
  designation: string | null | undefined,
  orifices: OrificeRow[],
  manufacturerId: string,
): OrificeRow | null {
  const wanted = String(designation ?? '').trim()
  if (!wanted) return null

  const approved = orifices.filter((row) => row.status === 'approved')
  const exact =
    approved.find(
      (row) =>
        row.designation.toLowerCase() === wanted.toLowerCase() &&
        (row.manufacturer_id === manufacturerId || row.manufacturer_id == null),
    ) ??
    approved.find((row) => row.designation.toLowerCase() === wanted.toLowerCase())

  return exact ?? null
}

/** Specificity score: exact series + orifice + size + spring material beats generic rows. */
function springSpecificityScore(args: {
  row: SpringSpecRow
  seriesId: string | null
  orificeId: string | null
  springMaterialCode: string | null
  sizeInlet: string | null
}): number {
  const { row, seriesId, orificeId, springMaterialCode, sizeInlet } = args
  let score = 0
  if (seriesId && row.valve_series_id === seriesId) score += 8
  else if (row.valve_series_id) score -= 2
  if (orificeId && row.orifice_id === orificeId) score += 4
  else if (row.orifice_id) score -= 1
  if (springMaterialCode && row.spring_material_code === springMaterialCode) score += 4
  else if (row.spring_material_code) score -= 1
  if (sizeInlet?.trim() && row.inlet_size_constraint?.trim()) {
    if (row.inlet_size_constraint.trim().toLowerCase() === sizeInlet.trim().toLowerCase()) {
      score += 2
    } else {
      score -= 4
    }
  }
  return score
}

function isCurrentEdition(row: SpringSpecRow, documentsById: Map<string, SpecDocumentRow>): boolean {
  const docId = row.source_document_id
  if (!docId) return true
  const doc = documentsById.get(docId)
  return doc?.status === 'active'
}

function selectSpringSpecs(args: {
  manufacturerId: string
  seriesId: string | null
  orificeId: string | null
  springMaterialCode: string | null
  cdtp: number
  service: SpringService
  sizeInlet?: string | null
  specs: SpringSpecRow[]
  documentsById: Map<string, SpecDocumentRow>
}): { winners: SpringSpecRow[]; ambiguous: boolean } {
  const {
    manufacturerId,
    seriesId,
    orificeId,
    springMaterialCode,
    cdtp,
    service,
    sizeInlet,
    specs,
    documentsById,
  } = args

  const candidates = specs.filter((row) => {
    if (row.status !== 'approved') return false
    if (row.manufacturer_id !== manufacturerId) return false
    if (seriesId && row.valve_series_id && row.valve_series_id !== seriesId) return false
    if (orificeId && row.orifice_id && row.orifice_id !== orificeId) return false
    if (springMaterialCode && row.spring_material_code && row.spring_material_code !== springMaterialCode) {
      return false
    }
    if (cdtp < row.set_pressure_min || cdtp > row.set_pressure_max) return false
    if (row.service !== 'both' && row.service !== service) return false
    if (row.inlet_size_constraint?.trim() && sizeInlet?.trim()) {
      if (row.inlet_size_constraint.trim().toLowerCase() !== sizeInlet.trim().toLowerCase()) {
        return false
      }
    }
    return true
  })

  if (candidates.length === 0) return { winners: [], ambiguous: false }
  if (candidates.length === 1) return { winners: [candidates[0]], ambiguous: false }

  const ranked = [...candidates].sort((a, b) => {
    const aSpec = springSpecificityScore({
      row: a,
      seriesId,
      orificeId,
      springMaterialCode,
      sizeInlet,
    })
    const bSpec = springSpecificityScore({
      row: b,
      seriesId,
      orificeId,
      springMaterialCode,
      sizeInlet,
    })
    if (bSpec !== aSpec) return bSpec - aSpec

    const aCurrent = isCurrentEdition(a, documentsById) ? 1 : 0
    const bCurrent = isCurrentEdition(b, documentsById) ? 1 : 0
    if (bCurrent !== aCurrent) return bCurrent - aCurrent

    const aBand = a.set_pressure_max - a.set_pressure_min
    const bBand = b.set_pressure_max - b.set_pressure_min
    return aBand - bBand
  })

  const top = ranked[0]
  const topSpec = springSpecificityScore({
    row: top,
    seriesId,
    orificeId,
    springMaterialCode,
    sizeInlet,
  })
  const topCurrent = isCurrentEdition(top, documentsById)
  const topBand = top.set_pressure_max - top.set_pressure_min

  const tied = ranked.filter((row) => {
    const sameSpec =
      springSpecificityScore({ row, seriesId, orificeId, springMaterialCode, sizeInlet }) === topSpec
    const sameEdition = isCurrentEdition(row, documentsById) === topCurrent
    const sameBand = row.set_pressure_max - row.set_pressure_min === topBand
    return sameSpec && sameEdition && sameBand
  })

  if (tied.length > 1) return { winners: tied, ambiguous: true }
  return { winners: [top], ambiguous: false }
}

/**
 * Phase 1 stub: decode model code → resolve series/orifice → select spring_spec against CDTP.
 * Temp correction, tolerances, and remaining spec tables are Phase 2+.
 */
export function resolveValveSpecs(
  input: SpecResolutionInput,
  context: SpecResolutionContext,
): SpecResolution {
  const reviewNotes: string[] = []
  const service = mapAsmeSectionToService(input.asmeSection)
  const proxyBase = context.specDocProxyBaseUrl

  const approvedRules = context.nomenclatureRules.filter((row) => row.status === 'approved')
  const approvedSprings = context.springSpecs.filter((row) => row.status === 'approved')

  let seriesId = input.seriesId ?? null
  let orificeDesignation = input.orificeDesignation ?? null
  let springMaterialCode: string | null = null
  let sizeCode = input.sizeCode ?? null

  let decoded: DecodedModelFields = {
    seriesId,
    orificeDesignation,
    springMaterialCode,
    sizeCode,
    lookupKey: null,
    rawSegments: {},
    ruleId: null,
  }

  if (input.modelCode?.trim()) {
    const decodeResult = decodeModelCode(input.modelCode, approvedRules)
    decoded = {
      ...decodeResult.decoded,
      seriesId: decodeResult.decoded.seriesId ?? seriesId,
      orificeDesignation: decodeResult.decoded.orificeDesignation ?? orificeDesignation,
      sizeCode: decodeResult.decoded.sizeCode ?? sizeCode,
    }
    seriesId = decoded.seriesId ?? seriesId
    orificeDesignation = decoded.orificeDesignation ?? orificeDesignation
    springMaterialCode = decoded.springMaterialCode
    sizeCode = decoded.sizeCode ?? sizeCode
    if (!decodeResult.rule) {
      reviewNotes.push(`No approved nomenclature rule matched model code “${input.modelCode.trim()}”.`)
    }
  }

  const seriesRow = seriesId ? context.series.find((row) => row.id === seriesId) ?? null : null
  if (seriesId && !seriesRow) {
    reviewNotes.push('Valve series id was provided but not found.')
  }

  const orificeRow = resolveOrifice(orificeDesignation, context.orifices, input.manufacturerId)
  if (orificeDesignation && !orificeRow) {
    reviewNotes.push(`Orifice designation “${orificeDesignation}” not found in approved orifice catalog.`)
  }

  const cdtp = input.cdtp
  if (input.cdtp == null || Number.isNaN(input.cdtp)) {
    reviewNotes.push('CDTP (Cold Differential Test Pressure) is required for spring lookup.')
  }

  if (!input.cdtp && input.setPressure != null && input.operatingTempF != null) {
    reviewNotes.push(
      'CDTP not supplied — temperature correction from set pressure requires approved spring_temp_corrections (Phase 2).',
    )
  } else if (input.operatingTempF != null && input.operatingTempF !== 70 && input.cdtp) {
    reviewNotes.push(
      `Operating temperature ${input.operatingTempF} °F noted; spring lookup uses supplied CDTP ${cdtp} psig.`,
    )
  }

  const springResult = selectSpringSpecs({
    manufacturerId: input.manufacturerId,
    seriesId,
    orificeId: orificeRow?.id ?? null,
    springMaterialCode,
    cdtp,
    service,
    sizeInlet: input.sizeInlet ?? sizeCode,
    specs: approvedSprings,
    documentsById: context.documentsById,
  })

  const { winners: springWinners, ambiguous: springAmbiguous } = springResult
  const springRow = springAmbiguous ? null : (springWinners[0] ?? null)

  if (springWinners.length === 0) {
    reviewNotes.push(`No approved spring spec found for CDTP ${cdtp} psig (${service}).`)
  } else if (springAmbiguous) {
    reviewNotes.push(
      `${springWinners.length} spring specs tied after specificity/edition/band ranking — manual review required.`,
    )
  }

  const springDoc = springRow?.source_document_id
    ? context.documentsById.get(springRow.source_document_id)
    : undefined

  const seriesField: ResolvedSpecField<string> | null = seriesRow
    ? {
        value: seriesRow.name,
        unit: null,
        source: null,
        confidence: 1,
        needsReview: false,
      }
    : seriesId
      ? needsReviewField('Series could not be resolved.')
      : needsReviewField('Valve series not identified from model code or input.')

  const orificeField: ResolvedSpecField<string> | null = orificeRow
    ? {
        value: orificeRow.designation,
        unit: null,
        source: null,
        confidence: 1,
        needsReview: false,
      }
    : orificeDesignation
      ? needsReviewField(`Orifice “${orificeDesignation}” not in catalog.`)
      : needsReviewField('Orifice designation not identified.')

  const springField: ResolvedSpecField<string> | null = springRow
    ? {
        value: springRow.spring_part_number ?? springRow.spring_material_code ?? '',
        unit: null,
        source: buildSource(springRow, 'spring_specs', springDoc, proxyBase),
        confidence: springRow.confidence ?? 1,
        needsReview: false,
      }
    : springAmbiguous
      ? needsReviewField(`${springWinners.length} ambiguous spring matches — pick manually.`)
      : needsReviewField('Spring part number could not be resolved.')

  const needsReview =
    reviewNotes.length > 0 ||
    Boolean(seriesField?.needsReview) ||
    Boolean(orificeField?.needsReview) ||
    Boolean(springField?.needsReview)

  return {
    resolverVersion: 'phase1-stub',
    resolvedAt: new Date().toISOString(),
    manufacturerId: input.manufacturerId,
    decoded,
    series: seriesField,
    orifice: orificeField,
    springPartNumber: springField,
    springCandidates: springAmbiguous ? springWinners : springRow ? [springRow] : [],
    springSpecRowId: springRow?.id ?? null,
    needsReview,
    reviewNotes,
  }
}
