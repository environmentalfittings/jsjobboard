import { useState } from 'react'
import type { LineItem, Quote, VendorQuote } from '../../types'

interface AddLineItemModalProps {
  open: boolean
  quote: Quote | null
  onClose: () => void
  onSave: (next: Quote) => void
}

export function AddLineItemModal({ open, quote, onClose, onSave }: AddLineItemModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [firstVendor, setFirstVendor] = useState('')
  const [notes, setNotes] = useState('')

  if (!open || !quote) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const lineId = crypto.randomUUID()
    const vendorQuotes: VendorQuote[] = []
    if (firstVendor.trim()) {
      vendorQuotes.push({
        id: crypto.randomUUID(),
        lineItemId: lineId,
        vendorName: firstVendor.trim(),
        unitPrice: null,
        leadTime: null,
        status: 'pending',
        notes: '',
        attachments: [],
        sentAt: null,
        receivedAt: null,
      })
    }
    const item: LineItem = {
      id: lineId,
      quoteId: quote.id,
      name: name.trim(),
      description: description.trim(),
      quantity: Math.max(1, quantity),
      notes: notes.trim(),
      vendorQuotes,
      selectedVendorId: null,
    }
    onSave({
      ...quote,
      lineItems: [...quote.lineItems, item],
    })
    setName('')
    setDescription('')
    setQuantity(1)
    setFirstVendor('')
    setNotes('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-qt-border bg-qt-panel p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-qt-text">Add line item</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm text-qt-muted">
            Item name *
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Description / spec
            <textarea
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Quantity
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm text-qt-muted">
            First vendor (optional)
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={firstVendor}
              onChange={(e) => setFirstVendor(e.target.value)}
            />
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
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-qt-border px-4 py-2 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-qt-accent px-4 py-2 text-sm font-semibold text-white">
              Add item
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
