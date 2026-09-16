import {
  allScopeItems,
  getExec,
  isOpenItpFlag,
  type ItpLibraryAttachment,
  type ItpLibraryPlanPayload,
  type ItpLibraryScopeItem,
} from '../types/itpLibraryPlan'
import type { ItpMeasFieldDef } from '../types/itpMeasFields'
import {
  getFieldPhotos,
  getMeasValue,
  itemRequiresMeasurements,
  itemRequiresPicture,
  itemRequirementsMet,
  resolvedMeasFields,
} from './itpItemRequirements'
import { itpShopAreaLabel } from '../constants/itpShopAreas'
import {
  isNameplateTravelerStep,
  mergeNameplateMeasFields,
} from './itpTravelerNameplate'

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
  photos: ItpLibraryAttachment[]
  requireMeasurement: boolean
  fields: ItpTravelerReportField[]
  requirementsMet: boolean
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
    const shopArea = String(item.sel.shopArea ?? '').trim()
    const notes = (item.sel.notes || exec.notes || '').trim()
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
      photos: [...(exec.photos ?? [])],
      requireMeasurement,
      fields: measDefs.map((field) => ({
        id: field.id,
        label: field.label,
        value: getMeasValue(exec, field.id).trim(),
        type: field.type,
        photos: field.type === 'picture' ? getFieldPhotos(exec, field.id) : undefined,
      })),
      requirementsMet: itemRequirementsMet(
        isNameplate ? { ...item.sel, measFields: measDefs } : item.sel,
        exec,
      ),
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
