export const ITP_SCHEMA_VERSION = 2 as const

/** One flange face (facing, condition, measurements, repair). */
export type FlangeFaceState = {
  facingType: string
  /** Shown when facing type is "Other". */
  facingTypeOther: string
  /** Shown when facing type is "Butt Weld". */
  buttWeldSchedule: string
  condition: string
  /** Shown when condition is "Other". */
  conditionOther: string
  measure1: string
  measure2: string
  measureAfterMachining: string
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
  /** Threaded holes inspection status (NPT-specific checks). */
  nptThreadInspection: string
  /** Visual condition of seating surface. */
  seatCondition: string
  /** Lapping pass/fail or measurement. */
  seatLapResult: string
  /** Stem runout measurement. */
  stemRunout: string
  /** Stem diameter as-found. */
  stemDiameter: string
  /** Minimum allowable stem diameter. */
  stemDiameterMin: string
  /** Condition of disc or wedge. */
  discWedgeCondition: string
  /** Disc or wedge thickness measurement. */
  discWedgeThickness: string
  /** Minimum allowable disc or wedge thickness. */
  discWedgeThicknessMin: string
  /** Packing / gland condition. */
  packingCondition: string
  /** Type of packing used. */
  packingType: string
  /** PRV set pressure as-found. */
  springSetPressure: string
  /** PRV specified set pressure. */
  springSetPressureSpec: string
  /** PRV blowdown pressure. */
  blowdownPressure: string
  /** Actuator stroke measured. */
  actuatorStrokeMeasured: string
  /** Actuator stroke specification. */
  actuatorStrokeSpec: string
  /** Breakout or running torque measured. */
  torqueMeasured: string
  /** Torque specification. */
  torqueSpec: string
  /** Leak test result for this section. */
  sealTestResult: string
  /** Dimension 3 in the critical dimensions diagram (end-to-end / face-to-face). */
  faceToFaceMeasurement: string
  faceToFaceAfterMachining: string
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
