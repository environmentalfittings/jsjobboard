import type { ItpPayload, ItpTabState } from '../types/itp'
import { ITP_SCHEMA_VERSION } from '../types/itp'
import { emptyItemState } from '../lib/itpDefaultState'

/** Persisted on valves.bowl_type and in itp_data.templateId */
export const ITP_BOWL_TYPE_OPTIONS = [
  { id: 'twinseal', label: 'Twinseal' },
  { id: 'twin_stem', label: 'Standard / Plug (full checklist)' },
  { id: 'non_lubricated_plug', label: 'Non-lubricated plug' },
  { id: 'four_way_diverter', label: 'Four-way diverter' },
  { id: 'machine_shop_welding', label: 'Machine Shop / Welding' },
  { id: 'gate_valve', label: 'Gate Valve' },
  { id: 'globe_valve', label: 'Globe Valve' },
  { id: 'check_valve', label: 'Check Valve' },
  { id: 'ball_valve', label: 'Ball Valve' },
  { id: 'butterfly_valve', label: 'Butterfly Valve' },
  { id: 'relief_valve', label: 'Relief / Safety Valve' },
  { id: 'pressure_seal_gate', label: 'Pressure Seal Gate' },
  { id: 'pressure_seal_globe', label: 'Pressure Seal Globe' },
  { id: 'lubricated_plug', label: 'Lubricated Plug Valve' },
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
      'Body',
      'Sealing Surfaces',
      'Threaded Holes',
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
      'Body',
      'Threaded Holes',
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
      'Body',
      'Sealing Surfaces',
      'Threaded Holes',
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
      'Body',
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

function gateValveTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', [
      'Flanges',
      'Wall Thickness',
      'Sealing Surfaces',
      'Threaded Holes',
      'Pressure Boundary',
      'Coating/Paint',
    ]),
    tabDef('wedge_disc', 'Wedge/Disc', ['Disc Condition', 'Seating Surfaces', 'Stem-to-Disc Connection']),
    tabDef('stem', 'Stem', ['Stem Condition', 'Packing Area', 'Back Seat']),
    tabDef('seat', 'Seat', ['Seat Surfaces', 'Seat Taper/Fit']),
    tabDef('actuator', 'Actuator', ['Mounting', 'Travel/Stroke', 'Accessories']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Tagging/ID', 'Final Checks']),
  ]
}

function globeValveTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', [
      'Flanges',
      'Wall Thickness',
      'Sealing Surfaces',
      'Threaded Holes',
      'Pressure Boundary',
      'Coating/Paint',
    ]),
    tabDef('disc_plug', 'Disc/Plug', ['Disc Condition', 'Seating Taper', 'Stem Connection']),
    tabDef('stem', 'Stem', ['Stem Condition', 'Packing Area', 'Backseat']),
    tabDef('seat', 'Seat', ['Seat Ring Condition', 'Lapping', 'Seat/Disc Match']),
    tabDef('actuator', 'Actuator', ['Mounting', 'Travel/Stroke', 'Accessories']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Tagging/ID', 'Handwheel/Operator', 'Final Checks']),
  ]
}

function checkValveTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Wall Thickness', 'Sealing Surfaces', 'Pressure Boundary', 'Coating/Paint']),
    tabDef('disc_clapper', 'Disc/Clapper', ['Disc or Clapper Condition', 'Hinge Pin', 'Seating Surfaces']),
    tabDef('seat', 'Seat', ['Seat Ring Condition', 'Lapping Result']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Spring/Dampener', 'Tagging/ID', 'Flow Direction Mark']),
  ]
}

function ballValveTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Wall Thickness', 'Threaded Holes', 'Pressure Boundary', 'Coating/Paint']),
    tabDef('ball', 'Ball', ['Ball Condition', 'Seat Pocket', 'Stem Drive']),
    tabDef('stem', 'Stem', ['Stem Condition', 'Packing/Seals', 'Anti-blowout']),
    tabDef('seat', 'Seat', ['Seat Condition', 'Seat Load/Compression']),
    tabDef('actuator', 'Actuator', ['Mounting', 'Travel/Stroke', 'Accessories']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Tagging/ID', 'Final Checks']),
  ]
}

function butterflyValveTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Wall Thickness', 'Sealing Surfaces', 'Pressure Boundary', 'Coating/Paint']),
    tabDef('disc', 'Disc', ['Disc Condition', 'Shaft Clearance', 'Seat Interference']),
    tabDef('shaft', 'Shaft', ['Shaft Condition', 'Packing', 'Bearings']),
    tabDef('seat', 'Seat', ['Seat/Liner Condition', 'Seat Compression']),
    tabDef('actuator', 'Actuator', ['Mounting', 'Travel Stops', 'Accessories']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Disc Alignment', 'Tagging/ID', 'Final Checks']),
  ]
}

function reliefValveTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Inlet/Outlet Condition', 'Pressure Boundary', 'Coating/Paint']),
    tabDef('internals', 'Internals', ['Nozzle/Seat Condition', 'Disc Condition', 'Lapping Result', 'Guide/Lift']),
    tabDef('spring', 'Spring', ['Spring Condition', 'Spring Height Free/Compressed']),
    tabDef('set_pressure', 'Set Pressure', ['Set Pressure As-Found', 'Set Pressure As-Left', 'Blowdown', 'Leak Test']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Lift Lever', 'Cap/Seal', 'Tagging/ID']),
  ]
}

function pressureSealGateTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Wall Thickness', 'Pressure Seal Bore', 'Pressure Boundary']),
    tabDef('wedge_disc', 'Wedge/Disc', ['Disc Condition', 'Seating Surfaces', 'Stem Connection']),
    tabDef('pressure_seal', 'Pressure Seal', ['Seal Ring Condition', 'Seal Groove', 'Retainer Bolting']),
    tabDef('stem', 'Stem', ['Stem Condition', 'Packing']),
    tabDef('seat', 'Seat', ['Seat Surfaces', 'Seat Taper/Fit']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Tagging/ID', 'Final Checks']),
  ]
}

function pressureSealGlobeTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Wall Thickness', 'Pressure Seal Bore', 'Pressure Boundary']),
    tabDef('disc_plug', 'Disc/Plug', ['Disc Condition', 'Seating Taper', 'Stem Connection']),
    tabDef('pressure_seal', 'Pressure Seal', ['Seal Ring Condition', 'Seal Groove', 'Retainer Bolting']),
    tabDef('stem', 'Stem', ['Stem Condition', 'Packing']),
    tabDef('seat', 'Seat', ['Seat Surfaces', 'Seat Taper/Fit']),
    tabDef('assembly', 'Assembly', ['Bolting', 'Tagging/ID', 'Final Checks']),
  ]
}

function lubricatedPlugTabs(): ItpTabState[] {
  return [
    tabDef('body', 'Body', ['Flanges', 'Wall Thickness', 'Port Configuration', 'Pressure Boundary']),
    tabDef('plug', 'Plug', ['Plug Taper Fit', 'Seating Surfaces', 'Lubrication Grooves', 'Key/Drive']),
    tabDef('stem', 'Stem', ['Stem & Packing', 'Blowout Protection']),
    tabDef('sealant', 'Sealant', ['Sealant System', 'Injection Fitting']),
    tabDef('assembly', 'Assembly', ['Torque/Bolting', 'Operator Alignment', 'Tagging/ID']),
  ]
}

function weldingWorkItemLabels(partNumber: number): string[] {
  return [
    `Part ${partNumber} - Item`,
    `Part ${partNumber} - Repair needed (tech)`,
    `Part ${partNumber} - Weld required`,
    `Part ${partNumber} - As found dimensions (machinist)`,
    `Part ${partNumber} - Machine 1 dimensions (machinist)`,
    `Part ${partNumber} - Weld procedure`,
    `Part ${partNumber} - Weld dimensions (welder)`,
    `Part ${partNumber} - Machine 2 dimensions (machinist)`,
    `Part ${partNumber} - Q/C approved`,
  ]
}

function machineShopWeldingTabs(): ItpTabState[] {
  return [
    tabDef('weld_item_1', 'Weld Item 1', weldingWorkItemLabels(1)),
    tabDef('weld_item_2', 'Weld Item 2', weldingWorkItemLabels(2)),
    tabDef('weld_item_3', 'Weld Item 3', weldingWorkItemLabels(3)),
    tabDef('weld_signoff', 'Sign-off', ['Q/C manager signature', 'Date']),
  ]
}

const TAB_BUILDERS: Record<ItpTemplateId, () => ItpTabState[]> = {
  twinseal: twinsealTabs,
  twin_stem: twinStemTabs,
  non_lubricated_plug: nonLubricatedPlugTabs,
  four_way_diverter: fourWayDiverterTabs,
  machine_shop_welding: machineShopWeldingTabs,
  gate_valve: gateValveTabs,
  globe_valve: globeValveTabs,
  check_valve: checkValveTabs,
  ball_valve: ballValveTabs,
  butterfly_valve: butterflyValveTabs,
  relief_valve: reliefValveTabs,
  pressure_seal_gate: pressureSealGateTabs,
  pressure_seal_globe: pressureSealGlobeTabs,
  lubricated_plug: lubricatedPlugTabs,
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
    '4 way diverter valve': 'four_way_diverter',
    diverter: 'four_way_diverter',
    welding: 'machine_shop_welding',
    'machine shop welding': 'machine_shop_welding',
    'machine shop/welding': 'machine_shop_welding',
  }
  if (bt && alias[bt]) return alias[bt]

  const vt = (valveType ?? '').trim().toLowerCase()
  const valveTypeMap: Record<string, ItpTemplateId> = {
    gate: 'gate_valve',
    'pipeline gate- slab': 'gate_valve',
    'pipeline gate- expanding': 'gate_valve',
    'knife gate': 'gate_valve',
    globe: 'globe_valve',
    'angle globe': 'globe_valve',
    'pressure seal globe': 'pressure_seal_globe',
    check: 'check_valve',
    'piston check': 'check_valve',
    'ball check': 'check_valve',
    'duo check': 'check_valve',
    'ball valve': 'ball_valve',
    'delayed coker ball': 'ball_valve',
    orbit: 'ball_valve',
    butterfly: 'butterfly_valve',
    everlast: 'butterfly_valve',
    'relief valve': 'relief_valve',
    'safety valve': 'relief_valve',
    'pressure seal gate': 'pressure_seal_gate',
    'lubricated plug': 'lubricated_plug',
    twinseal: 'twinseal',
    'non lubricated plug': 'non_lubricated_plug',
    'non-lubricated plug': 'non_lubricated_plug',
    '4 way diverter valve': 'four_way_diverter',
  }
  if (vt && valveTypeMap[vt]) return valveTypeMap[vt]

  if (vt.includes('pressure seal globe')) return 'pressure_seal_globe'
  if (vt.includes('pressure seal gate')) return 'pressure_seal_gate'
  if (vt.includes('four-way') || vt.includes('four way') || vt.includes('diverter')) return 'four_way_diverter'
  if (vt.includes('non lubricated') && vt.includes('plug')) return 'non_lubricated_plug'
  if (vt.includes('lubricated') && vt.includes('plug')) return 'lubricated_plug'
  if (vt.includes('twinseal')) return 'twinseal'
  if (vt.includes('weld') || vt.includes('machine shop')) return 'machine_shop_welding'

  return DEFAULT_ITP_TEMPLATE_ID
}
