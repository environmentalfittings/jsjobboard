import { parseJobTestTypes } from './jobTestTypes'

export const TEST_PROCEDURE_OTHER = '__other__'

export const API_598_TEST_LABEL = 'API 598 Test'
export const API_6D_TEST_LABEL = 'API 6D Test'
export const MSS_SP160_TEST_LABEL = 'MSS SP 160 Test'
export const ASME_B1634_TEST_LABEL = 'ASME B16.34'
export const FOUR_HOUR_CHART_TEST_LABEL = '4-Hour Chart Test'
export const HELIUM_TEST_LABEL = 'Helium Test'

export type TestProcedureFields = {
  testProcedures: string[]
  testProcedureOther: string
}

/** Map legacy/typo labels to the canonical test requirement option. */
export function normalizeTestProcedureLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed === 'API 518 Test' || trimmed === 'API 518' || trimmed === 'API 598') return API_598_TEST_LABEL
  if (trimmed === 'API 6D' || trimmed === '6D') return API_6D_TEST_LABEL
  if (trimmed === 'MSS SP-160' || trimmed === 'MSS SP160' || trimmed === 'SP-160' || trimmed === 'SP160') {
    return MSS_SP160_TEST_LABEL
  }
  if (trimmed === 'ASME B16.34 Test' || trimmed === 'B16.34') return ASME_B1634_TEST_LABEL
  if (/^4[\s-]?hour/i.test(trimmed)) return FOUR_HOUR_CHART_TEST_LABEL
  if (/^helium(\s+test)?$/i.test(trimmed)) return HELIUM_TEST_LABEL
  return trimmed
}

export function normalizeTestProcedures(procedures: string[]): string[] {
  const normalized = procedures.map(normalizeTestProcedureLabel).filter(Boolean)
  return Array.from(new Set(normalized))
}

export function emptyTestProcedureFields(): TestProcedureFields {
  return { testProcedures: [], testProcedureOther: '' }
}

export function resolveTestProcedures(fields: TestProcedureFields): string[] {
  const selected = normalizeTestProcedures(fields.testProcedures.filter(Boolean))
  const other = fields.testProcedureOther.trim()
  if (fields.testProcedures.includes(TEST_PROCEDURE_OTHER) && other) {
    return [...selected.filter((v) => v !== TEST_PROCEDURE_OTHER), other]
  }
  return selected
}

export function formatTestProceduresSummary(fields: TestProcedureFields): string {
  const resolved = resolveTestProcedures(fields)
  return resolved.length ? resolved.join(', ') : ''
}

export function isFourHourChartTestSelected(fields: TestProcedureFields): boolean {
  return resolveTestProcedures(fields).some(
    (p) => p === FOUR_HOUR_CHART_TEST_LABEL || p.toLowerCase().includes('4-hour chart'),
  )
}

function matchProcedureOption(part: string, procedureOptions: string[]): string | null {
  const normalized = normalizeTestProcedureLabel(part)
  const exact = procedureOptions.find((option) => option.toLowerCase() === normalized.toLowerCase())
  if (exact) return exact

  const lower = normalized.toLowerCase()
  const fuzzy = procedureOptions.find((option) => {
    const optionLower = option.toLowerCase()
    return optionLower === lower || optionLower.includes(lower) || lower.includes(optionLower.replace(/\s*test$/i, '').trim())
  })
  return fuzzy ?? null
}

/**
 * Map a job-card `test_type` value (possibly multi-select, comma-joined)
 * onto Test Log "Test requirements" checkboxes.
 */
export function mapJobTestTypeToProcedures(
  jobTestType: string | null | undefined,
  procedureOptions: string[],
): TestProcedureFields {
  const options = procedureOptions.length ? procedureOptions : []
  const parts = parseJobTestTypes(jobTestType, options)
  if (!parts.length) return emptyTestProcedureFields()

  const selected: string[] = []
  const custom: string[] = []

  for (const part of parts) {
    const matched = matchProcedureOption(part, options)
    if (matched) {
      selected.push(matched)
      continue
    }

    // Legacy media-ish values (Water, AIR, etc.) are not test requirements.
    if (/^(air|water|helium|mineral\s*oil|diesel|methane|prv)\b/i.test(part.trim())) {
      if (/4[\s-]?hour/i.test(part)) selected.push(FOUR_HOUR_CHART_TEST_LABEL)
      continue
    }

    custom.push(part.trim())
  }

  const procedures = normalizeTestProcedures(selected)
  if (custom.length) {
    return {
      testProcedures: normalizeTestProcedures([...procedures, TEST_PROCEDURE_OTHER]),
      testProcedureOther: custom.join(', '),
    }
  }

  return {
    testProcedures: procedures,
    testProcedureOther: '',
  }
}

/** True when a stored job test_type token looks like test media, not a procedure. */
export function jobTestTypeLooksLikeMedia(value: string, mediaOptions: string[]): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (mediaOptions.some((option) => option.toLowerCase() === trimmed.toLowerCase())) return true
  return /^(air|water|helium|mineral\s*oil|diesel|methane)\b/i.test(trimmed)
}

export function parseTestProcedureFields(raw: Record<string, unknown> | undefined): TestProcedureFields {
  if (!raw) return emptyTestProcedureFields()

  if (Array.isArray(raw.testProcedures)) {
    return {
      testProcedures: normalizeTestProcedures(raw.testProcedures.filter((v): v is string => typeof v === 'string')),
      testProcedureOther: typeof raw.testProcedureOther === 'string' ? raw.testProcedureOther : '',
    }
  }

  const procedures: string[] = []
  const legacyProcedure = typeof raw.testProcedure === 'string' ? raw.testProcedure.trim() : ''
  if (legacyProcedure === 'API 598' || legacyProcedure === 'API 518') procedures.push(API_598_TEST_LABEL)
  else if (legacyProcedure === 'API 6D') procedures.push(API_6D_TEST_LABEL)
  else if (legacyProcedure) procedures.push(normalizeTestProcedureLabel(legacyProcedure))

  if (raw.fourHourChartRequired === 'yes') procedures.push(FOUR_HOUR_CHART_TEST_LABEL)

  return {
    testProcedures: normalizeTestProcedures(procedures),
    testProcedureOther: typeof raw.testProcedureOther === 'string' ? raw.testProcedureOther : '',
  }
}
