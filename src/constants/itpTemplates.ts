import type { ItpPayload, ItpTabState } from '../types/itp'
import { ITP_SCHEMA_VERSION } from '../types/itp'
import { emptyItemState } from '../lib/itpDefaultState'

/** Persisted on valves.bowl_type and in itp_data.templateId */
export const ITP_BOWL_TYPE_OPTIONS = [
  { id: 'twinseal', label: 'Twinseal' },
  { id: 'twin_stem', label: 'Standard (full checklist)' },
  { id: 'non_lubricated_plug', label: 'Non-lubricated plug' },
  { id: 'four_way_diverter', label: 'Four-way diverter' },
] as const

export type ItpTemplateId = (typeof ITP_BOWL_TYPE_OPTIONS)[number]['id']

const KNOWN_IDS = new Set<string>(ITP_BOWL_TYPE_OPTIONS.map((o) => o.id))

export const DEFAULT_ITP_TEMPLATE_ID: ItpTemplateId = 'twin_stem'

export function normalizeTemplateId(id: string | null | undefined): ItpTemplateId {
  const s = (id ?? '').trim()
  if (KNOWN_IDS.has(s)) return s as ItpTemplateId
  return DEFAULT_ITP_TEMPLATE_ID
}

export function itpTemplateLabel(id: string | null | undefined): string {
  const n = normalizeTemplateId(id)
  return ITP_BOWL_TYPE_OPTIONS.find((o) => o.id === n)?.label ?? n
}

function slug(label: string, tabId: string) {
  return `${tabId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

function tabDef(id: string, label: string, itemLabels: string[]): ItpTabState {
  return {
    id,
    label,
    items: itemLabels.map((l) => ({
      id: slug(l, id),
      label: l,
      data: emptyItemState(),
    })),
  }
}

function twinStemTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', [
      'Flanges',
      'Body Bore',
      'Sealing Surfaces',
      'Threads/Tapped Holes',
      'Pressure Boundary',
      'Coating/Paint',
    ]),
    tabDef('plug', 'Plug', ['Plug OD', 'Seating Surfaces', 'Lubrication Grooves']),
    tabDef('stem', 'Stem', ['Stem Condition', 'Packing Area', 'Alignment']),
    tabDef('seat', 'Seat', ['Seat Surfaces', 'Seat Load']),
    tabDef('actuator', 'Actuator', ['Mounting', 'Travel / Stroke', 'Accessories']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Tagging / ID', 'Final checks']),
  ]
}

function nonLubricatedPlugTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', [
      'Flanges',
      'Body Bore',
      'Port openings',
      'Pressure boundary',
      'Coating/Paint',
    ]),
    tabDef('plug', 'Plug', [
      'Plug OD / fit',
      'Seating surfaces',
      'Key / drive fit',
      'Lubrication paths',
      'Stop / travel limits',
    ]),
    tabDef('stem', 'Stem', ['Stem & packing', 'Blow-out protection']),
    tabDef('assembly', 'Assembly', ['Torque / bolting', 'Operator alignment', 'ID / tagging']),
  ]
}

/** Twinseal-style walkthrough (Overall summary + Body / Top Lid / Bottom Lid / Trunnion). */
function twinsealTabs(): ItpTabState[] {
  return [
    tabDef('overall', 'Overall', []),
    tabDef('body', 'Body', [
      'Flanges',
      'Body Bore',
      'Sealing Surfaces',
      'Threads / Tapped Holes',
      'Pressure Boundary',
      'Coating / Paint',
    ]),
    tabDef('top_lid', 'Top Lid', ['Sealing Surface', 'Bolting / Studs']),
    tabDef('bottom_lid', 'Bottom Lid', ['Sealing surface', 'Bolting / hardware', 'Fit / alignment']),
    tabDef('trunnion', 'Trunnion', ['Trunnion / bearing area', 'Lubrication', 'Fasteners']),
  ]
}

function fourWayDiverterTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', [
      'Flanges',
      'Body bore',
      'Port labeling (A/B/C/D)',
      'Sealing surfaces',
      'Pressure boundary',
    ]),
    tabDef('diverter', 'Diverter / plug', [
      'Plug position vs ports',
      'Port-to-port sealing',
      'Wear / galling',
      'Actuation coupling',
    ]),
    tabDef('stem', 'Stem', ['Stem condition', 'Packing', 'Stroke / stops']),
    tabDef('actuator', 'Actuator', ['Mounting', 'Travel limits', 'Accessories']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Lockouts / stops', 'Final checks']),
  ]
}

const TAB_BUILDERS: Record<ItpTemplateId, () => ItpTabState[]> = {
  twinseal: twinsealTabs,
  twin_stem: twinStemTabs,
  non_lubricated_plug: nonLubricatedPlugTabs,
  four_way_diverter: fourWayDiverterTabs,
}

export function buildTabsForTemplate(templateId: string): ItpTabState[] {
  const id = normalizeTemplateId(templateId)
  return TAB_BUILDERS[id]()
}

export function createEmptyPayloadForTemplate(templateId: string): ItpPayload {
  const id = normalizeTemplateId(templateId)
  return {
    v: ITP_SCHEMA_VERSION,
    templateId: id,
    generalNotes: '',
    tabs: buildTabsForTemplate(id),
  }
}

/** Pick ITP checklist template from bowl type, then valve type hints. */
export function resolveItpTemplateIdFromValve(bowlType: string | null | undefined, valveType: string | null | undefined): ItpTemplateId {
  const raw = (bowlType ?? '').trim()
  if (raw && KNOWN_IDS.has(raw)) return raw as ItpTemplateId

  const bt = raw.toLowerCase()
  const alias: Record<string, ItpTemplateId> = {
    twinseal: 'twinseal',
    'twin seal': 'twinseal',
    'non lubricated plug': 'non_lubricated_plug',
    'non-lubricated plug': 'non_lubricated_plug',
    'four way': 'four_way_diverter',
    'four-way': 'four_way_diverter',
    diverter: 'four_way_diverter',
  }
  if (bt && alias[bt]) return alias[bt]

  const vt = (valveType ?? '').toLowerCase()
  if (vt.includes('four-way') || vt.includes('four way') || vt.includes('diverter')) return 'four_way_diverter'
  if (vt.includes('non lubricated') && vt.includes('plug')) return 'non_lubricated_plug'
  if (vt.includes('twinseal')) return 'twinseal'

  return DEFAULT_ITP_TEMPLATE_ID
}
