export const ITP_SCHEMA_VERSION = 2 as const

/** One flange face (facing, condition, measurements, repair). */
export type FlangeFaceState = {
  facingType: string
  /** Shown when facing type is "Other". */
  facingTypeOther: string
  condition: string
  /** Shown when condition is "Other". */
  conditionOther: string
  measure1: string
  measure2: string
  measurementNote: string
  repairAction: string
  /** Shown when repair action is "Other". */
  repairActionOther: string
  notes: string
}

/**
 * Checklist row state. Root fields are Flange A when using multi-flange Body → Flanges (all ITP templates).
 * `flangeB` / `flangeC` / `flangeD` hold additional ports for three-way / four-way.
 */
export type ItpItemState = FlangeFaceState & {
  valvePortConfig: string
  /** Shown when valve configuration is "Other". */
  valvePortConfigOther: string
  flangeB: FlangeFaceState
  flangeC: FlangeFaceState
  flangeD: FlangeFaceState
}

export type ItpItemRow = {
  id: string
  label: string
  data: ItpItemState
}

export type ItpTabState = {
  id: string
  label: string
  items: ItpItemRow[]
}

export type ItpPayload = {
  v: typeof ITP_SCHEMA_VERSION
  /** Bowl / checklist template (see constants/itpTemplates.ts). */
  templateId?: string
  generalNotes: string
  tabs: ItpTabState[]
}
