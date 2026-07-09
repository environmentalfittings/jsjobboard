import type { CheckedStandardKey, TestParametersBundle } from '../utils/testStandards'
import type { SeatTypeKind, TestMediumKind } from '../utils/testStandards'
import { normalizeSeatType } from '../utils/testStandards'

export type TestPhaseResult = {
  id: string
  passFail: 'pass' | 'fail' | ''
  notes: string
  medium?: string
  actualPressure?: string
}

/** Audit snapshot of required test parameters in effect when the test was performed. */
export type TestStandardParams = {
  checkedStandards: CheckedStandardKey[]
  testMedium: TestMediumKind
  seatType: SeatTypeKind
  cwp: number
  shellPressure: number
  hpSeatPressure: number
  lpSeatPressure: string
  sp160HeliumPressure?: number | null
  shellHoldTime?: number
  hpSeatHoldTime?: number
  lpSeatHoldTime?: number
  allowableLeakageShell?: number
  allowableLeakageHpSeat?: number
  allowableLeakageLpSeat?: number
  leakageUnit?: string
  sizeRange: string
  warnings: string[]
  phaseResults?: TestPhaseResult[]
  /** @deprecated legacy single-standard key */
  testStandard?: string
}

export function buildTestStandardParams(
  bundle: TestParametersBundle,
  testMedium: TestMediumKind,
  seatType: SeatTypeKind,
  checkedStandards: CheckedStandardKey[],
  phaseResults: TestPhaseResult[],
): TestStandardParams | null {
  if (!bundle.summary) return null

  const s = bundle.summary
  const shellPhase = bundle.phases.find((p) => p.id.includes('shell') || p.id === 'sp160-phase2')
  const hpPhase = bundle.phases.find((p) => p.id.includes('hp-seat') || p.id === 'sp160-phase4')
  const lpPhase = bundle.phases.find((p) => p.id.includes('lp') || p.id === 'sp160-phase5')

  return {
    checkedStandards,
    testMedium,
    seatType,
    cwp: s.cwp,
    shellPressure: s.shellTestPressure,
    hpSeatPressure: s.hpSeatTestPressure,
    lpSeatPressure: s.lpSeatTestPressure,
    sp160HeliumPressure: s.sp160HeliumPressure,
    sizeRange: s.sizeBracketLabel,
    warnings: s.warnings,
    phaseResults,
    shellHoldTime: shellPhase ? parseHoldSeconds(shellPhase.holdTime) : undefined,
    hpSeatHoldTime: hpPhase ? parseHoldSeconds(hpPhase.holdTime) : undefined,
    lpSeatHoldTime: lpPhase ? parseHoldSeconds(lpPhase.holdTime) : undefined,
  }
}

function parseHoldSeconds(holdTime: string): number | undefined {
  const sec = holdTime.match(/^(\d+)\s*s/)
  if (sec) return Number(sec[1])
  const min = holdTime.match(/^(\d+)\s*min/)
  if (min) return Number(min[1]) * 60
  return undefined
}

export function parseTestStandardParams(raw: unknown): TestStandardParams | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const legacyStandard = typeof o.testStandard === 'string' ? o.testStandard : null
  let checkedStandards: CheckedStandardKey[] = []
  if (Array.isArray(o.checkedStandards)) {
    checkedStandards = o.checkedStandards.filter((v): v is CheckedStandardKey =>
      ['api598', 'api6d', 'sp160', 'b1634'].includes(String(v)),
    )
  } else if (legacyStandard) {
    const map: Record<string, CheckedStandardKey> = {
      API_598: 'api598',
      API_6D: 'api6d',
      MSS_SP160: 'sp160',
      B16_34: 'b1634',
    }
    const key = map[legacyStandard]
    if (key) checkedStandards = [key]
  }

  const medium = o.testMedium === 'gas' ? 'gas' : o.testMedium === 'liquid' ? 'liquid' : 'liquid'
  const seat = normalizeSeatType(typeof o.seatType === 'string' ? o.seatType : 'soft-resilient')

  const lpRaw = o.lpSeatPressure
  const lpSeatPressure =
    typeof lpRaw === 'string' ? lpRaw : typeof lpRaw === 'number' ? String(lpRaw) : '60–100 PSI'

  const phaseResults: TestPhaseResult[] | undefined = Array.isArray(o.phaseResults)
    ? o.phaseResults
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
        .map((p) => ({
          id: typeof p.id === 'string' ? p.id : '',
          passFail:
            p.passFail === 'pass' || p.passFail === 'fail' ? p.passFail : ('' as TestPhaseResult['passFail']),
          notes: typeof p.notes === 'string' ? p.notes : '',
          medium: typeof p.medium === 'string' ? p.medium : undefined,
          actualPressure: typeof p.actualPressure === 'string' ? p.actualPressure : undefined,
        }))
    : undefined

  if (!checkedStandards.length && !o.cwp) return null

  return {
    checkedStandards,
    testMedium: medium,
    seatType: seat,
    cwp: typeof o.cwp === 'number' ? o.cwp : 0,
    shellPressure: typeof o.shellPressure === 'number' ? o.shellPressure : 0,
    hpSeatPressure: typeof o.hpSeatPressure === 'number' ? o.hpSeatPressure : 0,
    lpSeatPressure,
    sp160HeliumPressure: typeof o.sp160HeliumPressure === 'number' ? o.sp160HeliumPressure : null,
    shellHoldTime: typeof o.shellHoldTime === 'number' ? o.shellHoldTime : undefined,
    hpSeatHoldTime: typeof o.hpSeatHoldTime === 'number' ? o.hpSeatHoldTime : undefined,
    lpSeatHoldTime: typeof o.lpSeatHoldTime === 'number' ? o.lpSeatHoldTime : undefined,
    allowableLeakageShell: typeof o.allowableLeakageShell === 'number' ? o.allowableLeakageShell : undefined,
    allowableLeakageHpSeat: typeof o.allowableLeakageHpSeat === 'number' ? o.allowableLeakageHpSeat : undefined,
    allowableLeakageLpSeat: typeof o.allowableLeakageLpSeat === 'number' ? o.allowableLeakageLpSeat : undefined,
    leakageUnit: typeof o.leakageUnit === 'string' ? o.leakageUnit : undefined,
    sizeRange: typeof o.sizeRange === 'string' ? o.sizeRange : '',
    warnings: Array.isArray(o.warnings) ? o.warnings.filter((w): w is string => typeof w === 'string') : [],
    phaseResults,
    testStandard: legacyStandard ?? undefined,
  }
}

export {
  checkedStandardLabel,
  formatCheckedStandardsSummary,
  formatTestPressuresSummary,
  testStandardLabel,
} from '../utils/testStandards'

// Legacy type alias — bundle replaces single-result shape
export type TestParametersResult = TestParametersBundle
