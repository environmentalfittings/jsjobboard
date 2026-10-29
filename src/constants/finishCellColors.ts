/**
 * Finish cell colors from Valve Status spreadsheet → References (2) legend.
 * Source: “Valve Status 2026 new 5.26.26.xlsx”
 */
export type FinishCellTone = {
  background: string
  color: string
}

const FINISH_CELL_TONES: Record<string, FinishCellTone> = {
  Actuation: { background: '#FF66CC', color: '#1f2937' },
  'Ball Valve': { background: '#FBE3D6', color: '#1f2937' },
  'Durco/Twinseal': { background: '#73A0B4', color: '#1f2937' },
  'Field Service': { background: '#FB9205', color: '#1f2937' },
  'G/G/C': { background: '#95CA82', color: '#1f2937' },
  Pipeline: { background: '#FF0000', color: '#ffffff' },
  PRV: { background: '#7A5230', color: '#ffffff' },
  'Test Only': { background: '#FFFF00', color: '#1f2937' },
  Outsourced: { background: '#7030A0', color: '#ffffff' },
  // Spreadsheet lists these without a fill — keep a light neutral chip.
  'Machine Shop': { background: '#E8E8E8', color: '#1f2937' },
  Welding: { background: '#D0D0D0', color: '#1f2937' },
  'Machining only': { background: '#E8E8E8', color: '#1f2937' },
  RV: { background: '#F59E0B', color: '#1f2937' },
  CV: { background: '#38BDF8', color: '#1f2937' },
  UL: { background: '#A78BFA', color: '#1f2937' },
}

const ALIASES: Record<string, string> = {
  outsorced: 'Outsourced',
  'durco / twinseal': 'Durco/Twinseal',
  'durco-twinseal': 'Durco/Twinseal',
  ggc: 'G/G/C',
  'g/g/c': 'G/G/C',
  'test only': 'Test Only',
  'machine shop': 'Machine Shop',
  'machining only': 'Machining only',
  'ball valve': 'Ball Valve',
  'field service': 'Field Service',
  actuation: 'Actuation',
  pipeline: 'Pipeline',
  prv: 'PRV',
  welding: 'Welding',
  outsourced: 'Outsourced',
  rv: 'RV',
  cv: 'CV',
  ul: 'UL',
}

export function normalizeFinishCellKey(cell: string | null | undefined): string | null {
  const raw = String(cell ?? '').trim()
  if (!raw) return null
  const alias = ALIASES[raw.toLowerCase()]
  if (alias) return alias
  if (FINISH_CELL_TONES[raw]) return raw
  // Case-insensitive match against known keys
  const lower = raw.toLowerCase()
  for (const key of Object.keys(FINISH_CELL_TONES)) {
    if (key.toLowerCase() === lower) return key
  }
  return raw
}

export function finishCellTone(cell: string | null | undefined): FinishCellTone | null {
  const key = normalizeFinishCellKey(cell)
  if (!key) return null
  return FINISH_CELL_TONES[key] ?? null
}

/**
 * Map ITP / job valve type → finish cell key used for spreadsheet legend colors.
 * Valve type (e.g. Twinseal) and finish cell (e.g. Durco/Twinseal) are related but not identical labels.
 */
const VALVE_TYPE_TO_FINISH_CELL: Record<string, string> = {
  twinseal: 'Durco/Twinseal',
  durco: 'Durco/Twinseal',
  'durco/twinseal': 'Durco/Twinseal',
  'ball valve': 'Ball Valve',
  ball: 'Ball Valve',
  gate: 'G/G/C',
  globe: 'G/G/C',
  check: 'G/G/C',
  'knife gate': 'G/G/C',
  'angle globe': 'G/G/C',
  'pressure seal gate': 'G/G/C',
  'pressure seal globe': 'G/G/C',
  'ball check': 'G/G/C',
  'duo check': 'G/G/C',
  'piston check': 'G/G/C',
  'pipeline gate- slab': 'Pipeline',
  'pipeline gate- expanding': 'Pipeline',
  'relief valve': 'PRV',
  'safety valve': 'PRV',
  actuator: 'Actuation',
  butterfly: 'G/G/C',
  'lubricated plug': 'G/G/C',
  'non lubricated plug': 'G/G/C',
}

export function finishCellForValveType(valveType: string | null | undefined): string | null {
  const raw = String(valveType ?? '').trim()
  if (!raw) return null
  const mapped = VALVE_TYPE_TO_FINISH_CELL[raw.toLowerCase()]
  if (mapped) return mapped
  // Already a finish-cell label, or fuzzy match via normalizer.
  const asCell = normalizeFinishCellKey(raw)
  if (asCell && FINISH_CELL_TONES[asCell]) return asCell
  return null
}

export function finishCellToneForValveType(valveType: string | null | undefined): FinishCellTone | null {
  return finishCellTone(finishCellForValveType(valveType))
}
