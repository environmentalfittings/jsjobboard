import * as XLSX from 'xlsx'

export type FlangeThicknessReferenceRow = {
  id: number
  nps: string
  pressure_class: string
  min_thickness: number
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export type FlangeThicknessReferenceUpsert = {
  nps: string
  pressure_class: string
  min_thickness: number
  notes?: string | null
  source?: string | null
}

export function normalizeNps(input: string | null | undefined): string {
  const s = (input ?? '').trim().toLowerCase()
  if (!s) return ''
  return s
    .replace(/\binch(?:es)?\b/g, '')
    .replace(/\bin\b/g, '')
    .replace(/["']/g, '')
    .replace(/[^\d./-]+/g, '')
    .trim()
}

export function normalizePressureClass(input: string | null | undefined): string {
  const s = (input ?? '').trim().toLowerCase()
  if (!s) return ''
  const digits = s.match(/\d+/g)?.join('') ?? ''
  return digits || s.replace(/[^\w.-]+/g, '')
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const s = String(value ?? '')
  const m = s.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number.parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function parseRowFormat(rows: unknown[][]): FlangeThicknessReferenceUpsert[] {
  if (!rows.length) return []
  const head = rows[0].map((v) => toText(v).toLowerCase())
  const npsIdx = head.findIndex((h) => /(nps|size|nominal.*pipe.*size)/i.test(h))
  const classIdx = head.findIndex((h) => /(class|pressure)/i.test(h))
  const minIdx = head.findIndex((h) => /(min.*thick|thick.*min|minimum)/i.test(h))
  if (npsIdx < 0 || classIdx < 0 || minIdx < 0) return []

  const out: FlangeThicknessReferenceUpsert[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]
    const nps = normalizeNps(toText(r[npsIdx]))
    const pressureClass = normalizePressureClass(toText(r[classIdx]))
    const min = toNumber(r[minIdx])
    if (!nps || !pressureClass || min == null) continue
    out.push({
      nps,
      pressure_class: pressureClass,
      min_thickness: min,
      notes: null,
      source: 'ASME B16.5 upload',
    })
  }
  return out
}

function parseRawDataFormat(rows: unknown[][]): FlangeThicknessReferenceUpsert[] {
  if (!rows.length) return []
  const head = rows[0].map((v) => toText(v).toLowerCase())
  const classIdx = head.findIndex((h) => /^class$/.test(h) || /(pressure.*class|class)/i.test(h))
  const npsIdx = head.findIndex((h) => /^nps$/.test(h))
  const labelIdx = head.findIndex((h) => /nps.*label/.test(h))
  const minIdx = head.findIndex((h) => /(min.*thick.*in|min.*flange.*thickness.*in)/i.test(h))
  if (classIdx < 0 || minIdx < 0 || (npsIdx < 0 && labelIdx < 0)) return []

  const out: FlangeThicknessReferenceUpsert[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]
    const labelValue = labelIdx >= 0 ? toText(r[labelIdx]) : ''
    const npsValue = npsIdx >= 0 ? toText(r[npsIdx]) : ''
    const nps = normalizeNps(labelValue || npsValue)
    const pressureClass = normalizePressureClass(toText(r[classIdx]))
    const min = toNumber(r[minIdx])
    if (!nps || !pressureClass || min == null) continue
    out.push({
      nps,
      pressure_class: pressureClass,
      min_thickness: min,
      notes: null,
      source: 'ASME B16.5 upload',
    })
  }
  return out
}

function parseMatrixFormat(rows: unknown[][]): FlangeThicknessReferenceUpsert[] {
  if (!rows.length) return []
  const header = rows[0].map((v) => toText(v))
  if (header.length < 3) return []

  const classCols: Array<{ idx: number; cls: string }> = []
  for (let i = 1; i < header.length; i += 1) {
    const cls = normalizePressureClass(header[i])
    if (cls) classCols.push({ idx: i, cls })
  }
  if (!classCols.length) return []

  const out: FlangeThicknessReferenceUpsert[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i]
    const nps = normalizeNps(toText(r[0]))
    if (!nps) continue
    for (const c of classCols) {
      const min = toNumber(r[c.idx])
      if (min == null) continue
      out.push({
        nps,
        pressure_class: c.cls,
        min_thickness: min,
        notes: null,
        source: 'ASME B16.5 upload',
      })
    }
  }
  return out
}

export async function parseFlangeThicknessWorkbook(file: File): Promise<FlangeThicknessReferenceUpsert[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const parsed: FlangeThicknessReferenceUpsert[] = []

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      raw: true,
    })
    const compactRows = rows.filter((row) => row.some((c) => toText(c) !== ''))
    if (!compactRows.length) continue
    parsed.push(...parseRawDataFormat(compactRows))
    parsed.push(...parseRowFormat(compactRows))
    parsed.push(...parseMatrixFormat(compactRows))
  }
  return dedupeRefs(parsed)
}

export function dedupeRefs(rows: FlangeThicknessReferenceUpsert[]): FlangeThicknessReferenceUpsert[] {
  const map = new Map<string, FlangeThicknessReferenceUpsert>()
  for (const r of rows) {
    const key = `${r.nps}|${r.pressure_class}`
    map.set(key, r)
  }
  return [...map.values()].sort((a, b) => {
    const n = a.nps.localeCompare(b.nps, undefined, { numeric: true, sensitivity: 'base' })
    if (n !== 0) return n
    return a.pressure_class.localeCompare(b.pressure_class, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function parseMeasurementNumber(input: string | null | undefined): number | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null

  // Keep numeric tokens and separators only (units like "in" are ignored).
  let normalized = raw.replace(/[^\d.,+-]/g, '')
  if (!normalized) return null

  // Interpret leading ".66" or ",66" as 0.66.
  normalized = normalized.replace(/^([+-]?)\./, '$10.')
  normalized = normalized.replace(/^([+-]?)[,]/, '$10.')

  const hasDot = normalized.includes('.')
  const hasComma = normalized.includes(',')
  if (hasDot && hasComma) {
    // Use the last separator as decimal marker; treat the other as thousands separators.
    const lastDot = normalized.lastIndexOf('.')
    const lastComma = normalized.lastIndexOf(',')
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, '.')
  }

  const n = Number.parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}
