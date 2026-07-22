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
}

const VALVE_PREFILL_SELECT =
  'id,valve_id,size,pressure_class,body_material,valve_type,test_type,customer,cell,description,status'

function mapValveRow(row: {
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
}): TestLogValvePrefill {
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

/** Load job-board valve details for the test log form (exact valve ID match). */
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

    if (valve) return mapValveRow(valve as Parameters<typeof mapValveRow>[0])
  }

  return null
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
