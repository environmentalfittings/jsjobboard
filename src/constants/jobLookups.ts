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

/** Finish cells (work cell dropdown). */
export const FINISH_CELLS = [
  'Actuation',
  'Ball Valve',
  'Durco/Twinseal',
  'Field Service',
  'G/G/C',
  'Machine Shop',
  'Pipeline',
  'PRV',
  'Test Only',
  'Welding',
  'Outsourced',
] as const

export const ORDER_TYPES = ['In-Process Order', 'Waiting on Arrival', 'On-Hold', 'Completed'] as const

/** ANSI/ASME and API pressure classes (lb) used as fallback when DB lookup_values is empty. */
export const PRESSURE_CLASSES = ['150', '300', '600', '900', '1500', '2500', '3000', '5000', '10000'] as const
