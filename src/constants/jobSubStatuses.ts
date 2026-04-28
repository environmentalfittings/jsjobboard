/**
 * Granular shop sub-status for each job (independent of Kanban column / main status).
 * Edit this array to change labels and ordering app-wide.
 */
export const JOB_SUB_STATUSES = [
  'Received',
  'Disassembly',
  'Inspection',
  'Machining',
  'Reassembly',
  'Testing',
  'Ready to Ship',
] as const

export type JobSubStatus = string

const SUB_STATUS_SET = new Set<string>(JOB_SUB_STATUSES)

export function isJobSubStatus(value: string): boolean {
  return SUB_STATUS_SET.has(value)
}

/** First stage used when the DB value is missing or unknown. */
export function defaultJobSubStatus(): JobSubStatus {
  return JOB_SUB_STATUSES[0]
}

export function normalizeJobSubStatus(raw: string | null | undefined): JobSubStatus {
  const t = (raw ?? '').trim()
  if (t) return t
  return defaultJobSubStatus()
}

export function jobSubStatusIndex(status: JobSubStatus): number {
  return JOB_SUB_STATUSES.indexOf(status as (typeof JOB_SUB_STATUSES)[number])
}
