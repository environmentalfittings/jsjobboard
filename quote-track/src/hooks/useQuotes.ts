import { useCallback, useMemo, useState } from 'react'
import type { BoardSort, Quote } from '../types'
import { loadQuotes, saveQuotes } from '../utils/storage'
import { priorityWindowMs, timeRemainingMs } from '../utils/timerLogic'

const CLOSED: Quote['status'][] = ['won', 'lost', 'no_response']

export function isQuoteOpen(q: Quote): boolean {
  return !CLOSED.includes(q.status)
}

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>(() => loadQuotes())

  const persist = useCallback((next: Quote[]) => {
    setQuotes(next)
    saveQuotes(next)
  }, [])

  const updateQuote = useCallback(
    (id: string, fn: (q: Quote) => Quote) => {
      persist(quotes.map((q) => (q.id === id ? fn(q) : q)))
    },
    [quotes, persist],
  )

  const addQuote = useCallback(
    (q: Quote) => {
      persist([q, ...quotes])
    },
    [quotes, persist],
  )

  const removeQuote = useCallback(
    (id: string) => {
      persist(quotes.filter((q) => q.id !== id))
    },
    [quotes, persist],
  )

  const openQuotes = useMemo(() => quotes.filter(isQuoteOpen), [quotes])
  const closedQuotes = useMemo(() => quotes.filter((q) => !isQuoteOpen(q)), [quotes])

  const sortOpen = useCallback(
    (list: Quote[], sort: BoardSort, now: Date): Quote[] => {
      const copy = [...list]
      if (sort === 'newest') {
        copy.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        return copy
      }
      if (sort === 'customer') {
        copy.sort((a, b) => a.customerName.localeCompare(b.customerName))
        return copy
      }
      copy.sort((a, b) => {
        const da = new Date(a.deadlineAt)
        const db = new Date(b.deadlineAt)
        return timeRemainingMs(da, now) - timeRemainingMs(db, now)
      })
      return copy
    },
    [],
  )

  return {
    quotes,
    openQuotes,
    closedQuotes,
    persist,
    updateQuote,
    addQuote,
    removeQuote,
    sortOpen,
    priorityWindowMs,
  }
}
