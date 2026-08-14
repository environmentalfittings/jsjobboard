/** Lookup lists aligned with the Excel “Lists” sheet (dropdown sources). */

export const TEST_TYPES = [
  'AIR',
  'AIR / Helium',
  'Helium Mineral Oil',
  'Helium Only',
  'Mineral Oil',
  'Water',
  'Water w/ 4 Hour',
  'Water w/Air',
  'Water/Helium',
  'PRV Steam',
  'PRV Air',
  'PRV Pretest',
  'PRV Water',
] as const

/** Test log per-test media dropdown (editable under Admin → Manage lists). */
export const TEST_MEDIA = ['Air', 'Water', 'Methane', 'Helium', 'Mineral Oil', 'Diesel'] as const

/** Test requirement / procedure options (editable under Admin → Manage lists). */
export const TEST_PROCEDURE_REQUIREMENTS = [
  'API 598 Test',
  'API 6D Test',
  'MSS SP 160 Test',
  'ASME B16.34',
  '4-Hour Chart Test',
  'Helium Test',
] as const

export const VALVE_SIZES = [
  '0.5',
  '0.75',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '4',
  '5',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
  '18',
  '20',
  '22',
  '24',
  '26',
  '28',
  '30',
  '36',
  '42',
  '48',
] as const

export const VALVE_TYPES = [
  '4 WAY Diverter Valve',
  'Angle Globe',
  'Actuator',
  'ARC',
  'BALL CHECK',
  'Ball Valve',
  'BUTTERFLY',
  'Check',
  'CONTROLVALVE',
  'Delayed Coker Switch',
  'Delayed Coker Ball',
  'DUO CHECK',
  'Everlast',
  'Gate',
  'Globe',
  'Knife Gate',
  'Lubricated Plug',
  'Manufacture/Machine/Weld',
  'Mixer',
  'MUD VALVE',
  'Non Lubricated Plug',
  'ORBIT',
  'PINCH',
  'Pipeline Gate- Slab',
  'Pipeline Gate- Expanding',
  'Piston Check',
  'Pressure Seal Gate',
  'Pressure Seal Globe',
  'Relief Valve',
  'Safety Valve',
  'Twinseal',
] as const

/** Canonical valve types for test log entry (dropdown). */
export const TEST_LOG_VALVE_TYPES = [
  'Ball',
  'Gate',
  'Globe',
  'Check',
  'Plug',
  'Butterfly',
  'Needle',
  'Diaphragm',
  'Relief Valve',
  'Safety Valve',
] as const

/** Finish cells (work cell dropdown). */
export const FINISH_CELLS = [
  'Actuation',
  'Ball Valve',
  'Durco/Twinseal',
  'Field Service',
  'G/G/C',
  'Machine Shop',
  'Machining only',
  'Pipeline',
  'PRV',
  'Test Only',
  'Welding',
  'Outsourced',
] as const

export const ORDER_TYPES = ['In-Process Order', 'Waiting on Arrival', 'On-Hold', 'Completed'] as const

/** ANSI/ASME and API pressure classes (lb) used as fallback when DB lookup_values is empty. */
export const PRESSURE_CLASSES = ['150', '300', '400', '600', '800', '900', '1500', '2500', '3000', '5000', '10000'] as const

/** Body material designations used as fallback when DB lookup_values is empty. */
export const BODY_MATERIALS = [
  'WCB', 'WC1', 'F11', 'F22', 'C5', 'C12', 'P91',
  '304 SS', '309 SS', '316 SS', '347 SS',
  'Monel', 'Hastelloy', 'Alloy 400', 'Alloy C276',
] as const

/** API trim numbers (API 600 / common shop trim chart) used as fallback when DB lookup_values is empty. */
export const API_TRIMS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '5A',
  '6',
  '7',
  '8',
  '8A',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
] as const
