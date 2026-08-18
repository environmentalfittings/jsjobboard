import { TERMINAL_STATUSES } from '../constants/statuses'
import { supabase } from './supabase'
import { canonicalizeValveType, valveTypeMatches, valveTypeOrFilter } from './testLogValveType'
import { normalizeValveId } from './valveId'

export type TestLogValvePrefill = {
  valveRowId: number | null
  valveId: string
  size: string | null
  pressure: string | null
  bodyMaterial: string | null
  valveType: string | null
  testType: string | null
  customer: string | null
  cell: string | null
  description: string | null
  jobStatus: string | null
}

const VALVE_PREFILL_SELECT =
  'id,valve_id,size,pressure_class,body_material,valve_type,test_type,customer,cell,description,status'

type ValvePrefillRow = {
  id: number
  valve_id: string
  size: string | null
  pressure_class: string | null
  body_material: string | null
  valve_type: string | null
  test_type: string | null
  customer: string | null
  cell: string | null
  description: string | null
  status: string
}

function mapValveRow(row: ValvePrefillRow): TestLogValvePrefill {
  return {
    valveRowId: row.id,
    valveId: row.valve_id,
    size: row.size,
    pressure: row.pressure_class,
    bodyMaterial: row.body_material,
    valveType: row.valve_type,
    testType: row.test_type,
    customer: row.customer,
    cell: row.cell,
    description: row.description,
    jobStatus: row.status,
  }
}

function compareValveIdSuffix(a: string, b: string): number {
  const aParts = a.split('-')
  const bParts = b.split('-')
  const aSuffix = Number(aParts[aParts.length - 1])
  const bSuffix = Number(bParts[bParts.length - 1])
  if (Number.isFinite(aSuffix) && Number.isFinite(bSuffix) && aSuffix !== bSuffix) {
    return aSuffix - bSuffix
  }
  return a.localeCompare(b)
}

/** Load job-board valve details for the test log form. */
export async function fetchValveForTestLog(valveIdInput: string): Promise<TestLogValvePrefill | null> {
  const trimmed = valveIdInput.trim()
  if (!trimmed) return null

  const normalized = normalizeValveId(trimmed)
  const candidates = Array.from(new Set([normalized, trimmed].filter(Boolean)))

  for (const candidate of candidates) {
    const { data: valve } = await supabase
      .from('valves')
      .select(VALVE_PREFILL_SELECT)
      .eq('valve_id', candidate)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (valve) return mapValveRow(valve as ValvePrefillRow)
  }

  // Shop often types the work order without the line suffix (506269 → 506269-1).
  const baseId = normalized || trimmed
  if (!baseId.includes('-')) {
    const { data: matches } = await supabase
      .from('valves')
      .select(VALVE_PREFILL_SELECT)
      .ilike('valve_id', `${baseId}-%`)
      .order('id', { ascending: false })
      .limit(25)

    const rows = (matches ?? []) as ValvePrefillRow[]
    if (rows.length) {
      const preferred = [...rows].sort((a, b) => compareValveIdSuffix(a.valve_id, b.valve_id))[0]
      return mapValveRow(preferred)
    }
  }

  return null
}

/** Map of uppercase valve_id → description (newest valve row wins). */
export async function fetchValveDescriptionsByIds(valveIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(valveIds.map((id) => id.trim()).filter(Boolean)))
  if (!unique.length) return {}

  const { data, error } = await supabase.from('valves').select('id,valve_id,description').in('valve_id', unique)
  if (error || !data?.length) return {}

  const sorted = [...data].sort((a, b) => Number(b.id) - Number(a.id))
  const map: Record<string, string> = {}
  for (const row of sorted) {
    const key = String(row.valve_id ?? '')
      .trim()
      .toUpperCase()
    if (!key || key in map) continue
    const description = String(row.description ?? '').trim()
    if (description) map[key] = description
  }
  return map
}

/** Suggest valve IDs from the job board as the user types. */
export async function searchValveIdsForTestLog(query: string, limit = 12): Promise<string[]> {
  const normalized = normalizeValveId(query)
  if (!normalized) return []

  const { data } = await supabase
    .from('valves')
    .select('valve_id')
    .ilike('valve_id', `%${normalized}%`)
    .order('valve_id', { ascending: false })
    .limit(limit)

  return Array.from(new Set((data ?? []).map((row: { valve_id: string }) => row.valve_id)))
}

export type TestLogValveCandidate = {
  valveId: string
  status: string | null
  description: string | null
  source: 'available' | 'tested'
}

/** Open shop jobs of this type, plus valves that already have a test log of this type. */
export async function listTestLogValvesByType(
  valveType: string,
  limit = 80,
): Promise<TestLogValveCandidate[]> {
  const canonical = canonicalizeValveType(valveType)
  const typeOr = valveTypeOrFilter('valve_type', canonical)
  if (!canonical || !typeOr) return []

  const [{ data: jobRows }, { data: logRows }] = await Promise.all([
    supabase
      .from('valves')
      .select('valve_id, status, description, valve_type, updated_at')
      .or(typeOr)
      .order('updated_at', { ascending: false })
      .limit(120),
    supabase
      .from('test_logs')
      .select('valve_id, valve_type, tested_on')
      .or(typeOr)
      .order('tested_on', { ascending: false })
      .limit(120),
  ])

  const byId = new Map<string, TestLogValveCandidate>()

  for (const row of jobRows ?? []) {
    const valveId = String((row as { valve_id?: string }).valve_id ?? '').trim()
    if (!valveId) continue
    if (!valveTypeMatches((row as { valve_type?: string | null }).valve_type, canonical)) continue
    const status = String((row as { status?: string | null }).status ?? '').trim()
    if (status && TERMINAL_STATUSES.has(status)) continue
    byId.set(valveId.toUpperCase(), {
      valveId,
      status: status || 'In shop',
      description: String((row as { description?: string | null }).description ?? '').trim() || null,
      source: 'available',
    })
  }

  for (const row of logRows ?? []) {
    const valveId = String((row as { valve_id?: string }).valve_id ?? '').trim()
    if (!valveId) continue
    const key = valveId.toUpperCase()
    if (byId.has(key)) continue
    byId.set(key, {
      valveId,
      status: 'Tested',
      description: null,
      source: 'tested',
    })
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === 'available' ? -1 : 1
      return compareValveIdSuffix(a.valveId, b.valveId)
    })
    .slice(0, limit)
}
