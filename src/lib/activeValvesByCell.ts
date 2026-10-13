import { displayJobStatus } from './jobDisplayStatus'
import type { Valve } from '../types'

export type ActiveByCellGroup = 'shop-area' | 'finish-cell'

/** Assembly-phase jobs still belong on a finish-cell slice. */
const FINISH_CELL_STATUSES = new Set(['Assembly', 'PRV Assembly', 'Fitting', 'Waiting on Parts'])

const SHOP_AREA_BY_STATUS: Record<string, string> = {
  'Machine 1': 'Machine 1',
  'Machine 2': 'Machine 2',
  'Water Jet': 'Water Jet',
  Grinding: 'Grinding',
  Welding: 'Welding',
  Actuation: 'Actuation',
  Adaption: 'Actuation',
  Testing: 'Testing',
  Painting: 'Painting',
  'Warehouse RTS': 'Warehouse',
  Shipping: 'Warehouse',
}

/** Preferred pie order for shop-area view (remaining finish cells / statuses follow by count). */
export const SHOP_AREA_SLICE_ORDER = [
  'Teardown',
  'PRV Teardown',
  'Machine 1',
  'Machine 2',
  'Water Jet',
  'Grinding',
  'Welding',
  'Actuation',
  'Testing',
  'Painting',
  'Warehouse',
] as const

function finishCellLabel(valve: Pick<Valve, 'cell'>): string {
  return String(valve.cell ?? '').trim() || 'Unassigned'
}

/** Slice label for the Active valves pie: finish cell, or current shop area. */
export function activeValveGroupLabel(
  valve: Pick<Valve, 'status' | 'cell' | 'order_type'>,
  group: ActiveByCellGroup,
): string {
  if (group === 'finish-cell') return finishCellLabel(valve)
  const status = displayJobStatus(valve as Valve)
  const shopArea = SHOP_AREA_BY_STATUS[status]
  if (shopArea) return shopArea
  if (FINISH_CELL_STATUSES.has(status)) return finishCellLabel(valve)
  return status.trim() || 'Unassigned'
}

export function compareActiveByCellSlices(a: string, b: string): number {
  const order = SHOP_AREA_SLICE_ORDER as readonly string[]
  const ai = order.indexOf(a)
  const bi = order.indexOf(b)
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1
    if (bi === -1) return -1
    if (ai !== bi) return ai - bi
  }
  return a.localeCompare(b)
}
