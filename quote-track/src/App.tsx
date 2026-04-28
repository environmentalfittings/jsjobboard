import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardSort, Quote } from './types'
import { QuoteDrawer } from './components/QuoteDrawer'
import { NewQuoteModal } from './components/modals/NewQuoteModal'
import { LogContactModal } from './components/modals/LogContactModal'
import { AddLineItemModal } from './components/modals/AddLineItemModal'
import { AddVendorModal } from './components/modals/AddVendorModal'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { useNow } from './hooks/useNow'
import { useQuotes } from './hooks/useQuotes'
import { getTimerVisualState, priorityWindowMs } from './utils/timerLogic'

type Tab = 'active' | 'history'

function App() {
  const now = useNow()
  const { quotes, openQuotes, updateQuote, addQuote, sortOpen } = useQuotes()
  const [tab, setTab] = useState<Tab>('active')
  const [sort, setSort] = useState<BoardSort>('urgent')
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [logId, setLogId] = useState<string | null>(null)
  const [lineId, setLineId] = useState<string | null>(null)
  const [vendorCtx, setVendorCtx] = useState<{ quoteId: string; lineItemId: string } | null>(null)

  const sortedOpen = useMemo(
    () => sortOpen(openQuotes, sort, now),
    [openQuotes, sort, now, sortOpen],
  )

  const drawerQuote = useMemo(
    () => (drawerId ? quotes.find((q) => q.id === drawerId) ?? null : null),
    [quotes, drawerId],
  )
  const logQuote = useMemo(
    () => (logId ? quotes.find((q) => q.id === logId) ?? null : null),
    [quotes, logId],
  )
  const lineQuote = useMemo(
    () => (lineId ? quotes.find((q) => q.id === lineId) ?? null : null),
    [quotes, lineId],
  )
  const vendorQuote = useMemo(
    () =>
      vendorCtx ? quotes.find((q) => q.id === vendorCtx.quoteId) ?? null : null,
    [quotes, vendorCtx],
  )

  const applyQuote = useCallback(
    (next: Quote) => {
      updateQuote(next.id, () => next)
    },
    [updateQuote],
  )

  const sendQuoteById = useCallback(
    (id: string) => {
      const q = quotes.find((x) => x.id === id)
      if (!q || !confirm('Mark quote as sent to customer?')) return
      updateQuote(id, (x) => ({
        ...x,
        status: 'sent',
        sentAt: new Date().toISOString(),
      }))
    },
    [quotes, updateQuote],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setNewOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  const lastRedRef = useMemo(() => new Set<string>(), [])
  useEffect(() => {
    if (Notification.permission !== 'granted') return
    for (const q of openQuotes) {
      const d = new Date(q.deadlineAt)
      const w = priorityWindowMs(q.priority)
      const state = getTimerVisualState(d, now, w)
      if (state === 'red' && !lastRedRef.has(q.id)) {
        lastRedRef.add(q.id)
        new Notification('QuoteTrack', {
          body: `${q.quoteNumber} — under ~4h on clock`,
        })
      }
      if (state !== 'red') lastRedRef.delete(q.id)
    }
  }, [now, openQuotes, lastRedRef])

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#e2e8f0]">
      <header className="sticky top-0 z-30 border-b border-[#2e3350] bg-[#1a1d27]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight text-[#4a7eff]">QuoteTrack</h1>
          <nav className="flex flex-wrap gap-2">
            <button
              type="button"
              className={
                'rounded-lg px-4 py-2 text-sm font-semibold ' +
                (tab === 'active' ? 'bg-[#4a7eff] text-white' : 'bg-[#22263a] text-[#7a849e]')
              }
              onClick={() => setTab('active')}
            >
              Active quotes
            </button>
            <button
              type="button"
              className={
                'rounded-lg px-4 py-2 text-sm font-semibold ' +
                (tab === 'history' ? 'bg-[#4a7eff] text-white' : 'bg-[#22263a] text-[#7a849e]')
              }
              onClick={() => setTab('history')}
            >
              History / Reports
            </button>
          </nav>
          <button
            type="button"
            className="rounded-lg bg-[#4a7eff] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            onClick={() => setNewOpen(true)}
          >
            + New Quote
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px]">
        {tab === 'active' ? (
          <Dashboard
            quotes={sortedOpen}
            now={now}
            sort={sort}
            onSortChange={setSort}
            onOpenQuote={setDrawerId}
            onLogContact={(id) => setLogId(id)}
            onSendQuote={sendQuoteById}
          />
        ) : (
          <History quotes={quotes} />
        )}
      </main>

      <NewQuoteModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSave={(q) => {
          addQuote(q)
          setDrawerId(q.id)
        }}
      />

      <LogContactModal
        open={!!logId}
        quote={logQuote}
        onClose={() => setLogId(null)}
        onSave={(q) => applyQuote(q)}
      />

      <AddLineItemModal
        open={!!lineId}
        quote={lineQuote}
        onClose={() => setLineId(null)}
        onSave={(q) => applyQuote(q)}
      />

      <AddVendorModal
        open={!!vendorCtx}
        quote={vendorQuote}
        lineItemId={vendorCtx?.lineItemId ?? null}
        onClose={() => setVendorCtx(null)}
        onSave={(q) => applyQuote(q)}
      />

      {drawerQuote ? (
        <QuoteDrawer
          quote={drawerQuote}
          now={now}
          onClose={() => setDrawerId(null)}
          onUpdate={applyQuote}
          onLogContact={() => setLogId(drawerQuote.id)}
          onAddLineItem={() => setLineId(drawerQuote.id)}
          onAddVendor={(lineItemId) => setVendorCtx({ quoteId: drawerQuote.id, lineItemId })}
        />
      ) : null}
    </div>
  )
}

export default App
