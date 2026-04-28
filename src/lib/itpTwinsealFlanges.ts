import type { FlangeFaceState, ItpItemRow, ItpItemState, ItpPayload } from '../types/itp'

export const ITP_PORT_STANDARD = 'standard'
export const ITP_PORT_THREE_WAY = 'three_way'
export const ITP_PORT_FOUR_WAY = 'four_way'
export const ITP_PORT_OTHER = 'other'

export const ITP_VALVE_PORT_OPTIONS = [
  { id: ITP_PORT_STANDARD, label: 'Standard' },
  { id: ITP_PORT_THREE_WAY, label: 'Three-way' },
  { id: ITP_PORT_FOUR_WAY, label: 'Four-way' },
  { id: ITP_PORT_OTHER, label: 'Other' },
] as const

export type TwinsealFlangeInspectionStatus = 'pending' | 'acceptable' | 'attention'

export function normalizedPortConfig(
  raw: string | undefined,
): typeof ITP_PORT_STANDARD | typeof ITP_PORT_THREE_WAY | typeof ITP_PORT_FOUR_WAY {
  const s = (raw ?? '').trim()
  if (s === ITP_PORT_THREE_WAY) return ITP_PORT_THREE_WAY
  if (s === ITP_PORT_FOUR_WAY) return ITP_PORT_FOUR_WAY
  return ITP_PORT_STANDARD
}

export function visibleFlangeIds(
  config: ReturnType<typeof normalizedPortConfig>,
): readonly ('A' | 'B' | 'C' | 'D')[] {
  if (config === ITP_PORT_FOUR_WAY) return ['A', 'B', 'C', 'D']
  if (config === ITP_PORT_THREE_WAY) return ['A', 'B', 'C']
  return ['A', 'B']
}

/** True for the shared “Body → Flanges” row on every checklist template that defines it. */
export function isBodyFlangesItpItem(tabId: string, item: Pick<ItpItemRow, 'label'>): boolean {
  return tabId === 'body' && item.label.toLowerCase() === 'flanges'
}

/** @deprecated Use isBodyFlangesItpItem — kept for any stray imports */
export function isTwinsealBodyFlanges(
  _payload: ItpPayload,
  tabId: string,
  item: Pick<ItpItemRow, 'label'>,
): boolean {
  return isBodyFlangesItpItem(tabId, item)
}

/** Flange A lives on the root of `ItpItemState`; B/C/D on nested objects. */
export function getFlangeFaceState(data: ItpItemState, id: 'A' | 'B' | 'C' | 'D'): FlangeFaceState {
  if (id === 'A') {
    return {
      facingType: data.facingType,
      facingTypeOther: data.facingTypeOther,
      condition: data.condition,
      conditionOther: data.conditionOther,
      measure1: data.measure1,
      measure2: data.measure2,
      measurementNote: data.measurementNote,
      repairAction: data.repairAction,
      repairActionOther: data.repairActionOther,
      notes: data.notes,
    }
  }
  if (id === 'B') return { ...data.flangeB }
  if (id === 'C') return { ...data.flangeC }
  return { ...data.flangeD }
}

export function aggregateTwinsealFlangesStatus(data: ItpItemState): TwinsealFlangeInspectionStatus {
  const cfg = normalizedPortConfig(data.valvePortConfig)
  const ids = visibleFlangeIds(cfg)
  let pending = false
  let attention = false
  for (const fid of ids) {
    const f = getFlangeFaceState(data, fid)
    const c = f.condition.trim()
    if (!c) pending = true
    else if (c !== 'Acceptable') attention = true
  }
  if (pending) return 'pending'
  if (attention) return 'attention'
  return 'acceptable'
}

export function twinsealFlangesProgressTicks(data: ItpItemState): {
  inspected: boolean
  acceptable: boolean
  needRepair: boolean
} {
  const st = aggregateTwinsealFlangesStatus(data)
  if (st === 'pending') return { inspected: false, acceptable: false, needRepair: false }
  if (st === 'acceptable') return { inspected: true, acceptable: true, needRepair: false }
  return { inspected: true, acceptable: false, needRepair: true }
}

export function twinsealFlangesIsFlagged(data: ItpItemState): boolean {
  const cfg = normalizedPortConfig(data.valvePortConfig)
  for (const fid of visibleFlangeIds(cfg)) {
    const f = getFlangeFaceState(data, fid)
    const c = f.condition.trim()
    if (c && c !== 'Acceptable') return true
  }
  return false
}
