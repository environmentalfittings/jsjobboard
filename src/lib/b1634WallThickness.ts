import * as XLSX from 'xlsx'
import { normalizeNps, normalizePressureClass } from './flangeThicknessRefs'
import { normalizeValveType, type B1610ValveType } from './b1610FaceToFace'

export type B1634WallThicknessReferenceRow = {
  id: number
  valve_type: B1610ValveType
  nps: string
  pressure_class: string
  min_wall_thickness: number
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export type B1634WallThicknessReferenceUpsert = {
  valve_type: B1610ValveType
  nps: string
  pressure_class: string
  min_wall_thickness: number
  notes?: string | null
  source?: string | null
}

export const B1634_DEFAULT_ROWS: B1634WallThicknessReferenceUpsert[] = []

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const m = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number.parseFloat(m[0])
  return Number.isFinite(n) ? n : null
}

export async function parseB1634Workbook(file: File): Promise<B1634WallThicknessReferenceUpsert[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const parsed: B1634WallThicknessReferenceUpsert[] = []

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
    const minIdx = head.findIndex((h) => /min.*wall|wall.*thick|min.*thick|minimum/.test(h))
    if (valveTypeIdx < 0 || sizeIdx < 0 || classIdx < 0 || minIdx < 0) continue

    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i]
      const valveType = normalizeValveType(toText(r[valveTypeIdx]))
      const nps = normalizeNps(toText(r[sizeIdx]))
      const pressureClass = normalizePressureClass(toText(r[classIdx]))
      const minWall = toNumber(r[minIdx])
      if (!valveType || !nps || !pressureClass || minWall == null || minWall <= 0) continue
      parsed.push({
        valve_type: valveType,
        nps,
        pressure_class: pressureClass,
        min_wall_thickness: minWall,
        notes: null,
        source: `Workbook import: ${file.name}`,
      })
    }
  }

  const deduped = new Map<string, B1634WallThicknessReferenceUpsert>()
  for (const row of parsed) {
    const key = `${row.valve_type}|${row.nps}|${row.pressure_class}`
    deduped.set(key, row)
  }
  return [...deduped.values()]
}

export function findB1634WallThicknessStandard(
  args: {
    valveType: string | null | undefined
    size: string | null | undefined
    pressureClass: string | null | undefined
  },
  refs?: ReadonlyArray<{
    valve_type: string
    nps: string
    pressure_class: string
    min_wall_thickness: number
  }>,
): { minimum: number } | null {
  const valveType = normalizeValveType(args.valveType)
  const nps = normalizeNps(args.size)
  const pressureClass = normalizePressureClass(args.pressureClass)
  if (!valveType || !nps || !pressureClass) return null

  const source = refs && refs.length > 0 ? refs : B1634_DEFAULT_ROWS
  const row = source.find(
    (r) =>
      normalizeValveType(r.valve_type) === valveType &&
      normalizeNps(r.nps) === nps &&
      normalizePressureClass(r.pressure_class) === pressureClass,
  )
  if (!row || !Number.isFinite(row.min_wall_thickness)) return null
  return { minimum: Number(row.min_wall_thickness) }
}
