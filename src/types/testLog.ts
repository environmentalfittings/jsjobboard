import {
  applyTestMediaPrefill,
  emptyTestMediaFields,
  parseTestMediaFields,
  resolveTestMedia,
  type TestMediaFields,
} from '../lib/testLogMedia'
import {
  emptyTestProcedureFields,
  formatTestProceduresSummary,
  parseTestProcedureFields,
  type TestProcedureFields,
} from '../lib/testLogProcedure'
import { parseTestStandardParams, type TestStandardParams } from '../lib/testStandardParams'

export type PressureTestResult = 'pass' | 'fail' | ''

export type YesNo = 'yes' | 'no' | ''

export type PressureTestBlock = TestMediaFields & {
  gaugeId: string
  gauge: string
  pressure: string
  time: string
  result: PressureTestResult
  reason: string
  /** Shell test only — when 4-Hour Chart Test is selected in test requirements. */
  chartRecorderNumber: string
}

export type HeliumTest = TestMediaFields & {
  enabled: boolean
  heliumCalibrated: YesNo
  cycled5x: YesNo
  midStroke: YesNo
  draftsEliminated: YesNo
  gaugeId: string
  gauge: string
  pressure: string
  time: string
  ambient: string
  stem: string
  bonnet: string
  body: string
  result: PressureTestResult
  reason: string
}

export type CavityReliefTest = TestMediaFields & {
  enabled: boolean
  mawp100F: string
  seatA: string
  seatB: string
  result: PressureTestResult
  reason: string
}

export type TestLogTestingDetails = TestProcedureFields & {
  lowTest: PressureTestBlock
  highTest: PressureTestBlock
  shellTest: PressureTestBlock
  heliumTest: HeliumTest
  cavityReliefTest: CavityReliefTest
  additionalNotes: string
  /** Required test parameters audit snapshot (standard, CWP, pressures, hold times, leakage). */
  testStandardParams?: TestStandardParams | null
}

export function emptyPressureTestBlock(): PressureTestBlock {
  return {
    ...emptyTestMediaFields(),
    gaugeId: '',
    gauge: '',
    pressure: '',
    time: '',
    result: '',
    reason: '',
    chartRecorderNumber: '',
  }
}

export function emptyHeliumTest(): HeliumTest {
  return {
    ...emptyTestMediaFields(),
    enabled: false,
    heliumCalibrated: '',
    cycled5x: '',
    midStroke: '',
    draftsEliminated: '',
    gaugeId: '',
    gauge: '',
    pressure: '',
    time: '',
    ambient: '',
    stem: '',
    bonnet: '',
    body: '',
    result: '',
    reason: '',
  }
}

export function emptyCavityReliefTest(): CavityReliefTest {
  return { ...emptyTestMediaFields(), enabled: false, mawp100F: '', seatA: '', seatB: '', result: '', reason: '' }
}

export function emptyTestLogTestingDetails(): TestLogTestingDetails {
  return {
    ...emptyTestProcedureFields(),
    lowTest: emptyPressureTestBlock(),
    highTest: emptyPressureTestBlock(),
    shellTest: emptyPressureTestBlock(),
    heliumTest: emptyHeliumTest(),
    cavityReliefTest: emptyCavityReliefTest(),
    additionalNotes: '',
  }
}

/** Summary for legacy `test_logs.test_type` column. */
export function deriveLegacyTestType(details: TestLogTestingDetails): string | null {
  const values = [
    resolveTestMedia(details.lowTest),
    resolveTestMedia(details.highTest),
    resolveTestMedia(details.shellTest),
    details.heliumTest.enabled ? resolveTestMedia(details.heliumTest) : '',
    details.cavityReliefTest.enabled ? resolveTestMedia(details.cavityReliefTest) : '',
  ].filter(Boolean)
  const unique = Array.from(new Set(values))
  return unique.length ? unique.join(' / ') : null
}

/** Summary for legacy `test_logs.worked` column (test procedure / requirements). */
export function deriveLegacyWorked(details: TestLogTestingDetails): string | null {
  const summary = formatTestProceduresSummary(details)
  return summary || null
}

function collectEnabledResults(details: TestLogTestingDetails): PressureTestResult[] {
  const results = [details.lowTest.result, details.highTest.result, details.shellTest.result]
  if (details.heliumTest.enabled) results.push(details.heliumTest.result)
  if (details.cavityReliefTest.enabled) results.push(details.cavityReliefTest.result)
  return results
}

export function deriveOverallPassFail(details: TestLogTestingDetails): string {
  const results = collectEnabledResults(details)
  if (results.some((r) => r === 'fail')) return 'FAIL'

  const main = [details.lowTest.result, details.highTest.result, details.shellTest.result]
  if (!main.every((r) => r === 'pass')) return ''

  const optional: PressureTestResult[] = []
  if (details.heliumTest.enabled) optional.push(details.heliumTest.result)
  if (details.cavityReliefTest.enabled) optional.push(details.cavityReliefTest.result)

  if (optional.length && !optional.every((r) => r === 'pass')) return ''
  return 'PASS'
}

export function deriveActionTaken(details: TestLogTestingDetails): string | null {
  const failNotes = [
    details.lowTest.result === 'fail' && details.lowTest.reason.trim()
      ? `Low: ${details.lowTest.reason.trim()}`
      : '',
    details.highTest.result === 'fail' && details.highTest.reason.trim()
      ? `High: ${details.highTest.reason.trim()}`
      : '',
    details.shellTest.result === 'fail' && details.shellTest.reason.trim()
      ? `Shell: ${details.shellTest.reason.trim()}`
      : '',
    details.heliumTest.enabled && details.heliumTest.result === 'fail' && details.heliumTest.reason.trim()
      ? `Helium: ${details.heliumTest.reason.trim()}`
      : '',
    details.cavityReliefTest.enabled &&
    details.cavityReliefTest.result === 'fail' &&
    details.cavityReliefTest.reason.trim()
      ? `Cavity relief: ${details.cavityReliefTest.reason.trim()}`
      : '',
  ].filter(Boolean)

  const notes = details.additionalNotes.trim()
  if (failNotes.length && notes) return `${failNotes.join('; ')} | ${notes}`
  if (failNotes.length) return failNotes.join('; ')
  return notes || null
}

function parseYesNo(value: unknown): YesNo {
  return value === 'yes' || value === 'no' ? value : ''
}

function parsePressureBlock(raw: unknown, legacyMedium = ''): PressureTestBlock {
  const b = (raw as Record<string, unknown> | undefined) ?? {}
  const result = b.result === 'pass' || b.result === 'fail' ? b.result : ''
  const media = parseTestMediaFields(b)
  const hasMedia = Boolean(media.testMedia || media.testMediaOther)
  const mediaFields = hasMedia ? media : applyTestMediaPrefill(legacyMedium, [])

  return {
    ...mediaFields,
    gaugeId: typeof b.gaugeId === 'string' ? b.gaugeId : '',
    gauge: typeof b.gauge === 'string' ? b.gauge : '',
    pressure: typeof b.pressure === 'string' ? b.pressure : '',
    time: typeof b.time === 'string' ? b.time : '',
    result,
    reason: typeof b.reason === 'string' ? b.reason : '',
    chartRecorderNumber: typeof b.chartRecorderNumber === 'string' ? b.chartRecorderNumber : '',
  }
}

function parseHeliumTest(raw: unknown, legacyMedium = ''): HeliumTest {
  const b = (raw as Record<string, unknown> | undefined) ?? {}
  const media = parseTestMediaFields(b)
  const hasMedia = Boolean(media.testMedia || media.testMediaOther)
  const mediaFields = hasMedia ? media : applyTestMediaPrefill(legacyMedium || 'Helium', [])

  return {
    ...mediaFields,
    enabled: b.enabled === true,
    heliumCalibrated: parseYesNo(b.heliumCalibrated),
    cycled5x: parseYesNo(b.cycled5x),
    midStroke: parseYesNo(b.midStroke),
    draftsEliminated: parseYesNo(b.draftsEliminated),
    gaugeId: typeof b.gaugeId === 'string' ? b.gaugeId : '',
    gauge: typeof b.gauge === 'string' ? b.gauge : '304046',
    pressure: typeof b.pressure === 'string' ? b.pressure : '',
    time: typeof b.time === 'string' ? b.time : '',
    ambient: typeof b.ambient === 'string' ? b.ambient : '',
    stem: typeof b.stem === 'string' ? b.stem : '',
    bonnet: typeof b.bonnet === 'string' ? b.bonnet : '',
    body: typeof b.body === 'string' ? b.body : '',
    result: b.result === 'pass' || b.result === 'fail' ? b.result : '',
    reason: typeof b.reason === 'string' ? b.reason : '',
  }
}

function parseCavityReliefTest(raw: unknown): CavityReliefTest {
  const b = (raw as Record<string, unknown> | undefined) ?? {}
  return {
    ...parseTestMediaFields(b),
    enabled: b.enabled === true,
    mawp100F: typeof b.mawp100F === 'string' ? b.mawp100F : '',
    seatA: typeof b.seatA === 'string' ? b.seatA : '',
    seatB: typeof b.seatB === 'string' ? b.seatB : '',
    result: b.result === 'pass' || b.result === 'fail' ? b.result : '',
    reason: typeof b.reason === 'string' ? b.reason : '',
  }
}

export function parseTestLogTestingDetails(raw: unknown): TestLogTestingDetails | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const legacyMedium = typeof o.testMedium === 'string' ? o.testMedium : ''
  const procedureFields = parseTestProcedureFields(o)
  const legacyChartRecorder = typeof o.chartRecorderNumber === 'string' ? o.chartRecorderNumber : ''
  const shellTest = parsePressureBlock(o.shellTest, legacyMedium)
  if (legacyChartRecorder && !shellTest.chartRecorderNumber) {
    shellTest.chartRecorderNumber = legacyChartRecorder
  }

  const additionalNotes =
    typeof o.additionalNotes === 'string'
      ? o.additionalNotes
      : typeof o.additionalTesting === 'string'
        ? o.additionalTesting
        : ''

  return {
    ...procedureFields,
    lowTest: parsePressureBlock(o.lowTest, legacyMedium),
    highTest: parsePressureBlock(o.highTest, legacyMedium),
    shellTest,
    heliumTest: o.heliumTest ? parseHeliumTest(o.heliumTest, legacyMedium) : emptyHeliumTest(),
    cavityReliefTest: o.cavityReliefTest ? parseCavityReliefTest(o.cavityReliefTest) : emptyCavityReliefTest(),
    additionalNotes,
    testStandardParams: parseTestStandardParams(o.testStandardParams),
  }
}

export { resolveTestMedia } from '../lib/testLogMedia'
export { formatTestProceduresSummary } from '../lib/testLogProcedure'
