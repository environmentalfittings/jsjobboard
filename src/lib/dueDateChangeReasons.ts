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
  /** Late / change explanation; required for Waiting on parts and Other. */
  comments: string
  /** Customer was notified at save time. */
  customerNotified: boolean
}

export type DueDateChangeSavePayload = {
  nextDueDate: string | null
} & DueDateChangeDetails

export function commentsRequiredForReason(code: DueDateChangeReasonCode | ''): boolean {
  return code === 'Waiting on parts' || code === 'Other'
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

export function validateDueDateChangeDetails(
  details: Partial<DueDateChangeDetails>,
): string | null {
  const code = details.reasonCode
  if (!code || !DUE_DATE_CHANGE_REASON_CODES.includes(code)) {
    return 'Select a reason for the due date change'
  }
  if (otherTextRequiredForReason(code) && !details.otherText?.trim()) {
    return 'Describe what Other means'
  }
  if (commentsRequiredForReason(code) && !details.comments?.trim()) {
    return 'Comments are required for this reason'
  }
  if (!details.customerNotified) {
    return 'Confirm the customer has been notified of this due date change'
  }
  return null
}
