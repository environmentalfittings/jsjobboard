import * as XLSX from 'xlsx'
import b1610FaceToFaceRows from '../data/b16_10_face_to_face.json'
import { normalizeNps, normalizePressureClass, parseMeasurementNumber } from './flangeThicknessRefs'

export type B1610ValveType = 'Gate' | 'Globe' | 'Check' | 'Plug'
export type B1610EndConnection = 'RF' | 'RTJ'

export type B1610FaceToFaceRow = {
  valveType: B1610ValveType
  size: string
  class: string
  endConnection?: B1610EndConnection | null
  faceToFace: number
  tolerance?: number
}

export type B1610FaceToFaceReferenceRow = {
  id: number
  valve_type: B1610ValveType
  nps: string
  pressure_class: string
  end_connection: B1610EndConnection | 'ANY'
  standard_dimension: number
  tolerance: number
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export type B1610FaceToFaceReferenceUpsert = {
  valve_type: B1610ValveType
  nps: string
  pressure_class: string
  end_connection?: B1610EndConnection | 'ANY'
  standard_dimension: number
  tolerance?: number
  notes?: string | null
  source?: string | null
}

const DEFAULT_TOLERANCE_IN = 0.0625

export function normalizeValveType(raw: string | null | undefined): B1610ValveType | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('gate')) return 'Gate'
  if (s.includes('globe')) return 'Globe'
  if (s.includes('check')) return 'Check'
  if (s.includes('plug')) return 'Plug'
  return null
}

export function normalizeEndConnection(raw: string | null | undefined): B1610EndConnection | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('rtj') || s.includes('ring joint')) return 'RTJ'
  if (s.includes('rf') || s.includes('raised face') || s.includes('flat face')) return 'RF'
  return null
}

function normalizeRow(row: B1610FaceToFaceRow): B1610FaceToFaceRow | null {
  const valveType = normalizeValveType(row.valveType)
  const size = normalizeNps(row.size)
  const pressureClass = normalizePressureClass(row.class)
  const standard = Number(row.faceToFace)
  const tolerance = Number.isFinite(row.tolerance ?? NaN) ? Number(row.tolerance) : undefined
  if (!valveType || !size || !pressureClass || !Number.isFinite(standard) || standard <= 0) return null
  return {
    valveType,
    size,
    class: pressureClass,
    endConnection: normalizeEndConnection(row.endConnection ?? undefined),
    faceToFace: standard,
    tolerance,
  }
}

export const B1610_DEFAULT_ROWS: B1610FaceToFaceReferenceUpsert[] = (b1610FaceToFaceRows as B1610FaceToFaceRow[])
  .map(normalizeRow)
  .filter((row): row is B1610FaceToFaceRow => row != null)
  .map((row) => ({
    valve_type: row.valveType,
    nps: row.size,
    pressure_class: row.class,
    end_connection: row.endConnection ?? 'ANY',
    standard_dimension: row.faceToFace,
    tolerance: row.tolerance ?? DEFAULT_TOLERANCE_IN,
    notes: null,
    source: 'Bundled B16.10 defaults',
  }))

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const m = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number.parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

export async function parseB1610Workbook(file: File): Promise<B1610FaceToFaceReferenceUpsert[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const parsed: B1610FaceToFaceReferenceUpsert[] = []

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      raw: true,
    })
    if (!rows.length) continue
    const head = rows[0].map((v) => toText(v).toLowerCase())
    const valveTypeIdx = head.findIndex((h) => /valve.*type|type/.test(h))
    const sizeIdx = head.findIndex((h) => /\bnps\b|size|nominal.*pipe.*size/.test(h))
    const classIdx = head.findIndex((h) => /pressure.*class|\bclass\b/.test(h))
    const endConnIdx = head.findIndex((h) => /end.*connection|facing|rf|rtj/.test(h))
    const standardIdx = head.findIndex((h) => /face.*to.*face|end.*to.*end|standard.*dimension/.test(h))
    const toleranceIdx = head.findIndex((h) => /tolerance/.test(h))
    if (valveTypeIdx < 0 || sizeIdx < 0 || classIdx < 0 || standardIdx < 0) continue

    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i]
      const valveType = normalizeValveType(toText(r[valveTypeIdx]))
      const nps = normalizeNps(toText(r[sizeIdx]))
      const pressureClass = normalizePressureClass(toText(r[classIdx]))
      const endConnection = endConnIdx >= 0 ? normalizeEndConnection(toText(r[endConnIdx])) : null
      const standard = toNumber(r[standardIdx])
      const tolerance = toleranceIdx >= 0 ? toNumber(r[toleranceIdx]) : null
      if (!valveType || !nps || !pressureClass || standard == null || standard <= 0) continue
      parsed.push({
        valve_type: valveType,
        nps,
        pressure_class: pressureClass,
        end_connection: endConnection ?? 'ANY',
        standard_dimension: standard,
        tolerance: tolerance != null && tolerance > 0 ? tolerance : DEFAULT_TOLERANCE_IN,
        notes: null,
        source: `Workbook import: ${file.name}`,
      })
    }
  }

  const deduped = new Map<string, B1610FaceToFaceReferenceUpsert>()
  for (const row of parsed) {
    const key = `${row.valve_type}|${row.nps}|${row.pressure_class}|${row.end_connection ?? 'ANY'}`
    deduped.set(key, row)
  }
  return [...deduped.values()]
}

export function findB1610FaceToFaceStandard(
  args: {
    valveType: string | null | undefined
    size: string | null | undefined
    pressureClass: string | null | undefined
    facingType?: string | null | undefined
  },
  refs?: ReadonlyArray<{
    valve_type: string
    nps: string
    pressure_class: string
    end_connection?: string | null
    standard_dimension: number
    tolerance?: number | null
  }>,
): { standard: number; tolerance: number } | null {
  const valveType = normalizeValveType(args.valveType)
  const size = normalizeNps(args.size)
  const pressureClass = normalizePressureClass(args.pressureClass)
  const endConnection = normalizeEndConnection(args.facingType)
  if (!valveType || !size || !pressureClass) return null

  const source =
    refs && refs.length > 0
      ? refs
      : B1610_DEFAULT_ROWS.map((r) => ({ ...r, tolerance: r.tolerance ?? DEFAULT_TOLERANCE_IN }))
  const candidates = source.filter(
    (r) =>
      normalizeValveType(r.valve_type) === valveType &&
      normalizeNps(r.nps) === size &&
      normalizePressureClass(r.pressure_class) === pressureClass,
  )
  if (!candidates.length) return null
  const row =
    (endConnection
      ? candidates.find((r) => normalizeEndConnection(r.end_connection ?? undefined) === endConnection)
      : null) ?? candidates.find((r) => !normalizeEndConnection(r.end_connection ?? undefined)) ?? candidates[0]

  if (!row || !Number.isFinite(row.standard_dimension)) return null
  return {
    standard: Number(row.standard_dimension),
    tolerance:
      row.tolerance != null && Number.isFinite(row.tolerance) && row.tolerance > 0
        ? Number(row.tolerance)
        : DEFAULT_TOLERANCE_IN,
  }
}

export function b1610DeviationText(asFound: string, standard: number): string {
  const n = parseMeasurementNumber(asFound)
  if (n == null) return ''
  const delta = n - standard
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`
}
