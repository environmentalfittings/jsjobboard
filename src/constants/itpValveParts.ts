import { resolveItpTemplateIdFromValve, type ItpTemplateId } from './itpTemplates'

export type ValvePartDef = {
  key: string
  label: string
}

export type ValvePartProfile = {
  id: ItpTemplateId | 'generic'
  label: string
  parts: ValvePartDef[]
}

const GATE_VALVE_PARTS: ValvePartDef[] = [
  { key: 'stem', label: 'Stem' },
  { key: 'drive_bushing', label: 'Drive bushing' },
  { key: 'handwheel', label: 'Handwheel' },
  { key: 'backseat', label: 'Backseat' },
  { key: 'bonnet', label: 'Bonnet' },
  { key: 'stuffing_box', label: 'Stuffing box' },
  { key: 'packing_gland', label: 'Packing gland' },
  { key: 'packing_pusher', label: 'Packing pusher' },
  { key: 'body', label: 'Body' },
  { key: 'gasket_faces', label: 'Gasket faces' },
  { key: 'bonnet_gasket_area', label: 'Bonnet gasket area' },
  { key: 'body_guides', label: 'Body guides' },
  { key: 'disc', label: 'Disc' },
]

const GLOBE_VALVE_PARTS: ValvePartDef[] = [
  { key: 'stem', label: 'Stem' },
  { key: 'disc', label: 'Disc' },
  { key: 'seat_ring', label: 'Seat ring' },
  { key: 'bonnet', label: 'Bonnet' },
  { key: 'body', label: 'Body' },
  { key: 'stuffing_box', label: 'Stuffing box' },
  { key: 'packing_gland', label: 'Packing gland' },
  { key: 'gasket_faces', label: 'Gasket faces' },
  { key: 'handwheel', label: 'Handwheel' },
  { key: 'backseat', label: 'Backseat' },
]

const BALL_VALVE_PARTS: ValvePartDef[] = [
  { key: 'body', label: 'Body' },
  { key: 'ball', label: 'Ball' },
  { key: 'stem', label: 'Stem' },
  { key: 'seats', label: 'Seats' },
  { key: 'end_caps', label: 'End caps' },
  { key: 'gasket_faces', label: 'Gasket faces' },
]

const CHECK_VALVE_PARTS: ValvePartDef[] = [
  { key: 'body', label: 'Body' },
  { key: 'clapper', label: 'Clapper' },
  { key: 'seat', label: 'Seat' },
  { key: 'hinge_pin', label: 'Hinge pin' },
  { key: 'cover', label: 'Cover' },
  { key: 'gasket_faces', label: 'Gasket faces' },
]

const PLUG_VALVE_PARTS: ValvePartDef[] = [
  { key: 'body', label: 'Body' },
  { key: 'plug', label: 'Plug' },
  { key: 'stem', label: 'Stem' },
  { key: 'seats', label: 'Seats' },
  { key: 'top_cap', label: 'Top cap' },
  { key: 'gasket_faces', label: 'Gasket faces' },
]

const GENERIC_PARTS: ValvePartDef[] = [
  { key: 'body', label: 'Body' },
  { key: 'stem', label: 'Stem' },
  { key: 'disc', label: 'Disc / wedge' },
  { key: 'bonnet', label: 'Bonnet' },
  { key: 'gasket_faces', label: 'Gasket faces' },
]

export const VALVE_PART_PROFILES: Record<ValvePartProfile['id'], ValvePartProfile> = {
  gate_valve: { id: 'gate_valve', label: 'Gate valve', parts: GATE_VALVE_PARTS },
  pressure_seal_gate: { id: 'pressure_seal_gate', label: 'Pressure seal gate', parts: GATE_VALVE_PARTS },
  globe_valve: { id: 'globe_valve', label: 'Globe valve', parts: GLOBE_VALVE_PARTS },
  pressure_seal_globe: { id: 'pressure_seal_globe', label: 'Pressure seal globe', parts: GLOBE_VALVE_PARTS },
  ball_valve: { id: 'ball_valve', label: 'Ball valve', parts: BALL_VALVE_PARTS },
  check_valve: { id: 'check_valve', label: 'Check valve', parts: CHECK_VALVE_PARTS },
  butterfly_valve: { id: 'butterfly_valve', label: 'Butterfly valve', parts: GENERIC_PARTS },
  relief_valve: { id: 'relief_valve', label: 'Relief valve', parts: GENERIC_PARTS },
  lubricated_plug: { id: 'lubricated_plug', label: 'Lubricated plug', parts: PLUG_VALVE_PARTS },
  non_lubricated_plug: { id: 'non_lubricated_plug', label: 'Non-lubricated plug', parts: PLUG_VALVE_PARTS },
  twinseal: { id: 'twinseal', label: 'Twinseal', parts: PLUG_VALVE_PARTS },
  twin_stem: { id: 'twin_stem', label: 'Standard / plug', parts: PLUG_VALVE_PARTS },
  four_way_diverter: { id: 'four_way_diverter', label: 'Four-way diverter', parts: PLUG_VALVE_PARTS },
  machine_shop_welding: { id: 'machine_shop_welding', label: 'Machine shop / welding', parts: GENERIC_PARTS },
  generic: { id: 'generic', label: 'Valve', parts: GENERIC_PARTS },
}

export function resolveValvePartsProfileId(bowlType: string | null | undefined, valveType: string | null | undefined): ValvePartProfile['id'] {
  const vt = (valveType ?? '').trim().toLowerCase()
  if (vt.includes('wedge gate') || (vt.includes('gate') && !vt.includes('knife'))) return 'gate_valve'
  if (vt.includes('globe')) return vt.includes('pressure seal') ? 'pressure_seal_globe' : 'globe_valve'
  if (vt.includes('ball')) return 'ball_valve'
  if (vt.includes('check')) return 'check_valve'
  if (vt.includes('butterfly')) return 'butterfly_valve'
  if (vt.includes('relief') || vt.includes('safety')) return 'relief_valve'

  const templateId = resolveItpTemplateIdFromValve(bowlType, valveType)
  if (templateId in VALVE_PART_PROFILES) return templateId
  return 'generic'
}

export function getValvePartProfile(profileId: ValvePartProfile['id']): ValvePartProfile {
  return VALVE_PART_PROFILES[profileId] ?? VALVE_PART_PROFILES.generic
}
