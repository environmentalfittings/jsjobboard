import { PMI_MATERIALS_LOOKUP_CATEGORY } from '../constants/lookupCategories'
import type {
  ItpLibraryCustomItem,
  ItpLibraryItemExec,
  ItpLibraryItemSel,
} from '../types/itpLibraryPlan'
import { addLookupValue } from './lookupValues'
import {
  clampLinePhotoMax,
  clampLinePhotoMin,
  emptyMeasField,
  followUpApplies,
  followUpFieldId,
  isOtherDropdownAnswer,
  type ItpMeasFieldDef,
} from '../types/itpMeasFields'

function readMeasValue(exec: ItpLibraryItemExec, fieldId: string): string {
  return String(exec.measValues?.[fieldId] ?? '').trim()
}

function isNaMeas(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[./]/g, '')
  return normalized === 'na' || normalized === 'n a' || normalized === 'not applicable'
}

/**
 * For Material identification PMI material dropdowns: if Other + grade was entered,
 * store the typed grade on the field and append new grades to the shared PMI materials list.
 */
export async function growPmiMaterialsFromExec(
  fields: ItpMeasFieldDef[],
  exec: ItpLibraryItemExec,
): Promise<{ exec: ItpLibraryItemExec; added: string[] }> {
  let next = exec
  const toAdd = new Set<string>()

  for (const field of fields) {
    if (field.type !== 'dropdown') continue
    if (field.lookupCategory !== PMI_MATERIALS_LOOKUP_CATEGORY) continue

    const raw = readMeasValue(next, field.id)
    if (!raw || isNaMeas(raw)) continue

    let grade = raw
    if (followUpApplies(field, raw) || isOtherDropdownAnswer(raw)) {
      const followUp = readMeasValue(next, followUpFieldId(field.id))
      if (!followUp || isNaMeas(followUp)) continue
      grade = followUp
      next = {
        ...next,
        measValues: {
          ...next.measValues,
          [field.id]: grade,
          [followUpFieldId(field.id)]: '',
        },
      }
    }

    if (grade && !isOtherDropdownAnswer(grade)) toAdd.add(grade)
  }

  const added: string[] = []
  for (const grade of toAdd) {
    try {
      const saved = await addLookupValue(PMI_MATERIALS_LOOKUP_CATEGORY, grade)
      if (saved) added.push(saved)
    } catch {
      // Traveler save should not fail if the list upsert is blocked.
    }
  }

  return { exec: next, added }
}

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
export const PMI_REQUIRED_FIELD_LABEL = 'PMI required'
export const PMI_REPORT_FIELD_LABEL = 'PMI report'

export function isPmiRequiredFieldLabel(label: string | null | undefined): boolean {
  return /^(is\s+)?pmi\s*required\??$/i.test(String(label ?? '').trim())
}

export function isPmiReportFieldLabel(label: string | null | undefined): boolean {
  return /^pmi\s*report$/i.test(String(label ?? '').trim())
}

export function pmiMaterialDropdownPatch(partial?: Partial<ItpMeasFieldDef>): Partial<ItpMeasFieldDef> {
  return {
    ...partial,
    type: 'dropdown',
    required: true,
    options: [],
    optionSource: 'lookup',
    lookupCategory: PMI_MATERIALS_LOOKUP_CATEGORY,
    followUpWhen: 'Other',
    followUpLabel: 'Material grade',
  }
}

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

/** Combined Twinseal parts step label (replaces separate Order parts + bolting record). */
export const TWINSEAL_PARTS_STEP_NAME = 'Parts and bolting record'
export const TWINSEAL_PARTS_STEP_REF = 'Parts Record'
export const TWINSEAL_PARTS_DEFAULT_FIELD_LABELS = [
  'Studs type',
  'Studs size',
  'Studs quantity',
  'Slips part #',
  'Slips material',
  'Soft goods part #',
  'Soft goods material',
] as const

export function isPartsBoltingRecordName(name: string | null | undefined): boolean {
  const text = String(name ?? '').trim()
  return /parts\s+and\s+bolting/i.test(text) || /^parts\s*record$/i.test(text)
}

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
  return prev.measFields.some(
    (field) => isPmiReportFieldLabel(field.label) || isPmiRequiredFieldLabel(field.label),
  )
}

/** Upgrade one Material identification step selection (safe to call from the step modal). */
export function ensureMaterialIdentificationItemSel(
  itemId: string,
  prev: ItpLibraryItemSel,
  options?: { valveType?: string | null },
): ItpLibraryItemSel {
  const next = ensureMaterialIdentificationPmiReqs({ [itemId]: prev }, options)
  return next[itemId] ?? prev
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
            emptyMeasField(
              pmiMaterialDropdownPatch({
                id: `${itemId}_${label.toLowerCase().replace(/\s+/g, '_')}`,
                label,
              }),
            ),
          )
        } else {
          fields[idx] = emptyMeasField(pmiMaterialDropdownPatch({ ...fields[idx], label }))
        }
      }
    } else {
      for (let i = 0; i < fields.length; i += 1) {
        const field = fields[i]
        if (field.type === 'picture') continue
        if (isPmiRequiredFieldLabel(field.label)) continue
        if (isPmiReportFieldLabel(field.label)) continue
        fields[i] = emptyMeasField(pmiMaterialDropdownPatch({ ...field }))
      }
    }

    let pmiRequiredIdx = fields.findIndex((field) => isPmiRequiredFieldLabel(field.label))
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

    let pmiReportIdx = fields.findIndex((field) => isPmiReportFieldLabel(field.label))
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
      if (isPmiRequiredFieldLabel(field.label)) pmiRequired = field
      else if (isPmiReportFieldLabel(field.label)) pmiReport = field
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
          String(prevField.optionSource ?? '') === String(field.optionSource ?? '') &&
          String(prevField.lookupCategory ?? '') === String(field.lookupCategory ?? '') &&
          String(prevField.followUpWhen ?? '') === String(field.followUpWhen ?? '') &&
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

function twinsealPartsOrderCustom(existing?: ItpLibraryCustomItem | null): ItpLibraryCustomItem {
  const prevDetail =
    existing?.detail && typeof existing.detail === 'object' && !Array.isArray(existing.detail)
      ? existing.detail
      : null
  return {
    id: ORDER_REPLACEMENT_PARTS_ITEM_ID,
    secId: String(existing?.secId ?? '').trim() || 'inspection',
    name: TWINSEAL_PARTS_STEP_NAME,
    detail: {
      ...(prevDetail && typeof prevDetail === 'object' ? prevDetail : {}),
      id: ORDER_REPLACEMENT_PARTS_ITEM_ID,
      name: TWINSEAL_PARTS_STEP_NAME,
      ref: TWINSEAL_PARTS_STEP_REF,
      secId: String(existing?.secId ?? '').trim() || 'inspection',
      area: 'Teardown',
      requireMeasurement: true,
    },
  }
}

/**
 * Twinseal: one combined “Parts and bolting record” step (parts_order).
 * Hides legacy separate bolting-record lines and renames Order replacement parts.
 */
export function ensureTwinsealCombinedPartsPlan(plan: {
  sel: Record<string, ItpLibraryItemSel>
  custom: ItpLibraryCustomItem[]
  exec?: Record<string, ItpLibraryItemExec>
  valveType?: string | null
}): {
  sel: Record<string, ItpLibraryItemSel>
  custom: ItpLibraryCustomItem[]
  exec: Record<string, ItpLibraryItemExec>
} {
  const exec = { ...(plan.exec ?? {}) }
  if (!isTwinsealValveType(plan.valveType) && !(ORDER_REPLACEMENT_PARTS_ITEM_ID in plan.sel)) {
    return { sel: plan.sel, custom: plan.custom, exec }
  }
  if (plan.valveType != null && plan.valveType !== '' && !isTwinsealValveType(plan.valveType)) {
    return { sel: plan.sel, custom: plan.custom, exec }
  }

  let sel = { ...plan.sel }
  let custom = [...plan.custom]
  const duplicates = custom.filter(
    (row) =>
      row.id !== ORDER_REPLACEMENT_PARTS_ITEM_ID && isPartsBoltingRecordName(row.name),
  )

  let parts = sel[ORDER_REPLACEMENT_PARTS_ITEM_ID] ?? newOrderReplacementPartsSel()
  const fieldByLabel = new Map(
    parts.measFields.map((field) => [field.label.trim().toLowerCase(), field] as const),
  )

  for (const dup of duplicates) {
    const dupSel = sel[dup.id]
    if (dupSel?.measFields?.length) {
      for (const field of dupSel.measFields) {
        const key = field.label.trim().toLowerCase()
        if (!key || fieldByLabel.has(key)) continue
        const nextField = emptyMeasField({
          ...field,
          id: field.id?.startsWith(`${ORDER_REPLACEMENT_PARTS_ITEM_ID}_`)
            ? field.id
            : `${ORDER_REPLACEMENT_PARTS_ITEM_ID}_${field.id || key.replace(/\s+/g, '_')}`,
        })
        fieldByLabel.set(key, nextField)
      }
    }
    const dupExec = exec[dup.id]
    if (dupExec) {
      const partsExec = exec[ORDER_REPLACEMENT_PARTS_ITEM_ID] ?? {
        ...dupExec,
        measValues: {},
        fieldPhotos: {},
        photos: [],
        notes: '',
        done: false,
      }
      const measValues = { ...(partsExec.measValues ?? {}) }
      for (const [fieldId, value] of Object.entries(dupExec.measValues ?? {})) {
        if (!String(value ?? '').trim()) continue
        const mappedId = fieldId.startsWith(`${dup.id}_`)
          ? `${ORDER_REPLACEMENT_PARTS_ITEM_ID}_${fieldId.slice(dup.id.length + 1)}`
          : fieldId
        if (!String(measValues[mappedId] ?? '').trim()) measValues[mappedId] = value
      }
      const fieldPhotos = { ...(partsExec.fieldPhotos ?? {}) }
      for (const [fieldId, photos] of Object.entries(dupExec.fieldPhotos ?? {})) {
        if (!photos?.length) continue
        const mappedId = fieldId.startsWith(`${dup.id}_`)
          ? `${ORDER_REPLACEMENT_PARTS_ITEM_ID}_${fieldId.slice(dup.id.length + 1)}`
          : fieldId
        if (!fieldPhotos[mappedId]?.length) fieldPhotos[mappedId] = photos
      }
      exec[ORDER_REPLACEMENT_PARTS_ITEM_ID] = {
        ...partsExec,
        measValues,
        fieldPhotos,
        notes: partsExec.notes?.trim() ? partsExec.notes : dupExec.notes,
        done: partsExec.done || dupExec.done,
      }
    }
    if (dupSel) {
      sel[dup.id] = { ...dupSel, included: false, addToTraveler: false }
    }
  }

  let measFields = [...fieldByLabel.values()]
  if (measFields.length === 0) {
    measFields = TWINSEAL_PARTS_DEFAULT_FIELD_LABELS.map((label, index) =>
      emptyMeasField({
        id: `${ORDER_REPLACEMENT_PARTS_ITEM_ID}_f${String(index + 1).padStart(2, '0')}`,
        label,
        type: 'text',
        required: false,
      }),
    )
  }

  parts = withTwinsealOrderPartSubReqs({
    ...parts,
    included: true,
    addToTraveler: true,
    sectionId: parts.sectionId || 'inspection',
    shopArea: parts.shopArea || 'Teardown',
    beforeMeas: parts.beforeMeas || measFields.length > 0,
    afterMeas: parts.afterMeas || measFields.length > 0,
    measVerify: parts.measVerify || measFields.length > 0,
    measFields,
  })
  sel[ORDER_REPLACEMENT_PARTS_ITEM_ID] = parts

  const existingCustom = custom.find((row) => row.id === ORDER_REPLACEMENT_PARTS_ITEM_ID) ?? null
  const nextCustom = twinsealPartsOrderCustom(existingCustom)
  const customIdx = custom.findIndex((row) => row.id === ORDER_REPLACEMENT_PARTS_ITEM_ID)
  if (customIdx < 0) custom = [...custom, nextCustom]
  else custom[customIdx] = nextCustom

  return { sel, custom, exec }
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
