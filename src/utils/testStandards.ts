/** Test pressure / hold-time / leakage calculations per API 598, API 6D, MSS SP-160, ASME B16.34. */

import { canonicalizeValveType } from '../lib/testLogValveType'

export type MaterialKey =
  | 'WCB'
  | 'WC1'
  | 'F11'
  | 'F22'
  | 'SS304'
  | 'SS316'
  | 'C5'
  | 'C12'
  | 'P91'
  | 'Monel'
  | 'Hastelloy'

export const CWP_BY_CLASS: Record<number, Record<MaterialKey, number>> = {
  150: {
    WCB: 285,
    WC1: 285,
    F11: 285,
    F22: 285,
    SS304: 275,
    SS316: 275,
    C5: 260,
    C12: 280,
    P91: 290,
    Monel: 270,
    Hastelloy: 210,
  },
  300: {
    WCB: 740,
    WC1: 740,
    F11: 730,
    F22: 750,
    SS304: 720,
    SS316: 720,
    C5: 675,
    C12: 730,
    P91: 750,
    Monel: 705,
    Hastelloy: 545,
  },
  400: {
    WCB: 990,
    WC1: 990,
    F11: 975,
    F22: 1000,
    SS304: 960,
    SS316: 960,
    C5: 900,
    C12: 970,
    P91: 1000,
    Monel: 940,
    Hastelloy: 730,
  },
  600: {
    WCB: 1480,
    WC1: 1480,
    F11: 1460,
    F22: 1500,
    SS304: 1440,
    SS316: 1440,
    C5: 1350,
    C12: 1455,
    P91: 1500,
    Monel: 1410,
    Hastelloy: 1095,
  },
  900: {
    WCB: 2220,
    WC1: 2220,
    F11: 2190,
    F22: 2250,
    SS304: 2160,
    SS316: 2160,
    C5: 2025,
    C12: 2185,
    P91: 2250,
    Monel: 2120,
    Hastelloy: 1640,
  },
  1500: {
    WCB: 3705,
    WC1: 3705,
    F11: 3655,
    F22: 3750,
    SS304: 3600,
    SS316: 3600,
    C5: 3375,
    C12: 3640,
    P91: 3750,
    Monel: 3530,
    Hastelloy: 2735,
  },
  2500: {
    WCB: 6170,
    WC1: 6170,
    F11: 6090,
    F22: 6250,
    SS304: 6000,
    SS316: 6000,
    C5: 5625,
    C12: 6065,
    P91: 6250,
    Monel: 5885,
    Hastelloy: 4565,
  },
}

export type CheckedStandardKey = 'api598' | 'api6d' | 'sp160' | 'b1634'

export type NpsSizeBracket = 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge'

export type SeatTypeKind = 'soft-resilient' | 'metal'

/** Canonical seat type for calculations and new saves. */
export function normalizeSeatType(seatType: string): SeatTypeKind {
  if (seatType === 'metal') return 'metal'
  return 'soft-resilient'
}

export function isMetalSeat(seatType: SeatTypeKind | string): boolean {
  return normalizeSeatType(seatType) === 'metal'
}

export type TestMediumKind = 'liquid' | 'gas'

export type LeakageResult = {
  allowance: number | string
  unit: string
  label?: string
  note?: string
}

export type TestPhaseRow = {
  id: string
  standard: CheckedStandardKey
  phase: string
  test: string
  medium: string
  mediumEditable: boolean
  mediumOptions?: string[]
  testPressure: string
  holdTime: string
  leakage: string
  leakageDetail?: LeakageResult
  passFail?: 'pass' | 'fail' | ''
  notes?: string
  locked: boolean
  isOptional?: boolean
  acceptanceCriteria?: string
  /** Pre-check steps (e.g. receiving inspection) — not part of sequential phase locking. */
  excludesFromLocking?: boolean
  /** Banner text rendered immediately below this row in the parameters table. */
  noticeAfter?: string
}

export type TestParametersSummary = {
  cwp: number
  shellTestPressure: number
  hpSeatTestPressure: number
  lpSeatTestPressure: string
  sp160HeliumPressure: number | null
  sizeBracket: NpsSizeBracket
  sizeBracketLabel: string
  seatType: SeatTypeKind
  seatTypeLabel: string
  valveType: string
  warnings: string[]
}

export type TestParametersBundle = {
  complete: boolean
  summary: TestParametersSummary | null
  notices: string[]
  infoPanels: { standard: CheckedStandardKey; title: string; message: string }[]
  /** Non-pressure pre-checks shown above the phase table (not in locking sequence). */
  precheckSteps: TestPhaseRow[]
  phases: TestPhaseRow[]
  optionalPhases: TestPhaseRow[]
}

export type ValveDataForTest = {
  nps: number
  pressureClass: number
  bodyMaterial: string
  seatType: SeatTypeKind
  valveType: string
}

const SIZE_BRACKET_LABELS: Record<NpsSizeBracket, string> = {
  small: 'NPS ≤ 2"',
  medium: 'NPS 2.5"–6"',
  large: 'NPS 8"–12"',
  xlarge: 'NPS 14"–18"',
  xxlarge: 'NPS ≥ 20"',
}

/** API 598-2023 Table 4 — verify hold times against current edition before production use. */
export const API598_HOLD_TIMES: Record<
  NpsSizeBracket,
  { shell_liq: number; shell_gas: number; backseat: number; lp: number; hp_liq: number; hp_gas: number }
> = {
  small: { shell_liq: 60, shell_gas: 15, backseat: 15, lp: 60, hp_liq: 60, hp_gas: 60 },
  medium: { shell_liq: 60, shell_gas: 15, backseat: 15, lp: 60, hp_liq: 60, hp_gas: 60 },
  large: { shell_liq: 120, shell_gas: 30, backseat: 60, lp: 120, hp_liq: 120, hp_gas: 60 },
  xlarge: { shell_liq: 300, shell_gas: 60, backseat: 60, lp: 120, hp_liq: 120, hp_gas: 60 },
  xxlarge: { shell_liq: 300, shell_gas: 60, backseat: 60, lp: 120, hp_liq: 120, hp_gas: 60 },
}

/** API 6D 25th Ed. Table 10.1 */
export const API6D_HOLD_TIMES: Record<NpsSizeBracket, { shell: number; seat: number }> = {
  small: { shell: 300, seat: 300 },
  medium: { shell: 300, seat: 300 },
  large: { shell: 300, seat: 600 },
  xlarge: { shell: 300, seat: 600 },
  xxlarge: { shell: 1800, seat: 1200 },
}

/** MSS SP-160-2024 Sections 8.3.6.1 / 8.3.6.2 — hold times in minutes */
export const SP160_HELIUM_HOLD_TIMES = {
  bubble: {
    small: 15,
    medium: 15,
    large: 30,
    xlarge: 30,
    xxlarge: 45,
  },
  massspec: {
    small: 30,
    medium: 30,
    large: 45,
    xlarge: 45,
    xxlarge: 60,
  },
} as const

const SPECIAL_ALLOY_MATERIALS = new Set(['Monel', 'Hastelloy', 'Alloy 400', 'Alloy C276'])

const BODY_MATERIAL_TO_CWP_KEY: Record<string, MaterialKey> = {
  WCB: 'WCB',
  WC1: 'WC1',
  F11: 'F11',
  F22: 'F22',
  C5: 'C5',
  C12: 'C12',
  C9: 'C12',
  W9: 'C12',
  P91: 'P91',
  '304 SS': 'SS304',
  '309 SS': 'SS304',
  '347 SS': 'SS304',
  '316 SS': 'SS316',
  Monel: 'Monel',
  Hastelloy: 'Hastelloy',
  'Alloy 400': 'Monel',
  'Alloy C276': 'Hastelloy',
}

export function getNPSSizeBracket(nps: number): NpsSizeBracket {
  if (nps <= 2) return 'small'
  if (nps <= 6) return 'medium'
  if (nps <= 12) return 'large'
  if (nps <= 18) return 'xlarge'
  return 'xxlarge'
}

export function getNpsRange(nps: number): number {
  return ['small', 'medium', 'large', 'xlarge', 'xxlarge'].indexOf(getNPSSizeBracket(nps))
}

export function parseNpsFromSize(size: string): number | null {
  const raw = size.trim().replace(/"/g, '')
  if (!raw) return null

  const mixed = raw.match(/^(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1])
    const num = Number(mixed[2])
    const den = Number(mixed[3])
    if (den > 0) return whole + num / den
  }

  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : null
}

export function parsePressureClassFromLabel(pressureClass: string): number | null {
  const match = pressureClass.match(/(\d{2,4})/)
  if (!match) return null
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) ? value : null
}

export function resolveMaterialKey(bodyMaterial: string): { key: MaterialKey | null; warnings: string[] } {
  const trimmed = bodyMaterial.trim()
  const warnings: string[] = []

  if (!trimmed) {
    return { key: null, warnings: ['Body material required to calculate test pressures'] }
  }

  const key = BODY_MATERIAL_TO_CWP_KEY[trimmed]
  if (!key) {
    warnings.push(`Unrecognized body material "${trimmed}" — verify CWP against ASME B16.34 Table 2`)
    return { key: null, warnings }
  }

  if (SPECIAL_ALLOY_MATERIALS.has(trimmed)) {
    warnings.push(
      '⚠ Special alloy — verify CWP against ASME B16.34 Table 2 for this material group before accepting auto-populated pressures',
    )
  }

  return { key, warnings }
}

export function getCwp(pressureClass: number, materialKey: MaterialKey): number | null {
  return CWP_BY_CLASS[pressureClass]?.[materialKey] ?? null
}

/** MSS SP-160-2024 Section 8.3.5 */
export function getSP160HeliumTestPressure(cwp: number): number {
  const raw = Math.min(500, cwp * 0.8)
  return Math.ceil(raw / 25) * 25
}

/** Leakage values must be verified against current standard editions and updated by a QA-authorized person only. */
export function getAPI598LeakageAllowance(
  nps: number,
  seatType: SeatTypeKind | string,
  medium: TestMediumKind,
): LeakageResult {
  if (!isMetalSeat(seatType)) {
    return {
      allowance: 0,
      unit: medium === 'gas' ? 'bubbles/min' : 'drops/min',
      label: 'Zero — no visible leakage',
    }
  }

  if (medium === 'liquid') {
    const ccPerMin = Math.max(1, Math.round(3 * nps))
    return { allowance: ccPerMin, unit: 'cc/min', note: '(1 cc = 16 drops)' }
  }

  if (nps <= 2) return { allowance: 0, unit: 'bubbles/min', label: 'Zero' }

  return {
    allowance: Math.round(4 * nps),
    unit: 'bubbles/min',
    note: '(100 bubbles ≈ 1 cc)',
  }
}

export function getAPI6DLeakageAllowance(nps: number, seatType: SeatTypeKind | string): LeakageResult {
  if (!isMetalSeat(seatType)) {
    return { allowance: 0, unit: 'visible leakage', label: 'Rate A — zero visible leakage (ISO 5208)' }
  }

  const dn = nps * 25.4
  const rate = Number.parseFloat((0.006 * dn).toFixed(3))
  return {
    allowance: rate,
    unit: 'mm³/s',
    label: `ISO 5208 Rate D — ≤ ${rate} mm³/s`,
  }
}

export function isGasMedium(medium: string): boolean {
  const m = medium.toLowerCase()
  return m.includes('air') || m.includes('gas') || m.includes('nitrogen') || m.includes('helium')
}

export function isLiquidMedium(medium: string): boolean {
  const m = medium.toLowerCase()
  return m.includes('water') || m.includes('liquid') || m.includes('oil')
}

export function mediumToTestKind(medium: string): TestMediumKind {
  return isGasMedium(medium) && !isLiquidMedium(medium) ? 'gas' : 'liquid'
}

export function getAPI598ShellHoldTime(bracket: NpsSizeBracket, medium: string): number {
  const times = API598_HOLD_TIMES[bracket]
  return isGasMedium(medium) ? times.shell_gas : times.shell_liq
}

export function getAPI598HpSeatHoldTime(bracket: NpsSizeBracket, medium: string): number {
  const times = API598_HOLD_TIMES[bracket]
  return isGasMedium(medium) ? times.hp_gas : times.hp_liq
}

function formatLeakageDisplay(result: LeakageResult): string {
  if (result.label) return result.label
  if (typeof result.allowance === 'number') return `${result.allowance} ${result.unit}`
  return String(result.allowance)
}

function formatSeconds(seconds: number): string {
  return `${seconds} s`
}

function formatMinutes(minutes: number): string {
  return `${minutes} min`
}

function normalizeValveType(valveType: string): string {
  return valveType.toLowerCase().trim()
}

function isValveType(valveType: string, ...needles: string[]): boolean {
  const n = normalizeValveType(valveType)
  return needles.some((needle) => n.includes(needle))
}

export function defaultSeatTypeForValve(valveType: string): SeatTypeKind {
  const t = normalizeValveType(valveType)
  if (t.includes('gate') || t.includes('globe') || t.includes('check') || t.includes('plug')) return 'metal'
  return 'soft-resilient'
}

export function seatTypeLabel(seatType: SeatTypeKind | string): string {
  if (isMetalSeat(seatType)) return 'Metal'
  return 'Soft / Resilient'
}

export function mapProceduresToStandards(procedures: string[]): CheckedStandardKey[] {
  const keys = new Set<CheckedStandardKey>()

  for (const procedure of procedures) {
    const p = procedure.toUpperCase()
    if (/API\s*598|598\s*TEST/.test(p)) keys.add('api598')
    if (/API\s*518|518\s*TEST/.test(p)) keys.add('api598')
    if (/API\s*6D|6D\s*TEST/.test(p)) keys.add('api6d')
    if (/MSS\s*SP[\s-]*160|SP\s*160/.test(p)) keys.add('sp160')
    if (/B16\.?34|ASME\s*B16/.test(p)) keys.add('b1634')
  }

  return Array.from(keys)
}

export function checkedStandardLabel(key: CheckedStandardKey): string {
  const labels: Record<CheckedStandardKey, string> = {
    api598: 'API 598',
    api6d: 'API 6D',
    sp160: 'MSS SP-160',
    b1634: 'ASME B16.34',
  }
  return labels[key]
}

function buildApi598Phases(
  valveData: ValveDataForTest,
  bracket: NpsSizeBracket,
  shellPsi: number,
  hpPsi: number,
  startLocked: boolean,
): TestPhaseRow[] {
  const { nps, seatType, valveType } = valveData
  const phases: TestPhaseRow[] = []
  let lockNext = startLocked

  const push = (row: Omit<TestPhaseRow, 'locked'>) => {
    phases.push({ ...row, locked: lockNext })
    lockNext = true
  }

  const showLp = isValveType(valveType, 'gate', 'plug', 'butterfly', 'ball')

  if (showLp) {
    const lpLeak = getAPI598LeakageAllowance(nps, seatType, 'gas')
    push({
      id: 'api598-lp-seat',
      standard: 'api598',
      phase: 'LP Seat Closure',
      test: 'Low-pressure seat closure',
      medium: 'Air',
      mediumEditable: false,
      testPressure: '60–100 PSI (enter actual)',
      holdTime: formatSeconds(API598_HOLD_TIMES[bracket].lp),
      leakage: formatLeakageDisplay(lpLeak),
      leakageDetail: lpLeak,
    })
  }

  if (isValveType(valveType, 'gate', 'globe', 'ball', 'check', 'plug', 'butterfly')) {
    const hpLeak = getAPI598LeakageAllowance(nps, seatType, 'liquid')
    push({
      id: 'api598-hp-seat',
      standard: 'api598',
      phase: 'HP Seat Closure',
      test: 'High-pressure seat closure',
      medium: 'Water',
      mediumEditable: true,
      mediumOptions: ['Water', 'Liquid'],
      testPressure: `${hpPsi} PSI`,
      holdTime: formatSeconds(API598_HOLD_TIMES[bracket].hp_liq),
      leakage: formatLeakageDisplay(hpLeak),
      leakageDetail: hpLeak,
    })
  }

  if (isValveType(valveType, 'gate', 'globe')) {
    push({
      id: 'api598-backseat',
      standard: 'api598',
      phase: 'HP Backseat',
      test: 'Backseat test',
      medium: 'Water',
      mediumEditable: true,
      mediumOptions: ['Water', 'Liquid'],
      testPressure: `${hpPsi} PSI`,
      holdTime: formatSeconds(API598_HOLD_TIMES[bracket].backseat),
      leakage: 'Zero — no visible leakage',
      leakageDetail: { allowance: 0, unit: 'drops/min', label: 'Zero — no visible leakage' },
    })
  }

  push({
    id: 'api598-shell',
    standard: 'api598',
    phase: 'Shell',
    test: 'Shell test',
    medium: 'Water',
    mediumEditable: true,
    mediumOptions: ['Water', 'Liquid', 'Air', 'Gas'],
    testPressure: `${shellPsi} PSI`,
    holdTime: formatSeconds(API598_HOLD_TIMES[bracket].shell_liq),
    leakage: 'Zero — no visible leakage',
    leakageDetail: { allowance: 0, unit: 'drops/min', label: 'Zero — no visible leakage' },
  })

  return phases
}

function buildApi6dPhases(
  valveData: ValveDataForTest,
  bracket: NpsSizeBracket,
  hpPsi: number,
  shellPsi: number,
  startLocked: boolean,
): { phases: TestPhaseRow[]; optionalPhases: TestPhaseRow[] } {
  const { nps, seatType, valveType } = valveData
  const phases: TestPhaseRow[] = []
  const optionalPhases: TestPhaseRow[] = []
  let lockNext = startLocked

  const push = (row: Omit<TestPhaseRow, 'locked'>) => {
    phases.push({ ...row, locked: lockNext })
    lockNext = true
  }

  const lpLeak = getAPI6DLeakageAllowance(nps, seatType)
  push({
    id: 'api6d-lp-gas-seat',
    standard: 'api6d',
    phase: 'LP Gas Seat Closure',
    test: 'Low-pressure gas seat closure',
    medium: 'Nitrogen (preferred) or Air',
    mediumEditable: false,
    testPressure: '80–100 PSI (enter actual)',
    holdTime: formatSeconds(API6D_HOLD_TIMES[bracket].seat),
    leakage: formatLeakageDisplay(lpLeak),
    leakageDetail: lpLeak,
  })

  const hpLeak = getAPI6DLeakageAllowance(nps, seatType)
  push({
    id: 'api6d-hp-gas-seat',
    standard: 'api6d',
    phase: 'High Pressure Seat Closure Test',
    test: 'High-pressure seat closure — required for gas transmission service',
    medium: 'Nitrogen',
    mediumEditable: false,
    testPressure: `${hpPsi} PSI`,
    holdTime: formatSeconds(API6D_HOLD_TIMES[bracket].seat),
    leakage: formatLeakageDisplay(hpLeak),
    leakageDetail: hpLeak,
  })

  push({
    id: 'api6d-shell',
    standard: 'api6d',
    phase: 'Shell',
    test: 'Shell test',
    medium: 'Water',
    mediumEditable: true,
    mediumOptions: ['Water', 'Liquid', 'Nitrogen'],
    testPressure: `${shellPsi} PSI`,
    holdTime: formatSeconds(API6D_HOLD_TIMES[bracket].shell),
    leakage: 'Zero — no visible leakage',
    leakageDetail: { allowance: 0, unit: 'visible leakage', label: 'Zero — no visible leakage' },
  })

  if (isValveType(valveType, 'ball')) {
    push({
      id: 'api6d-antistatic',
      standard: 'api6d',
      phase: 'Anti-Static',
      test: 'Electrical continuity (ball to body)',
      medium: 'N/A',
      mediumEditable: false,
      testPressure: 'N/A',
      holdTime: 'N/A',
      leakage: 'N/A',
      acceptanceCriteria: '≤ 10 Ohms',
    })
  }

  push({
    id: 'api6d-operational',
    standard: 'api6d',
    phase: 'Operational',
    test: 'Operate valve through full open-close cycle at test pressure',
    medium: 'N/A',
    mediumEditable: false,
    testPressure: 'At test pressure',
    holdTime: 'N/A',
    leakage: 'N/A',
    acceptanceCriteria: 'Smooth operation, no binding',
  })

  optionalPhases.push({
    id: 'api6d-dbb',
    standard: 'api6d',
    phase: 'Double Block & Bleed',
    test: 'Both seats simultaneously from annulus cavity bleed port',
    medium: 'Per procedure',
    mediumEditable: false,
    testPressure: 'Per procedure',
    holdTime: 'Per procedure',
    leakage: 'Per ISO 5208',
    locked: false,
    isOptional: true,
  })

  optionalPhases.push({
    id: 'api6d-hp-gas-optional',
    standard: 'api6d',
    phase: 'High-Pressure Gas Test',
    test: 'High-pressure gas test (1.1× CWP, Nitrogen)',
    medium: 'Nitrogen',
    mediumEditable: false,
    testPressure: `${hpPsi} PSI`,
    holdTime: formatSeconds(API6D_HOLD_TIMES[bracket].seat),
    leakage: formatLeakageDisplay(hpLeak),
    leakageDetail: hpLeak,
    locked: false,
    isOptional: true,
  })

  return { phases, optionalPhases }
}

const SP160_HELIUM_MEDIA = ['Bubble test', 'Mass Spec – Detector Probe', 'Mass Spec – Accumulation'] as const

export function getSP160HeliumHoldTime(bracket: NpsSizeBracket, medium: string): string {
  const isBubble = medium.toLowerCase().includes('bubble')
  const minutes = isBubble ? SP160_HELIUM_HOLD_TIMES.bubble[bracket] : SP160_HELIUM_HOLD_TIMES.massspec[bracket]
  return formatMinutes(minutes)
}

export function getSP160HeliumAcceptance(medium: string): string {
  return medium.toLowerCase().includes('bubble')
    ? 'No continuous bubble formation'
    : '≤ 1×10⁻⁵ std cm³/s over background'
}

function buildSp160Phases(
  valveData: ValveDataForTest,
  bracket: NpsSizeBracket,
  shellPsi: number,
  hpPsi: number,
  heliumPsi: number,
): { precheckSteps: TestPhaseRow[]; phases: TestPhaseRow[] } {
  const { nps, seatType, valveType } = valveData

  const precheckSteps: TestPhaseRow[] = [
    {
      id: 'sp160-precheck',
      standard: 'sp160',
      phase: 'Pre-check',
      test: 'Receiving inspection & pre-test documentation',
      medium: 'N/A',
      mediumEditable: false,
      testPressure: 'N/A',
      holdTime: 'N/A',
      leakage: 'N/A',
      acceptanceCriteria: 'Per MSS SP-160 Section 7',
      excludesFromLocking: true,
      locked: false,
    },
  ]

  const phases: TestPhaseRow[] = [
    {
      id: 'sp160-phase1',
      standard: 'sp160',
      phase: 'Phase 1',
      test: 'Shell helium leak test (SP-160 Section 8.3)',
      medium: 'Bubble test',
      mediumEditable: true,
      mediumOptions: [...SP160_HELIUM_MEDIA],
      testPressure: `${heliumPsi} PSI`,
      holdTime: getSP160HeliumHoldTime(bracket, 'Bubble test'),
      leakage: 'N/A',
      acceptanceCriteria: getSP160HeliumAcceptance('Bubble test'),
      noticeAfter:
        '⚠ Phases 2–5 are locked until Phase 1 (Helium) passes. SP-160 §8.1.1: all pneumatic tests must precede liquid tests.',
      locked: false,
    },
    {
      id: 'sp160-phase2',
      standard: 'sp160',
      phase: 'Phase 2',
      test: 'Shell hydrostatic test (SP-160 Section 8.4)',
      medium: 'Water',
      mediumEditable: true,
      mediumOptions: ['Water', 'Kerosene', 'Paraffinic Oil', 'Helium', 'Nitrogen'],
      testPressure: `${shellPsi} PSI`,
      holdTime: formatSeconds(API598_HOLD_TIMES.xlarge.shell_liq),
      leakage: 'Zero — no visible leakage',
      leakageDetail: { allowance: 0, unit: 'drops/min', label: 'Zero — no visible leakage' },
      locked: false,
    },
  ]

  if (isValveType(valveType, 'gate', 'globe')) {
    phases.push({
      id: 'sp160-phase3',
      standard: 'sp160',
      phase: 'Phase 3',
      test: 'HP backseat test (SP-160 Section 8.5)',
      medium: 'Water',
      mediumEditable: true,
      mediumOptions: ['Water', 'Liquid'],
      testPressure: `${hpPsi} PSI`,
      holdTime: formatSeconds(API598_HOLD_TIMES[bracket].backseat),
      leakage: 'Zero — no visible leakage',
      leakageDetail: { allowance: 0, unit: 'drops/min', label: 'Zero — no visible leakage' },
      locked: false,
    })
  }

  const hpLeak = getAPI598LeakageAllowance(nps, seatType, 'liquid')
  if (isValveType(valveType, 'gate', 'globe', 'check')) {
    phases.push({
      id: 'sp160-phase4',
      standard: 'sp160',
      phase: 'Phase 4',
      test: 'HP seat closure test (SP-160 Section 8.6)',
      medium: 'Water or Liquid',
      mediumEditable: false,
      testPressure: `${hpPsi} PSI`,
      holdTime: formatSeconds(API598_HOLD_TIMES[bracket].hp_liq),
      leakage: formatLeakageDisplay(hpLeak),
      leakageDetail: hpLeak,
      locked: false,
    })
  }

  if (isValveType(valveType, 'gate', 'plug', 'butterfly')) {
    const lpLeak = getAPI598LeakageAllowance(nps, seatType, 'gas')
    phases.push({
      id: 'sp160-phase5',
      standard: 'sp160',
      phase: 'Phase 5',
      test: 'LP seat closure test (SP-160 Section 8.7)',
      medium: 'Air',
      mediumEditable: false,
      testPressure: '60–100 PSI (enter actual)',
      holdTime: formatSeconds(API598_HOLD_TIMES[bracket].lp),
      leakage: formatLeakageDisplay(lpLeak),
      leakageDetail: lpLeak,
      locked: false,
    })
  }

  return { precheckSteps, phases }
}

export function getTestParameters(
  valveData: ValveDataForTest,
  checkedStandards: CheckedStandardKey[],
): TestParametersBundle {
  valveData = { ...valveData, valveType: canonicalizeValveType(valveData.valveType) }
  const notices: string[] = []
  const infoPanels: TestParametersBundle['infoPanels'] = []
  const warnings: string[] = []

  const material = resolveMaterialKey(valveData.bodyMaterial)
  warnings.push(...material.warnings)

  const bracket = getNPSSizeBracket(valveData.nps)
  const complete = Boolean(valveData.nps && valveData.pressureClass && material.key)

  let cwp = 0
  let shellPsi = 0
  let hpPsi = 0
  let heliumPsi: number | null = null

  if (material.key && valveData.pressureClass) {
    const lookedUp = getCwp(valveData.pressureClass, material.key)
    if (lookedUp != null) {
      cwp = lookedUp
      shellPsi = Math.round(cwp * 1.5)
      hpPsi = Math.round(cwp * 1.1)
      heliumPsi = getSP160HeliumTestPressure(cwp)
    } else {
      warnings.push(`Pressure class ${valveData.pressureClass} not in CWP table`)
    }
  }

  const summary: TestParametersSummary | null = complete
    ? {
        cwp,
        shellTestPressure: shellPsi,
        hpSeatTestPressure: hpPsi,
        lpSeatTestPressure: '60–100 PSI',
        sp160HeliumPressure: checkedStandards.includes('sp160') ? heliumPsi : null,
        sizeBracket: bracket,
        sizeBracketLabel: SIZE_BRACKET_LABELS[bracket],
        seatType: valveData.seatType,
        seatTypeLabel: seatTypeLabel(valveData.seatType),
        valveType: valveData.valveType || '—',
        warnings,
      }
    : null

  if (!checkedStandards.length || !complete) {
    return { complete, summary, notices, infoPanels, precheckSteps: [], phases: [], optionalPhases: [] }
  }

  const standards = new Set(checkedStandards)
  const phases: TestPhaseRow[] = []
  const precheckSteps: TestPhaseRow[] = []
  const optionalPhases: TestPhaseRow[] = []

  if (standards.has('b1634')) {
    infoPanels.push({
      standard: 'b1634',
      title: 'ASME B16.34',
      message:
        'ASME B16.34 pressure class ratings are the basis for CWP values shown above. No additional test procedures are added — the test pressures shown (1.5× and 1.1× CWP) already comply with ASME B16.34 Section 10.',
    })
  }

  if (standards.has('api6d')) {
    notices.push(
      'API 6D minimum hold times apply — longer than API 598. Shell: 5 min minimum; Seat: 5–20 min minimum.',
    )
  }

  const showSp160 = standards.has('sp160')
  const showApi598 = standards.has('api598') && !showSp160

  if (showSp160) {
    const sp160 = buildSp160Phases(valveData, bracket, shellPsi, hpPsi, heliumPsi ?? 0)
    precheckSteps.push(...sp160.precheckSteps)
    phases.push(...sp160.phases)
  } else if (showApi598) {
    phases.push(...buildApi598Phases(valveData, bracket, shellPsi, hpPsi, false))
  }

  if (standards.has('api6d')) {
    const { phases: api6dPhases, optionalPhases: api6dOptional } = buildApi6dPhases(
      valveData,
      bracket,
      hpPsi,
      shellPsi,
      phases.length > 0,
    )
    phases.push(...api6dPhases)
    optionalPhases.push(...api6dOptional)
  }

  return { complete, summary, notices, infoPanels, precheckSteps, phases, optionalPhases }
}

export function applyPhaseMediumOverride(
  phase: TestPhaseRow,
  medium: string,
  context: { nps: number; seatType: SeatTypeKind; bracket: NpsSizeBracket },
): TestPhaseRow {
  const { nps, seatType, bracket } = context
  let holdTime = phase.holdTime
  let leakage = phase.leakage
  let leakageDetail = phase.leakageDetail
  let acceptanceCriteria = phase.acceptanceCriteria

  if (phase.id === 'api598-shell' || phase.id === 'sp160-phase2') {
    if (phase.id === 'sp160-phase2') {
      holdTime = formatSeconds(
        isGasMedium(medium) ? API598_HOLD_TIMES.xlarge.shell_gas : API598_HOLD_TIMES.xlarge.shell_liq,
      )
    } else {
      holdTime = formatSeconds(getAPI598ShellHoldTime(bracket, medium))
    }
  }

  if (phase.id === 'api598-hp-seat' || phase.id === 'sp160-phase4') {
    holdTime = formatSeconds(getAPI598HpSeatHoldTime(bracket, medium))
    const leak = getAPI598LeakageAllowance(nps, seatType, mediumToTestKind(medium))
    leakage = formatLeakageDisplay(leak)
    leakageDetail = leak
  }

  if (phase.id === 'sp160-phase5' || phase.id === 'api598-lp-seat') {
    const leak = getAPI598LeakageAllowance(nps, seatType, 'gas')
    leakage = formatLeakageDisplay(leak)
    leakageDetail = leak
  }

  if (phase.id === 'sp160-phase1') {
    holdTime = getSP160HeliumHoldTime(bracket, medium)
    acceptanceCriteria = getSP160HeliumAcceptance(medium)
  }

  return { ...phase, medium, holdTime, leakage, leakageDetail, acceptanceCriteria }
}

export function formatHoldTimeSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  if (seconds % 60 === 0) return `${seconds / 60} minutes`
  return `${seconds} seconds`
}

export function formatTestPressuresSummary(params: {
  shellPressure: number
  hpSeatPressure: number
  lpSeatPressure?: number | string
} | null): string {
  if (!params || (!params.shellPressure && !params.hpSeatPressure)) return '—'
  const lp =
    typeof params.lpSeatPressure === 'string'
      ? params.lpSeatPressure.replace(/\s*PSI.*/i, '').trim()
      : params.lpSeatPressure ?? '60–100'
  return `Shell: ${params.shellPressure} / HP: ${params.hpSeatPressure} / LP: ${lp} PSI`
}

export function formatCheckedStandardsSummary(standards: CheckedStandardKey[]): string {
  if (!standards.length) return '—'
  return standards.map(checkedStandardLabel).join(', ')
}

// Legacy aliases for existing imports
export type TestStandardKey = CheckedStandardKey
export function testStandardLabel(key: CheckedStandardKey | string): string {
  if (key === 'API_598' || key === 'api598') return 'API 598'
  if (key === 'API_6D' || key === 'api6d') return 'API 6D'
  if (key === 'MSS_SP160' || key === 'sp160') return 'MSS SP-160'
  if (key === 'B16_34' || key === 'b1634') return 'ASME B16.34'
  return String(key)
}
