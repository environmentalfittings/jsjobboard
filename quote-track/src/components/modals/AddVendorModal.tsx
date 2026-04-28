import { useState } from 'react'
import type { Quote, VendorQuote, VendorQuoteStatus } from '../../types'
import { makeAttachment } from '../../utils/files'

interface AddVendorModalProps {
  open: boolean
  quote: Quote | null
  lineItemId: string | null
  onClose: () => void
  onSave: (next: Quote) => void
}

export function AddVendorModal({ open, quote, lineItemId, onClose, onSave }: AddVendorModalProps) {
  const [vendorName, setVendorName] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [leadTime, setLeadTime] = useState('')
  const [status, setStatus] = useState<VendorQuoteStatus>('pending')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)

  if (!open || !quote || !lineItemId) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!vendorName.trim()) return
    const price = unitPrice.trim() === '' ? null : Number(unitPrice)
    if (unitPrice.trim() !== '' && !Number.isFinite(price)) {
      setError('Invalid price')
      return
    }
    const vId = crypto.randomUUID()
    const v: VendorQuote = {
      id: vId,
      lineItemId,
      vendorName: vendorName.trim(),
      unitPrice: price,
      leadTime: leadTime.trim() || null,
      status,
      notes: notes.trim(),
      attachments: [],
      sentAt: status === 'rfq_sent' ? new Date().toISOString() : null,
      receivedAt: status === 'price_received' ? new Date().toISOString() : null,
    }
    if (file) {
      try {
        v.attachments = [
          await makeAttachment({
            parentId: vId,
            parentType: 'vendor_quote',
            file,
            tag: 'vendor_quote',
          }),
        ]
      } catch (err) {
        setError(err instanceof Error ? err.message : 'File error')
        return
      }
    }
    const lineItems = quote.lineItems.map((li) =>
      li.id === lineItemId ? { ...li, vendorQuotes: [...li.vendorQuotes, v] } : li,
    )
    onSave({ ...quote, lineItems })
    setVendorName('')
    setUnitPrice('')
    setLeadTime('')
    setStatus('pending')
    setNotes('')
    setFile(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-qt-border bg-qt-panel p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-qt-text">Add vendor quote</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm text-qt-muted">
            Vendor name *
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Unit price
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Lead time
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              placeholder="e.g. 3 weeks"
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Status
            <select
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={status}
              onChange={(e) => setStatus(e.target.value as VendorQuoteStatus)}
            >
              <option value="pending">Pending</option>
              <option value="rfq_sent">RFQ sent</option>
              <option value="price_received">Price received</option>
            </select>
          </label>
          <label className="block text-sm text-qt-muted">
            Notes
            <textarea
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Attachment (PDF, etc.)
            <input type="file" className="mt-1 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
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
