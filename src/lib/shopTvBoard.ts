import { FINISH_CELLS } from '../constants/jobLookups'
import { displayJobStatus } from './jobDisplayStatus'
import type { Valve } from '../types'

export const TV_CELL_BUCKET_STATUSES = [
  'Assembly',
  'PRV Assembly',
  'Fitting',
  'Waiting on Parts',
] as const

const TV_CELL_BUCKET_STATUS_SET = new Set<string>(TV_CELL_BUCKET_STATUSES)

export type ShopTvColumnKind = 'fixed' | 'finish-cell' | 'other'

export type ShopTvColumnDef = {
  id: string
  label: string
  kind: ShopTvColumnKind
  /** Shop statuses that belong in this column (finish-cell columns share the cell-bucket statuses). */
  statuses: readonly string[]
  /** Finish cell for kind === 'finish-cell'. Empty string = unassigned cell. */
  finishCell?: string
}

const FIXED_TV_COLUMNS: readonly ShopTvColumnDef[] = [
  {
    id: 'pull-customer-yard',
    label: 'Pull from Customer Yard',
    kind: 'fixed',
    statuses: ['Pull from Customer Yard'],
  },
  { id: 'teardown', label: 'Teardown', kind: 'fixed', statuses: ['Teardown', 'PRV Teardown'] },
  { id: 'welding', label: 'Welding', kind: 'fixed', statuses: ['Welding'] },
  {
    id: 'machine-shop',
    label: 'Machine shop',
    kind: 'fixed',
    statuses: ['Machine 1', 'Machine 2', 'Water Jet', 'Grinding'],
  },
  { id: 'testing', label: 'Testing', kind: 'fixed', statuses: ['Testing'] },
  { id: 'painting', label: 'Painting', kind: 'fixed', statuses: ['Painting'] },
]

const FIXED_STATUS_SET = new Set(FIXED_TV_COLUMNS.flatMap((column) => [...column.statuses]))

function normalizeCell(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

function cellFromJson(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return ''
  return typeof row.cell === 'string' ? row.cell.trim() : ''
}

function statusFromJson(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return ''
  return typeof row.status === 'string' ? row.status.trim() : ''
}

export function valveMatchesTvColumn(valve: Valve, column: ShopTvColumnDef): boolean {
  const status = displayJobStatus(valve)
  if (column.kind === 'fixed') {
    return column.statuses.includes(status)
  }
  if (column.kind === 'finish-cell') {
    if (!TV_CELL_BUCKET_STATUS_SET.has(status)) return false
    const cell = normalizeCell(valve.cell)
    const wanted = column.finishCell ?? ''
    if (!wanted) return !cell
    return cell === wanted
  }
  // Other: active shop work not in fixed columns and not in the finish-cell bucket.
  if (FIXED_STATUS_SET.has(status)) return false
  if (TV_CELL_BUCKET_STATUS_SET.has(status)) return false
  return true
}

/**
 * Build TV columns: fixed areas, then finish-cell breakdown for Assembly / Fitting /
 * Waiting on Parts (only cells that currently have jobs, plus Unassigned when needed),
 * then Other for everything else.
 */
export function buildShopTvColumns(valves: Valve[]): ShopTvColumnDef[] {
  const cellCounts = new Map<string, number>()
  let unassigned = 0
  let otherCount = 0

  for (const valve of valves) {
    const status = displayJobStatus(valve)
    if (TV_CELL_BUCKET_STATUS_SET.has(status)) {
      const cell = normalizeCell(valve.cell)
      if (!cell) unassigned += 1
      else cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1)
      continue
    }
    if (!FIXED_STATUS_SET.has(status)) otherCount += 1
  }

  const finishCellColumns: ShopTvColumnDef[] = []
  for (const cell of FINISH_CELLS) {
    if ((cellCounts.get(cell) ?? 0) > 0) {
      finishCellColumns.push({
        id: `cell-${cell}`,
        label: cell,
        kind: 'finish-cell',
        statuses: TV_CELL_BUCKET_STATUSES,
        finishCell: cell,
      })
      cellCounts.delete(cell)
    }
  }
  // Any non-canonical cell values still in use.
  for (const [cell, count] of [...cellCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > 0) {
      finishCellColumns.push({
        id: `cell-${cell}`,
        label: cell,
        kind: 'finish-cell',
        statuses: TV_CELL_BUCKET_STATUSES,
        finishCell: cell,
      })
    }
  }
  if (unassigned > 0) {
    finishCellColumns.push({
      id: 'cell-unassigned',
      label: 'Unassigned cell',
      kind: 'finish-cell',
      statuses: TV_CELL_BUCKET_STATUSES,
      finishCell: '',
    })
  }

  const columns: ShopTvColumnDef[] = [...FIXED_TV_COLUMNS, ...finishCellColumns]
  if (otherCount > 0) {
    columns.push({
      id: 'other',
      label: 'Other',
      kind: 'other',
      statuses: [],
    })
  }
  return columns
}

export type ShopTvStatusMove = {
  valve_id: string
  fromStatus: string
  toStatus: string
  fromCell: string
  toCell: string
  changedAt: string
  changedBy: string
}

export type ShopTvCellMoveRow = {
  cell: string
  moveCount: number
}

function displayMoverName(emailOrName: string): string {
  const raw = emailOrName.trim()
  if (!raw) return 'Unknown'
  if (!raw.includes('@')) return raw
  const local = raw.split('@')[0] ?? raw
  return local
    .replace(/[._]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

/** Prefer the cell the job left; fall back to destination / Unassigned. */
function cellForMoveAttribution(fromCell: string, toCell: string): string {
  if (fromCell) return fromCell
  if (toCell) return toCell
  return 'Unassigned'
}

export function parseShopTvStatusMoves(
  rows: Array<{
    valve_row_id: string | null
    changed_at: string
    changed_by_email?: string | null
    old_row: Record<string, unknown> | null
    new_row: Record<string, unknown> | null
  }>,
): { moves: ShopTvStatusMove[]; cellLeaderboard: ShopTvCellMoveRow[] } {
  const moves: ShopTvStatusMove[] = []
  const counts = new Map<string, number>()

  for (const raw of rows) {
    const fromStatus = statusFromJson(raw.old_row)
    const toStatus = statusFromJson(raw.new_row)
    const fromCell = cellFromJson(raw.old_row)
    const toCell = cellFromJson(raw.new_row)
    if (!fromStatus && !toStatus) continue
    if (fromStatus === toStatus && fromCell === toCell) continue
    const wo =
      (raw.valve_row_id ?? '').trim() ||
      (typeof raw.new_row?.valve_id === 'string' ? raw.new_row.valve_id.trim() : '') ||
      (typeof raw.old_row?.valve_id === 'string' ? raw.old_row.valve_id.trim() : '')
    if (!wo) continue
    const changedBy = displayMoverName(String(raw.changed_by_email ?? '').trim() || 'Unknown')
    const cell = cellForMoveAttribution(fromCell, toCell)
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
    moves.push({
      valve_id: wo,
      fromStatus: fromStatus || '—',
      toStatus: toStatus || '—',
      fromCell,
      toCell,
      changedAt: raw.changed_at,
      changedBy,
    })
  }

  const cellLeaderboard = [...counts.entries()]
    .map(([cell, moveCount]) => ({ cell, moveCount }))
    .sort((a, b) => b.moveCount - a.moveCount || a.cell.localeCompare(b.cell))

  return { moves, cellLeaderboard }
}

function moveLeftFixedColumn(move: ShopTvStatusMove, column: ShopTvColumnDef): boolean {
  if (!column.statuses.includes(move.fromStatus)) return false
  return !column.statuses.includes(move.toStatus)
}

function moveLeftFinishCellColumn(move: ShopTvStatusMove, column: ShopTvColumnDef): boolean {
  if (!TV_CELL_BUCKET_STATUS_SET.has(move.fromStatus)) return false
  const wanted = column.finishCell ?? ''
  const fromCell = move.fromCell
  const matchedCell = wanted ? fromCell === wanted : !fromCell
  if (!matchedCell) return false

  const stillInBucket = TV_CELL_BUCKET_STATUS_SET.has(move.toStatus)
  if (!stillInBucket) return true
  const toCell = move.toCell
  const stillSameCell = wanted ? toCell === wanted : !toCell
  return !stillSameCell
}

function moveLeftOtherColumn(move: ShopTvStatusMove): boolean {
  const fromWasOther =
    Boolean(move.fromStatus) &&
    move.fromStatus !== '—' &&
    !FIXED_STATUS_SET.has(move.fromStatus) &&
    !TV_CELL_BUCKET_STATUS_SET.has(move.fromStatus)
  if (!fromWasOther) return false
  const toIsOther =
    Boolean(move.toStatus) &&
    move.toStatus !== '—' &&
    !FIXED_STATUS_SET.has(move.toStatus) &&
    !TV_CELL_BUCKET_STATUS_SET.has(move.toStatus)
  return !toIsOther
}

/** Count distinct jobs that left this TV column/area today. */
export function countMovedOutToday(column: ShopTvColumnDef, moves: readonly ShopTvStatusMove[]): number {
  const left = new Set<string>()
  for (const move of moves) {
    let exited = false
    if (column.kind === 'fixed') exited = moveLeftFixedColumn(move, column)
    else if (column.kind === 'finish-cell') exited = moveLeftFinishCellColumn(move, column)
    else exited = moveLeftOtherColumn(move)
    if (exited) left.add(move.valve_id)
  }
  return left.size
}
