import {
  allScopeItems,
  getExec,
  isOpenItpFlag,
  type ItpLibraryAttachment,
  type ItpLibraryPlanPayload,
  type ItpLibraryScopeItem,
  type ItpLinkedResourceDoc,
} from '../types/itpLibraryPlan'
import type { ItpMeasFieldDef } from '../types/itpMeasFields'
import {
  getFieldPhotos,
  getMeasValue,
  followUpApplies,
  followUpFieldId,
  followUpLabelOf,
  itemHasTravelerRequirement,
  itemRequiresMeasurements,
  itemRequiresPicture,
  itemRequirementsMet,
  resolvedMeasFields,
} from './itpItemRequirements'
import { itpShopAreaLabel } from '../constants/itpShopAreas'
import { resolveItpItemShopArea } from './itpMasterCatalog'
import {
  isNameplateTravelerStep,
  mergeNameplateMeasFields,
} from './itpTravelerNameplate'
import { isOrderReplacementPartsItem } from './itpOrderParts'

export type ItpTravelerReportStatus = 'pending' | 'complete' | 'flagged' | 'hold'

export type ItpTravelerReportField = {
  id: string
  label: string
  value: string
  type?: string
  photos?: ItpLibraryAttachment[]
}

export type ItpTravelerReportItem = {
  id: string
  name: string
  ref: string
  secId: string
  secTitle: string
  shopArea: string
  shopAreaLabel: string
  status: ItpTravelerReportStatus
  holdPoint: boolean
  requireNameplate: boolean
  done: boolean
  result: string
  techInitials: string
  notes: string
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  maxPhotos: number
  photos: ItpLibraryAttachment[]
  requireMeasurement: boolean
  hasTravelerRequirement: boolean
  fields: ItpTravelerReportField[]
  requirementsMet: boolean
  blockNext: boolean
  resourceDocs: ItpLinkedResourceDoc[]
}

export type ItpTravelerReportSection = {
  secId: string
  secTitle: string
  items: ItpTravelerReportItem[]
}

export type ItpTravelerReportStats = {
  total: number
  complete: number
  pending: number
  flagged: number
  hold: number
  /** @deprecated use complete — kept for older call sites */
  captured: number
}

/** @deprecated All included scope items appear on the traveler now. */
export function isTravelerReportItem(sel: ItpLibraryScopeItem['sel']): boolean {
  return Boolean(sel?.included)
}

export function travelerItemStatus(
  exec: ReturnType<typeof getExec>,
): ItpTravelerReportStatus {
  if (isOpenItpFlag(exec)) return 'flagged'
  if (exec.holdPending && !exec.done) return 'hold'
  if (exec.done) return 'complete'
  return 'pending'
}

export function buildItpTravelerReport(plan: ItpLibraryPlanPayload): {
  sections: ItpTravelerReportSection[]
  stats: ItpTravelerReportStats
} {
  const rows: ItpTravelerReportItem[] = []
  for (const item of allScopeItems(plan)) {
    const exec = getExec(plan, item.id)
    const isNameplate = isNameplateTravelerStep({
      id: item.id,
      name: item.name,
      ref: item.ref,
      requireNameplate: item.sel.requireNameplate,
    })
    const measDefs: ItpMeasFieldDef[] = isNameplate
      ? mergeNameplateMeasFields(resolvedMeasFields(item.sel))
      : resolvedMeasFields(item.sel)
    const requirePicture = itemRequiresPicture(item.sel)
    const requireMeasurement = itemRequiresMeasurements(item.sel) || isNameplate
    const isOrderParts = isOrderReplacementPartsItem(item.id)
    const hasTravelerRequirement =
      itemHasTravelerRequirement(item.sel) || isNameplate || isOrderParts
    const shopArea = resolveItpItemShopArea(item.sel.shopArea, item.secId)
    const notes = String(exec.notes ?? '').trim()
    rows.push({
      id: item.id,
      name: item.name,
      ref: item.ref,
      secId: item.secId,
      secTitle: item.secTitle,
      shopArea,
      shopAreaLabel: shopArea ? itpShopAreaLabel(shopArea) : '',
      status: travelerItemStatus(exec),
      holdPoint: Boolean(item.sel.holdPoint),
      requireNameplate: isNameplate,
      done: Boolean(exec.done),
      result: String(exec.result ?? '').trim(),
      techInitials: String(exec.techInitials ?? '').trim(),
      notes,
      requirePicture,
      pictureLabel: item.sel.pictureLabel.trim() || 'Photos',
      minPhotos: Math.max(1, item.sel.minPhotos || 1),
      maxPhotos: Math.max(1, item.sel.maxPhotos || 4),
      photos: [...(exec.photos ?? [])],
      requireMeasurement,
      hasTravelerRequirement,
      blockNext: Boolean(item.sel.blockNext),
      fields: measDefs.flatMap((field) => {
        const value = getMeasValue(exec, field.id).trim()
        const rows: ItpTravelerReportField[] = [
          {
            id: field.id,
            label: field.label,
            value,
            type: field.type,
            photos: field.type === 'picture' ? getFieldPhotos(exec, field.id) : undefined,
          },
        ]
        const followUpValue = getMeasValue(exec, followUpFieldId(field.id)).trim()
        if (followUpApplies(field, value) || followUpValue) {
          rows.push({
            id: followUpFieldId(field.id),
            label: followUpLabelOf(field),
            value: followUpValue,
            type: field.followUpLookupCategory ? 'dropdown' : 'text',
          })
        }
        return rows
      }),
      requirementsMet: isOrderParts
        ? true
        : itemRequirementsMet(
            isNameplate ? { ...item.sel, measFields: measDefs } : item.sel,
            exec,
          ),
      resourceDocs: [...(item.sel.resourceDocs ?? [])],
    })
  }

  const sections: ItpTravelerReportSection[] = []
  for (const row of rows) {
    const last = sections[sections.length - 1]
    if (last && last.secId === row.secId) {
      last.items.push(row)
    } else {
      sections.push({ secId: row.secId, secTitle: row.secTitle, items: [row] })
    }
  }

  const complete = rows.filter((r) => r.status === 'complete').length
  const flagged = rows.filter((r) => r.status === 'flagged').length
  const hold = rows.filter((r) => r.status === 'hold').length
  return {
    sections,
    stats: {
      total: rows.length,
      complete,
      pending: rows.length - complete - flagged - hold,
      flagged,
      hold,
      captured: complete,
    },
  }
}

export function formatItpTravelerCaptureSummary(stats: ItpTravelerReportStats): string {
  if (stats.total === 0) return 'No traveler steps'
  const parts = [`${stats.complete} / ${stats.total} complete`]
  if (stats.hold > 0) parts.push(`${stats.hold} hold`)
  if (stats.flagged > 0) parts.push(`${stats.flagged} flagged`)
  return parts.join(' · ')
}

export function findTravelerReportItem(
  sections: ItpTravelerReportSection[],
  itemId: string,
): ItpTravelerReportItem | null {
  for (const section of sections) {
    const found = section.items.find((item) => item.id === itemId)
    if (found) return found
  }
  return null
}

export function collectTravelerPhotos(
  sections: ItpTravelerReportSection[],
): Array<{ itemName: string; pictureLabel: string; photo: ItpLibraryAttachment }> {
  const out: Array<{ itemName: string; pictureLabel: string; photo: ItpLibraryAttachment }> = []
  for (const section of sections) {
    for (const item of section.items) {
      for (const photo of item.photos) {
        out.push({
          itemName: item.name,
          pictureLabel: item.pictureLabel,
          photo,
        })
      }
    }
  }
  return out
}
