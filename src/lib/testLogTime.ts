export const TEST_TIME_OTHER = '__other__'

export const TEST_TIME_OPTIONS = ['5 Min', '15 Min', '4 Hours'] as const

/** Normalize saved/auto-filled hold times onto the dropdown options when possible. */
export function normalizeTestTimeLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  const compact = lower.replace(/\s+/g, '')

  if (
    compact === '5min' ||
    compact === '5mins' ||
    compact === '5m' ||
    compact === '5minute' ||
    compact === '5minutes' ||
    compact === '300s' ||
    compact === '300sec' ||
    compact === '300seconds' ||
    /^5\s*min(ute)?s?$/i.test(trimmed)
  ) {
    return '5 Min'
  }
  if (
    compact === '15min' ||
    compact === '15mins' ||
    compact === '15m' ||
    compact === '15minute' ||
    compact === '15minutes' ||
    compact === '900s' ||
    compact === '900sec' ||
    compact === '900seconds' ||
    /^15\s*min(ute)?s?$/i.test(trimmed)
  ) {
    return '15 Min'
  }
  if (
    compact === '4hour' ||
    compact === '4hours' ||
    compact === '4hr' ||
    compact === '4hrs' ||
    compact === '4h' ||
    compact === '240min' ||
    compact === '240mins' ||
    /^4\s*(hour|hr)s?$/i.test(trimmed)
  ) {
    return '4 Hours'
  }

  const exact = TEST_TIME_OPTIONS.find((option) => option.toLowerCase() === lower)
  return exact ?? trimmed
}

export function resolveTestTimeSelection(time: string): { selectValue: string; customValue: string } {
  const normalized = normalizeTestTimeLabel(time)
  if (!normalized) return { selectValue: '', customValue: '' }
  if ((TEST_TIME_OPTIONS as readonly string[]).includes(normalized)) {
    return { selectValue: normalized, customValue: '' }
  }
  return { selectValue: TEST_TIME_OTHER, customValue: normalized }
}
