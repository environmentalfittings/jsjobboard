import type { ItpLibraryItemExec, ItpLibraryItemSel } from '../types/itpLibraryPlan'
import {
  clampLinePhotoMax,
  DEFAULT_ITP_MEAS_FIELDS,
  followUpApplies,
  followUpFieldId,
  followUpLabelOf,
  type ItpJobCardFieldKey,
  type ItpMeasFieldDef,
  type ItpMeasFieldType,
  type ItpMeasOptionSource,
} from '../types/itpMeasFields'

export type { ItpMeasFieldDef, ItpMeasFieldType, ItpMeasOptionSource, ItpJobCardFieldKey }
export {
  DEFAULT_ITP_MEAS_FIELDS,
  ITP_JOB_CARD_FIELD_OPTIONS,
  ITP_MEAS_FIELD_TYPE_OPTIONS,
  dropdownOptionSource,
  dropdownSourceSelectValue,
  emptyMeasField,
  fieldLookupCategory,
  followUpApplies,
  followUpFieldId,
  followUpLabelOf,
  inferJobCardField,
  lookupListLabel,
  looksLikeManufacturerLabel,
  measFieldTypeLabel,
  newMeasFieldId,
  normalizeMeasFields,
  patchFromDropdownSourceSelect,
  pictureFieldMax,
  clampPictureFieldMax,
  clampLinePhotoMin,
  clampLinePhotoMax,
  normalizeLinePhotoCounts,
  DEFAULT_PICTURE_FIELD_MAX,
  MEAS_PICTURE_MAX,
  measFieldTypePatch,
  resolveDropdownChoices,
  resolveJobCardField,
  withPersistedJobCardField,
} from '../types/itpMeasFields'

/** Requirement defaults stored on a master-catalog (or built-in library) item. */
export type ItpItemRequirementDefaults = {
  requirePicture?: boolean
  pictureLabel?: string
  minPhotos?: number
  maxPhotos?: number
  requireMeasurement?: boolean
  measFields?: ItpMeasFieldDef[]
  /** Traveler nameplate / job-card transfer requirement. */
  requireNameplate?: boolean
  holdPoint?: boolean
  blockNext?: boolean
}

export function itemRequiresMeasurements(sel: ItpLibraryItemSel): boolean {
  if (sel.measFields.length > 0) return true
  return Boolean(sel.beforeMeas || sel.afterMeas || sel.measVerify)
}

export function itemRequiresPicture(sel: ItpLibraryItemSel): boolean {
  return Boolean(sel.requirePicture)
}

/** Photos, measurements, or nameplate fields the technician must fill before checking the line. */
export function itemHasTravelerRequirement(sel: ItpLibraryItemSel): boolean {
  return itemRequiresPicture(sel) || itemRequiresMeasurements(sel) || Boolean(sel.requireNameplate)
}

export function stampLoggedInTech(
  exec: ItpLibraryItemExec,
  signerName: string,
): ItpLibraryItemExec {
  const stamp = signerName.trim()
  if (!stamp) return exec
  return { ...exec, techInitials: stamp }
}

export function toggleItemExecDone(
  sel: ItpLibraryItemSel,
  exec: ItpLibraryItemExec,
  options: {
    canSignOffHold: boolean
    signerName: string
    signerUserId: string | null
  },
): { exec: ItpLibraryItemExec; error?: string } {
  if (exec.done || exec.holdPending) {
    if (exec.done && sel.holdPoint && !options.canSignOffHold) {
      return {
        exec,
        error: 'Only a supervisor or Quality Team owner can clear a signed-off hold point',
      }
    }
    return {
      exec: {
        ...exec,
        done: false,
        holdPending: false,
        holdSignedOffAt: null,
        holdSignedOffByUserId: null,
        holdSignedOffByName: null,
      },
    }
  }
  const blocked = markDoneBlockedReason(sel, exec)
  if (blocked) return { exec, error: blocked }
  const stamped = stampLoggedInTech(exec, options.signerName)
  if (sel.holdPoint) {
    if (options.canSignOffHold) {
      return {
        exec: {
          ...stamped,
          done: true,
          holdPending: false,
          holdSignedOffAt: new Date().toISOString(),
          holdSignedOffByUserId: options.signerUserId,
          holdSignedOffByName: options.signerName || 'QC',
        },
      }
    }
    return { exec: { ...stamped, done: false, holdPending: true } }
  }
  return { exec: { ...stamped, done: true, holdPending: false } }
}

/** Resolve the field list to render (configured list, else legacy triple). */
export function resolvedMeasFields(sel: ItpLibraryItemSel): ItpMeasFieldDef[] {
  if (sel.measFields.length > 0) return sel.measFields
  if (sel.beforeMeas || sel.afterMeas || sel.measVerify) return DEFAULT_ITP_MEAS_FIELDS
  return []
}

export function getMeasValue(exec: ItpLibraryItemExec, fieldId: string): string {
  if (exec.measValues[fieldId] != null && exec.measValues[fieldId] !== '') {
    return exec.measValues[fieldId]
  }
  if (fieldId === 'before') return exec.beforeVal
  if (fieldId === 'after') return exec.afterVal
  if (fieldId === 'verify') return exec.verifyVal
  return ''
}

export function getFieldPhotos(exec: ItpLibraryItemExec, fieldId: string) {
  return exec.fieldPhotos?.[fieldId] ?? []
}

/** Stored when a technician marks a traveler input as not applicable. */
export const NA_MEAS_VALUE = 'N/A'

export function isNaAnswer(value: string | null | undefined): boolean {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[./]/g, '')
  return normalized === 'na' || normalized === 'n a' || normalized === 'not applicable'
}

export function patchMeasValue(
  exec: ItpLibraryItemExec,
  fieldId: string,
  value: string,
): Partial<ItpLibraryItemExec> {
  const measValues = { ...exec.measValues, [fieldId]: value }
  const patch: Partial<ItpLibraryItemExec> = { measValues }
  if (fieldId === 'before') patch.beforeVal = value
  if (fieldId === 'after') patch.afterVal = value
  if (fieldId === 'verify') patch.verifyVal = value
  return patch
}

export function measurementsComplete(sel: ItpLibraryItemSel, exec: ItpLibraryItemExec): boolean {
  const fields = resolvedMeasFields(sel)
  if (fields.length === 0) return true
  return fields.every((field) => measFieldComplete(field, exec))
}

function measFieldComplete(field: ItpMeasFieldDef, exec: ItpLibraryItemExec): boolean {
  const value = getMeasValue(exec, field.id)
  if (isNaAnswer(value)) return true
  if (followUpApplies(field, value)) {
    const followUp = getMeasValue(exec, followUpFieldId(field.id))
    if (!isNaAnswer(followUp) && !followUp.trim()) return false
  }
  if (field.required === false) return true
  if (field.type === 'picture') return getFieldPhotos(exec, field.id).length > 0
  return value.trim().length > 0
}

export function picturesComplete(sel: ItpLibraryItemSel, exec: ItpLibraryItemExec): boolean {
  if (!sel.requirePicture) return true
  const min = Math.max(1, sel.minPhotos || 1)
  return (exec.photos?.length ?? 0) >= min
}

export function itemRequirementsMet(sel: ItpLibraryItemSel, exec: ItpLibraryItemExec): boolean {
  return picturesComplete(sel, exec) && measurementsComplete(sel, exec)
}

export function markDoneBlockedReason(
  sel: ItpLibraryItemSel,
  exec: ItpLibraryItemExec,
): string | null {
  if (!picturesComplete(sel, exec)) {
    const min = Math.max(1, sel.minPhotos || 1)
    const label = sel.pictureLabel.trim() || 'required photos'
    const have = exec.photos?.length ?? 0
    return `Attach at least ${min} photo${min === 1 ? '' : 's'} (${label}) — ${have}/${min}`
  }
  if (!measurementsComplete(sel, exec)) {
    const missingFollowUp = resolvedMeasFields(sel).find((field) => {
      const value = getMeasValue(exec, field.id)
      if (isNaAnswer(value) || !followUpApplies(field, value)) return false
      const followUp = getMeasValue(exec, followUpFieldId(field.id))
      return !isNaAnswer(followUp) && !followUp.trim()
    })
    if (missingFollowUp) {
      return `Enter ${followUpLabelOf(missingFollowUp)} for ${missingFollowUp.label} (${missingFollowUp.followUpWhen})`
    }
    return 'Fill in all required fields or mark them N/A before marking done'
  }
  return null
}

/** Copy master-catalog requirement defaults onto a scope selection when including. */
export function selFromRequirementDefaults(
  base: ItpLibraryItemSel,
  defaults: ItpItemRequirementDefaults | null | undefined,
): ItpLibraryItemSel {
  if (!defaults) return base
  const requireNameplate = Boolean(defaults.requireNameplate) || base.requireNameplate
  const requireMeasurement = Boolean(defaults.requireMeasurement) || requireNameplate
  const measFields =
    defaults.measFields && defaults.measFields.length > 0
      ? defaults.measFields.map((f) => ({ ...f }))
      : requireMeasurement && !requireNameplate
        ? DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f }))
        : base.measFields
  return {
    ...base,
    holdPoint: Boolean(defaults.holdPoint) || base.holdPoint,
    blockNext: Boolean(defaults.blockNext) || base.blockNext,
    requirePicture: Boolean(defaults.requirePicture) || base.requirePicture,
    pictureLabel: (defaults.pictureLabel ?? '').trim() || base.pictureLabel,
    minPhotos: defaults.minPhotos && defaults.minPhotos > 0 ? defaults.minPhotos : base.minPhotos || 1,
    maxPhotos: clampLinePhotoMax(
      defaults.maxPhotos ?? base.maxPhotos,
      defaults.minPhotos && defaults.minPhotos > 0 ? defaults.minPhotos : base.minPhotos || 1,
    ),
    beforeMeas: requireMeasurement || base.beforeMeas,
    afterMeas: requireMeasurement || base.afterMeas,
    measVerify: requireMeasurement || base.measVerify,
    requireNameplate,
    measFields: measFields.length > 0 ? measFields : base.measFields,
  }
}
