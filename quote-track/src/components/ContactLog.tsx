import type { ContactEntry, ContactType } from '../types'
import { formatDateTime } from '../utils/formatters'

const TYPE_ICON: Record<ContactType, string> = {
  email_sent: '✉',
  call: '📞',
  rfq_to_vendor: '📤',
  customer_replied: '↩',
  vendor_price_received: '💲',
  text: '💬',
  in_person: '🤝',
}

const TYPE_LABEL: Record<ContactType, string> = {
  email_sent: 'Email sent',
  call: 'Call',
  rfq_to_vendor: 'RFQ to vendor',
  customer_replied: 'Customer replied',
  vendor_price_received: 'Vendor price',
  text: 'Text',
  in_person: 'In person',
}

interface ContactLogProps {
  entries: ContactEntry[]
}

export function ContactLog({ entries }: ContactLogProps) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
  if (sorted.length === 0) {
    return <p className="text-sm text-qt-muted">No contacts logged yet.</p>
  }
  return (
    <ul className="space-y-3">
      {sorted.map((e) => (
        <li
          key={e.id}
          className="rounded-lg border border-qt-border bg-qt-panel2/50 p-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg" title={TYPE_LABEL[e.type]}>
              {TYPE_ICON[e.type]}
            </span>
            <span className="font-medium text-qt-text">{TYPE_LABEL[e.type]}</span>
            <span className="text-xs text-qt-muted">{formatDateTime(new Date(e.timestamp))}</span>
            {e.extensionHours > 0 ? (
              <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                +{e.extensionHours}h extension
              </span>
            ) : null}
          </div>
          {e.note ? <p className="mt-2 whitespace-pre-wrap text-qt-muted">{e.note}</p> : null}
        </li>
      ))}
    </ul>
  )
}
