import type { Priority, TimerVisualState } from '../types'
import { formatDateTime, formatHhMmSs } from '../utils/formatters'
import {
  getTimerVisualState,
  priorityWindowMs,
  TIMER_COLORS,
  timeRemainingMs,
} from '../utils/timerLogic'

interface TimerDisplayProps {
  deadlineAt: string
  receivedAt: string
  priority: Priority
  now: Date
  large?: boolean
}

export function TimerDisplay(props: TimerDisplayProps) {
  const { deadlineAt, receivedAt, priority, now, large } = props
  const deadline = new Date(deadlineAt)
  const received = new Date(receivedAt)
  const windowMs = priorityWindowMs(priority)
  const remaining = timeRemainingMs(deadline, now)
  const state: TimerVisualState = getTimerVisualState(deadline, now, windowMs)
  const colors = TIMER_COLORS[state]
  const progressPct =
    remaining <= 0 ? 100 : Math.min(100, Math.max(0, (1 - remaining / windowMs) * 100))

  const label =
    remaining <= 0 ? `OVERDUE ${formatHhMmSs(remaining)}` : formatHhMmSs(remaining)

  const sizeClass = large ? 'text-2xl p-4' : 'text-lg p-3'
  const lateClass = state === 'late' ? 'qt-late-pulse' : ''

  return (
    <div className={'rounded-lg border border-qt-border bg-qt-panel2/80 ' + sizeClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span
          className={
            'font-mono font-bold tabular-nums ' + colors.text + ' ' + lateClass + (large ? ' text-2xl' : ' text-lg')
          }
        >
          {label}
        </span>
        <span className="text-xs text-qt-muted">Due {formatDateTime(deadline)}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-qt-bg">
        <div
          className={'h-full rounded-full transition-all duration-500 ' + colors.bar}
          style={{ width: progressPct + '%' }}
        />
      </div>
      <p className="mt-1 text-[10px] text-qt-muted">
        Window: {String(windowMs / 3600000)}h from {formatDateTime(received)}
      </p>
    </div>
  )
}
