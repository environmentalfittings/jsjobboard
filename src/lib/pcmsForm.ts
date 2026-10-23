import type { Valve } from '../types'

/** PCMS / SP-0135 > RV-1958 test & repair data captured from the job board. */
export type PcmsPartRow = {
  primaryCondition: string
  secondaryCondition: string
  workPerformed: string
  recommendation: string
  priorRecommendation: string
}

export const PCMS_PART_NAMES = [
  'Seat',
  'Disc',
  'Bellows',
  'Stem',
  'Nozzle',
  'Body In',
  'Body Out',
  'Spring',
  'Disc Holder',
  'B/D Ring',
  'Bonnet',
  'Inlet',
  'Outlet',
  'Adjusting Screw',
  'Guide',
  'Spindle',
] as const

export type PcmsPartName = (typeof PCMS_PART_NAMES)[number]

export type PcmsFormState = {
  reportDate: string
  testRepairDate: string
  /** Relief valve data */
  description: string
  assetNo: string
  serialNo: string
  fluidState: string
  manufacturer: string
  modelNo: string
  testMedium: string
  governingCode: string
  shopNo: string
  maxTestPressure: string
  springNumber: string
  freeHeight: string
  springRangeFrom: string
  springRangeTo: string
  orificeDesignation: string
  orificeSize: string
  cdtp: string
  requiredCapacity: string
  setPressure: string
  calculatedCapacity: string
  ratedCapacity: string
  backPressureConstant: string
  backPressureVariable: string
  builtUpBackPressure: string
  relievingTemperature: string
  nozzleRingSet: string
  guideRingSet: string
  inletSize: string
  inletRating: string
  inletType: string
  outletSize: string
  outletRating: string
  outletType: string
  /** Pretest */
  visualDirty: boolean
  visualSealsIntact: boolean
  visualDisassembled: boolean
  visualBrokenSpring: boolean
  visualPlugged: boolean
  visualPluggedPct: string
  valveCdtpPressure: string
  initialPopPressure: string
  repopPressure: string
  leakPressure: string
  reseatPressure: string
  lift: string
  blowdown: string
  tightAfterReseat: boolean
  noPopLeakedTooBad: boolean
  noPopStuck: boolean
  sealTightPressure: string
  sealTightLeakRate: string
  passFailOverride: boolean
  passFailResult: string
  passFailReason: string
  pretestComments: string
  parts: Record<PcmsPartName, PcmsPartRow>
  partsComments: string
  /** Final test / QA */
  qaSpringFreeHeight: boolean
  qaDiskSinglePiece: boolean
  qaOpenTopAdjustingBolt: boolean
  qaSpringNoVerified: boolean
  qaCautionTag: boolean
  qaLeadSeals: boolean
  qaCodeStamp: boolean
  finalSet: string
  finalCdtp: string
  finalBack: string
  finalReseat: string
  finalVacuum: string
  finalNozzleRing: string
  finalGuideRing: string
  seatTestPressure: string
  finalTestMedium: string
  gaugeSerialNo: string
  finalLeakRate: string
  gaugeCalibrationDate: string
  valveRepairShop: string
  representative: string
  controlNo: string
  finalComments: string
  workPerformedNotes: string
  recommendation: string
  /** Field checklist (page 3) */
  removalPerson: string
  removalDate: string
  inletPipingClear: boolean
  inletPipingPluggedPct: string
  outletPipingClear: boolean
  outletPipingPluggedPct: string
  installPerson: string
  installDate: string
  sapTagMatchesAsset: '' | 'yes' | 'no'
  dataPlateMatchesForm: '' | 'yes' | 'no'
  dataPlateMatchesPtp: '' | 'yes' | 'no'
  properLocation: '' | 'yes' | 'no'
  noObstructions: '' | 'yes' | 'no'
  bonnetVentsOk: '' | 'yes' | 'no' | 'na'
  drainHolesOk: '' | 'yes' | 'no' | 'na'
  fieldComments: string
  mocNumber: string
}

const emptyPart = (): PcmsPartRow => ({
  primaryCondition: '',
  secondaryCondition: '',
  workPerformed: '',
  recommendation: '',
  priorRecommendation: '',
})

function emptyParts(): Record<PcmsPartName, PcmsPartRow> {
  return Object.fromEntries(PCMS_PART_NAMES.map((name) => [name, emptyPart()])) as Record<
    PcmsPartName,
    PcmsPartRow
  >
}

function todayIso(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const KNOWN_MANUFACTURERS = [
  'Crosby',
  'Consolidated',
  'Farris',
  'Anderson Greenwood',
  'Anderson',
  'Tyco',
  'Dresser',
  'Emerson',
  'Leser',
  'Spirax',
  'Bailey',
  'Mercer',
  'Kunkle',
  'Taylor',
  'Flowsafe',
]

function parseSizePair(raw: string | null | undefined): { inlet: string; outlet: string } {
  const text = String(raw ?? '').trim()
  if (!text) return { inlet: '', outlet: '' }
  const pair = text.match(/(\d+(?:\.\d+)?)\s*[x×\/]\s*(\d+(?:\.\d+)?)/i)
  if (pair) return { inlet: pair[1], outlet: pair[2] }
  const single = text.match(/(\d+(?:\.\d+)?)/)
  return { inlet: single?.[1] ?? text.replace(/["']/g, ''), outlet: '' }
}

function parseDescriptionHints(description: string | null | undefined): {
  assetNo: string
  manufacturer: string
  modelNo: string
  setPressure: string
  inletSize: string
  outletSize: string
} {
  const text = String(description ?? '')
  const asset =
    text.match(/\bRV[-\s]?\d+[A-Z]?\b/i)?.[0]?.replace(/\s+/g, '-').toUpperCase() ??
    text.match(/\b[A-Z]{1,3}-?\d{3,}\b/)?.[0] ??
    ''
  let manufacturer = ''
  for (const name of KNOWN_MANUFACTURERS) {
    if (new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)) {
      manufacturer = name.toUpperCase() === 'CROSBY' ? 'CROSBY' : name
      break
    }
  }
  const setPressure = text.match(/\bset\s*[:=]?\s*(\d+(?:\.\d+)?)\b/i)?.[1] ?? ''
  const sizes = parseSizePair(text)
  // Model-ish token after manufacturer (e.g. JOSE15C)
  let modelNo = ''
  if (manufacturer) {
    const after = text.split(new RegExp(manufacturer, 'i'))[1] ?? ''
    modelNo = after.match(/\b([A-Z]{2,}[A-Z0-9-]{2,})\b/)?.[1] ?? ''
  }
  return {
    assetNo: asset,
    manufacturer,
    modelNo,
    setPressure,
    inletSize: sizes.inlet,
    outletSize: sizes.outlet,
  }
}

export function emptyPcmsForm(): PcmsFormState {
  return {
    reportDate: todayIso(),
    testRepairDate: '',
    description: '',
    assetNo: '',
    serialNo: '',
    fluidState: '',
    manufacturer: '',
    modelNo: '',
    testMedium: '',
    governingCode: '',
    shopNo: '',
    maxTestPressure: '',
    springNumber: '',
    freeHeight: '',
    springRangeFrom: '',
    springRangeTo: '',
    orificeDesignation: '',
    orificeSize: '',
    cdtp: '',
    requiredCapacity: '',
    setPressure: '',
    calculatedCapacity: '',
    ratedCapacity: '',
    backPressureConstant: '',
    backPressureVariable: '',
    builtUpBackPressure: '',
    relievingTemperature: '',
    nozzleRingSet: '',
    guideRingSet: '',
    inletSize: '',
    inletRating: '',
    inletType: 'ANSI RF',
    outletSize: '',
    outletRating: '',
    outletType: 'ANSI RF',
    visualDirty: false,
    visualSealsIntact: false,
    visualDisassembled: false,
    visualBrokenSpring: false,
    visualPlugged: false,
    visualPluggedPct: '',
    valveCdtpPressure: '',
    initialPopPressure: '',
    repopPressure: '',
    leakPressure: '',
    reseatPressure: '',
    lift: '',
    blowdown: '',
    tightAfterReseat: false,
    noPopLeakedTooBad: false,
    noPopStuck: false,
    sealTightPressure: '',
    sealTightLeakRate: '',
    passFailOverride: false,
    passFailResult: '',
    passFailReason: '',
    pretestComments: '',
    parts: emptyParts(),
    partsComments: '',
    qaSpringFreeHeight: false,
    qaDiskSinglePiece: false,
    qaOpenTopAdjustingBolt: false,
    qaSpringNoVerified: false,
    qaCautionTag: false,
    qaLeadSeals: false,
    qaCodeStamp: false,
    finalSet: '',
    finalCdtp: '',
    finalBack: '',
    finalReseat: '',
    finalVacuum: '',
    finalNozzleRing: '',
    finalGuideRing: '',
    seatTestPressure: '',
    finalTestMedium: '',
    gaugeSerialNo: '',
    finalLeakRate: '',
    gaugeCalibrationDate: '',
    valveRepairShop: 'JS Valve',
    representative: '',
    controlNo: '',
    finalComments: '',
    workPerformedNotes: '',
    recommendation: '',
    removalPerson: '',
    removalDate: '',
    inletPipingClear: false,
    inletPipingPluggedPct: '',
    outletPipingClear: false,
    outletPipingPluggedPct: '',
    installPerson: '',
    installDate: '',
    sapTagMatchesAsset: '',
    dataPlateMatchesForm: '',
    dataPlateMatchesPtp: '',
    properLocation: '',
    noObstructions: '',
    bonnetVentsOk: '',
    drainHolesOk: '',
    fieldComments: '',
    mocNumber: '',
  }
}

/** Prefill PCMS fields from an open job card (plus light parsing of description). */
export function pcmsFormFromValve(valve: Valve): PcmsFormState {
  const hints = parseDescriptionHints(valve.description)
  const sizePair = parseSizePair(valve.size)
  const base = emptyPcmsForm()
  return {
    ...base,
    reportDate: todayIso(),
    testRepairDate: (valve.date_tested || valve.date_pre_tested || '').trim(),
    description: (valve.description ?? '').trim(),
    assetNo: hints.assetNo,
    manufacturer: hints.manufacturer,
    modelNo: hints.modelNo,
    shopNo: valve.valve_id,
    controlNo: valve.valve_id,
    setPressure: hints.setPressure,
    finalSet: hints.setPressure,
    inletSize: sizePair.inlet || hints.inletSize,
    outletSize: sizePair.outlet || hints.outletSize,
    inletRating: (valve.pressure_class ?? '').trim(),
    outletRating: (valve.pressure_class ?? '').trim(),
    pretestComments: (valve.notes ?? '').trim(),
    finalComments: (valve.notes ?? '').trim(),
    valveRepairShop: 'JS Valve',
  }
}

const storageKey = (valveRowId: number) => `pcms-form:v1:${valveRowId}`

export function loadSavedPcmsForm(valveRowId: number): PcmsFormState | null {
  try {
    const raw = localStorage.getItem(storageKey(valveRowId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PcmsFormState>
    const base = emptyPcmsForm()
    return {
      ...base,
      ...parsed,
      parts: { ...base.parts, ...(parsed.parts ?? {}) },
    }
  } catch {
    return null
  }
}

export function savePcmsForm(valveRowId: number, form: PcmsFormState) {
  localStorage.setItem(storageKey(valveRowId), JSON.stringify(form))
}

export function clearSavedPcmsForm(valveRowId: number) {
  localStorage.removeItem(storageKey(valveRowId))
}

/** Merge saved draft over job-card defaults (saved wins for edited fields). */
export function loadPcmsFormForValve(valve: Valve): PcmsFormState {
  const fromCard = pcmsFormFromValve(valve)
  const saved = loadSavedPcmsForm(valve.id)
  if (!saved) return fromCard
  return {
    ...fromCard,
    ...saved,
    // Keep shop / control tied to current job id unless user overrode to something else.
    shopNo: saved.shopNo?.trim() || fromCard.shopNo,
    controlNo: saved.controlNo?.trim() || fromCard.controlNo,
    parts: { ...fromCard.parts, ...saved.parts },
  }
}

export const PCMS_CONDITION_OPTIONS = [
  '(N/A)',
  'CR-H',
  'CR-L',
  'CR-M',
  'CR-N',
  'CR-O',
  'Dpst-H',
  'Dpst-L',
  'Dpst-M',
  'Dpst-N',
  'DPST-O',
  'OK',
  'Replace',
  'Pitted',
  'Rusty',
  'Stuck',
]

/** Official Work Performed codes from the RV-1958 / PCMS Crystal legend. */
export const PCMS_WORK_OPTIONS = [
  '(N/A)',
  'BACK PRESSURE TESTED',
  'BLAST',
  'BLAST & PAINT',
  'BLAST & POLISH',
  'BLAST & POLISH/LAPPED',
  'CLEAN',
  'CLEAN & BLAST',
  'CLEAN & LAP',
  'CLEAN & MACHINE',
  'CLEAN & PAINT',
  'CLEAN & POLISH',
  'CLEAN & REPLACED ORING',
  'CLEAN & TESTED',
  'CLEAN, BLAST & POLISH',
  'CLEAN, LAP & BLAST',
  'CLEAN, LAP & MACHINE',
  'CLEAN, LAP & POLISH',
  'CLEAN, LAP, MACHINE & POLISH',
  'CLEAN, MACHINE & POLISH',
  'CLEAN, PAINT & BLAST',
  'CLEANED, PAINT, LAPPED SEATS',
  'CRACKED / PITTED / REPLACED',
  'CUT - LAPPED',
  'DRILLED & TAPPED BONNET',
  'INSTALL NEW',
  'LAP',
  'LAP & MACHINE',
  'M/V KIT INSTALLED',
  'M/V KIT P/N MORK73V022',
  'M/V O-RING KIT INSTALLED',
  'MACHINE',
  'MACHINED & POLISHED',
  'MAIN VALVE & PILOT VALVE',
  'MAIN VAVLE SOFT GOODS KIT',
  'MARKED/LAPPED',
  'NEW VALVE',
  'NOZZLE',
  'OK',
  'PAINTED',
  'PILOT "O" RINGS BAD',
  'PITTED, REPLACED',
  'PLASTIC TRAPPED BETWEEN DISC &',
  'POLISH',
  'POLISH & LAPPED',
  'POLISH/MACHINE/LAPPED',
  'PRESSURE CHANGE REPLACE W/0385CR',
  'PRESSURE CHANGED REPLACED 0405CR',
  'RECONDITIONED',
  'REINSTALLED',
  'REJECT',
  'REPAIRED & PAINTED',
  'Replaced',
  'RESET POP PRESSURE',
  'RPLCE NEXT TIME, WAS IN TOLERANC',
  'RUSTY',
  'RUSTY/POLISHED',
  'SHOULD BE REPLACED NEXT TIME',
  'SOME PITTING (LIGHT)',
  'STUCK',
  'STUCK, CLEAN',
  'TEFLON COATED',
  'TEST AND SET ONLY',
  'TEST ONLY',
  'TESTED & CLEANED',
  'UPGRADED TO INC 625',
  'VALVE PASSED PRETEST',
  'VITON',
]

export const PCMS_RECOMMENDATION_OPTIONS = ['(N/A)', 'Replace Next Repair', 'OK']
