import { TEST_LOG_VALVE_TYPES } from '../constants/jobLookups'

/** Map free-text or legacy job-board valve types to a canonical test-log option. */
export function canonicalizeValveType(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''

  for (const option of TEST_LOG_VALVE_TYPES) {
    if (trimmed.toLowerCase() === option.toLowerCase()) return option
  }

  const n = trimmed.toLowerCase()
  if (n.includes('relief') || n.includes('pressure relief') || n === 'prv') return 'Relief Valve'
  if (n.includes('safety valve') || n === 'safety') return 'Safety Valve'
  if (n.includes('butterfly')) return 'Butterfly'
  if (n.includes('diaphragm')) return 'Diaphragm'
  if (n.includes('needle')) return 'Needle'
  if (n.includes('globe')) return 'Globe'
  if (n.includes('gate')) return 'Gate'
  if (n.includes('check')) return 'Check'
  if (n.includes('plug')) return 'Plug'
  if (n.includes('ball')) return 'Ball'

  return trimmed
}

export function valveTypeSelectOptions(currentValue: string): string[] {
  const canonical = canonicalizeValveType(currentValue)
  const options: string[] = [...TEST_LOG_VALVE_TYPES]
  if (canonical && !options.some((o) => o.toLowerCase() === canonical.toLowerCase())) {
    options.push(canonical)
  }
  return options
}
