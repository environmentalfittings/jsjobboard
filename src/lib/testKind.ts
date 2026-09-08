/** Shop test kind for job-card badges and Testing status stamps. */
export type ShopTestKind = 'pre' | 'final'

/** True when a test log (or related text) is a pretest / as-received test. */
export function isPretestLogText(...parts: Array<string | null | undefined>): boolean {
  const text = parts
    .map((part) => String(part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
  if (!text) return false
  return (
    /\bpre[\s_-]?test\b/.test(text) ||
    /\bpretest\b/.test(text) ||
    /\bas[\s_-]?received\s+test\b/.test(text) ||
    text.includes('prv pretest')
  )
}

export function defaultShopTestKind(valve: {
  date_pre_tested?: string | null
}): ShopTestKind {
  return valve.date_pre_tested?.trim() ? 'final' : 'pre'
}

export function shopTestKindLabel(kind: ShopTestKind): string {
  return kind === 'pre' ? 'Pre-test' : 'Final test'
}
