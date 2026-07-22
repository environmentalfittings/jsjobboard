import {
  buildItpDataForSave,
  extractLibraryPlanFromItpData,
  extractProcessPlanFromItpData,
  hasItpInspectionData,
  hasLegacyProcessPlan,
} from './valveItpStorage'
import { supabase } from './supabase'
import {
  createEmptyItpLibraryPlan,
  normalizeItpLibraryPlan,
  valveToLibrarySnapshot,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function loadItpLibraryPlan(valve: Valve): Promise<{
  plan: ItpLibraryPlanPayload
  isNew: boolean
  hasLegacyInspection: boolean
  hasLegacyProcessPlan: boolean
}> {
  const { data, error } = await supabase
    .from('valve_itp')
    .select('content,itp_data')
    .eq('valve_row_id', valve.id)
    .maybeSingle()

  if (error) throw error

  const fromJsonb = data?.itp_data
  const storedPlan = extractLibraryPlanFromItpData(fromJsonb)
  if (storedPlan) {
    return {
      plan: normalizeItpLibraryPlan({ ...storedPlan, valveSnapshot: valveToLibrarySnapshot(valve) }, valve),
      isNew: false,
      hasLegacyInspection: hasItpInspectionData(fromJsonb, data?.content),
      hasLegacyProcessPlan: hasLegacyProcessPlan(fromJsonb),
    }
  }

  const rawContent = String(data?.content ?? '').trim()
  const fromContent = rawContent ? tryParseJson(rawContent) : null
  const storedFromContent = extractLibraryPlanFromItpData(fromContent)
  if (storedFromContent) {
    return {
      plan: normalizeItpLibraryPlan(
        { ...storedFromContent, valveSnapshot: valveToLibrarySnapshot(valve) },
        valve,
      ),
      isNew: false,
      hasLegacyInspection: hasItpInspectionData(fromJsonb ?? fromContent, rawContent),
      hasLegacyProcessPlan: hasLegacyProcessPlan(fromJsonb ?? fromContent),
    }
  }

  return {
    plan: createEmptyItpLibraryPlan(valve),
    isNew: true,
    hasLegacyInspection: hasItpInspectionData(fromJsonb, rawContent),
    hasLegacyProcessPlan: Boolean(extractProcessPlanFromItpData(fromJsonb) || extractProcessPlanFromItpData(fromContent)),
  }
}

export async function saveItpLibraryPlan(valve: Valve, plan: ItpLibraryPlanPayload): Promise<void> {
  const { data: existing, error: loadError } = await supabase
    .from('valve_itp')
    .select('itp_data')
    .eq('valve_row_id', valve.id)
    .maybeSingle()
  if (loadError) throw loadError

  const payload = normalizeItpLibraryPlan(
    {
      ...plan,
      valveSnapshot: valveToLibrarySnapshot(valve),
      updatedAt: new Date().toISOString(),
    },
    valve,
  )

  const included = Object.values(payload.sel).filter((s) => s.included).length
  const itp_data = buildItpDataForSave({
    existing: existing?.itp_data,
    libraryPlan: payload,
  })
  const row = {
    valve_row_id: valve.id,
    content: payload.notes.trim() || `ITP library plan for ${valve.valve_id} (${included} items)`,
    itp_data,
  }
  const { error } = await supabase.from('valve_itp').upsert(row, { onConflict: 'valve_row_id' })
  if (error) throw error
}
