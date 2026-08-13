import {
  allScopeItems,
  getExec,
  type ItpLibraryAttachment,
  type ItpLibraryPlanPayload,
  type ItpLibraryScopeItem,
} from '../types/itpLibraryPlan'
import type { ItpMeasFieldDef } from '../types/itpMeasFields'
import {
  getMeasValue,
  itemRequiresMeasurements,
  itemRequiresPicture,
  itemRequirementsMet,
  resolvedMeasFields,
} from './itpItemRequirements'

export type ItpTravelerReportStatus = 'captured' | 'pending'

export type ItpTravelerReportField = {
  id: string
  label: string
  value: string
}

export type ItpTravelerReportItem = {
  id: string
  name: string
  ref: string
  secId: string
  secTitle: string
  status: ItpTravelerReportStatus
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  photos: ItpLibraryAttachment[]
  requireMeasurement: boolean
  fields: ItpTravelerReportField[]
}

export type ItpTravelerReportSection = {
  secId: string
  secTitle: string
  items: ItpTravelerReportItem[]
}

export type ItpTravelerReportStats = {
  total: number
  captured: number
  pending: number
}

/** True when this Build Scope line should appear on the compiled View Traveler. */
export function isTravelerReportItem(sel: ItpLibraryScopeItem['sel']): boolean {
  return itemRequiresPicture(sel) || itemRequiresMeasurements(sel)
}

export function buildItpTravelerReport(plan: ItpLibraryPlanPayload): {
  sections: ItpTravelerReportSection[]
  stats: ItpTravelerReportStats
} {
  const rows: ItpTravelerReportItem[] = []
  for (const item of allScopeItems(plan)) {
    if (!isTravelerReportItem(item.sel)) continue
    const exec = getExec(plan, item.id)
    const measDefs: ItpMeasFieldDef[] = resolvedMeasFields(item.sel)
    const requirePicture = itemRequiresPicture(item.sel)
    const requireMeasurement = itemRequiresMeasurements(item.sel)
    const captured = itemRequirementsMet(item.sel, exec)
    rows.push({
      id: item.id,
      name: item.name,
      ref: item.ref,
      secId: item.secId,
      secTitle: item.secTitle,
      status: captured ? 'captured' : 'pending',
      requirePicture,
      pictureLabel: item.sel.pictureLabel.trim() || 'Photos',
      minPhotos: Math.max(1, item.sel.minPhotos || 1),
      photos: [...(exec.photos ?? [])],
      requireMeasurement,
      fields: measDefs.map((field) => ({
        id: field.id,
        label: field.label,
        value: getMeasValue(exec, field.id).trim(),
      })),
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

  const captured = rows.filter((r) => r.status === 'captured').length
  return {
    sections,
    stats: {
      total: rows.length,
      captured,
      pending: rows.length - captured,
    },
  }
}

export function formatItpTravelerCaptureSummary(stats: ItpTravelerReportStats): string {
  if (stats.total === 0) return 'No traveler items'
  return `${stats.captured} / ${stats.total} item${stats.total === 1 ? '' : 's'} captured`
}
