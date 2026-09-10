/** Shop WPS number decoder from “Weld Procedure Number Generation 5262020”. */

export const WPS_NUMBER_INTRO =
  'PQR numbers start with P. WPS numbers start with WP, then a five-digit (or longer) code.'

export const WPS_TYPE_DIGITS: { code: string; label: string }[] = [
  { code: '1', label: 'Joint' },
  { code: '2', label: 'Overlay HF (hardface)' },
  { code: '3', label: 'Overlay corrosion resistant' },
]

export const WPS_PROCESS_DIGITS: { code: string; label: string }[] = [
  { code: '10', label: 'SMAW — manual (stick)' },
  { code: '20', label: 'GMAW — manual (MIG)' },
  { code: '21', label: 'GMAW — semi-automatic (FCAW)' },
  { code: '30', label: 'GTAW — manual (TIG)' },
  { code: '31', label: 'GTAW — semi-automatic (machine TIG)' },
  { code: '40', label: 'GTAW manual / SMAW manual' },
  { code: '41', label: 'GTAW manual / GMAW' },
  { code: '42', label: 'GTAW manual / FCAW' },
  { code: '45', label: 'GTAW / SMAW / GMAW / FCAW' },
  { code: '50', label: 'Submerged arc (SAW)' },
  { code: '51', label: 'GMAW / FCAW / SAW' },
  { code: '52', label: 'GTAW / SAW' },
]

export const WPS_MATERIAL_DIGITS: { code: string; label: string }[] = [
  { code: '10', label: 'P1 to P1 — carbon to carbon' },
  { code: '11', label: 'P1 to P42 — carbon to Monel' },
  { code: '12', label: 'P1 to P8' },
  { code: '13', label: 'P1 to nickel' },
  { code: '14', label: 'P1 to Hastelloy C' },
  { code: '15', label: 'P1 to P3' },
  { code: '20', label: 'P1 to 309 to Stellite 21' },
  { code: '21', label: 'P1 to Inconel to Stellite 6' },
  { code: '22', label: 'P1 to Inconel to Ultimet' },
  { code: '23', label: 'P1 to Ultimet' },
  { code: '24', label: 'P1 to Stellite 21' },
  { code: '25', label: 'P1 to 309 SS' },
  { code: '26', label: 'P1 to 410 SS' },
  { code: '27', label: 'P1 to 316 SS' },
  { code: '30', label: 'P5B to P5B — 5 Chrome to 5 Chrome' },
  { code: '40', label: '9 Chrome to 9 Chrome' },
  { code: '41', label: '9 Chrome to Inconel' },
  { code: '42', label: '9 Chrome to 410 with Inconel filler, or 9 Chrome to Inconel to Stellite 6' },
  { code: '43', label: 'P5B 9 Chrome to Stellite 21' },
  { code: '50', label: 'Monel to Monel' },
  { code: '51', label: 'Nickel to Monel' },
  { code: '55', label: 'Hastelloy C to Hastelloy C (P43)' },
  { code: '60', label: '410 to 410' },
  { code: '61', label: '410 to Inconel to Ultimet' },
  { code: '62', label: '347 to 347' },
  { code: '63', label: '304 to 304' },
  { code: '64', label: '309 to 309' },
  { code: '65', label: '316 to 316, or 316 to Stellite 6' },
  { code: '66', label: '304L to 304L, or 347 to Stellite 21' },
  { code: '70', label: 'F91 to F91' },
  { code: '71', label: 'F91 to Inconel (P43)' },
  { code: '72', label: 'F91 to Inconel to Stellite 6' },
  { code: '73', label: 'F91 to Inconel to Stellite 21' },
  { code: '80', label: 'P5A to P5A' },
  { code: '81', label: 'P5A to Inconel (P43)' },
  { code: '82', label: 'P5A to Inconel to Stellite 6' },
  { code: '83', label: 'P5A to Inconel to Ultimet' },
  { code: '84', label: 'P5A to Ultimet' },
  { code: '90', label: 'P4 — 1¼ to 1¼' },
  { code: '91', label: 'P4 1¼ to Inconel to Stellite 6' },
  { code: '92', label: 'P4 to 316 SS' },
  { code: '1X', label: 'P3 to P3' },
  { code: '1X1', label: '4130 to Inconel to Stellite 6' },
  { code: '1X2', label: '4130 to 4130' },
  { code: '1X3', label: 'P3 to P3 with Inconel 82/182' },
]

export const WPS_HEAT_TREAT_DIGITS: { code: string; label: string }[] = [
  { code: '1', label: 'Heat treat not required' },
  { code: '2', label: 'Heat treat required' },
]

export const WPS_THICKNESS_DIGITS: { code: string; label: string }[] = [
  { code: '0', label: 'Anything less than ½″' },
  { code: '1', label: '½″ to 1″' },
  { code: '2', label: '1″' },
  { code: '3', label: '≥ 1½″' },
  { code: '4', label: 'Special (plates of different sizes)' },
]

export const WPS_P_NUMBER_EXAMPLES: { code: string; examples: string }[] = [
  { code: 'P1', examples: 'A105, WCB, LF2, LCC, LCB, LF1' },
  { code: 'P3', examples: 'F1, WC1, LC1, ½ Molybdenum or ½ Chromium' },
  { code: 'P4', examples: 'F11, WC5, WC6, P11, 1¼ Chrome' },
  { code: 'P5A', examples: 'F22, WC9, P22, 2¼ Chrome' },
  { code: 'P5B Gr. 1', examples: 'P5, P9, C5, C12, F5, F9' },
  { code: 'P5B Gr. 2 / P5C / P15E', examples: 'F91, P91, C12A' },
  { code: 'P6', examples: 'Stainless (410, 415, 429), CR13' },
  { code: 'P7', examples: 'Ferritic stainless (409, 430)' },
  { code: 'P8 Gr. 1', examples: 'Austenitic stainless (304, 316, 317, 347)' },
  { code: 'P8 Gr. 2', examples: 'Austenitic stainless (309, 310)' },
  { code: 'P8 Gr. 3', examples: 'Austenitic stainless, high manganese grades' },
  { code: 'P8 Gr. 4', examples: 'Austenitic stainless, high molybdenum grades' },
  { code: 'P9A, 9B', examples: 'LC3, LF3, LC2' },
  { code: 'P42', examples: 'Monel' },
  { code: 'P43', examples: 'Inconel, C22, C276' },
  { code: 'P44', examples: 'Hastelloy B2' },
]

export const WPS_QW424_ROWS: { coupon: string; qualified: string }[] = [
  {
    coupon: 'One metal from a P-Number to any metal from the same P-Number',
    qualified: 'Any metals assigned that P-Number',
  },
  {
    coupon: 'One metal from P-Number 15E to any metal from P-Number 15E',
    qualified: 'Any P-Number 15E or 5B metal to any metal assigned P-Number 15E or 5B',
  },
  {
    coupon: 'One metal from a P-Number to any metal from any other P-Number',
    qualified: 'Any metal assigned the first P-Number to any metal assigned the second P-Number',
  },
  {
    coupon: 'One metal from P-No. 3 to any metal from P-No. 3',
    qualified: 'Any P-No. 3 metal to any metal assigned P-No. 3 or 1',
  },
  {
    coupon: 'One metal from P-No. 4 to any metal from P-No. 4',
    qualified: 'Any P-No. 4 metal to any metal assigned P-No. 4, 3, or 1',
  },
  {
    coupon: 'One metal from P-No. 5A to any metal from P-No. 5A',
    qualified: 'Any P-No. 5A metal to any metal assigned P-No. 5A, 4, 3, or 1',
  },
  {
    coupon: 'Any unassigned metal to the same unassigned metal',
    qualified: 'The unassigned metal to itself',
  },
]

export function weldProcedureMatchesQuery(
  row: {
    title: string
    filler_metal?: string | null
    wps_type?: string | null
    base_metal_category?: string | null
    file_name?: string | null
    notes?: string | null
    weld_processes?: string[] | null
    weld_modes?: string[] | null
  },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const compactQ = q.replace(/\s+/g, '')
  const hay = [
    row.title,
    row.filler_metal,
    row.wps_type,
    row.base_metal_category,
    row.file_name,
    row.notes,
    ...(row.weld_processes ?? []),
    ...(row.weld_modes ?? []),
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
  const compactTitle = row.title.replace(/\s+/g, '').toLowerCase()
  return hay.includes(q) || (compactQ.length >= 2 && compactTitle.includes(compactQ))
}
