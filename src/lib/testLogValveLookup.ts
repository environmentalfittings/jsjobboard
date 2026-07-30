import { supabase } from './supabase'
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
  drawingPoNumber: string | null
}

const VALVE_PREFILL_SELECT =
  'id,valve_id,size,pressure_class,body_material,valve_type,test_type,customer,cell,description,status,drawing_po_number'
const VALVE_PREFILL_SELECT_FALLBACK =
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
  drawing_po_number?: string | null
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
    drawingPoNumber: row.drawing_po_number ?? null,
  }
}

async function selectValvePrefillExact(candidate: string): Promise<ValvePrefillRow | null> {
  const primary = await supabase
    .from('valves')
    .select(VALVE_PREFILL_SELECT)
    .eq('valve_id', candidate)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!primary.error && primary.data) return primary.data as ValvePrefillRow

  if (primary.error && /drawing_po_number/i.test(primary.error.message)) {
    const fallback = await supabase
      .from('valves')
      .select(VALVE_PREFILL_SELECT_FALLBACK)
      .eq('valve_id', candidate)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!fallback.error && fallback.data) return fallback.data as ValvePrefillRow
  }

  return null
}

async function selectValvePrefillSuffix(baseId: string): Promise<ValvePrefillRow[]> {
  const primary = await supabase
    .from('valves')
    .select(VALVE_PREFILL_SELECT)
    .ilike('valve_id', `${baseId}-%`)
    .order('id', { ascending: false })
    .limit(25)

  if (!primary.error) return (primary.data ?? []) as ValvePrefillRow[]

  if (primary.error && /drawing_po_number/i.test(primary.error.message)) {
    const fallback = await supabase
      .from('valves')
      .select(VALVE_PREFILL_SELECT_FALLBACK)
      .ilike('valve_id', `${baseId}-%`)
      .order('id', { ascending: false })
      .limit(25)
    if (!fallback.error) return (fallback.data ?? []) as ValvePrefillRow[]
  }

  return []
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
    const valve = await selectValvePrefillExact(candidate)
    if (valve) return mapValveRow(valve)
  }

  // Shop often types the work order without the line suffix (506269 → 506269-1).
  const baseId = normalized || trimmed
  if (!baseId.includes('-')) {
    const rows = await selectValvePrefillSuffix(baseId)
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
