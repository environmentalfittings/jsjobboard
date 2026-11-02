/**
 * Cutoff for the dashboard customer-response queue (America/Chicago calendar day).
 * - On/before this date: only still-in-shop (not Completed) due date changes appear.
 * - After this date: every due date change stays on the list until Approved / Cancelled / Other.
 */
export const DUE_DATE_CUSTOMER_QUEUE_CUTOFF_DATE = '2026-11-02'

/** Inclusive end of the cutoff day in Chicago (CST = UTC-6 on this date). */
export const DUE_DATE_CUSTOMER_QUEUE_CUTOFF_END_ISO = '2026-11-03T05:59:59.999Z'

/** Technician reason codes when moving a due date. */
export const DUE_DATE_CHANGE_REASON_CODES = [
  'Due date unrealistic',
  'Waiting on parts',
  'Postponed due to outside repair vendor',
  'Rework was required',
  'Other',
] as const

export type DueDateChangeReasonCode = (typeof DUE_DATE_CHANGE_REASON_CODES)[number]

export const DUE_DATE_CUSTOMER_RESPONSES = ['Approved', 'Cancelled', 'Other'] as const
export type DueDateCustomerResponse = (typeof DUE_DATE_CUSTOMER_RESPONSES)[number]

export type DueDateChangeDetails = {
  reasonCode: DueDateChangeReasonCode
  /** Required when reasonCode is Other — what “Other” means. */
  otherText: string
  /** Late / change explanation — required for every reason. */
  comments: string
  /** Customer was notified at save time. */
  customerNotified: boolean
}

export type DueDateChangeSavePayload = {
  nextDueDate: string | null
} & DueDateChangeDetails

/** Comments are required for every due date change reason. */
export function commentsRequiredForReason(code: DueDateChangeReasonCode | ''): boolean {
  return Boolean(code)
}

export function otherTextRequiredForReason(code: DueDateChangeReasonCode | ''): boolean {
  return code === 'Other'
}

/** Single display string stored in due_date_changes.reason (report column). */
export function formatDueDateChangeReason(
  code: DueDateChangeReasonCode,
  otherText: string,
  comments: string,
): string {
  const parts: string[] = []
  if (code === 'Other') {
    const other = otherText.trim()
    parts.push(other ? `Other: ${other}` : 'Other')
  } else {
    parts.push(code)
  }
  const note = comments.trim()
  if (note) parts.push(note)
  return parts.join(' — ')
}

/** Reason dropdown / Other / comments only (dashboard edit, no notify checkbox). */
export function validateDueDateChangeReasonFields(details: {
  reasonCode?: DueDateChangeReasonCode | ''
  otherText?: string
  comments?: string
}): string | null {
  const code = details.reasonCode
  if (!code || !DUE_DATE_CHANGE_REASON_CODES.includes(code)) {
    return 'Select a reason for the due date change'
  }
  if (otherTextRequiredForReason(code) && !details.otherText?.trim()) {
    return 'Describe what Other means'
  }
  if (commentsRequiredForReason(code) && !details.comments?.trim()) {
    return 'Comments are required'
  }
  return null
}

export function validateDueDateChangeDetails(
  details: Partial<DueDateChangeDetails>,
): string | null {
  const reasonError = validateDueDateChangeReasonFields(details)
  if (reasonError) return reasonError
  if (!details.customerNotified) {
    return 'Confirm the customer has been notified of this due date change'
  }
  return null
}

export function parseReasonCodeFromRecord(
  reasonCode: string | null | undefined,
): DueDateChangeReasonCode | '' {
  if (reasonCode && DUE_DATE_CHANGE_REASON_CODES.includes(reasonCode as DueDateChangeReasonCode)) {
    return reasonCode as DueDateChangeReasonCode
  }
  return ''
}
