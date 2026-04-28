import type { Quote } from '../types'
import { chipsToLabels, computeSourcingChips } from '../utils/sourcingChips'
import { formatHhMmSs } from '../utils/formatters'
import {
  getTimerVisualState,
  priorityWindowMs,
  TIMER_COLORS,
  timeRemainingMs,
} from '../utils/timerLogic'

interface QuoteCardProps {
  quote: Quote
  now: Date
  onOpen: () => void
  onLogContact: (e: React.MouseEvent) => void
  onSendQuote: (e: React.MouseEvent) => void
}

export function QuoteCard({ quote, now, onOpen, onLogContact, onSendQuote }: QuoteCardProps) {
  const deadline = new Date(quote.deadlineAt)
  const windowMs = priorityWindowMs(quote.priority)
  const remaining = timeRemainingMs(deadline, now)
  const state = getTimerVisualState(deadline, now, windowMs)
  const colors = TIMER_COLORS[state]
  const chips = chipsToLabels(computeSourcingChips(quote))
  const progressPct =
    remaining <= 0 ? 100 : Math.min(100, Math.max(0, (1 - remaining / windowMs) * 100))

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`cursor-pointer rounded-xl border border-qt-border bg-qt-panel p-4 text-left shadow-lg ring-2 transition hover:border-qt-accent/50 ${colors.ring} focus:outline-none focus:ring-qt-accent`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-qt-text">{quote.customerName}</h3>
          <p className="font-mono text-sm text-qt-accent">{quote.quoteNumber}</p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${colors.text} bg-qt-bg`}
        >
          {quote.priority}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-qt-muted">{quote.description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {chips.length === 0 ? (
          <span className="rounded bg-qt-bg px-2 py-0.5 text-[10px] text-qt-muted">No sourcing data</span>
        ) : (
          chips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-qt-panel2 px-2 py-0.5 text-[10px] text-qt-text"
            >
              {c}
            </span>
          ))
        )}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-qt-muted">
          <span>{state === 'late' ? 'Overdue' : 'Time left'}</span>
          <span className={`font-mono font-bold ${colors.text} ${state === 'late' ? 'qt-late-pulse' : ''}`}>
            {remaining <= 0 ? formatHhMmSs(remaining) : formatHhMmSs(remaining)}
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-qt-bg">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rounded-lg bg-qt-panel2 px-3 py-1.5 text-xs font-semibold text-qt-text hover:bg-qt-border"
          onClick={onLogContact}
        >
          Log Contact
        </button>
        <button
          type="button"
          className="rounded-lg bg-qt-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          onClick={onSendQuote}
        >
          Send Quote
        </button>
        <button
          type="button"
          className="rounded-lg border border-qt-border px-3 py-1.5 text-xs font-semibold text-qt-muted hover:text-qt-text"
          onClick={onOpen}
        >
          Open ›
        </button>
      </div>
    </article>
  )
}
