import { VALVE_SIZES } from '../constants/jobLookups'

export const RELIEF_VALVE_MEDIA = ['Air', 'Liquid', 'Steam', 'Other'] as const
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
  result: 'pass' | 'fail' | ''
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
    result: '',
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

export function parseReliefValveTestFields(raw: unknown): ReliefValveTestFields {
  const empty = emptyReliefValveTestFields()
  if (!raw || typeof raw !== 'object') return empty
  const o = raw as Record<string, unknown>
  return {
    inletSize: String(o.inletSize ?? '').trim(),
    outletSize: String(o.outletSize ?? '').trim(),
    setPressure: String(o.setPressure ?? '').trim(),
    media: String(o.media ?? '').trim(),
    mediaOther: String(o.mediaOther ?? '').trim(),
    testType: String(o.testType ?? '').trim(),
    test1: String(o.test1 ?? '').trim(),
    test2: String(o.test2 ?? '').trim(),
    test3: String(o.test3 ?? '').trim(),
    result: o.result === 'pass' || o.result === 'fail' ? o.result : '',
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

/** Average of the three pop tests; null until all three numeric values are entered. */
export function averageReliefValveTests(fields: Pick<ReliefValveTestFields, 'test1' | 'test2' | 'test3'>): number | null {
  const values = [fields.test1, fields.test2, fields.test3].map(parseReliefPressureValue)
  if (values.some((value) => value === null)) return null
  const total = (values[0] as number) + (values[1] as number) + (values[2] as number)
  return total / 3
}

export function formatReliefValveAverage(average: number | null): string {
  if (average === null) return ''
  const rounded = Math.round(average * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
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
    return 'Enter all three set-pressure tests for Relief Valve'
  }
  if (
    parseReliefPressureValue(fields.test1) === null ||
    parseReliefPressureValue(fields.test2) === null ||
    parseReliefPressureValue(fields.test3) === null
  ) {
    return 'Each Relief Valve test must be a number'
  }
  if (!fields.result) return 'Select Pass or Fail for the Relief Valve test'
  if (fields.result === 'fail' && !fields.reason.trim()) {
    return 'Enter a fail reason for the Relief Valve test'
  }
  return null
}
