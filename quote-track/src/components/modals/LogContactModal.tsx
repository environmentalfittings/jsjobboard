import { useState } from 'react'
import type { ContactEntry, ContactType } from '../../types'
import { extendDeadline } from '../../utils/timerLogic'
import { makeAttachment } from '../../utils/files'
import type { Quote } from '../../types'

interface LogContactModalProps {
  open: boolean
  quote: Quote | null
  onClose: () => void
  onSave: (next: Quote) => void
}

const EXT_OPTIONS = [
  { label: 'No extension', hours: 0 },
  { label: '+8 hours', hours: 8 },
  { label: '+12 hours', hours: 12 },
  { label: '+24 hours', hours: 24 },
] as const

export function LogContactModal({ open, quote, onClose, onSave }: LogContactModalProps) {
  const [type, setType] = useState<ContactType>('call')
  const [note, setNote] = useState('')
  const [extIdx, setExtIdx] = useState(0)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])

  if (!open || !quote) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const extHours = EXT_OPTIONS[extIdx].hours
    const entry: ContactEntry = {
      id: crypto.randomUUID(),
      quoteId: quote.id,
      type,
      note: note.trim(),
      timestamp: new Date().toISOString(),
      extensionHours: extHours,
      attachments: [],
    }
    const atts = []
    for (const f of files) {
      try {
        atts.push(
          await makeAttachment({
            parentId: entry.id,
            parentType: 'contact_entry',
            file: f,
            tag: 'email',
          }),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        return
      }
    }
    entry.attachments = atts
    const newDeadline =
      extHours > 0
        ? extendDeadline(new Date(quote.deadlineAt), extHours).toISOString()
        : quote.deadlineAt
    onSave({
      ...quote,
      deadlineAt: newDeadline,
      contactLog: [...quote.contactLog, entry],
      status: quote.status === 'new' ? 'in_progress' : quote.status,
    })
    setNote('')
    setExtIdx(0)
    setFiles([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-qt-border bg-qt-panel p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-qt-text">Log contact</h2>
        <p className="text-sm text-qt-muted">{quote.quoteNumber}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm text-qt-muted">
            Type
            <select
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={type}
              onChange={(e) => setType(e.target.value as ContactType)}
            >
              <option value="email_sent">Email sent</option>
              <option value="call">Call</option>
              <option value="text">Text</option>
              <option value="in_person">In person</option>
              <option value="customer_replied">Customer replied</option>
              <option value="rfq_to_vendor">RFQ to vendor</option>
              <option value="vendor_price_received">Vendor price received</option>
            </select>
          </label>
          <label className="block text-sm text-qt-muted">
            Notes
            <textarea
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Extend deadline
            <select
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={extIdx}
              onChange={(e) => setExtIdx(Number(e.target.value))}
            >
              {EXT_OPTIONS.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-qt-border px-4 py-2 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-qt-accent px-4 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
