import { VALVE_SIZES } from '../constants/jobLookups'

export const RELIEF_VALVE_MEDIA = ['Air/Gas', 'Liquid', 'Steam', 'Other'] as const
export type ReliefValveMedia = (typeof RELIEF_VALVE_MEDIA)[number]

/** Pretest flavor when a pretest is included on the record. */
export const RELIEF_VALVE_PRETEST_KINDS = ['Pretest', 'Pretest with Repair'] as const
export type ReliefValvePretestKind = (typeof RELIEF_VALVE_PRETEST_KINDS)[number]

/** @deprecated Use RELIEF_VALVE_PRETEST_KINDS */
export const RELIEF_VALVE_TEST_TYPES = RELIEF_VALVE_PRETEST_KINDS
/** @deprecated Use ReliefValvePretestKind */
export type ReliefValveTestType = ReliefValvePretestKind

/** One pop/reseat run (pretest or final) on a single relief-valve record. */
export type ReliefValveRunFields = {
  gaugeId: string
  gauge: string
  test1: string
  test2: string
  test3: string
  reseat1: string
  reseat2: string
  reseat3: string
  result: 'pass' | 'fail' | ''
  reseatResult: 'pass' | 'fail' | 'na' | ''
  reason: string
}

/**
 * One Test Log record for a PRV / relief valve.
 * Shared header + optional pretest run + required final run.
 */
export type ReliefValveTestFields = {
  inletSize: string
  outletSize: string
  setPressure: string
  media: string
  mediaOther: string
  /** When true, pretest pop/reseat is part of this record. */
  includePretest: boolean
  pretestKind: string
  pretest: ReliefValveRunFields
  final: ReliefValveRunFields
}

export function emptyReliefValveRunFields(): ReliefValveRunFields {
  return {
    gaugeId: '',
    gauge: '',
    test1: '',
    test2: '',
    test3: '',
    reseat1: '',
    reseat2: '',
    reseat3: '',
    result: '',
    reseatResult: '',
    reason: '',
  }
}

export function emptyReliefValveTestFields(): ReliefValveTestFields {
  return {
    inletSize: '',
    outletSize: '',
    setPressure: '',
    media: '',
    mediaOther: '',
    includePretest: false,
    pretestKind: '',
    pretest: emptyReliefValveRunFields(),
    final: emptyReliefValveRunFields(),
  }
}

export function isReliefValveType(valveType: string | null | undefined): boolean {
  const n = String(valveType ?? '')
    .trim()
    .toLowerCase()
  if (!n) return false
  return (
    n.includes('relief') ||
    n.includes('safety valve') ||
    n === 'prv' ||
    n.includes('pressure relief')
  )
}

function normalizeStoredMedia(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^air(\/gas)?$/i.test(trimmed) || /^gas$/i.test(trimmed)) return 'Air/Gas'
  return trimmed
}

function parseRunFields(raw: unknown): ReliefValveRunFields {
  const empty = emptyReliefValveRunFields()
  if (!raw || typeof raw !== 'object') return empty
  const o = raw as Record<string, unknown>
  const reseatResult =
    o.reseatResult === 'pass' || o.reseatResult === 'fail' || o.reseatResult === 'na'
      ? o.reseatResult
      : ''
  return {
    gaugeId: String(o.gaugeId ?? '').trim(),
    gauge: String(o.gauge ?? '').trim(),
    test1: String(o.test1 ?? '').trim(),
    test2: String(o.test2 ?? '').trim(),
    test3: String(o.test3 ?? '').trim(),
    reseat1: String(o.reseat1 ?? '').trim(),
    reseat2: String(o.reseat2 ?? '').trim(),
    reseat3: String(o.reseat3 ?? '').trim(),
    result: o.result === 'pass' || o.result === 'fail' ? o.result : '',
    reseatResult,
    reason: String(o.reason ?? '').trim(),
  }
}

function runHasAnyData(run: ReliefValveRunFields): boolean {
  return Boolean(
    run.gaugeId ||
      run.gauge ||
      run.test1 ||
      run.test2 ||
      run.test3 ||
      run.reseat1 ||
      run.reseat2 ||
      run.reseat3 ||
      run.result ||
      run.reason,
  )
}

export function parseReliefValveTestFields(raw: unknown): ReliefValveTestFields {
  const empty = emptyReliefValveTestFields()
  if (!raw || typeof raw !== 'object') return empty
  const o = raw as Record<string, unknown>

  const header = {
    inletSize: String(o.inletSize ?? '').trim(),
    outletSize: String(o.outletSize ?? '').trim(),
    setPressure: String(o.setPressure ?? '').trim(),
    media: normalizeStoredMedia(String(o.media ?? '')),
    mediaOther: String(o.mediaOther ?? '').trim(),
  }

  const hasNestedShape =
    o.final != null ||
    o.pretest != null ||
    typeof o.includePretest === 'boolean' ||
    typeof o.pretestKind === 'string'

  if (hasNestedShape) {
    const pretest = parseRunFields(o.pretest)
    const final = parseRunFields(o.final)
    const pretestKind = String(o.pretestKind ?? o.testType ?? '').trim()
    const includePretest =
      typeof o.includePretest === 'boolean'
        ? o.includePretest
        : Boolean(pretestKind) || runHasAnyData(pretest)
    return {
      ...header,
      includePretest,
      pretestKind,
      pretest,
      final,
    }
  }

  // Legacy flat shape (single pretest-style run) → migrate into pretest.
  const legacyRun = parseRunFields(o)
  const legacyType = String(o.testType ?? '').trim()
  const hasLegacyRun = Boolean(legacyType) || runHasAnyData(legacyRun)
  return {
    ...header,
    includePretest: hasLegacyRun,
    pretestKind: legacyType,
    pretest: hasLegacyRun ? legacyRun : emptyReliefValveRunFields(),
    final: emptyReliefValveRunFields(),
  }
}

/** Parse a pressure string like "150", "150 PSI", "150.5#" into a number. */
export function parseReliefPressureValue(raw: string | null | undefined): number | null {
  const match = String(raw ?? '')
    .trim()
    .match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

function averageThree(a: string, b: string, c: string): number | null {
  const values = [a, b, c].map(parseReliefPressureValue)
  if (values.some((value) => value === null)) return null
  return ((values[0] as number) + (values[1] as number) + (values[2] as number)) / 3
}

/** Average of the three pop tests; null until all three numeric values are entered. */
export function averageReliefValveTests(
  fields: Pick<ReliefValveRunFields, 'test1' | 'test2' | 'test3'>,
): number | null {
  return averageThree(fields.test1, fields.test2, fields.test3)
}

/** Average of the three reseat tests; null until all three numeric values are entered. */
export function averageReliefValveReseatTests(
  fields: Pick<ReliefValveRunFields, 'reseat1' | 'reseat2' | 'reseat3'>,
): number | null {
  return averageThree(fields.reseat1, fields.reseat2, fields.reseat3)
}

export function formatReliefValveAverage(average: number | null): string {
  if (average === null) return ''
  const rounded = Math.round(average * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

/** Pass band: set pressure through +3% (never below set). */
export const RELIEF_VALVE_PASS_TOLERANCE_PERCENT = 3

export type ReliefValvePassEvaluation = {
  average: number | null
  setPressure: number | null
  maxPassPressure: number | null
  result: 'pass' | 'fail' | ''
  summary: string
}

export type ReliefValveReseatEvaluation = {
  reseatAverage: number | null
  popAverage: number | null
  tolerancePercent: number | null
  enforced: boolean
  minPass: number | null
  maxPass: number | null
  percentDiff: number | null
  result: 'pass' | 'fail' | 'na' | ''
  summary: string
}

export type ReliefValveOverallEvaluation = {
  pop: ReliefValvePassEvaluation
  reseat: ReliefValveReseatEvaluation
  result: 'pass' | 'fail' | ''
  summary: string
}

export type ReliefValveRunEvalInput = Pick<ReliefValveTestFields, 'setPressure' | 'media'> &
  Pick<ReliefValveRunFields, 'test1' | 'test2' | 'test3' | 'reseat1' | 'reseat2' | 'reseat3'>

export function reliefValvePassBand(setPressure: number): { min: number; max: number } {
  return {
    min: setPressure,
    max: setPressure * (1 + RELIEF_VALVE_PASS_TOLERANCE_PERCENT / 100),
  }
}

/**
 * Pass when three-pop average is between set pressure and +3% of set pressure.
 * Below set pressure = fail (customers do not want valves set low).
 */
export function evaluateReliefValvePassFail(fields: ReliefValveRunEvalInput): ReliefValvePassEvaluation {
  const setPressure = parseReliefPressureValue(fields.setPressure)
  const average = averageReliefValveTests(fields)
  if (setPressure === null || average === null) {
    return {
      average,
      setPressure,
      maxPassPressure: null,
      result: '',
      summary: 'Enter set pressure and all three pop tests',
    }
  }

  const { min, max } = reliefValvePassBand(setPressure)
  const maxLabel = formatReliefValveAverage(max)
  const avgLabel = formatReliefValveAverage(average)
  const setLabel = formatReliefValveAverage(setPressure)

  if (average + 1e-9 >= min && average - 1e-9 <= max) {
    return {
      average,
      setPressure,
      maxPassPressure: max,
      result: 'pass',
      summary: `Pass band: ${setLabel}–${maxLabel} PSI (+${RELIEF_VALVE_PASS_TOLERANCE_PERCENT}%)`,
    }
  }

  if (average < min) {
    return {
      average,
      setPressure,
      maxPassPressure: max,
      result: 'fail',
      summary: `Pop average ${avgLabel} PSI is below set pressure ${setLabel} PSI`,
    }
  }

  return {
    average,
    setPressure,
    maxPassPressure: max,
    result: 'fail',
    summary: `Pop average ${avgLabel} PSI is above +${RELIEF_VALVE_PASS_TOLERANCE_PERCENT}% limit ${maxLabel} PSI`,
  }
}

/** Reseat tolerance vs average pop, by media. Liquid is advisory only. */
export function reseatToleranceForMedia(media: string): {
  percent: number
  enforced: boolean
  label: string
} | null {
  const n = normalizeStoredMedia(media).toLowerCase()
  if (!n) return null
  if (n === 'steam') return { percent: 6, enforced: true, label: 'Steam' }
  if (n === 'air/gas' || n === 'other') {
    return { percent: 10, enforced: true, label: n === 'other' ? 'Other' : 'Air/Gas' }
  }
  if (n === 'liquid') return { percent: 10, enforced: false, label: 'Liquid' }
  return { percent: 10, enforced: true, label: media }
}

/**
 * Reseat average must be within media % of the three-pop average.
 * Steam 6%, Air/Gas 10%, Liquid target 10% with no pass/fail.
 */
export function evaluateReliefValveReseat(fields: ReliefValveRunEvalInput): ReliefValveReseatEvaluation {
  const popAverage = averageReliefValveTests(fields)
  const reseatAverage = averageReliefValveReseatTests(fields)
  const mediaRule = reseatToleranceForMedia(fields.media)

  if (!mediaRule) {
    return {
      reseatAverage,
      popAverage,
      tolerancePercent: null,
      enforced: false,
      minPass: null,
      maxPass: null,
      percentDiff: null,
      result: '',
      summary: 'Select media for reseat criteria',
    }
  }

  if (popAverage === null || reseatAverage === null) {
    return {
      reseatAverage,
      popAverage,
      tolerancePercent: mediaRule.percent,
      enforced: mediaRule.enforced,
      minPass: null,
      maxPass: null,
      percentDiff: null,
      result: '',
      summary: mediaRule.enforced
        ? `Enter three pop tests and three reseat tests (${mediaRule.label}: within ${mediaRule.percent}% of pop average)`
        : `Enter three pop tests and three reseat tests (Liquid target: within ${mediaRule.percent}% of pop average; no pass/fail)`,
    }
  }

  if (Math.abs(popAverage) < 1e-9) {
    return {
      reseatAverage,
      popAverage,
      tolerancePercent: mediaRule.percent,
      enforced: mediaRule.enforced,
      minPass: null,
      maxPass: null,
      percentDiff: null,
      result: mediaRule.enforced ? 'fail' : 'na',
      summary: 'Pop average must be greater than zero to evaluate reseat',
    }
  }

  const percentDiff = (Math.abs(reseatAverage - popAverage) / Math.abs(popAverage)) * 100
  const minPass = popAverage * (1 - mediaRule.percent / 100)
  const maxPass = popAverage * (1 + mediaRule.percent / 100)
  const within = percentDiff <= mediaRule.percent + 1e-9
  const popLabel = formatReliefValveAverage(popAverage)
  const reseatLabel = formatReliefValveAverage(reseatAverage)
  const diffLabel = formatReliefValveAverage(percentDiff)

  if (!mediaRule.enforced) {
    return {
      reseatAverage,
      popAverage,
      tolerancePercent: mediaRule.percent,
      enforced: false,
      minPass,
      maxPass,
      percentDiff,
      result: 'na',
      summary: within
        ? `Liquid reseat ${reseatLabel} PSI is within ${mediaRule.percent}% of pop average ${popLabel} PSI (${diffLabel}%) — advisory only`
        : `Liquid reseat ${reseatLabel} PSI is ${diffLabel}% from pop average ${popLabel} PSI (target ≤ ${mediaRule.percent}%) — advisory only`,
    }
  }

  if (within) {
    return {
      reseatAverage,
      popAverage,
      tolerancePercent: mediaRule.percent,
      enforced: true,
      minPass,
      maxPass,
      percentDiff,
      result: 'pass',
      summary: `${mediaRule.label} reseat within ${mediaRule.percent}% of pop average (${diffLabel}%): ${formatReliefValveAverage(minPass)}–${formatReliefValveAverage(maxPass)} PSI`,
    }
  }

  return {
    reseatAverage,
    popAverage,
    tolerancePercent: mediaRule.percent,
    enforced: true,
    minPass,
    maxPass,
    percentDiff,
    result: 'fail',
    summary: `${mediaRule.label} reseat ${reseatLabel} PSI is ${diffLabel}% from pop average ${popLabel} PSI (limit ${mediaRule.percent}%)`,
  }
}

export function evaluateReliefValveRun(
  run: ReliefValveRunFields,
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>,
): ReliefValveOverallEvaluation {
  const fields: ReliefValveRunEvalInput = {
    setPressure: header.setPressure,
    media: header.media,
    test1: run.test1,
    test2: run.test2,
    test3: run.test3,
    reseat1: run.reseat1,
    reseat2: run.reseat2,
    reseat3: run.reseat3,
  }
  const pop = evaluateReliefValvePassFail(fields)
  const reseat = evaluateReliefValveReseat(fields)

  if (!pop.result || (reseat.enforced && !reseat.result) || (!reseat.enforced && reseat.result === '')) {
    return {
      pop,
      reseat,
      result: '',
      summary: !pop.result ? pop.summary : reseat.summary,
    }
  }

  if (pop.result === 'fail' || reseat.result === 'fail') {
    return {
      pop,
      reseat,
      result: 'fail',
      summary: pop.result === 'fail' ? pop.summary : reseat.summary,
    }
  }

  return {
    pop,
    reseat,
    result: 'pass',
    summary:
      reseat.result === 'na'
        ? `Pop passed; liquid reseat recorded (advisory). ${pop.summary}`
        : `Pop and reseat both passed. ${pop.summary}`,
  }
}

/** @deprecated Prefer evaluateReliefValveRun on pretest/final. */
export function evaluateReliefValveOverall(fields: ReliefValveTestFields): ReliefValveOverallEvaluation {
  const run = fields.includePretest && runHasAnyData(fields.pretest) ? fields.pretest : fields.final
  return evaluateReliefValveRun(run, fields)
}

export function resolveReliefValveMedia(fields: ReliefValveTestFields): string {
  if (fields.media.toLowerCase() === 'other') {
    return fields.mediaOther.trim() || 'Other'
  }
  return fields.media.trim()
}

export function formatReliefValveSize(fields: ReliefValveTestFields): string {
  const inlet = fields.inletSize.trim()
  const outlet = fields.outletSize.trim()
  if (inlet && outlet && inlet !== outlet) return `${inlet} x ${outlet}`
  return inlet || outlet
}

/** Seed inlet/outlet from a single job-board size when possible. */
export function prefillReliefSizesFromJobSize(size: string | null | undefined): Pick<
  ReliefValveTestFields,
  'inletSize' | 'outletSize'
> {
  const raw = String(size ?? '').trim()
  if (!raw) return { inletSize: '', outletSize: '' }
  const split = raw
    .split(/\s*[x×/]\s*/i)
    .map((part) => part.trim())
    .filter(Boolean)
  if (split.length >= 2) {
    return { inletSize: split[0], outletSize: split[1] }
  }
  return { inletSize: raw, outletSize: '' }
}

export function valveSizeSelectOptions(extra: string[] = []): string[] {
  const merged = [...VALVE_SIZES, ...extra]
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of merged) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function applyRunEvaluations(
  run: ReliefValveRunFields,
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>,
): ReliefValveRunFields {
  const overall = evaluateReliefValveRun(run, header)
  return {
    ...run,
    result: overall.result,
    reseatResult: overall.reseat.result,
    reason: overall.result === 'pass' ? '' : run.reason,
  }
}

export function applyReliefValveEvaluations(fields: ReliefValveTestFields): ReliefValveTestFields {
  return {
    ...fields,
    pretest: fields.includePretest
      ? applyRunEvaluations(fields.pretest, fields)
      : fields.pretest,
    final: applyRunEvaluations(fields.final, fields),
  }
}

function validateRunFields(
  run: ReliefValveRunFields,
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>,
  label: string,
): string | null {
  if (!run.gaugeId.trim() && !run.gauge.trim()) {
    return `Select a test gauge for the ${label}`
  }
  if (!run.test1.trim() || !run.test2.trim() || !run.test3.trim()) {
    return `Enter all three set-pressure / pop tests for the ${label}`
  }
  if (
    parseReliefPressureValue(run.test1) === null ||
    parseReliefPressureValue(run.test2) === null ||
    parseReliefPressureValue(run.test3) === null
  ) {
    return `Each ${label} pop test must be a number`
  }
  if (!run.reseat1.trim() || !run.reseat2.trim() || !run.reseat3.trim()) {
    return `Enter all three reseat pressure tests for the ${label}`
  }
  if (
    parseReliefPressureValue(run.reseat1) === null ||
    parseReliefPressureValue(run.reseat2) === null ||
    parseReliefPressureValue(run.reseat3) === null
  ) {
    return `Each ${label} reseat test must be a number`
  }

  const overall = evaluateReliefValveRun(run, header)
  if (!overall.result) return overall.summary || `Complete ${label} pop and reseat tests`
  if (run.result !== overall.result) {
    return `${label} result must be ${overall.result.toUpperCase()} based on pop and reseat rules`
  }
  if (run.reseatResult !== overall.reseat.result) {
    return `${label} reseat result is out of date — re-enter reseat values`
  }
  if (run.result === 'fail' && !run.reason.trim()) {
    return `Enter a fail reason for the ${label}`
  }
  return null
}

export function validateReliefValveFields(fields: ReliefValveTestFields): string | null {
  if (!fields.inletSize.trim()) return 'Inlet size is required for Relief Valve'
  if (!fields.outletSize.trim()) return 'Outlet size is required for Relief Valve'
  if (!fields.setPressure.trim()) return 'Set pressure is required for Relief Valve'
  if (parseReliefPressureValue(fields.setPressure) === null) {
    return 'Set pressure must be a number'
  }
  if (!fields.media.trim()) return 'Media is required for Relief Valve'
  if (fields.media.toLowerCase() === 'other' && !fields.mediaOther.trim()) {
    return 'Enter the Other media for Relief Valve'
  }

  if (fields.includePretest) {
    if (!fields.pretestKind.trim()) return 'Select a pretest type (Pretest or Pretest with Repair)'
    const pretestError = validateRunFields(fields.pretest, fields, 'Pretest')
    if (pretestError) return pretestError
  }

  const finalStarted = runHasAnyData(fields.final)
  if (!fields.includePretest || finalStarted) {
    const finalError = validateRunFields(fields.final, fields, 'Final test')
    if (finalError) return finalError
  }

  if (!fields.includePretest && !finalStarted) {
    return 'Enter the Final test for Relief Valve'
  }

  return null
}

/** Row-level pass/fail prefers the final test (what ships); falls back to pretest only. */
export function reliefValveRecordPassFail(fields: ReliefValveTestFields): 'PASS' | 'FAIL' | '' {
  if (fields.final.result === 'fail') return 'FAIL'
  if (fields.final.result === 'pass') return 'PASS'
  if (fields.includePretest && fields.pretest.result === 'fail') return 'FAIL'
  if (fields.includePretest && fields.pretest.result === 'pass') return ''
  return ''
}

export function formatReliefValveWorkedSummary(fields: ReliefValveTestFields): string | null {
  const parts: string[] = []
  if (fields.includePretest) {
    parts.push(fields.pretestKind.trim() || 'Pretest')
  }
  if (runHasAnyData(fields.final) || fields.final.result) {
    parts.push('Final')
  }
  return parts.length ? parts.join(' + ') : null
}

export function formatReliefValveFailReasons(fields: ReliefValveTestFields): string[] {
  const notes: string[] = []
  if (fields.includePretest && fields.pretest.result === 'fail' && fields.pretest.reason.trim()) {
    notes.push(`Pretest: ${fields.pretest.reason.trim()}`)
  }
  if (fields.final.result === 'fail' && fields.final.reason.trim()) {
    notes.push(`Final: ${fields.final.reason.trim()}`)
  }
  return notes
}
