import type { Quote } from '../types'
import { AttachmentList } from './AttachmentList'
import { ContactLog } from './ContactLog'
import { LineItemRow } from './LineItemRow'
import { TimerDisplay } from './TimerDisplay'
import { computeSourcingChips } from '../utils/sourcingChips'
import { makeAttachment } from '../utils/files'

interface QuoteDrawerProps {
  quote: Quote
  now: Date
  onClose: () => void
  onUpdate: (q: Quote) => void
  onLogContact: () => void
  onAddLineItem: () => void
  onAddVendor: (lineItemId: string) => void
}

export function QuoteDrawer({
  quote,
  now,
  onClose,
  onUpdate,
  onLogContact,
  onAddLineItem,
  onAddVendor,
}: QuoteDrawerProps) {
  const chips = computeSourcingChips(quote)
  const vendorsOut = chips.vendorsOut
  const pricesIn = quote.lineItems.reduce(
    (n, li) => n + li.vendorQuotes.filter((v) => v.status === 'price_received').length,
    0,
  )

  const sendQuote = () => {
    if (!confirm('Mark this quote as sent to the customer?')) return
    onUpdate({
      ...quote,
      status: 'sent',
      sentAt: new Date().toISOString(),
    })
  }

  const closeQuote = (outcome: 'won' | 'lost' | 'no_response') => {
    if (!confirm(`Close quote as ${outcome.replace('_', ' ')}?`)) return
    onUpdate({
      ...quote,
      status: outcome,
      outcome,
      closedAt: new Date().toISOString(),
    })
    onClose()
  }

  const selectVendor = (lineItemId: string, vendorQuoteId: string) => {
    onUpdate({
      ...quote,
      lineItems: quote.lineItems.map((li) =>
        li.id === lineItemId ? { ...li, selectedVendorId: vendorQuoteId } : li,
      ),
    })
  }

  const lineNotes = (lineItemId: string, notes: string) => {
    onUpdate({
      ...quote,
      lineItems: quote.lineItems.map((li) => (li.id === lineItemId ? { ...li, notes } : li)),
    })
  }

  const onUploadQuoteFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const next = [...quote.attachments]
    for (const f of Array.from(files)) {
      try {
        next.push(
          await makeAttachment({
            parentId: quote.id,
            parentType: 'quote',
            file: f,
            tag: 'drawing',
          }),
        )
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Upload failed')
        return
      }
    }
    onUpdate({ ...quote, attachments: next })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-qt-border bg-qt-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-qt-border px-4 py-3">
          <div>
            <h2 className="text-lg font-bold text-qt-text">{quote.customerName}</h2>
            <p className="font-mono text-sm text-qt-accent">{quote.quoteNumber}</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-qt-border px-3 py-1 text-sm text-qt-muted hover:text-qt-text"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <TimerDisplay
            deadlineAt={quote.deadlineAt}
            receivedAt={quote.receivedAt}
            priority={quote.priority}
            now={now}
            large
          />
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-qt-bg px-3 py-2">
              <div className="text-qt-muted">Line items</div>
              <div className="font-bold text-qt-text">{quote.lineItems.length}</div>
            </div>
            <div className="rounded-lg bg-qt-bg px-3 py-2">
              <div className="text-qt-muted">Vendors out</div>
              <div className="font-bold text-yellow-400">{vendorsOut}</div>
            </div>
            <div className="rounded-lg bg-qt-bg px-3 py-2">
              <div className="text-qt-muted">Prices in</div>
              <div className="font-bold text-emerald-400">{pricesIn}</div>
            </div>
            <div className="rounded-lg bg-qt-bg px-3 py-2">
              <div className="text-qt-muted">Files</div>
              <div className="font-bold text-qt-text">{quote.attachments.length}</div>
            </div>
          </div>
          <p className="text-sm text-qt-muted">{quote.description}</p>
          <label className="block text-sm text-qt-muted">
            Internal notes
            <textarea
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              rows={2}
              value={quote.notes}
              onChange={(e) => onUpdate({ ...quote, notes: e.target.value })}
            />
          </label>
          <section>
            <h3 className="mb-2 font-semibold text-qt-text">Contact log</h3>
            <ContactLog entries={quote.contactLog} />
            <button
              type="button"
              className="mt-2 rounded-lg bg-qt-panel2 px-3 py-2 text-sm font-semibold text-qt-text hover:bg-qt-border"
              onClick={onLogContact}
            >
              + Log contact
            </button>
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-qt-text">Line items & sourcing</h3>
              <button
                type="button"
                className="text-sm font-semibold text-qt-accent hover:underline"
                onClick={onAddLineItem}
              >
                + Add item
              </button>
            </div>
            <div className="space-y-2">
              {quote.lineItems.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  onSelectVendor={selectVendor}
                  onAddVendor={onAddVendor}
                  onNotesChange={lineNotes}
                />
              ))}
              {quote.lineItems.length === 0 ? (
                <p className="text-sm text-qt-muted">No line items yet.</p>
              ) : null}
            </div>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-qt-text">Attachments</h3>
            <AttachmentList items={quote.attachments} onUpload={onUploadQuoteFiles} />
          </section>
        </div>
        <footer className="border-t border-qt-border p-4 space-y-2 bg-qt-bg/50">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-qt-panel2 px-3 py-2 text-sm font-semibold"
              onClick={onLogContact}
            >
              Log contact
            </button>
            <button
              type="button"
              className="rounded-lg bg-qt-accent px-3 py-2 text-sm font-semibold text-white"
              onClick={sendQuote}
            >
              Send quote
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="self-center text-qt-muted">Close:</span>
            <button
              type="button"
              className="rounded-lg bg-emerald-600/30 px-3 py-1.5 font-semibold text-emerald-300"
              onClick={() => closeQuote('won')}
            >
              Won
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600/30 px-3 py-1.5 font-semibold text-red-300"
              onClick={() => closeQuote('lost')}
            >
              Lost
            </button>
            <button
              type="button"
              className="rounded-lg bg-qt-border px-3 py-1.5 font-semibold"
              onClick={() => closeQuote('no_response')}
            >
              No response
            </button>
          </div>
        </footer>
      </aside>
    </>
  )
}
