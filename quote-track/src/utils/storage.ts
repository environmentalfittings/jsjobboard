import type { Quote } from '../types'

const KEY = 'quotetrack_v1'

export function loadQuotes(): Quote[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Quote[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveQuotes(quotes: Quote[]): void {
  localStorage.setItem(KEY, JSON.stringify(quotes))
}
