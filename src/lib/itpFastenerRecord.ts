import type { ItpLibraryItemSel } from '../types/itpLibraryPlan'
import { DEFAULT_ITP_MEAS_FIELDS, type ItpMeasFieldDef } from '../types/itpMeasFields'

export const FASTENER_RECORD_ITEM_ID = 'd4'

/** Former ITP sub-checks — these are traveler inputs now. */
export const FASTENER_SUB_REQ_LABELS = [
  'Fastener size & thread spec (dia. × pitch × length)',
  'Material / grade (e.g. A193 B7, A320 L7, SS316)',
  'Quantity replaced',
  'Replacement part number / heat number',
  'MTR / material certification number obtained',
  'Verify replacement fasteners meet original design spec',
] as const

export const FASTENER_TRAVELER_FIELDS: ItpMeasFieldDef[] = [
  {
    id: 'fastener_size',
    label: 'Fastener size & thread spec (dia. × pitch × length)',
    type: 'text',
    options: [],
    required: true,
    jobCardField: 'none',
  },
  {
    id: 'fastener_material',
    label: 'Material / grade (e.g. A193 B7, A320 L7, SS316)',
    type: 'text',
    options: [],
    required: true,
    jobCardField: 'none',
  },
  {
    id: 'fastener_qty',
    label: 'Quantity replaced',
    type: 'number',
    options: [],
    required: true,
    jobCardField: 'none',
  },
  {
    id: 'fastener_part',
    label: 'Replacement part number / heat number',
    type: 'text',
    options: [],
    required: true,
    jobCardField: 'none',
  },
  {
    id: 'fastener_mtr',
    label: 'MTR / material certification number',
    type: 'text',
    options: [],
    required: true,
    jobCardField: 'none',
  },
  {
    id: 'fastener_verify',
    label: 'Replacement fasteners meet original design spec',
    type: 'yes_no',
    options: [],
    required: true,
    jobCardField: 'none',
  },
]

const FASTENER_SUB_REQ_SET = new Set(
  FASTENER_SUB_REQ_LABELS.map((label) => label.trim().toLowerCase()),
)

function isFastenerSubReq(label: string): boolean {
  const text = label.trim().toLowerCase()
  if (FASTENER_SUB_REQ_SET.has(text)) return true
  return (
    /fastener size|thread spec/.test(text) ||
    /material \/ grade|a193 b7/.test(text) ||
    /quantity replaced/.test(text) ||
    /replacement part number/.test(text) ||
    /mtr \/ material certification/.test(text) ||
    /replacement fasteners meet original/.test(text)
  )
}

function isGenericMeasDefaults(fields: ItpMeasFieldDef[]): boolean {
  if (fields.length !== DEFAULT_ITP_MEAS_FIELDS.length) return false
  const expected = DEFAULT_ITP_MEAS_FIELDS.map((field) => field.id).join('|')
  const actual = fields.map((field) => field.id).join('|')
  return expected === actual
}

function hasFastenerTravelerFields(fields: ItpMeasFieldDef[]): boolean {
  const labels = new Set(fields.map((field) => field.label.trim().toLowerCase()))
  return FASTENER_TRAVELER_FIELDS.every((field) => labels.has(field.label.trim().toLowerCase()))
}

const FASTENER_FIELD_LABEL_SET = new Set(
  FASTENER_TRAVELER_FIELDS.map((field) => field.label.trim().toLowerCase()),
)

export function withoutJobCardPrefill(fields: ItpMeasFieldDef[]): ItpMeasFieldDef[] {
  let changed = false
  const next = fields.map((field) => {
    if (!FASTENER_FIELD_LABEL_SET.has(field.label.trim().toLowerCase())) return field
    if (field.jobCardField === 'none') return field
    changed = true
    return { ...field, jobCardField: 'none' as const }
  })
  return changed ? next : fields
}

export function migrateFastenerRecordSel(itemId: string, sel: ItpLibraryItemSel): ItpLibraryItemSel {
  const stripped = sel.subReqs.filter((row) => !isFastenerSubReq(row))
  const strippedAny = stripped.length !== sel.subReqs.length
  const shouldConvert = itemId === FASTENER_RECORD_ITEM_ID || strippedAny
  if (!shouldConvert) return sel

  let measFields = sel.measFields
  if (measFields.length === 0 || isGenericMeasDefaults(measFields)) {
    measFields = FASTENER_TRAVELER_FIELDS.map((field) => ({ ...field }))
  } else if (!hasFastenerTravelerFields(measFields)) {
    const have = new Set(measFields.map((field) => field.label.trim().toLowerCase()))
    measFields = [
      ...measFields,
      ...FASTENER_TRAVELER_FIELDS.filter((field) => !have.has(field.label.trim().toLowerCase())).map(
        (field) => ({ ...field }),
      ),
    ]
  }
  measFields = withoutJobCardPrefill(measFields)

  if (
    !strippedAny &&
    measFields === sel.measFields &&
    hasFastenerTravelerFields(sel.measFields) &&
    sel.addToTraveler
  ) {
    return sel
  }

  return {
    ...sel,
    subReqs: stripped,
    measFields,
    addToTraveler: true,
    beforeMeas: true,
    afterMeas: true,
    measVerify: true,
  }
}

export function migrateFastenerRecordScopeSel(
  sel: Record<string, ItpLibraryItemSel>,
): Record<string, ItpLibraryItemSel> {
  let changed = false
  const next: Record<string, ItpLibraryItemSel> = {}
  for (const [id, value] of Object.entries(sel)) {
    const migrated = migrateFastenerRecordSel(id, value)
    if (migrated !== value) changed = true
    next[id] = migrated
  }
  return changed ? next : sel
}
