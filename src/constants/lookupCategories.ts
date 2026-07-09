import {
  BODY_MATERIALS,
  CHART_RECORDERS,
  FINISH_CELLS,
  ORDER_TYPES,
  PRESSURE_CLASSES,
  TEST_MEDIA,
  TEST_PROCEDURE_REQUIREMENTS,
  TEST_TYPES,
  VALVE_SIZES,
  VALVE_TYPES,
} from './jobLookups'

export type LookupCategory =
  | 'test_type'
  | 'test_media'
  | 'test_procedure'
  | 'chart_recorder'
  | 'valve_size'
  | 'valve_type'
  | 'finish_cell'
  | 'order_type'
  | 'pressure_class'
  | 'body_material'
  | 'manufacturer'

export const LOOKUP_CATEGORY_DEFS: readonly {
  key: LookupCategory
  label: string
  fallback: readonly string[]
}[] = [
  { key: 'test_type', label: 'Test type', fallback: TEST_TYPES },
  { key: 'test_media', label: 'Test media', fallback: TEST_MEDIA },
  { key: 'test_procedure', label: 'Test requirements', fallback: TEST_PROCEDURE_REQUIREMENTS },
  { key: 'chart_recorder', label: 'Chart recorders', fallback: CHART_RECORDERS },
  { key: 'valve_size', label: 'Size', fallback: VALVE_SIZES },
  { key: 'valve_type', label: 'Valve type', fallback: VALVE_TYPES },
  { key: 'pressure_class', label: 'Pressure class', fallback: PRESSURE_CLASSES },
  { key: 'body_material', label: 'Body material', fallback: BODY_MATERIALS },
  { key: 'finish_cell', label: 'Finish cell', fallback: FINISH_CELLS },
  { key: 'order_type', label: 'Order type', fallback: ORDER_TYPES },
  { key: 'manufacturer', label: 'Manufacturer', fallback: [] },
]
