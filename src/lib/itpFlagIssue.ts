import { notifyQualityTeamItpItemFlagged } from './messages'
import type { ItpLibraryAttachment, ItpLibraryItemExec } from '../types/itpLibraryPlan'

export type RaiseItpItemFlagInput = {
  currentExec: ItpLibraryItemExec
  reason: string
  photos: ItpLibraryAttachment[]
  actor: { userId: string; name: string }
  itemName: string
  valveRowId: number
  valveId: string
  customer: string | null
  /** Persist the flagged exec (plan save / step save). Throw on failure. */
  save: (nextExec: ItpLibraryItemExec) => Promise<void>
}

/** Build the open-flag exec fields shared by ITP checklist, traveler lines, and step modal. */
export function buildOpenItpFlagExec(
  current: ItpLibraryItemExec,
  input: { reason: string; photos: ItpLibraryAttachment[] },
  actor: { userId: string; name: string },
  at: string = new Date().toISOString(),
): ItpLibraryItemExec {
  return {
    ...current,
    flagged: true,
    flagReason: input.reason,
    flagPhotos: input.photos.slice(0, 3),
    flaggedAt: at,
    flaggedByUserId: actor.userId,
    flaggedByName: actor.name,
    // Always start a fresh open ticket (do not keep a prior resolution).
    flagOwnerEmployeeId: null,
    flagOwnerUserId: null,
    flagOwnerName: null,
    flagResolution: '',
    flagResolvedAt: null,
    flagResolvedByUserId: null,
    flagResolvedByName: null,
    flagClearReason: '',
    flagClearedAt: null,
    flagClearedByUserId: null,
    flagClearedByName: null,
  }
}

/**
 * Save a flagged ITP item and notify Quality Team the same way the checklist flag path does.
 * Call from ItpLibraryEditor, ItpTravelerViewPage, and ItpTravelerStepModal.
 */
export async function raiseItpItemFlag(
  options: RaiseItpItemFlagInput,
): Promise<{ toast: string; notified: number; error: string | null }> {
  const nextExec = buildOpenItpFlagExec(
    options.currentExec,
    { reason: options.reason, photos: options.photos },
    options.actor,
  )
  await options.save(nextExec)

  const { notified, error } = await notifyQualityTeamItpItemFlagged({
    valveRowId: options.valveRowId,
    valveId: options.valveId,
    customer: options.customer,
    itemName: options.itemName,
    flagReason: options.reason,
    photoCount: options.photos.length,
    senderUserId: options.actor.userId,
    senderName: options.actor.name,
  })

  window.dispatchEvent(new Event('jsjb-inbox-refresh'))

  if (error) {
    return {
      toast: `Item flagged, but notify failed: ${error}`,
      notified,
      error,
    }
  }
  return {
    toast:
      notified > 0
        ? `Item flagged — Quality Team notified (${notified})`
        : 'Item flagged — no Quality Team logins to notify',
    notified,
    error: null,
  }
}
