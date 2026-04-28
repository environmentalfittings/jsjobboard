/**
 * Default lists from the Excel “Lists” sheet — same data as
 * `supabase/seed-lookup-values.sql` and `supabase/seed-customers-from-spreadsheet.sql`.
 */
import type { LookupCategory } from './lookupCategories'
import { LOOKUP_CATEGORY_DEFS } from './lookupCategories'
import {
  FINISH_CELLS,
  ORDER_TYPES,
  TEST_TYPES,
  VALVE_SIZES,
  VALVE_TYPES,
} from './jobLookups'
import { JOB_SUB_STATUSES } from './jobSubStatuses'

const BY_CATEGORY: Record<LookupCategory, readonly string[]> = {
  test_type: TEST_TYPES,
  valve_size: VALVE_SIZES,
  valve_type: VALVE_TYPES,
  finish_cell: FINISH_CELLS,
  order_type: ORDER_TYPES,
  job_sub_status: JOB_SUB_STATUSES,
}

export function buildSeedLookupValueRows(): {
  category: LookupCategory
  value: string
  sort_order: number
}[] {
  const rows: { category: LookupCategory; value: string; sort_order: number }[] = []
  for (const def of LOOKUP_CATEGORY_DEFS) {
    const values = BY_CATEGORY[def.key]
    values.forEach((value, sort_order) => {
      rows.push({ category: def.key, value, sort_order })
    })
  }
  return rows
}

/** Customer names from the Excel Lists sheet (matches seed-customers-from-spreadsheet.sql). */
export const SPREADSHEET_CUSTOMER_NAMES: readonly string[] = [
  'ACME',
  'AEP Riverside',
  'AEP Southwest (Anadarko)',
  'AEP Southwest Station',
  'AEP/PSO Oologah',
  'AEP/PSO TPS',
  'AEP/SWEPCO - Flint Creek',
  'AG Equipment',
  'Allied Power Group (Jim Chamberlin)',
  'Caliber Valve & Controls',
  'Calpine - Fore River',
  'CELEROS',
  'CHS',
  'Circle B Measurement & Fab',
  'City of Coffeyville Power Plant',
  'City of Nowata',
  'Coffeyville Resources',
  'Coffeyville Resources - Pipeline',
  'Crane Valves',
  'Cross K Construction',
  'CVR Nitrogen Plant',
  'Edgen Murray',
  'Ehtos Energy',
  'Enbridge Energy',
  'Energy Transfer',
  'En-Pro',
  'Enterprise Pipeline',
  'Explorer Pipeline',
  'EXXON Refinery',
  'FCX Performrance',
]
