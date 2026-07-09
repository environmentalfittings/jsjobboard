import {
  buildItpDataForSave,
  extractProcessPlanFromItpData,
  hasItpInspectionData,
} from './valveItpStorage'
import { supabase } from './supabase'
import {
  createEmptyItpProcessPlan,
  normalizeItpProcessPlan,
  type ItpProcessPlanPayload,
  valveToItpSnapshot,
} from '../types/itpPlan'
import type { Valve } from '../types'

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function loadItpProcessPlan(valve: Valve): Promise<{
  plan: ItpProcessPlanPayload
  hasLegacyInspection: boolean
}> {
  const { data, error } = await supabase
    .from('valve_itp')
    .select('content,itp_data')
    .eq('valve_row_id', valve.id)
    .maybeSingle()

  if (error) throw error

  const fromJsonb = data?.itp_data
  const storedPlan = extractProcessPlanFromItpData(fromJsonb)
  if (storedPlan) {
    const plan = normalizeItpProcessPlan({ ...storedPlan, valveSnapshot: valveToItpSnapshot(valve) }, valve)
    return {
      plan,
      hasLegacyInspection: hasItpInspectionData(fromJsonb, data?.content),
    }
  }

  const rawContent = String(data?.content ?? '').trim()
  const fromContent = rawContent ? tryParseJson(rawContent) : null
  const storedPlanFromContent = extractProcessPlanFromItpData(fromContent)
  if (storedPlanFromContent) {
    const plan = normalizeItpProcessPlan({ ...storedPlanFromContent, valveSnapshot: valveToItpSnapshot(valve) }, valve)
    return {
      plan,
      hasLegacyInspection: hasItpInspectionData(fromJsonb ?? fromContent, rawContent),
    }
  }

  const hasLegacyInspection = hasItpInspectionData(fromJsonb, rawContent)

  return { plan: createEmptyItpProcessPlan(valve), hasLegacyInspection }
}

export async function saveItpProcessPlan(valve: Valve, plan: ItpProcessPlanPayload): Promise<void> {
  const { data: existing, error: loadError } = await supabase
    .from('valve_itp')
    .select('itp_data')
    .eq('valve_row_id', valve.id)
    .maybeSingle()
  if (loadError) throw loadError

  const payload: ItpProcessPlanPayload = normalizeItpProcessPlan({
    ...plan,
    valveSnapshot: valveToItpSnapshot(valve),
    updatedAt: new Date().toISOString(),
  }, valve)
  const itp_data = buildItpDataForSave({
    existing: existing?.itp_data,
    processPlan: payload,
  })
  const row = {
    valve_row_id: valve.id,
    content: payload.notes.trim() || `ITP process plan for ${valve.valve_id}`,
    itp_data,
  }
  const { error } = await supabase.from('valve_itp').upsert(row, { onConflict: 'valve_row_id' })
  if (error) throw error
}
