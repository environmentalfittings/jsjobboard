export type QuoteStatus =
  | 'new'
  | 'in_progress'
  | 'sent'
  | 'won'
  | 'lost'
  | 'no_response'

export type Priority = 'rush' | 'standard' | 'low'

export type ContactType =
  | 'email_sent'
  | 'call'
  | 'rfq_to_vendor'
  | 'customer_replied'
  | 'vendor_price_received'
  | 'text'
  | 'in_person'

export type VendorQuoteStatus = 'pending' | 'rfq_sent' | 'price_received'

export type AttachmentTag = 'rfq' | 'vendor_quote' | 'drawing' | 'email' | 'other'

export type AttachmentParentType = 'quote' | 'line_item' | 'vendor_quote' | 'contact_entry'

export interface Attachment {
  id: string
  parentId: string
  parentType: AttachmentParentType
  fileName: string
  fileSize: number
  mimeType: string
  data: string
  uploadedAt: string
  tag: AttachmentTag
}

export interface VendorQuote {
  id: string
  lineItemId: string
  vendorName: string
  unitPrice: number | null
  leadTime: string | null
  status: VendorQuoteStatus
  notes: string
  attachments: Attachment[]
  sentAt: string | null
  receivedAt: string | null
}

export interface LineItem {
  id: string
  quoteId: string
  name: string
  description: string
  quantity: number
  notes: string
  vendorQuotes: VendorQuote[]
  selectedVendorId: string | null
}

export interface ContactEntry {
  id: string
  quoteId: string
  type: ContactType
  note: string
  timestamp: string
  extensionHours: number
  attachments: Attachment[]
}

export interface Quote {
  id: string
  quoteNumber: string
  customerName: string
  description: string
  status: QuoteStatus
  priority: Priority
  receivedAt: string
  deadlineAt: string
  sentAt: string | null
  closedAt: string | null
  outcome: 'won' | 'lost' | 'no_response' | null
  notes: string
  lineItems: LineItem[]
  contactLog: ContactEntry[]
  attachments: Attachment[]
}

export type TimerVisualState = 'green' | 'yellow' | 'red' | 'late'

export type BoardSort = 'urgent' | 'newest' | 'customer'
