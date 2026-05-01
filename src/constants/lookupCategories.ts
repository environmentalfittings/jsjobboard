import {
  BODY_MATERIALS,
  FINISH_CELLS,
  ORDER_TYPES,
  PRESSURE_CLASSES,
  TEST_TYPES,
  VALVE_SIZES,
  VALVE_TYPES,
} from './jobLookups'
import { JOB_SUB_STATUSES } from './jobSubStatuses'

export type LookupCategory = 'test_type' | 'valve_size' | 'valve_type' | 'finish_cell' | 'order_type' | 'job_sub_status' | 'pressure_class' | 'body_material'

export const LOOKUP_CATEGORY_DEFS: readonly {
  key: LookupCategory
  label: string
  fallback: readonly string[]
}[] = [
  { key: 'test_type', label: 'Test type', fallback: TEST_TYPES },
  { key: 'valve_size', label: 'Size', fallback: VALVE_SIZES },
  { key: 'valve_type', label: 'Valve type', fallback: VALVE_TYPES },
  { key: 'pressure_class', label: 'Pressure class', fallback: PRESSURE_CLASSES },
  { key: 'body_material', label: 'Body material', fallback: BODY_MATERIALS },
  { key: 'finish_cell', label: 'Finish cell', fallback: FINISH_CELLS },
  { key: 'order_type', label: 'Order type', fallback: ORDER_TYPES },
  { key: 'job_sub_status', label: 'Job sub-status', fallback: JOB_SUB_STATUSES },
]
