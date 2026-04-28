import { useState } from 'react'
import type { LineItem } from '../types'
import { VendorTable } from './VendorTable'

interface LineItemRowProps {
  item: LineItem
  disabled?: boolean
  onSelectVendor: (lineItemId: string, vendorQuoteId: string) => void
  onAddVendor: (lineItemId: string) => void
  onNotesChange: (lineItemId: string, notes: string) => void
}

function sourcingSummary(item: LineItem): string {
  const n = item.vendorQuotes.length
  const prices = item.vendorQuotes.filter((v) => v.status === 'price_received' || v.unitPrice != null).length
  if (n === 0) return 'No vendors'
  return `${prices} of ${n} prices in`
}

export function LineItemRow({
  item,
  disabled,
  onSelectVendor,
  onAddVendor,
  onNotesChange,
}: LineItemRowProps) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-lg border border-qt-border bg-qt-panel2/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <span className="font-semibold text-qt-text">{item.name}</span>
          <span className="ml-2 text-sm text-qt-muted">×{item.quantity}</span>
          <p className="text-xs text-qt-muted">{sourcingSummary(item)}</p>
        </div>
        <span className="text-qt-muted">{open ? '▼' : '▶'}</span>
      </button>
      {open ? (
        <div className="border-t border-qt-border p-3">
          {item.description ? (
            <p className="mb-2 text-sm text-qt-muted whitespace-pre-wrap">{item.description}</p>
          ) : null}
          <VendorTable
            lineItem={item}
            disabled={disabled}
            onSelectVendor={(vid) => onSelectVendor(item.id, vid)}
            onAddVendor={() => onAddVendor(item.id)}
          />
          <label className="mt-3 block text-xs text-qt-muted">
            Item notes
            <textarea
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-2 py-1 text-sm text-qt-text"
              rows={2}
              value={item.notes}
              disabled={disabled}
              onChange={(e) => onNotesChange(item.id, e.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
