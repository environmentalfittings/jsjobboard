import { supabase } from '../lib/supabase'
import type { Traveler, TravelerBasicInfo, TravelerSectionStatus } from '../types/traveler'

export async function prefillTravelerBasicInfoFromValve(travelerId: string, valveIdText: string): Promise<void> {
  const { data: existing } = await supabase
    .from('traveler_basic_info')
    .select('id')
    .eq('traveler_id', travelerId)
    .maybeSingle()
  if (existing) return

  const { data: valve } = await supabase
    .from('valves')
    .select('customer,size,pressure_class,due_date,valve_type,description')
    .eq('valve_id', valveIdText.trim())
    .maybeSingle()

  if (!valve) return

  await supabase.from('traveler_basic_info').insert({
    traveler_id: travelerId,
    valve_id: valveIdText.trim(),
    customer: valve.customer,
    size: valve.size,
    pressure: valve.pressure_class,
    due_date: valve.due_date,
    notes: valve.description,
  })
}

export async function getOrCreateTraveler(valveId: string): Promise<Traveler> {
  const normalizedValveId = valveId.trim()

  const { data: existingTraveler, error: findError } = await supabase
    .from('travelers')
    .select('*')
    .eq('valve_id', normalizedValveId)
    .maybeSingle<Traveler>()

  if (findError) {
    throw findError
  }

  if (existingTraveler) {
    return existingTraveler
  }

  const { data: createdTraveler, error: createError } = await supabase
    .from('travelers')
    .upsert(
      {
        valve_id: normalizedValveId,
      },
      { onConflict: 'valve_id' },
    )
    .select('*')
    .single<Traveler>()

  if (createError) {
    const { data: retryTraveler, error: retryError } = await supabase
      .from('travelers')
      .select('*')
      .eq('valve_id', normalizedValveId)
      .maybeSingle<Traveler>()
    if (retryError || !retryTraveler) {
      throw createError
    }
    return retryTraveler
  }

  return createdTraveler
}

export async function getTravelerSections(travelerId: string): Promise<TravelerSectionStatus[]> {
  const { data, error } = await supabase.rpc('traveler_section_status', {
    p_traveler_id: travelerId,
  })

  if (error) {
    throw error
  }

  return (data ?? []) as TravelerSectionStatus[]
}

export async function getTravelerBasicInfo(travelerId: string): Promise<TravelerBasicInfo | null> {
  const { data, error } = await supabase
    .from('traveler_basic_info')
    .select('*')
    .eq('traveler_id', travelerId)
    .maybeSingle<TravelerBasicInfo>()

  if (error) {
    throw error
  }

  return data
}
