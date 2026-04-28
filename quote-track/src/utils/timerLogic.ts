import type { Priority, TimerVisualState } from '../types'

const PRIORITY_HOURS: Record<Priority, number> = {
  rush: 12,
  standard: 24,
  low: 48,
}

export function priorityHours(p: Priority): number {
  return PRIORITY_HOURS[p]
}

export function priorityWindowMs(priority: Priority): number {
  return priorityHours(priority) * 60 * 60 * 1000
}

export function deadlineFromReceived(receivedAt: Date, priority: Priority): Date {
  return new Date(receivedAt.getTime() + priorityWindowMs(priority))
}

export function extendDeadline(deadlineAt: Date, extensionHours: number): Date {
  if (extensionHours <= 0) return deadlineAt
  return new Date(deadlineAt.getTime() + extensionHours * 60 * 60 * 1000)
}

export function getTimerVisualState(
  deadlineAt: Date,
  now: Date,
  totalWindowMs: number,
): TimerVisualState {
  const timeRemainingMs = deadlineAt.getTime() - now.getTime()
  if (timeRemainingMs <= 0) return 'late'
  if (timeRemainingMs > 0.5 * totalWindowMs) return 'green'
  if (timeRemainingMs > 0.166 * totalWindowMs) return 'yellow'
  return 'red'
}

export function timeRemainingMs(deadlineAt: Date, now: Date): number {
  return deadlineAt.getTime() - now.getTime()
}

export const TIMER_COLORS: Record<
  TimerVisualState,
  { bar: string; text: string; ring: string }
> = {
  green: { bar: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/40' },
  yellow: { bar: 'bg-yellow-500', text: 'text-yellow-400', ring: 'ring-yellow-500/40' },
  red: { bar: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/40' },
  late: { bar: 'bg-red-600', text: 'text-red-500', ring: 'ring-red-600/50' },
}
