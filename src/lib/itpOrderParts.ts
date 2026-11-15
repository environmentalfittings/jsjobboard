import type { ItpLibraryItemSel } from '../types/itpLibraryPlan'
import { clampLinePhotoMax, clampLinePhotoMin, emptyMeasField } from '../types/itpMeasFields'

export const ORDER_REPLACEMENT_PARTS_ITEM_ID = 'parts_order'

/** Twinseal traveler receive / as-found step (generated traveler templates). */
export const TWINSEAL_RECEIVE_ITEM_ID = 'trv_i_01'
export const TWINSEAL_WORK_ORDER_PHOTO_FIELD_ID = 'trv_i_01_wo'
/** Twinseal Material identification step (generated traveler templates). */
export const TWINSEAL_MAT_ID_ITEM_ID = 'trv_i_02'
export const TWINSEAL_MAT_ID_PART_LABELS = [
  'Body',
  'Body Lining',
  'Stem',
  'Lids',
  'Lid Groove',
  'Stem Overlay',
  'Packing Gland',
  'Packing Area',
] as const
export const PMI_REQUIRED_FIELD_LABEL = 'Is PMI required'
export const PMI_REPORT_FIELD_LABEL = 'PMI report'

export const ORDER_PART_KIND_IDS = {
  studs: 'parts_order:studs',
  slips: 'parts_order:slips',
  softGoods: 'parts_order:soft_goods',
} as const

export const ORDER_PART_KIND_NAMES: Record<string, string> = {
  [ORDER_PART_KIND_IDS.studs]: 'Studs / bolting',
  [ORDER_PART_KIND_IDS.slips]: 'Slips',
  [ORDER_PART_KIND_IDS.softGoods]: 'Soft goods',
}

/**
 * Twinseal Order replacement parts — matches Field Service traveler layout
 * and seeds the Needs Parts list with these three lines.
 */
export const TWINSEAL_ORDER_PART_SUB_REQS = ['Studs', 'Slips', 'Soft Goods'] as const

export const TWINSEAL_NEEDED_PART_SEEDS: ReadonlyArray<{
  kindId: string
  partName: string
  itpItemName: string
}> = [
  // Studs are not seeded as a single fixed line: a Twinseal job can need studs in several
  // locations (top lid, bottom lid, packing area, gearbox, etc.), so each is added as its own
  // line via the Studs "Add studs" control instead.
  {
    kindId: ORDER_PART_KIND_IDS.slips,
    partName: 'Slips',
    itpItemName: ORDER_PART_KIND_NAMES[ORDER_PART_KIND_IDS.slips],
  },
  {
    kindId: ORDER_PART_KIND_IDS.softGoods,
    partName: 'Soft Goods',
    itpItemName: 'Soft Goods',
  },
]

export function isTwinsealValveType(valveType: string | null | undefined): boolean {
  return /twinseal|durco/i.test(String(valveType ?? '').trim())
}

export function twinsealNeededPartDrafts(): Array<{
  partName: string
  partNumber: string
  quantity: number
  supplier: string
  notes: string
  itpItemId: string
  itpItemName: string
}> {
  return TWINSEAL_NEEDED_PART_SEEDS.map((seed) => ({
    partName: seed.partName,
    partNumber: '',
    quantity: 1,
    supplier: '',
    notes: '',
    itpItemId: seed.kindId,
    itpItemName: seed.itpItemName,
  }))
}

export function isOrderReplacementPartsItem(itemId: string | null | undefined): boolean {
  return itemId === ORDER_REPLACEMENT_PARTS_ITEM_ID
}

export function isOrderReplacementPartsKind(itemId: string | null | undefined): boolean {
  const id = String(itemId ?? '')
  return id === ORDER_REPLACEMENT_PARTS_ITEM_ID || id.startsWith('parts_order:')
}

export function isOrderStudsKind(itemId: string | null | undefined): boolean {
  const id = String(itemId ?? '')
  return id === ORDER_PART_KIND_IDS.studs || id.startsWith(`${ORDER_PART_KIND_IDS.studs}:`)
}

function newOrderReplacementPartsSel(): ItpLibraryItemSel {
  return {
    included: true,
    holdPoint: false,
    beforeMeas: false,
    afterMeas: false,
    measVerify: false,
    subReqs: [],
    notes: '',
    requirePicture: false,
    pictureLabel: '',
    minPhotos: 1,
    maxPhotos: 4,
    measFields: [],
    requireNameplate: false,
    blockNext: false,
    sectionId: 'disassembly',
    shopArea: '',
    sortIndex: null,
    addToTraveler: true,
    travelerEntry: null,
    resourceDocs: [],
  }
}

function withTwinsealOrderPartSubReqs(prev: ItpLibraryItemSel): ItpLibraryItemSel {
  const have = new Set(prev.subReqs.map((row) => row.trim().toLowerCase()))
  const missing = TWINSEAL_ORDER_PART_SUB_REQS.filter((label) => !have.has(label.toLowerCase()))
  if (missing.length === 0 && prev.addToTraveler) return prev
  return {
    ...prev,
    addToTraveler: true,
    subReqs: [...prev.subReqs, ...missing],
  }
}

function looksLikeMaterialIdStep(itemId: string, prev: ItpLibraryItemSel): boolean {
  if (itemId === TWINSEAL_MAT_ID_ITEM_ID) return true
  return prev.measFields.some((field) => {
    const label = field.label.trim().toLowerCase()
    return (
      label === PMI_REPORT_FIELD_LABEL.toLowerCase() ||
      label === PMI_REQUIRED_FIELD_LABEL.toLowerCase() ||
      /^is pmi required\??$/i.test(field.label.trim())
    )
  })
}

/**
 * Material identification: always collect material IDs + “Is PMI required?”.
 * PMI report upload is required only when the answer is Yes.
 * Safe to re-run on existing templates / open travelers.
 */
export function ensureMaterialIdentificationPmiReqs(
  sel: Record<string, ItpLibraryItemSel>,
  options?: { valveType?: string | null },
): Record<string, ItpLibraryItemSel> {
  let nextSel = sel
  let changed = false
  for (const [itemId, prev] of Object.entries(sel)) {
    if (!prev || prev.included === false) continue
    if (!looksLikeMaterialIdStep(itemId, prev)) continue

    const fields = prev.measFields.map((row) => emptyMeasField(row))
    const byLabel = (label: string) =>
      fields.findIndex((field) => field.label.trim().toLowerCase() === label.trim().toLowerCase())

    if (itemId === TWINSEAL_MAT_ID_ITEM_ID || isTwinsealValveType(options?.valveType)) {
      for (const label of TWINSEAL_MAT_ID_PART_LABELS) {
        const idx = byLabel(label)
        if (idx < 0) {
          fields.push(
            emptyMeasField({
              id: `${itemId}_${label.toLowerCase().replace(/\s+/g, '_')}`,
              label,
              type: 'text',
              required: true,
            }),
          )
        } else {
          fields[idx] = emptyMeasField({ ...fields[idx], type: 'text', required: true })
        }
      }
    } else {
      for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i]
        if (field.type === 'picture') continue
        if (/^is pmi required/i.test(field.label.trim())) continue
        if (/^pmi report$/i.test(field.label.trim())) continue
        fields[i] = emptyMeasField({ ...field, required: true })
      }
    }

    let pmiRequiredIdx = byLabel(PMI_REQUIRED_FIELD_LABEL)
    if (pmiRequiredIdx < 0) {
      pmiRequiredIdx = fields.findIndex((field) => /^is pmi required/i.test(field.label.trim()))
    }
    if (pmiRequiredIdx < 0) {
      fields.push(
        emptyMeasField({
          id: `${itemId}_pmi_required`,
          label: PMI_REQUIRED_FIELD_LABEL,
          type: 'yes_no',
          required: true,
        }),
      )
      pmiRequiredIdx = fields.length - 1
    } else {
      fields[pmiRequiredIdx] = emptyMeasField({
        ...fields[pmiRequiredIdx],
        label: PMI_REQUIRED_FIELD_LABEL,
        type: 'yes_no',
        required: true,
      })
    }

    let pmiReportIdx = byLabel(PMI_REPORT_FIELD_LABEL)
    if (pmiReportIdx < 0) {
      pmiReportIdx = fields.findIndex((field) => /^pmi report$/i.test(field.label.trim()))
    }
    const pmiReportPatch = {
      label: PMI_REPORT_FIELD_LABEL,
      type: 'picture' as const,
      required: false,
      maxPhotos: 3,
      requiredWhenLabel: PMI_REQUIRED_FIELD_LABEL,
      requiredWhenValue: 'Yes',
      requiredWhenFieldId: fields[pmiRequiredIdx]?.id,
    }
    if (pmiReportIdx < 0) {
      fields.push(
        emptyMeasField({
          id: `${itemId}_pmi_report`,
          ...pmiReportPatch,
        }),
      )
    } else {
      fields[pmiReportIdx] = emptyMeasField({
        ...fields[pmiReportIdx],
        ...pmiReportPatch,
      })
    }

    // Keep material parts first, then PMI required, then PMI report, then any extras.
    const partSet = new Set(
      TWINSEAL_MAT_ID_PART_LABELS.map((label) => label.toLowerCase()),
    )
    const parts: typeof fields = []
    const middle: typeof fields = []
    let pmiRequired: (typeof fields)[number] | null = null
    let pmiReport: (typeof fields)[number] | null = null
    for (const field of fields) {
      const label = field.label.trim().toLowerCase()
      if (label === PMI_REQUIRED_FIELD_LABEL.toLowerCase()) pmiRequired = field
      else if (label === PMI_REPORT_FIELD_LABEL.toLowerCase()) pmiReport = field
      else if (partSet.has(label)) parts.push(field)
      else middle.push(field)
    }
    const ordered = [
      ...parts,
      ...middle,
      ...(pmiRequired ? [pmiRequired] : []),
      ...(pmiReport ? [pmiReport] : []),
    ]

    const sameLength = ordered.length === prev.measFields.length
    const sameShape =
      sameLength &&
      ordered.every((field, index) => {
        const prevField = prev.measFields[index]
        return (
          prevField &&
          prevField.id === field.id &&
          prevField.label === field.label &&
          prevField.type === field.type &&
          prevField.required === field.required &&
          String(prevField.requiredWhenLabel ?? '') === String(field.requiredWhenLabel ?? '') &&
          String(prevField.requiredWhenValue ?? '') === String(field.requiredWhenValue ?? '') &&
          String(prevField.requiredWhenFieldId ?? '') === String(field.requiredWhenFieldId ?? '')
        )
      })
    if (sameShape) continue

    changed = true
    nextSel = {
      ...nextSel,
      [itemId]: {
        ...prev,
        beforeMeas: true,
        afterMeas: true,
        measVerify: true,
        measFields: ordered,
      },
    }
  }
  return changed ? nextSel : sel
}

/**
 * Twinseal incoming receive step: 1 required work-order photo + at least 4 as-found before photos.
 * Safe to re-run; upgrades older templates that only required 1 before photo.
 */
export function ensureTwinsealReceivePhotoReqs(
  sel: Record<string, ItpLibraryItemSel>,
  options?: { valveType?: string | null },
): Record<string, ItpLibraryItemSel> {
  if (!isTwinsealValveType(options?.valveType) && !(TWINSEAL_RECEIVE_ITEM_ID in sel)) {
    return sel
  }
  if (options?.valveType != null && !isTwinsealValveType(options.valveType)) {
    return sel
  }
  const prev = sel[TWINSEAL_RECEIVE_ITEM_ID]
  if (!prev || prev.included === false) return sel

  const fields = prev.measFields.map((row) => emptyMeasField(row))
  const hasWorkOrder = fields.some(
    (field) =>
      field.id === TWINSEAL_WORK_ORDER_PHOTO_FIELD_ID ||
      /^work\s*order$/i.test(field.label.trim()),
  )
  if (!hasWorkOrder) {
    fields.unshift(
      emptyMeasField({
        id: TWINSEAL_WORK_ORDER_PHOTO_FIELD_ID,
        label: 'Work order',
        type: 'picture',
        required: true,
        maxPhotos: 1,
      }),
    )
  } else {
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i]
      if (
        field.id === TWINSEAL_WORK_ORDER_PHOTO_FIELD_ID ||
        /^work\s*order$/i.test(field.label.trim())
      ) {
        fields[i] = emptyMeasField({
          ...field,
          type: 'picture',
          required: true,
          maxPhotos: 1,
        })
      }
    }
  }

  const label = prev.pictureLabel.trim()
  const pictureLabel =
    !label || /^as[- ]?found/i.test(label) || /^before\s*photos?/i.test(label)
      ? label || 'Before photos'
      : label
  const minPhotos = Math.max(4, clampLinePhotoMin(prev.minPhotos))
  const maxPhotos = clampLinePhotoMax(Math.max(8, prev.maxPhotos || 8), minPhotos)

  const unchanged =
    prev.requirePicture &&
    prev.pictureLabel === pictureLabel &&
    prev.minPhotos === minPhotos &&
    prev.maxPhotos === maxPhotos &&
    hasWorkOrder &&
    fields.length === prev.measFields.length
  if (unchanged) return sel

  return {
    ...sel,
    [TWINSEAL_RECEIVE_ITEM_ID]: {
      ...prev,
      requirePicture: true,
      pictureLabel,
      minPhotos,
      maxPhotos,
      beforeMeas: prev.beforeMeas || fields.length > 0,
      afterMeas: prev.afterMeas || fields.length > 0,
      measVerify: prev.measVerify || fields.length > 0,
      measFields: fields,
    },
  }
}

/** Include the Order replacement parts traveler step on plans/templates that do not have it yet. */
export function ensureOrderReplacementPartsSel(
  sel: Record<string, ItpLibraryItemSel>,
  options?: { valveType?: string | null },
): Record<string, ItpLibraryItemSel> {
  const twinseal = isTwinsealValveType(options?.valveType)
  const prev = sel[ORDER_REPLACEMENT_PARTS_ITEM_ID]
  let nextSel = sel
  if (!prev) {
    const created = newOrderReplacementPartsSel()
    nextSel = {
      ...sel,
      [ORDER_REPLACEMENT_PARTS_ITEM_ID]: twinseal
        ? withTwinsealOrderPartSubReqs(created)
        : created,
    }
  } else {
    let next = prev
    if (prev.included !== false && !prev.addToTraveler) {
      next = { ...next, addToTraveler: true }
    } else if (prev.included === false && !prev.addToTraveler) {
      next = { ...next, addToTraveler: true }
    }
    if (twinseal && next.included !== false) {
      next = withTwinsealOrderPartSubReqs(next)
    }
    if (next !== prev) {
      nextSel = { ...sel, [ORDER_REPLACEMENT_PARTS_ITEM_ID]: next }
    }
  }
  return ensureMaterialIdentificationPmiReqs(
    ensureTwinsealReceivePhotoReqs(nextSel, options),
    options,
  )
}
