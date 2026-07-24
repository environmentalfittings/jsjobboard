import type { ToolCalibration } from '../types/toolCalibration'

export type SopCheckKind = 'measurement' | 'visual' | 'passfail'

export type SopCheckPoint = {
  id: string
  label: string
  /** Nominal / reference size when applicable */
  nominal: string | null
  kind: SopCheckKind
}

export type ToolCalibrationMeasurement = {
  pointId: string
  label: string
  nominal: string | null
  kind: SopCheckKind
  asFound: string
  asLeft: string
  passed: boolean
}

function pts(
  items: Array<{ id: string; label: string; nominal?: string | null; kind?: SopCheckKind }>,
): SopCheckPoint[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    nominal: item.nominal ?? null,
    kind: item.kind ?? 'measurement',
  }))
}

/** Dial / digital calipers — SOP 2010. */
const DIGITAL_CALIPER_POINTS = pts([
  { id: 'c-100', label: 'Outside jaws', nominal: '0.100"' },
  { id: 'c-200', label: 'Outside jaws', nominal: '0.200"' },
  { id: 'c-300', label: 'Outside jaws', nominal: '0.300"' },
  { id: 'c-500', label: 'Outside jaws', nominal: '0.500"' },
  { id: 'c-1000', label: 'Outside jaws', nominal: '1.000"' },
  { id: 'c-parallel', label: 'Outside jaws parallelism', nominal: '2.000"', kind: 'passfail' },
  { id: 'c-depth', label: 'Depth rod (if applicable)', nominal: '0.200"' },
  { id: 'c-id', label: 'Inside jaws', nominal: '0.500" or 1.000"' },
  { id: 'c-visual', label: 'Clean / visual condition', kind: 'visual' },
])

/** Vernier calipers — SOP 2010. */
const VERNIER_CALIPER_POINTS = pts([
  { id: 'v-200', label: 'Outside jaws', nominal: '0.200"' },
  { id: 'v-1000', label: 'Outside jaws', nominal: '1.000"' },
  { id: 'v-6000', label: 'Outside jaws', nominal: '6.000"' },
  { id: 'v-parallel', label: 'Outside jaws parallelism', nominal: '2.000"', kind: 'passfail' },
  { id: 'v-depth', label: 'Depth rod (if applicable)', nominal: '0.200"' },
  { id: 'v-id', label: 'Inside jaws', nominal: '0.500" or 1.000"' },
  { id: 'v-visual', label: 'Clean / visual condition', kind: 'visual' },
])

/** Depth gages — SOP 2010. */
const DEPTH_GAGE_POINTS = pts([
  { id: 'd-100', label: 'Depth', nominal: '0.100"' },
  { id: 'd-200', label: 'Depth', nominal: '0.200"' },
  { id: 'd-300', label: 'Depth', nominal: '0.300"' },
  { id: 'd-500', label: 'Depth', nominal: '0.500"' },
  { id: 'd-1000', label: 'Depth', nominal: '1.000"' },
  { id: 'd-rods', label: 'Rods over 1.000" at nominal length', kind: 'passfail' },
  { id: 'd-visual', label: 'Clean / visual condition', kind: 'visual' },
])

/** Pitch micrometers — SOP 2010. */
const PITCH_MIC_POINTS = pts([
  { id: 'p-visual', label: 'Anvils — chips, dents, wear', kind: 'visual' },
  { id: 'p-100', label: 'Reading', nominal: '0.100"' },
  { id: 'p-200', label: 'Reading', nominal: '0.200"' },
  { id: 'p-300', label: 'Reading', nominal: '0.300"' },
  { id: 'p-500', label: 'Reading', nominal: '0.500"' },
  { id: 'p-1000', label: 'Reading', nominal: '1.000"' },
])

/** 0–1" micrometers — SOP 2010. */
const MIC_0_1_POINTS = pts([
  { id: 'm-100', label: 'Reading', nominal: '0.100"' },
  { id: 'm-200', label: 'Reading', nominal: '0.200"' },
  { id: 'm-300', label: 'Reading', nominal: '0.300"' },
  { id: 'm-500', label: 'Reading', nominal: '0.500"' },
  { id: 'm-1000', label: 'Reading', nominal: '1.000"' },
  { id: 'm-flat', label: 'Anvil flatness', kind: 'passfail' },
  { id: 'm-parallel', label: 'Anvil parallelism', kind: 'passfail' },
  { id: 'm-visual', label: 'Clean / visual condition', kind: 'visual' },
])

/** Micrometers 1" and larger — SOP 2010. */
const MIC_LARGE_POINTS = pts([
  { id: 'ml-min', label: 'Minimum measurement', kind: 'measurement' },
  { id: 'ml-max', label: 'Maximum measurement', kind: 'measurement' },
  { id: 'ml-par1', label: 'Parallelism place 1 (nominal length)', kind: 'passfail' },
  { id: 'ml-par2', label: 'Parallelism place 2', kind: 'passfail' },
  { id: 'ml-par3', label: 'Parallelism place 3', kind: 'passfail' },
  { id: 'ml-par4', label: 'Parallelism place 4', kind: 'passfail' },
  { id: 'ml-visual', label: 'Clean / visual condition', kind: 'visual' },
])

/** Inside micrometers — SOP 2010. */
const INSIDE_MIC_POINTS = pts([
  { id: 'i-min', label: 'Minimum head measurement', kind: 'measurement' },
  { id: 'i-max', label: 'Maximum head measurement', kind: 'measurement' },
  { id: 'i-rods', label: 'Rods above minimum — nominal length', kind: 'passfail' },
  { id: 'i-visual', label: 'Clean / visual condition', kind: 'visual' },
])

/** Thread gages — SOP 2010. */
const THREAD_GAGE_POINTS = pts([
  { id: 't-clean', label: 'Cleaned', kind: 'visual' },
  { id: 't-visual', label: 'Visual check for damage', kind: 'visual' },
])

/** Dial indicators / general shop tools without a dedicated SOP section. */
const GENERIC_POINTS = pts([
  { id: 'g-visual', label: 'Clean / visual condition', kind: 'visual' },
  { id: 'g-zero', label: 'Zero / reference check', kind: 'passfail' },
  { id: 'g-span', label: 'Working range check', kind: 'passfail' },
  { id: 'g-notes', label: 'Additional checks per manufacturer / standard', kind: 'passfail' },
])

function haystack(tool: ToolCalibration): string {
  return `${tool.category ?? ''} ${tool.tool_type ?? ''} ${tool.model ?? ''}`.toLowerCase()
}

/** Resolve SOP 2010 check-point template for a tool. */
export function resolveSopCheckPoints(tool: ToolCalibration): {
  templateId: string
  title: string
  points: SopCheckPoint[]
} {
  const hay = haystack(tool)

  if (/thread\s*ga(?:u)?ge|go\s*\/?\s*no[\s-]?go/.test(hay)) {
    return { templateId: 'thread-gage', title: 'Thread gages (SOP 2010)', points: THREAD_GAGE_POINTS }
  }
  if (/depth\s*ga(?:u)?ge|depth\s*mic|micrometer\s*depth/.test(hay)) {
    return { templateId: 'depth-gage', title: 'Depth gages (SOP 2010)', points: DEPTH_GAGE_POINTS }
  }
  if (/pitch\s*mic/.test(hay)) {
    return { templateId: 'pitch-mic', title: 'Pitch micrometers (SOP 2010)', points: PITCH_MIC_POINTS }
  }
  if (/inside\s*mic|i\.?\s*d\.?\s*mic/.test(hay)) {
    return { templateId: 'inside-mic', title: 'Inside micrometers (SOP 2010)', points: INSIDE_MIC_POINTS }
  }
  if (/vernier/.test(hay)) {
    return { templateId: 'vernier-caliper', title: 'Vernier calipers (SOP 2010)', points: VERNIER_CALIPER_POINTS }
  }
  if (/caliper/.test(hay) || (tool.category ?? '').trim().toLowerCase() === 'calipers') {
    return {
      templateId: 'digital-caliper',
      title: 'Dial / digital calipers (SOP 2010)',
      points: DIGITAL_CALIPER_POINTS,
    }
  }
  if (/micrometer|\bmic\b/.test(hay) || (tool.category ?? '').trim().toLowerCase() === 'micrometer') {
    // Prefer 0–1" template when range is indicated; otherwise large-mic template.
    if (/\b0\s*[-–to]+\s*1\b|0-1"|0–1"/.test(hay) || /0-1\s*mic/.test(hay)) {
      return { templateId: 'mic-0-1', title: 'Micrometers 0–1" (SOP 2010)', points: MIC_0_1_POINTS }
    }
    if (/\b[2-9]\s*[-–]|1\s*[-–]\s*[2-9]|[2-9]"|12"|6"/.test(hay)) {
      return { templateId: 'mic-large', title: 'Micrometers 1" and larger (SOP 2010)', points: MIC_LARGE_POINTS }
    }
    return { templateId: 'mic-0-1', title: 'Micrometers 0–1" (SOP 2010)', points: MIC_0_1_POINTS }
  }

  return {
    templateId: 'generic',
    title: 'General MTE checks (SOP 2010)',
    points: GENERIC_POINTS,
  }
}

export function blankMeasurementsFromPoints(points: SopCheckPoint[]): ToolCalibrationMeasurement[] {
  return points.map((point) => ({
    pointId: point.id,
    label: point.label,
    nominal: point.nominal,
    kind: point.kind,
    asFound: '',
    asLeft: '',
    passed: false,
  }))
}

export function addYearsIso(dateIso: string, years = 1): string {
  return addMonthsIso(dateIso, years * 12)
}

export function addMonthsIso(dateIso: string, months: number): string {
  const d = new Date(`${dateIso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateIso
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // Clamp end-of-month overflow (e.g. Jan 31 + 1 month)
  if (d.getDate() < day) d.setDate(0)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dayStr = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dayStr}`
}

export type CalibrationFrequency = '3-month' | '6-month' | 'annually'

export const CALIBRATION_FREQUENCY_OPTIONS: readonly {
  value: CalibrationFrequency
  label: string
  months: number
}[] = [
  { value: '3-month', label: '3 Month', months: 3 },
  { value: '6-month', label: '6 Month', months: 6 },
  { value: 'annually', label: 'Annually', months: 12 },
] as const

export function nextDueFromFrequency(
  calibratedAt: string,
  frequency: CalibrationFrequency,
): string {
  const option = CALIBRATION_FREQUENCY_OPTIONS.find((o) => o.value === frequency)
  return addMonthsIso(calibratedAt, option?.months ?? 12)
}

export function todayIsoDate(today = new Date()): string {
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
