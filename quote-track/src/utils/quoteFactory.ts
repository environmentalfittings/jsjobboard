import type { Priority, Quote } from '../types'
import { deadlineFromReceived } from './timerLogic'

export function createEmptyQuote(input: {
  quoteNumber: string
  customerName: string
  description: string
  priority: Priority
}): Quote {
  const receivedAt = new Date()
  const deadlineAt = deadlineFromReceived(receivedAt, input.priority)
  return {
    id: crypto.randomUUID(),
    quoteNumber: input.quoteNumber.trim(),
    customerName: input.customerName.trim(),
    description: input.description.trim(),
    status: 'new',
    priority: input.priority,
    receivedAt: receivedAt.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    sentAt: null,
    closedAt: null,
    outcome: null,
    notes: '',
    lineItems: [],
    contactLog: [],
    attachments: [],
  }
}
