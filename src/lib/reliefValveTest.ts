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
  /** Tester initials for this run (e.g. "CP, CB"). */
  tester: string
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
 * Shared header + optional pretest attempts + final attempts (failed runs stay; re-test adds another).
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
  pretestAttempts: ReliefValveRunFields[]
  finalAttempts: ReliefValveRunFields[]
}

export function emptyReliefValveRunFields(): ReliefValveRunFields {
  return {
    tester: '',
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
    pretestAttempts: [emptyReliefValveRunFields()],
    finalAttempts: [emptyReliefValveRunFields()],
  }
}

export function ensureReliefAttempts(attempts: ReliefValveRunFields[] | null | undefined): ReliefValveRunFields[] {
  if (Array.isArray(attempts) && attempts.length > 0) return attempts
  return [emptyReliefValveRunFields()]
}

export function latestReliefAttempt(attempts: ReliefValveRunFields[] | null | undefined): ReliefValveRunFields {
  const list = ensureReliefAttempts(attempts)
  return list[list.length - 1] ?? emptyReliefValveRunFields()
}

/** Append a blank attempt after a failed latest run (keeps the failed record). */
export function startReliefRetest(attempts: ReliefValveRunFields[]): ReliefValveRunFields[] {
  const list = ensureReliefAttempts(attempts)
  const latest = list[list.length - 1] ?? emptyReliefValveRunFields()
  if (latest.result !== 'fail') return list
  return [...list, emptyReliefValveRunFields()]
}

export function canStartReliefRetest(attempts: ReliefValveRunFields[]): boolean {
  return latestReliefAttempt(attempts).result === 'fail'
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
    tester: String(o.tester ?? '').trim(),
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
    run.tester ||
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

function parseAttempts(raw: unknown, fallbackRun?: unknown): ReliefValveRunFields[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => parseRunFields(item))
  }
  if (fallbackRun != null && typeof fallbackRun === 'object') {
    const run = parseRunFields(fallbackRun)
    return runHasAnyData(run) || run.result ? [run] : [emptyReliefValveRunFields()]
  }
  return [emptyReliefValveRunFields()]
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
    o.finalAttempts != null ||
    o.pretestAttempts != null ||
    typeof o.includePretest === 'boolean' ||
    typeof o.pretestKind === 'string'

  if (hasNestedShape) {
    const pretestAttempts = parseAttempts(o.pretestAttempts, o.pretest)
    const finalAttempts = parseAttempts(o.finalAttempts, o.final)
    const pretestKind = String(o.pretestKind ?? o.testType ?? '').trim()
    const includePretest =
      typeof o.includePretest === 'boolean'
        ? o.includePretest
        : Boolean(pretestKind) || pretestAttempts.some((run) => runHasAnyData(run))
    return {
      ...header,
      includePretest,
      pretestKind,
      pretestAttempts,
      finalAttempts,
    }
  }

  // Legacy flat shape (single pretest-style run) → migrate into pretest attempts.
  const legacyRun = parseRunFields(o)
  const legacyType = String(o.testType ?? '').trim()
  const hasLegacyRun = Boolean(legacyType) || runHasAnyData(legacyRun)
  return {
    ...header,
    includePretest: hasLegacyRun,
    pretestKind: legacyType,
    pretestAttempts: hasLegacyRun ? [legacyRun] : [emptyReliefValveRunFields()],
    finalAttempts: [emptyReliefValveRunFields()],
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

function parseEnteredPressures(...rawValues: string[]): number[] {
  const values: number[] = []
  for (const raw of rawValues) {
    const value = parseReliefPressureValue(raw)
    if (value !== null) values.push(value)
  }
  return values
}

function averageOf(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Running average of whichever pop readings are entered so far (1–3). */
export function averageReliefValveTests(
  fields: Pick<ReliefValveRunFields, 'test1' | 'test2' | 'test3'>,
): number | null {
  return averageOf(parseEnteredPressures(fields.test1, fields.test2, fields.test3))
}

/** Running average of whichever reseat readings are entered so far (1–3). */
export function averageReliefValveReseatTests(
  fields: Pick<ReliefValveRunFields, 'reseat1' | 'reseat2' | 'reseat3'>,
): number | null {
  return averageOf(parseEnteredPressures(fields.reseat1, fields.reseat2, fields.reseat3))
}

export function countReliefValvePopTests(
  fields: Pick<ReliefValveRunFields, 'test1' | 'test2' | 'test3'>,
): number {
  return parseEnteredPressures(fields.test1, fields.test2, fields.test3).length
}

export function countReliefValveReseatTests(
  fields: Pick<ReliefValveRunFields, 'reseat1' | 'reseat2' | 'reseat3'>,
): number {
  return parseEnteredPressures(fields.reseat1, fields.reseat2, fields.reseat3).length
}

export function hasCompleteReliefValvePopTests(
  fields: Pick<ReliefValveRunFields, 'test1' | 'test2' | 'test3'>,
): boolean {
  return countReliefValvePopTests(fields) === 3
}

export function hasCompleteReliefValveReseatTests(
  fields: Pick<ReliefValveRunFields, 'reseat1' | 'reseat2' | 'reseat3'>,
): boolean {
  return countReliefValveReseatTests(fields) === 3
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
  enteredCount: number
  complete: boolean
  setPressure: number | null
  maxPassPressure: number | null
  result: 'pass' | 'fail' | ''
  summary: string
}

export type ReliefValveReseatEvaluation = {
  reseatAverage: number | null
  reseatEnteredCount: number
  reseatComplete: boolean
  popAverage: number | null
  popEnteredCount: number
  popComplete: boolean
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
 * Average auto-updates as each pop is entered; pass/fail waits for all three.
 */
export function evaluateReliefValvePassFail(fields: ReliefValveRunEvalInput): ReliefValvePassEvaluation {
  const setPressure = parseReliefPressureValue(fields.setPressure)
  const enteredCount = countReliefValvePopTests(fields)
  const complete = enteredCount === 3
  const average = averageReliefValveTests(fields)

  if (setPressure === null) {
    return {
      average,
      enteredCount,
      complete,
      setPressure: null,
      maxPassPressure: null,
      result: '',
      summary: 'Enter set pressure to see the pop pass band',
    }
  }

  const { min, max } = reliefValvePassBand(setPressure)
  const maxLabel = formatReliefValveAverage(max)
  const setLabel = formatReliefValveAverage(setPressure)
  const bandSummary = `Pass: ${setLabel}–${maxLabel} PSI (set to +${RELIEF_VALVE_PASS_TOLERANCE_PERCENT}%)`

  if (average === null) {
    return {
      average: null,
      enteredCount,
      complete,
      setPressure,
      maxPassPressure: max,
      result: '',
      summary: `${bandSummary}. Enter pop tests to start the average.`,
    }
  }

  const avgLabel = formatReliefValveAverage(average)
  const progress = complete ? '3 of 3' : `${enteredCount} of 3`

  if (!complete) {
    return {
      average,
      enteredCount,
      complete,
      setPressure,
      maxPassPressure: max,
      result: '',
      summary: `${bandSummary} · running average ${avgLabel} PSI (${progress})`,
    }
  }

  if (average + 1e-9 >= min && average - 1e-9 <= max) {
    return {
      average,
      enteredCount,
      complete,
      setPressure,
      maxPassPressure: max,
      result: 'pass',
      summary: `${bandSummary} · average ${avgLabel} PSI`,
    }
  }

  if (average < min) {
    return {
      average,
      enteredCount,
      complete,
      setPressure,
      maxPassPressure: max,
      result: 'fail',
      summary: `Pop average ${avgLabel} PSI is below set pressure ${setLabel} PSI (${bandSummary})`,
    }
  }

  return {
    average,
    enteredCount,
    complete,
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
 * Reseat average must be within media % of the pop average.
 * Steam 6%, Air/Gas 10%, Liquid target 10% with no pass/fail.
 * Pop/reseat averages and the reseat band update as each reading is entered;
 * pass/fail waits until all three pops and three reseats are complete.
 */
export function evaluateReliefValveReseat(fields: ReliefValveRunEvalInput): ReliefValveReseatEvaluation {
  const popEnteredCount = countReliefValvePopTests(fields)
  const popComplete = popEnteredCount === 3
  const reseatEnteredCount = countReliefValveReseatTests(fields)
  const reseatComplete = reseatEnteredCount === 3
  const popAverage = averageReliefValveTests(fields)
  const reseatAverage = averageReliefValveReseatTests(fields)
  const mediaRule = reseatToleranceForMedia(fields.media)

  if (!mediaRule) {
    return {
      reseatAverage,
      reseatEnteredCount,
      reseatComplete,
      popAverage,
      popEnteredCount,
      popComplete,
      tolerancePercent: null,
      enforced: false,
      minPass: null,
      maxPass: null,
      percentDiff: null,
      result: '',
      summary: 'Select media for reseat criteria',
    }
  }

  const minPass = popAverage === null ? null : popAverage * (1 - mediaRule.percent / 100)
  const maxPass = popAverage === null ? null : popAverage * (1 + mediaRule.percent / 100)

  if (popAverage === null) {
    return {
      reseatAverage,
      reseatEnteredCount,
      reseatComplete,
      popAverage: null,
      popEnteredCount,
      popComplete,
      tolerancePercent: mediaRule.percent,
      enforced: mediaRule.enforced,
      minPass: null,
      maxPass: null,
      percentDiff: null,
      result: '',
      summary: mediaRule.enforced
        ? `Reseat pass band = pop average ±${mediaRule.percent}% (${mediaRule.label}). Enter pop tests to calculate numbers.`
        : `Reseat target band = pop average ±${mediaRule.percent}% (${mediaRule.label}, advisory). Enter pop tests to calculate numbers.`,
    }
  }

  const popLabel = formatReliefValveAverage(popAverage)
  const minLabel = formatReliefValveAverage(minPass)
  const maxLabel = formatReliefValveAverage(maxPass)
  const bandLabel = mediaRule.enforced
    ? `Pass: ${minLabel}–${maxLabel} PSI (±${mediaRule.percent}% of pop average ${popLabel})`
    : `Target: ${minLabel}–${maxLabel} PSI (±${mediaRule.percent}% of pop average ${popLabel}, advisory)`
  const popProgress = popComplete ? '3 of 3 pops' : `${popEnteredCount} of 3 pops`

  if (reseatAverage === null) {
    return {
      reseatAverage: null,
      reseatEnteredCount,
      reseatComplete,
      popAverage,
      popEnteredCount,
      popComplete,
      tolerancePercent: mediaRule.percent,
      enforced: mediaRule.enforced,
      minPass,
      maxPass,
      percentDiff: null,
      result: '',
      summary: `${bandLabel} · ${popProgress}. Enter reseat tests.`,
    }
  }

  if (Math.abs(popAverage) < 1e-9) {
    return {
      reseatAverage,
      reseatEnteredCount,
      reseatComplete,
      popAverage,
      popEnteredCount,
      popComplete,
      tolerancePercent: mediaRule.percent,
      enforced: mediaRule.enforced,
      minPass: null,
      maxPass: null,
      percentDiff: null,
      result: mediaRule.enforced && popComplete && reseatComplete ? 'fail' : '',
      summary: 'Pop average must be greater than zero to evaluate reseat',
    }
  }

  const percentDiff = (Math.abs(reseatAverage - popAverage) / Math.abs(popAverage)) * 100
  const within = percentDiff <= mediaRule.percent + 1e-9
  const reseatLabel = formatReliefValveAverage(reseatAverage)
  const diffLabel = formatReliefValveAverage(percentDiff)
  const reseatProgress = reseatComplete ? '3 of 3 reseats' : `${reseatEnteredCount} of 3 reseats`

  if (!popComplete || !reseatComplete) {
    return {
      reseatAverage,
      reseatEnteredCount,
      reseatComplete,
      popAverage,
      popEnteredCount,
      popComplete,
      tolerancePercent: mediaRule.percent,
      enforced: mediaRule.enforced,
      minPass,
      maxPass,
      percentDiff,
      result: '',
      summary: `${bandLabel} · running reseat average ${reseatLabel} PSI (${reseatProgress}, ${popProgress})`,
    }
  }

  if (!mediaRule.enforced) {
    return {
      reseatAverage,
      reseatEnteredCount,
      reseatComplete,
      popAverage,
      popEnteredCount,
      popComplete,
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
      reseatEnteredCount,
      reseatComplete,
      popAverage,
      popEnteredCount,
      popComplete,
      tolerancePercent: mediaRule.percent,
      enforced: true,
      minPass,
      maxPass,
      percentDiff,
      result: 'pass',
      summary: `${mediaRule.label} reseat within ${mediaRule.percent}% of pop average (${diffLabel}%): ${minLabel}–${maxLabel} PSI`,
    }
  }

  return {
    reseatAverage,
    reseatEnteredCount,
    reseatComplete,
    popAverage,
    popEnteredCount,
    popComplete,
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

/** @deprecated Prefer evaluateReliefValveRun on a specific attempt. */
export function evaluateReliefValveOverall(fields: ReliefValveTestFields): ReliefValveOverallEvaluation {
  const run =
    fields.includePretest && runHasAnyData(latestReliefAttempt(fields.pretestAttempts))
      ? latestReliefAttempt(fields.pretestAttempts)
      : latestReliefAttempt(fields.finalAttempts)
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
    pretestAttempts: ensureReliefAttempts(fields.pretestAttempts).map((run) =>
      fields.includePretest ? applyRunEvaluations(run, fields) : run,
    ),
    finalAttempts: ensureReliefAttempts(fields.finalAttempts).map((run) =>
      applyRunEvaluations(run, fields),
    ),
  }
}

function validateRunFields(
  run: ReliefValveRunFields,
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>,
  label: string,
): string | null {
  if (!run.tester.trim()) {
    return `Select at least one tester for the ${label}`
  }
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

function validateAttempts(
  attempts: ReliefValveRunFields[],
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>,
  baseLabel: string,
  options: { requireLatest: boolean },
): string | null {
  const list = ensureReliefAttempts(attempts)
  for (let index = 0; index < list.length; index += 1) {
    const run = list[index]!
    const isLatest = index === list.length - 1
    if (!isLatest && !runHasAnyData(run) && !run.result) continue
    if (isLatest && !options.requireLatest && !runHasAnyData(run)) continue
    const label = list.length > 1 ? `${baseLabel} attempt ${index + 1}` : baseLabel
    const error = validateRunFields(run, header, label)
    if (error) return error
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
    const pretestError = validateAttempts(fields.pretestAttempts, fields, 'Pretest', {
      requireLatest: true,
    })
    if (pretestError) return pretestError
  }

  const finalStarted = ensureReliefAttempts(fields.finalAttempts).some(
    (run) => runHasAnyData(run) || Boolean(run.result),
  )
  if (!fields.includePretest || finalStarted) {
    const finalError = validateAttempts(fields.finalAttempts, fields, 'Final test', {
      requireLatest: !fields.includePretest || finalStarted,
    })
    if (finalError) return finalError
  }

  if (!fields.includePretest && !finalStarted) {
    return 'Enter the Final test for Relief Valve'
  }

  return null
}

/** Row-level pass/fail prefers the latest final attempt (what ships). */
export function reliefValveRecordPassFail(fields: ReliefValveTestFields): 'PASS' | 'FAIL' | '' {
  const finalAttempts = ensureReliefAttempts(fields.finalAttempts)
  const latestFinal = latestReliefAttempt(finalAttempts)
  if (latestFinal.result === 'pass') return 'PASS'
  if (latestFinal.result === 'fail') return 'FAIL'
  if (finalAttempts.some((run) => run.result === 'fail')) return 'FAIL'

  if (fields.includePretest) {
    const latestPretest = latestReliefAttempt(fields.pretestAttempts)
    if (latestPretest.result === 'fail') return 'FAIL'
    if (ensureReliefAttempts(fields.pretestAttempts).some((run) => run.result === 'fail')) return 'FAIL'
    if (latestPretest.result === 'pass') return ''
  }
  return ''
}

export function formatReliefValveWorkedSummary(fields: ReliefValveTestFields): string | null {
  const parts: string[] = []
  if (fields.includePretest) {
    const pretestCount = ensureReliefAttempts(fields.pretestAttempts).filter(
      (run) => runHasAnyData(run) || run.result,
    ).length
    const label = fields.pretestKind.trim() || 'Pretest'
    parts.push(pretestCount > 1 ? `${label} ×${pretestCount}` : label)
  }
  const finalCount = ensureReliefAttempts(fields.finalAttempts).filter(
    (run) => runHasAnyData(run) || run.result,
  ).length
  if (finalCount > 0) {
    parts.push(finalCount > 1 ? `Final ×${finalCount}` : 'Final')
  }
  return parts.length ? parts.join(' + ') : null
}

export function formatReliefValveFailReasons(fields: ReliefValveTestFields): string[] {
  const notes: string[] = []
  if (fields.includePretest) {
    ensureReliefAttempts(fields.pretestAttempts).forEach((run, index, list) => {
      if (run.result === 'fail' && run.reason.trim()) {
        const label = list.length > 1 ? `Pretest attempt ${index + 1}` : 'Pretest'
        notes.push(`${label}: ${run.reason.trim()}`)
      }
    })
  }
  ensureReliefAttempts(fields.finalAttempts).forEach((run, index, list) => {
    if (run.result === 'fail' && run.reason.trim()) {
      const label = list.length > 1 ? `Final attempt ${index + 1}` : 'Final'
      notes.push(`${label}: ${run.reason.trim()}`)
    }
  })
  return notes
}

/** Combine pretest + final tester initials for the legacy test_logs.tester column. */
export function formatReliefValveLegacyTester(fields: ReliefValveTestFields): string | null {
  const parts: string[] = []
  if (fields.includePretest) {
    for (const run of ensureReliefAttempts(fields.pretestAttempts)) {
      if (run.tester.trim()) parts.push(run.tester.trim())
    }
  }
  for (const run of ensureReliefAttempts(fields.finalAttempts)) {
    if (run.tester.trim()) parts.push(run.tester.trim())
  }
  if (!parts.length) return null
  const seen = new Set<string>()
  const initials: string[] = []
  for (const part of parts) {
    for (const token of part
      .split(/[,/;+]|\s+&\s+|\s+and\s+/i)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)) {
      if (seen.has(token)) continue
      seen.add(token)
      initials.push(token)
    }
  }
  return initials.join(', ') || null
}

/** Seed latest-run testers from a legacy row-level tester string when missing. */
export function seedReliefValveTestersFromLegacy(
  fields: ReliefValveTestFields,
  legacyTester: string | null | undefined,
): ReliefValveTestFields {
  const legacy = String(legacyTester ?? '').trim()
  if (!legacy) return fields

  const pretestAttempts = ensureReliefAttempts(fields.pretestAttempts)
  const finalAttempts = ensureReliefAttempts(fields.finalAttempts)
  const latestPretest = latestReliefAttempt(pretestAttempts)
  const latestFinal = latestReliefAttempt(finalAttempts)
  const pretestNeeds = fields.includePretest && !latestPretest.tester.trim()
  const finalNeeds = !latestFinal.tester.trim()
  if (!pretestNeeds && !finalNeeds) return fields

  return {
    ...fields,
    pretestAttempts: pretestNeeds
      ? pretestAttempts.map((run, index) =>
          index === pretestAttempts.length - 1 ? { ...run, tester: legacy } : run,
        )
      : pretestAttempts,
    finalAttempts: finalNeeds
      ? finalAttempts.map((run, index) =>
          index === finalAttempts.length - 1 ? { ...run, tester: legacy } : run,
        )
      : finalAttempts,
  }
}
