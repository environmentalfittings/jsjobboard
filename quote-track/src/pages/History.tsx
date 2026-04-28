import type { Quote } from '../types'
import { formatDateTime } from '../utils/formatters'

interface HistoryProps {
  quotes: Quote[]
}

export function History({ quotes }: HistoryProps) {
  const closed = [...quotes].filter((q) => ['won', 'lost', 'no_response'].includes(q.status))
  closed.sort((a, b) => {
    const ca = a.closedAt ? new Date(a.closedAt).getTime() : 0
    const cb = b.closedAt ? new Date(b.closedAt).getTime() : 0
    return cb - ca
  })

  let onTime = 0
  let sentWithDeadline = 0
  let won = 0
  let turnaroundSum = 0
  let turnaroundN = 0

  for (const q of closed) {
    if (q.outcome === 'won') won++
    if (q.sentAt) {
      const sent = new Date(q.sentAt)
      const deadline = new Date(q.deadlineAt)
      sentWithDeadline++
      if (sent.getTime() <= deadline.getTime()) onTime++
      const recv = new Date(q.receivedAt)
      turnaroundSum += sent.getTime() - recv.getTime()
      turnaroundN++
    }
  }

  const pctOnTime = sentWithDeadline ? Math.round((onTime / sentWithDeadline) * 100) : 0
  const pctWon = closed.length ? Math.round((won / closed.length) * 100) : 0
  const avgTurnaround =
    turnaroundN > 0 ? Math.round(turnaroundSum / turnaroundN / 3600000) : 0

  return (
    <div className="px-4 py-6">
      <div className="mb-6 flex flex-wrap gap-4 rounded-xl border border-qt-border bg-qt-panel p-4 text-sm">
        <div>
          <span className="text-qt-muted">Total closed</span>
          <div className="text-xl font-bold text-qt-text">{closed.length}</div>
        </div>
        <div>
          <span className="text-qt-muted">Sent on time</span>
          <div className="text-xl font-bold text-emerald-400">{pctOnTime}%</div>
        </div>
        <div>
          <span className="text-qt-muted">Won</span>
          <div className="text-xl font-bold text-qt-accent">{pctWon}%</div>
        </div>
        <div>
          <span className="text-qt-muted">Avg turnaround</span>
          <div className="text-xl font-bold text-qt-text">{avgTurnaround}h</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-qt-border bg-qt-panel">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-qt-border text-qt-muted">
              <th className="p-3">Quote #</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Description</th>
              <th className="p-3">Received</th>
              <th className="p-3">Sent</th>
              <th className="p-3">Turnaround</th>
              <th className="p-3">On time?</th>
              <th className="p-3">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((q) => {
              const recv = new Date(q.receivedAt)
              const sent = q.sentAt ? new Date(q.sentAt) : null
              const deadline = new Date(q.deadlineAt)
              const turnaround =
                sent ? Math.round((sent.getTime() - recv.getTime()) / 3600000) : null
              const onTimeOk = sent ? sent.getTime() <= deadline.getTime() : null
              return (
                <tr key={q.id} className="border-b border-qt-border/50 hover:bg-qt-bg/30">
                  <td className="p-3 font-mono text-qt-accent">{q.quoteNumber}</td>
                  <td className="p-3 text-qt-text">{q.customerName}</td>
                  <td className="max-w-xs truncate p-3 text-qt-muted">{q.description}</td>
                  <td className="p-3 text-qt-muted">{formatDateTime(recv)}</td>
                  <td className="p-3 text-qt-muted">{sent ? formatDateTime(sent) : '—'}</td>
                  <td className="p-3 text-qt-muted">{turnaround != null ? `${turnaround}h` : '—'}</td>
                  <td className="p-3 text-center text-lg">
                    {onTimeOk === null ? '—' : onTimeOk ? '✓' : '✗'}
                  </td>
                  <td className="p-3 capitalize text-qt-text">{q.outcome?.replace('_', ' ') ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {closed.length === 0 ? (
          <p className="p-8 text-center text-qt-muted">No closed quotes yet.</p>
        ) : null}
      </div>
    </div>
  )
}
