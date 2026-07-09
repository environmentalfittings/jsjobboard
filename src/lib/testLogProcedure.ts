export const TEST_PROCEDURE_OTHER = '__other__'

export const API_598_TEST_LABEL = 'API 598 Test'

export type TestProcedureFields = {
  testProcedures: string[]
  testProcedureOther: string
}

/** Map legacy/typo labels to the canonical test requirement option. */
export function normalizeTestProcedureLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed === 'API 518 Test' || trimmed === 'API 518' || trimmed === 'API 598') return API_598_TEST_LABEL
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

export const FOUR_HOUR_CHART_TEST_LABEL = '4-Hour Chart Test'

export function isFourHourChartTestSelected(fields: TestProcedureFields): boolean {
  return resolveTestProcedures(fields).some(
    (p) => p === FOUR_HOUR_CHART_TEST_LABEL || p.toLowerCase().includes('4-hour chart'),
  )
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
  else if (legacyProcedure === 'API 6D') procedures.push('API 6D Test')
  else if (legacyProcedure) procedures.push(normalizeTestProcedureLabel(legacyProcedure))

  if (raw.fourHourChartRequired === 'yes') procedures.push('4-Hour Chart Test')

  return {
    testProcedures: normalizeTestProcedures(procedures),
    testProcedureOther: typeof raw.testProcedureOther === 'string' ? raw.testProcedureOther : '',
  }
}
