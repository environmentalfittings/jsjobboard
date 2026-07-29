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
    result: o.result === 'pass' || o.result === 'fail' ? o.result : '',
    reason: String(o.reason ?? '').trim(),
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

export function validateReliefValveFields(fields: ReliefValveTestFields): string | null {
  if (!fields.inletSize.trim()) return 'Inlet size is required for Relief Valve'
  if (!fields.outletSize.trim()) return 'Outlet size is required for Relief Valve'
  if (!fields.setPressure.trim()) return 'Set pressure is required for Relief Valve'
  if (!fields.media.trim()) return 'Media is required for Relief Valve'
  if (fields.media.toLowerCase() === 'other' && !fields.mediaOther.trim()) {
    return 'Enter the Other media for Relief Valve'
  }
  if (!fields.testType.trim()) return 'Test type is required for Relief Valve'
  if (!fields.result) return 'Select Pass or Fail for the Relief Valve test'
  if (fields.result === 'fail' && !fields.reason.trim()) {
    return 'Enter a fail reason for the Relief Valve test'
  }
  return null
}
