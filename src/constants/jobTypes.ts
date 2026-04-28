export const JOB_TYPES = ['Valve Repair', 'Machining', 'Welding', 'Manufacturing', 'Test Only'] as const

export type JobType = (typeof JOB_TYPES)[number]

const JOB_TYPE_SET = new Set<string>(JOB_TYPES)

export function normalizeJobType(raw: string | null | undefined): JobType {
  const value = (raw ?? '').trim()
  if (value && JOB_TYPE_SET.has(value)) return value as JobType
  return 'Valve Repair'
}

export function isValveRelatedJobType(raw: string | null | undefined): boolean {
  const jt = normalizeJobType(raw)
  return jt === 'Valve Repair' || jt === 'Test Only'
}
