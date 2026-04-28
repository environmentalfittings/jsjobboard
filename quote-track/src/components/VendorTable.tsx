import type { LineItem, VendorQuote } from '../types'

interface VendorTableProps {
  lineItem: LineItem
  disabled?: boolean
  onSelectVendor: (vendorQuoteId: string) => void
  onAddVendor: () => void
}

const STATUS_LABEL: Record<VendorQuote['status'], string> = {
  pending: 'Pending',
  rfq_sent: 'RFQ sent',
  price_received: 'Price in',
}

export function VendorTable({
  lineItem,
  disabled,
  onSelectVendor,
  onAddVendor,
}: VendorTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-qt-border text-left text-xs text-qt-muted">
            <th className="py-2 pr-2">Vendor</th>
            <th className="py-2 pr-2">Unit price</th>
            <th className="py-2 pr-2">Lead time</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2">Select</th>
          </tr>
        </thead>
        <tbody>
          {lineItem.vendorQuotes.map((v) => {
            const selected = lineItem.selectedVendorId === v.id
            return (
              <tr
                key={v.id}
                className={
                  'border-b border-qt-border/50 ' +
                  (selected ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40' : '')
                }
              >
                <td className="py-2 pr-2 font-medium text-qt-text">{v.vendorName}</td>
                <td className="py-2 pr-2 text-qt-muted">
                  {v.unitPrice != null ? `$${v.unitPrice.toFixed(2)}` : '—'}
                </td>
                <td className="py-2 pr-2 text-qt-muted">{v.leadTime ?? '—'}</td>
                <td className="py-2 pr-2">{STATUS_LABEL[v.status]}</td>
                <td className="py-2">
                  <button
                    type="button"
                    disabled={disabled}
                    className="rounded bg-qt-panel2 px-2 py-1 text-xs hover:bg-emerald-600/30 disabled:opacity-50"
                    onClick={() => onSelectVendor(v.id)}
                  >
                    Select
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button
        type="button"
        disabled={disabled}
        className="mt-2 text-sm font-semibold text-qt-accent hover:underline disabled:opacity-50"
        onClick={onAddVendor}
      >
        + Add vendor
      </button>
    </div>
  )
}
