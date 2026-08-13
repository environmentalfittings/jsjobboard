import type { ItpLibraryItemExec, ItpLibraryItemSel } from '../types/itpLibraryPlan'
import {
  DEFAULT_ITP_MEAS_FIELDS,
  type ItpMeasFieldDef,
} from '../types/itpMeasFields'

export type { ItpMeasFieldDef }
export { DEFAULT_ITP_MEAS_FIELDS, newMeasFieldId, normalizeMeasFields } from '../types/itpMeasFields'

/** Requirement defaults stored on a master-catalog (or built-in library) item. */
export type ItpItemRequirementDefaults = {
  requirePicture?: boolean
  pictureLabel?: string
  minPhotos?: number
  requireMeasurement?: boolean
  measFields?: ItpMeasFieldDef[]
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
  return fields.every((f) => getMeasValue(exec, f.id).trim().length > 0)
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
    return 'Fill in all measurement / verification fields before marking done'
  }
  return null
}

/** Copy master-catalog requirement defaults onto a scope selection when including. */
export function selFromRequirementDefaults(
  base: ItpLibraryItemSel,
  defaults: ItpItemRequirementDefaults | null | undefined,
): ItpLibraryItemSel {
  if (!defaults) return base
  const requireMeasurement = Boolean(defaults.requireMeasurement)
  const measFields =
    defaults.measFields && defaults.measFields.length > 0
      ? defaults.measFields.map((f) => ({ ...f }))
      : requireMeasurement
        ? DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f }))
        : base.measFields
  return {
    ...base,
    holdPoint: Boolean(defaults.holdPoint) || base.holdPoint,
    blockNext: Boolean(defaults.blockNext) || base.blockNext,
    requirePicture: Boolean(defaults.requirePicture) || base.requirePicture,
    pictureLabel: (defaults.pictureLabel ?? '').trim() || base.pictureLabel,
    minPhotos: defaults.minPhotos && defaults.minPhotos > 0 ? defaults.minPhotos : base.minPhotos || 1,
    beforeMeas: requireMeasurement || base.beforeMeas,
    afterMeas: requireMeasurement || base.afterMeas,
    measVerify: requireMeasurement || base.measVerify,
    measFields: measFields.length > 0 ? measFields : base.measFields,
  }
}
