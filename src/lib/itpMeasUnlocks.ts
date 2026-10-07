import { findLibraryItem } from '../constants/itpLibrary'
import { processSectionTitle } from '../constants/itpProcessSections'
import { itpShopAreaLabel } from '../constants/itpShopAreas'
import {
  emptyItemExec,
  emptyItemSel,
  getExec,
  getSel,
  type ItpLibraryItemExec,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import {
  emptyMeasField,
  type ItpMeasFieldDef,
} from '../types/itpMeasFields'
import { REPAIR_NEEDED_LOOKUP_CATEGORY } from '../constants/lookupCategories'

function isSkipUnlockValue(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[./]/g, '')
  return normalized === 'na' || normalized === 'n a' || normalized === 'not applicable'
}

export type ItpUnlockCandidate = {
  id: string
  name: string
  secId: string
  secTitle: string
  shopAreaLabel: string
}

export const REPAIR_NEEDED_FIELD_LABEL = 'Repair needed'

export function looksLikeBodyBodyBore(name: string): boolean {
  const text = String(name ?? '').trim().toLowerCase()
  if (!text) return false
  return /body[\s/\-]*body[\s/\-]*bore/.test(text) || /^body[\s/\-]*bore\b/.test(text)
}

export function ensureRepairNeededDropdown(
  fields: ItpMeasFieldDef[],
  itemName: string,
): ItpMeasFieldDef[] {
  if (!looksLikeBodyBodyBore(itemName)) return fields
  if (fields.some((field) => field.type === 'dropdown' && /repair/i.test(field.label))) {
    return fields
  }
  return [
    emptyMeasField({
      label: REPAIR_NEEDED_FIELD_LABEL,
      type: 'dropdown',
      options: [],
      required: true,
      optionSource: 'lookup',
      lookupCategory: REPAIR_NEEDED_LOOKUP_CATEGORY,
    }),
    ...fields,
  ]
}

export function collectUnlockItemIdsFromFields(fields: ItpMeasFieldDef[] | undefined): string[] {
  const ids = new Set<string>()
  for (const field of fields ?? []) {
    const map = field.unlockItemIdsByOption
    if (!map) continue
    for (const list of Object.values(map)) {
      for (const id of list) {
        const trimmed = String(id ?? '').trim()
        if (trimmed) ids.add(trimmed)
      }
    }
  }
  return [...ids]
}

export function collectUnlockItemIdsFromSels(
  sel: Record<string, ItpLibraryItemSel> | undefined,
): string[] {
  const ids = new Set<string>()
  for (const item of Object.values(sel ?? {})) {
    for (const id of collectUnlockItemIdsFromFields(item.measFields)) ids.add(id)
  }
  return [...ids]
}

export function unlockItemIdsForValue(
  field: Pick<ItpMeasFieldDef, 'unlockItemIdsByOption'>,
  value: string | null | undefined,
): string[] {
  const selected = String(value ?? '').trim()
  if (!selected || isSkipUnlockValue(selected)) return []
  const map = field.unlockItemIdsByOption
  if (!map) return []
  const hit = Object.entries(map).find(
    ([label]) => label.trim().toLowerCase() === selected.toLowerCase(),
  )
  return hit ? [...hit[1]] : []
}

export function fieldHasUnlockRoutes(field: Pick<ItpMeasFieldDef, 'type' | 'unlockItemIdsByOption'>): boolean {
  return field.type === 'dropdown' && Boolean(field.unlockItemIdsByOption && Object.keys(field.unlockItemIdsByOption).length)
}

function measValue(exec: { measValues?: Record<string, string>; beforeVal?: string; afterVal?: string; verifyVal?: string }, fieldId: string): string {
  const values = exec.measValues ?? {}
  if (values[fieldId] != null && values[fieldId] !== '') return String(values[fieldId])
  if (fieldId === 'before') return String(exec.beforeVal ?? '')
  if (fieldId === 'after') return String(exec.afterVal ?? '')
  if (fieldId === 'verify') return String(exec.verifyVal ?? '')
  return ''
}

function describeUnlockItem(
  plan: ItpLibraryPlanPayload,
  itemId: string,
): ItpUnlockCandidate {
  const custom = plan.custom.find((row) => row.id === itemId)
  const lib = findLibraryItem(itemId)
  const sel = getSel(plan, itemId)
  const name = custom?.name || lib?.item.name || itemId
  const secId = sel.sectionId.trim() || custom?.secId || lib?.section.id || 'receipt'
  return {
    id: itemId,
    name,
    secId,
    secTitle: processSectionTitle(secId),
    shopAreaLabel: itpShopAreaLabel(sel.shopArea),
  }
}

export function describeUnlockItemsForValue(
  plan: ItpLibraryPlanPayload,
  field: ItpMeasFieldDef,
  value: string,
): ItpUnlockCandidate[] {
  return unlockItemIdsForValue(field, value).map((id) => describeUnlockItem(plan, id))
}

export function applyMeasUnlocksToPlan(
  plan: ItpLibraryPlanPayload,
  args: {
    sourceItemId: string
    fields: ItpMeasFieldDef[]
    prevExec: { measValues?: Record<string, string>; beforeVal?: string; afterVal?: string; verifyVal?: string }
    nextExec: { measValues?: Record<string, string>; beforeVal?: string; afterVal?: string; verifyVal?: string }
  },
): ItpLibraryPlanPayload {
  const sourceId = args.sourceItemId.trim()
  if (!sourceId) return plan
  let sel = plan.sel
  let changed = false

  for (const field of args.fields) {
    if (field.type !== 'dropdown') continue
    const prevIds = unlockItemIdsForValue(field, measValue(args.prevExec, field.id))
    const nextIds = unlockItemIdsForValue(field, measValue(args.nextExec, field.id))
    if (prevIds.length === 0 && nextIds.length === 0) continue

    const nextSet = new Set(nextIds)
    const dropIds = prevIds.filter((id) => id !== sourceId && !nextSet.has(id))

    if (dropIds.length > 0) {
      if (!changed) sel = { ...sel }
      changed = true
      for (const id of dropIds) {
        const current = sel[id] ?? emptyItemSel()
        if (!current.included) continue
        const exec = getExec(plan, id) ?? emptyItemExec()
        if (exec.done || exec.flagged || exec.holdPending) continue
        sel[id] = { ...current, included: false }
      }
    }

    if (nextIds.length > 0) {
      if (!changed) sel = { ...sel }
      changed = true
      for (const id of nextIds) {
        if (id === sourceId) continue
        const current = sel[id] ?? emptyItemSel()
        sel[id] = { ...current, included: true }
      }
    }
  }

  return changed ? { ...plan, sel } : plan
}

export function applyTravelerStepUnlocks(
  plan: ItpLibraryPlanPayload,
  itemId: string,
  next: { sel: ItpLibraryItemSel; exec: ItpLibraryItemExec },
): ItpLibraryPlanPayload {
  const withStep: ItpLibraryPlanPayload = {
    ...plan,
    sel: { ...plan.sel, [itemId]: next.sel },
    exec: { ...plan.exec, [itemId]: next.exec },
  }
  return applyMeasUnlocksToPlan(withStep, {
    sourceItemId: itemId,
    fields: next.sel.measFields,
    prevExec: getExec(plan, itemId),
    nextExec: next.exec,
  })
}
