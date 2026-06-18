import { supabase } from './supabase'
import { VALVE_LIST_SELECT } from './valveSelect'
import type { Valve } from '../types'

const PAGE_SIZE = 1000

type ValveOrder = { column: string; ascending: boolean }

/**
 * Supabase caps each request at 1,000 rows. Paginate so dashboards and boards
 * see the full valve table (6k+ rows).
 */
export async function fetchAllValves(order: ValveOrder = { column: 'id', ascending: false }): Promise<{
  data: Valve[]
  error: Error | null
}> {
  const rows: Valve[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .order(order.column, { ascending: order.ascending })
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { data: rows, error: new Error(error.message) }
    if (!data?.length) break

    rows.push(...(data as Valve[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: rows, error: null }
}
