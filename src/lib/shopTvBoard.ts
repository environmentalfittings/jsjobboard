import { VSI_DEPARTMENTS, type CompanyWorkflowKey } from '../constants/companyWorkflows'
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

export type ShopTvColumnKind = 'fixed' | 'finish-cell' | 'other' | 'department'

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

const VSI_DEPARTMENT_SET = new Set<string>(VSI_DEPARTMENTS)

function normalizeCell(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

/** Map a job's cell onto RV / CV / UL when it matches a VSI department. */
export function normalizeVsiDepartment(value: string | null | undefined): string {
  const raw = normalizeCell(value)
  if (!raw) return ''
  const upper = raw.toUpperCase()
  if (upper === 'RV' || /^relief(\s+valve)?s?$/i.test(raw)) return 'RV'
  if (upper === 'CV' || /^control(\s+valve)?s?$/i.test(raw)) return 'CV'
  if (upper === 'UL' || /^unload(ing)?$/i.test(raw)) return 'UL'
  for (const dept of VSI_DEPARTMENTS) {
    if (dept.toLowerCase() === raw.toLowerCase()) return dept
  }
  return raw
}

function isKnownVsiDepartment(value: string | null | undefined): boolean {
  return VSI_DEPARTMENT_SET.has(normalizeVsiDepartment(value))
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
  if (column.kind === 'department') {
    const dept = normalizeVsiDepartment(valve.cell)
    const wanted = column.finishCell ?? ''
    if (!wanted) return !isKnownVsiDepartment(dept)
    return dept === wanted
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

function buildVsiTvColumns(valves: Valve[]): ShopTvColumnDef[] {
  let unassigned = 0
  for (const valve of valves) {
    if (!isKnownVsiDepartment(valve.cell)) unassigned += 1
  }
  const columns: ShopTvColumnDef[] = VSI_DEPARTMENTS.map((dept) => ({
    id: `dept-${dept}`,
    label: dept,
    kind: 'department',
    statuses: [],
    finishCell: dept,
  }))
  if (unassigned > 0) {
    columns.push({
      id: 'dept-unassigned',
      label: 'Unassigned department',
      kind: 'department',
      statuses: [],
      finishCell: '',
    })
  }
  return columns
}

/**
 * Build TV columns: JS uses shop areas + finish cells. VSI uses departments RV / CV / UL.
 */
export function buildShopTvColumns(
  valves: Valve[],
  options?: { workflowKey?: CompanyWorkflowKey },
): ShopTvColumnDef[] {
  if (options?.workflowKey === 'vsi') return buildVsiTvColumns(valves)

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

export type ShopTvDeptMoveKind = 'department' | 'finish-cell'

export type ShopTvDeptMoveRow = {
  id: string
  label: string
  kind: ShopTvDeptMoveKind
  /** Present when kind === 'finish-cell' or VSI department (for badge colors). */
  cell?: string
  moveCount: number
}

export const VSI_TV_CHART_BASE: readonly Omit<ShopTvDeptMoveRow, 'moveCount'>[] = VSI_DEPARTMENTS.map(
  (dept) => ({
    id: `dept-${dept}`,
    label: dept,
    kind: 'department' as const,
    cell: dept,
  }),
)

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

const DEPT_TEARDOWN_STATUSES = new Set(['Pull from Customer Yard', 'Teardown'])
const DEPT_WELDING_STATUSES = new Set(['Welding'])
const DEPT_MACHINE_SHOP_STATUSES = new Set(['Machine 1', 'Machine 2', 'Water Jet', 'Grinding'])
const DEPT_TESTING_STATUSES = new Set(['Testing'])
const DEPT_PAINTING_STATUSES = new Set(['Painting'])

function isPrvStatus(status: string): boolean {
  return /\bprv\b/i.test(status)
}

/**
 * Map a move to a competitive bucket:
 * Teardown (Pull from Customer Yard + Teardown), Welding, Machine shop (Machine 1/2),
 * Testing, Painting, PRV (PRV Assembly + any PRV status). Everything else → finish cell.
 */
function vsiDepartmentBucketForMove(
  fromCell: string,
  toCell: string,
): Omit<ShopTvDeptMoveRow, 'moveCount'> {
  const dept = normalizeVsiDepartment(fromCell) || normalizeVsiDepartment(toCell)
  if (isKnownVsiDepartment(dept)) {
    return { id: `dept-${dept}`, label: dept, kind: 'department', cell: dept }
  }
  return { id: 'dept-unassigned', label: 'Unassigned', kind: 'department', cell: '' }
}

export function departmentBucketForMove(
  status: string,
  fromCell: string,
  toCell: string,
  workflowKey: CompanyWorkflowKey = 'js-valve',
): Omit<ShopTvDeptMoveRow, 'moveCount'> {
  if (workflowKey === 'vsi') return vsiDepartmentBucketForMove(fromCell, toCell)

  const trimmed = status.trim()
  if (isPrvStatus(trimmed)) {
    return { id: 'dept-prv', label: 'PRV', kind: 'department' }
  }
  if (DEPT_TEARDOWN_STATUSES.has(trimmed)) {
    return { id: 'dept-teardown', label: 'Teardown', kind: 'department' }
  }
  if (DEPT_WELDING_STATUSES.has(trimmed)) {
    return { id: 'dept-welding', label: 'Welding', kind: 'department' }
  }
  if (DEPT_MACHINE_SHOP_STATUSES.has(trimmed)) {
    return { id: 'dept-machine-shop', label: 'Machine shop', kind: 'department' }
  }
  if (DEPT_TESTING_STATUSES.has(trimmed)) {
    return { id: 'dept-testing', label: 'Testing', kind: 'department' }
  }
  if (DEPT_PAINTING_STATUSES.has(trimmed)) {
    return { id: 'dept-painting', label: 'Painting', kind: 'department' }
  }
  const cell = cellForMoveAttribution(fromCell, toCell)
  return {
    id: `cell-${cell}`,
    label: cell,
    kind: 'finish-cell',
    cell,
  }
}

export function parseShopTvStatusMoves(
  rows: Array<{
    valve_row_id: string | null
    changed_at: string
    changed_by_email?: string | null
    old_row: Record<string, unknown> | null
    new_row: Record<string, unknown> | null
  }>,
  options?: { workflowKey?: CompanyWorkflowKey },
): { moves: ShopTvStatusMove[]; deptLeaderboard: ShopTvDeptMoveRow[] } {
  const moves: ShopTvStatusMove[] = []
  const counts = new Map<string, { meta: Omit<ShopTvDeptMoveRow, 'moveCount'>; moveCount: number }>()

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
    // Attribute the move to the department/status the job left (from), else destination.
    const statusForBucket = fromStatus || toStatus
    const bucket = departmentBucketForMove(
      statusForBucket,
      fromCell,
      toCell,
      options?.workflowKey ?? 'js-valve',
    )
    const existing = counts.get(bucket.id)
    if (existing) existing.moveCount += 1
    else counts.set(bucket.id, { meta: bucket, moveCount: 1 })
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

  const deptLeaderboard = [...counts.values()]
    .map(({ meta, moveCount }) => ({ ...meta, moveCount }))
    .sort((a, b) => b.moveCount - a.moveCount || a.label.localeCompare(b.label))

  return { moves, deptLeaderboard }
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

function moveLeftDepartmentColumn(move: ShopTvStatusMove, column: ShopTvColumnDef): boolean {
  const wanted = column.finishCell ?? ''
  const fromDept = normalizeVsiDepartment(move.fromCell)
  const toDept = normalizeVsiDepartment(move.toCell)
  if (wanted) {
    if (fromDept !== wanted) return false
    return toDept !== wanted
  }
  const fromUnassigned = !isKnownVsiDepartment(fromDept)
  const toUnassigned = !isKnownVsiDepartment(toDept)
  return fromUnassigned && !toUnassigned
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
    else if (column.kind === 'department') exited = moveLeftDepartmentColumn(move, column)
    else exited = moveLeftOtherColumn(move)
    if (exited) left.add(move.valve_id)
  }
  return left.size
}
