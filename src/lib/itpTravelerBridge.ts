import { getOrCreateTraveler, prefillTravelerBasicInfoFromValve } from '../hooks/useTraveler'
import { supabase } from './supabase'
import type { ItpTravelerNoteSection } from '../types/itpLibraryPlan'

export const ITP_TRAVELER_SECTION_OPTIONS: {
  value: ItpTravelerNoteSection
  label: string
}[] = [
  { value: 'basic_info', label: 'Basic info — notes' },
  { value: 'valve_selection', label: 'Valve selection — notes' },
  { value: 'other_parts', label: 'Other parts — notes' },
  { value: 'welding', label: 'Welding — notes' },
  { value: 'testing_qc', label: 'Testing / QC — testing notes' },
]

export function suggestTravelerSectionFromShopArea(shopArea: string | null | undefined): ItpTravelerNoteSection {
  const area = String(shopArea ?? '').trim().toLowerCase()
  if (!area) return 'other_parts'
  if (area.includes('weld')) return 'welding'
  if (area.includes('test') || area.includes('paint') || area.includes('qa')) return 'testing_qc'
  if (area.includes('assembl') || area.includes('fitting') || area.includes('adapt') || area.includes('actuat')) {
    return 'valve_selection'
  }
  if (area.includes('tear') || area.includes('machine') || area.includes('grind') || area.includes('water')) {
    return 'basic_info'
  }
  return 'other_parts'
}

function formatEntryBlock(itemName: string, notes: string, savedAt: string): string {
  const stamp = new Date(savedAt).toLocaleString()
  const body = notes.trim()
  return [`[ITP] ${itemName.trim()} — ${stamp}`, body].filter(Boolean).join('\n')
}

function mergeNotes(existing: string | null | undefined, block: string, previousBlock?: string | null): string {
  const current = String(existing ?? '').trim()
  let base = current
  const prev = String(previousBlock ?? '').trim()
  if (prev && base.includes(prev)) {
    base = base.replace(prev, '').replace(/\n{3,}/g, '\n\n').trim()
  }
  if (!base) return block
  if (base.includes(block)) return base
  return `${base}\n\n${block}`
}

type SectionConfig = {
  table: string
  notesColumn: string
  extraInsert?: Record<string, unknown>
}

const SECTION_CONFIG: Record<ItpTravelerNoteSection, SectionConfig> = {
  basic_info: { table: 'traveler_basic_info', notesColumn: 'notes' },
  valve_selection: { table: 'traveler_valve_selection', notesColumn: 'notes', extraInsert: { is_na: false } },
  other_parts: { table: 'traveler_other_parts', notesColumn: 'parts_notes', extraInsert: { is_na: false } },
  welding: { table: 'traveler_welding', notesColumn: 'notes', extraInsert: { is_na: false } },
  testing_qc: { table: 'traveler_testing_qc', notesColumn: 'testing_notes' },
}

export async function appendItpLineToTraveler(input: {
  valveIdText: string
  section: ItpTravelerNoteSection
  itemName: string
  notes: string
  /** Prior formatted block for this ITP line, if re-saving. */
  previousBlock?: string | null
}): Promise<{ savedAt: string; block: string }> {
  const valveId = input.valveIdText.trim()
  if (!valveId) throw new Error('This job needs a valve ID before it can write to the traveler')
  const notes = input.notes.trim()
  if (!notes) throw new Error('Enter what should go on the traveler')

  const traveler = await getOrCreateTraveler(valveId)
  await prefillTravelerBasicInfoFromValve(traveler.id, valveId)

  const savedAt = new Date().toISOString()
  const block = formatEntryBlock(input.itemName, notes, savedAt)
  const config = SECTION_CONFIG[input.section]

  const { data: existing, error: loadError } = await supabase
    .from(config.table)
    .select('*')
    .eq('traveler_id', traveler.id)
    .maybeSingle()

  if (loadError) throw loadError

  const existingRow = existing as { id?: string; [key: string]: unknown } | null
  const priorNotes = existingRow ? String(existingRow[config.notesColumn] ?? '') : ''
  const nextNotes = mergeNotes(priorNotes, block, input.previousBlock)

  if (existingRow?.id) {
    const { error } = await supabase
      .from(config.table)
      .update({ [config.notesColumn]: nextNotes })
      .eq('id', existingRow.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from(config.table).insert({
      id: crypto.randomUUID(),
      traveler_id: traveler.id,
      valve_id: valveId,
      [config.notesColumn]: nextNotes,
      ...(config.extraInsert ?? {}),
    })
    if (error) throw error
  }

  return { savedAt, block }
}
