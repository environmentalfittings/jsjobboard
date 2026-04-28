import type { BoardSort, Quote } from '../types'
import { QuoteCard } from '../components/QuoteCard'
import { getTimerVisualState, priorityWindowMs } from '../utils/timerLogic'

interface DashboardProps {
  quotes: Quote[]
  now: Date
  sort: BoardSort
  onSortChange: (s: BoardSort) => void
  onOpenQuote: (id: string) => void
  onLogContact: (id: string) => void
  onSendQuote: (id: string) => void
}

export function Dashboard(props: DashboardProps) {
  const { quotes, now, sort, onSortChange, onOpenQuote, onLogContact, onSendQuote } = props
  const stats = { green: 0, yellow: 0, red: 0, late: 0 }
  for (const q of quotes) {
    const d = new Date(q.deadlineAt)
    const w = priorityWindowMs(q.priority)
    const state = getTimerVisualState(d, now, w)
    stats[state]++
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-emerald-500/20 px-3 py-1.5 font-semibold text-emerald-400">
            On track: {stats.green}
          </span>
          <span className="rounded-lg bg-yellow-500/20 px-3 py-1.5 font-semibold text-yellow-400">
            Due soon: {stats.yellow}
          </span>
          <span className="rounded-lg bg-red-500/20 px-3 py-1.5 font-semibold text-red-400">
            Urgent: {stats.red}
          </span>
          <span className="rounded-lg bg-red-600/30 px-3 py-1.5 font-semibold text-red-500 qt-late-pulse">
            Overdue: {stats.late}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-sm text-qt-muted">
            Sort
            <select
              className="ml-1 rounded border border-qt-border bg-qt-bg px-2 py-1 text-qt-text"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as BoardSort)}
            >
              <option value="urgent">Most urgent</option>
              <option value="newest">Newest first</option>
              <option value="customer">Customer A–Z</option>
            </select>
          </label>
        </div>
      </div>
      {quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-qt-border bg-qt-panel/50 py-24 text-center">
          <p className="text-lg text-qt-muted">No active quotes</p>
          <p className="mt-2 text-sm text-qt-muted">Press N or use New Quote</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quotes.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              now={now}
              onOpen={() => onOpenQuote(q.id)}
              onLogContact={(e) => {
                e.stopPropagation()
                onLogContact(q.id)
              }}
              onSendQuote={(e) => {
                e.stopPropagation()
                onSendQuote(q.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
