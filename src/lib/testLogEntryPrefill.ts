/** Query-string keys must match `TestLogEntryPage` prefill reader. */
export const TEST_LOG_PREFILL_KEYS = {
  valveId: 'valveId',
  size: 'size',
  valveType: 'valveType',
  testType: 'testType',
  customer: 'customer',
  cell: 'cell',
  description: 'description',
  jobStatus: 'jobStatus',
} as const

export type JobCardTestLogPrefill = {
  valveId: string
  size?: string | null
  valveType?: string | null
  testType?: string | null
  customer?: string | null
  cell?: string | null
  description?: string | null
  jobStatus?: string | null
}

const MAX_DESCRIPTION_LEN = 1500

/** Build `/test-log-entry?…` from job card context (for Link `to` prop). */
export function buildTestLogEntryHref(p: JobCardTestLogPrefill): string {
  const params = new URLSearchParams()
  const vid = (p.valveId ?? '').trim()
  if (vid) params.set(TEST_LOG_PREFILL_KEYS.valveId, vid)

  const sz = (p.size ?? '').trim()
  if (sz) params.set(TEST_LOG_PREFILL_KEYS.size, sz)

  const vt = (p.valveType ?? '').trim()
  if (vt) params.set(TEST_LOG_PREFILL_KEYS.valveType, vt)

  const tt = (p.testType ?? '').trim()
  if (tt) params.set(TEST_LOG_PREFILL_KEYS.testType, tt)

  const cust = (p.customer ?? '').trim()
  if (cust) params.set(TEST_LOG_PREFILL_KEYS.customer, cust)

  const cell = (p.cell ?? '').trim()
  if (cell) params.set(TEST_LOG_PREFILL_KEYS.cell, cell)

  const desc = (p.description ?? '').trim()
  if (desc) params.set(TEST_LOG_PREFILL_KEYS.description, desc.slice(0, MAX_DESCRIPTION_LEN))

  const st = (p.jobStatus ?? '').trim()
  if (st) params.set(TEST_LOG_PREFILL_KEYS.jobStatus, st)

  const qs = params.toString()
  return qs ? `/test-log-entry?${qs}` : '/test-log-entry'
}
