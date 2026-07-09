import { normalizeValveId } from './valveId'
import { supabase } from './supabase'

export type ValveIdParts = {
  base: string
  suffix: number | null
}

export function parseValveIdParts(valveId: string): ValveIdParts {
  const normalized = normalizeValveId(valveId)
  const dashIndex = normalized.lastIndexOf('-')
  if (dashIndex === -1) {
    return { base: normalized, suffix: null }
  }

  const base = normalized.slice(0, dashIndex)
  const suffixPart = normalized.slice(dashIndex + 1)
  const suffix = /^\d+$/.test(suffixPart) ? Number.parseInt(suffixPart, 10) : null
  return { base, suffix }
}

export function formatValveIdWithSuffix(base: string, suffix: number) {
  return `${base}-${suffix}`
}

export async function suggestNextValveIdOnOrder(sourceValveId: string): Promise<string> {
  const { base } = parseValveIdParts(sourceValveId)
  if (!base) return ''

  const { data, error } = await supabase.from('valves').select('valve_id').or(`valve_id.eq.${base},valve_id.ilike.${base}-%`)
  if (error) throw new Error(error.message)

  let maxSuffix = 0
  for (const row of data ?? []) {
    const parts = parseValveIdParts(String(row.valve_id ?? ''))
    if (parts.base !== base) continue
    if (parts.suffix == null) {
      maxSuffix = Math.max(maxSuffix, 0)
      continue
    }
    maxSuffix = Math.max(maxSuffix, parts.suffix)
  }

  return formatValveIdWithSuffix(base, maxSuffix + 1)
}
