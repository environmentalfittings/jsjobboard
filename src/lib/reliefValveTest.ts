import { VALVE_SIZES } from '../constants/jobLookups'

export const RELIEF_VALVE_MEDIA = ['Air/Gas', 'Liquid', 'Steam', 'Other'] as const
export type ReliefValveMedia = (typeof RELIEF_VALVE_MEDIA)[number]

export const RELIEF_VALVE_TEST_TYPES = ['Pretest', 'Pretest with Repair'] as const
export type ReliefValveTestType = (typeof RELIEF_VALVE_TEST_TYPES)[number]

export type ReliefValveTestFields = {
  inletSize: string
  outletSize: string
  setPressure: string
  media: string
  mediaOther: string
  testType: string
  /** Three pop / lift tests against set pressure. */
  test1: string
  test2: string
  test3: string
  /** Three reseat pressure tests. */
  reseat1: string
  reseat2: string
  reseat3: string
  /** Overall result (pop + reseat rules). */
  result: 'pass' | 'fail' | ''
  /** Reseat-only result (Liquid is advisory / na). */
  reseatResult: 'pass' | 'fail' | 'na' | ''
  reason: string
}

export function emptyReliefValveTestFields(): ReliefValveTestFields {
  return {
    inletSize: '',
    outletSize: '',
    setPressure: '',
    media: '',
    mediaOther: '',
    testType: '',
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

export function parseReliefValveTestFields(raw: unknown): ReliefValveTestFields {
  const empty = emptyReliefValveTestFields()
  if (!raw || typeof raw !== 'object') return empty
  const o = raw as Record<string, unknown>
  const reseatResult =
    o.reseatResult === 'pass' || o.reseatResult === 'fail' || o.reseatResult === 'na'
      ? o.reseatResult
      : ''
  return {
    inletSize: String(o.inletSize ?? '').trim(),
    outletSize: String(o.outletSize ?? '').trim(),
    setPressure: String(o.setPressure ?? '').trim(),
    media: normalizeStoredMedia(String(o.media ?? '')),
    mediaOther: String(o.mediaOther ?? '').trim(),
    testType: String(o.testType ?? '').trim(),
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

/** Parse a pressure string like "150", "150 PSI", "150.5#" into a number. */
export function parseReliefPressureValue(raw: string | null | undefined): number | null {
  const match = String(raw ?? '').trim().match(/-?\d+(?:\.\d+)?/)
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
  fields: Pick<ReliefValveTestFields, 'test1' | 'test2' | 'test3'>,
): number | null {
  return averageThree(fields.test1, fields.test2, fields.test3)
}

/** Average of the three reseat tests; null until all three numeric values are entered. */
export function averageReliefValveReseatTests(
  fields: Pick<ReliefValveTestFields, 'reseat1' | 'reseat2' | 'reseat3'>,
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
export function evaluateReliefValvePassFail(
  fields: Pick<ReliefValveTestFields, 'setPressure' | 'test1' | 'test2' | 'test3'>,
): ReliefValvePassEvaluation {
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
  if (n === 'air/gas' || n === 'other') return { percent: 10, enforced: true, label: n === 'other' ? 'Other' : 'Air/Gas' }
  if (n === 'liquid') return { percent: 10, enforced: false, label: 'Liquid' }
  return { percent: 10, enforced: true, label: media }
}

/**
 * Reseat average must be within media % of the three-pop average.
 * Steam 6%, Air/Gas 10%, Liquid target 10% with no pass/fail.
 */
export function evaluateReliefValveReseat(
  fields: Pick<
    ReliefValveTestFields,
    'media' | 'test1' | 'test2' | 'test3' | 'reseat1' | 'reseat2' | 'reseat3'
  >,
): ReliefValveReseatEvaluation {
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

export function evaluateReliefValveOverall(fields: ReliefValveTestFields): ReliefValveOverallEvaluation {
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
  const split = raw.split(/\s*[x×/]\s*/i).map((part) => part.trim()).filter(Boolean)
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

export function applyReliefValveEvaluations(fields: ReliefValveTestFields): ReliefValveTestFields {
  const overall = evaluateReliefValveOverall(fields)
  return {
    ...fields,
    result: overall.result,
    reseatResult: overall.reseat.result,
    reason: overall.result === 'pass' ? '' : fields.reason,
  }
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
  if (!fields.testType.trim()) return 'Test type is required for Relief Valve'
  if (!fields.test1.trim() || !fields.test2.trim() || !fields.test3.trim()) {
    return 'Enter all three set-pressure / pop tests for Relief Valve'
  }
  if (
    parseReliefPressureValue(fields.test1) === null ||
    parseReliefPressureValue(fields.test2) === null ||
    parseReliefPressureValue(fields.test3) === null
  ) {
    return 'Each Relief Valve pop test must be a number'
  }
  if (!fields.reseat1.trim() || !fields.reseat2.trim() || !fields.reseat3.trim()) {
    return 'Enter all three reseat pressure tests for Relief Valve'
  }
  if (
    parseReliefPressureValue(fields.reseat1) === null ||
    parseReliefPressureValue(fields.reseat2) === null ||
    parseReliefPressureValue(fields.reseat3) === null
  ) {
    return 'Each Relief Valve reseat test must be a number'
  }

  const overall = evaluateReliefValveOverall(fields)
  if (!overall.result) return overall.summary || 'Complete Relief Valve pop and reseat tests'
  if (fields.result !== overall.result) {
    return `Relief Valve result must be ${overall.result.toUpperCase()} based on pop and reseat rules`
  }
  if (fields.reseatResult !== overall.reseat.result) {
    return 'Relief Valve reseat result is out of date — re-enter reseat values'
  }
  if (fields.result === 'fail' && !fields.reason.trim()) {
    return 'Enter a fail reason for the Relief Valve test'
  }
  return null
}
