import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import {
  deleteJobNeededPart,
  insertJobNeededPart,
  listJobNeededPartsForValve,
  upsertJobNeededPartByItemId,
  type JobNeededPart,
  type JobNeededPartDraft,
} from '../lib/jobNeededParts'

export type NeedPartStep = { id: string; name: string }

export function useJobNeededParts(valveRowId: number | null) {
  const { showToast } = useToast()
  const { user, username } = useAuth()
  const [rows, setRows] = useState<JobNeededPart[]>([])
  const [saving, setSaving] = useState(false)
  const [needPartItem, setNeedPartItem] = useState<NeedPartStep | null>(null)

  const reload = useCallback(async () => {
    if (valveRowId == null || !Number.isFinite(valveRowId) || valveRowId <= 0) {
      setRows([])
      return
    }
    const result = await listJobNeededPartsForValve(valveRowId)
    if (result.error) showToast(result.error)
    setRows(result.rows)
  }, [showToast, valveRowId])

  useEffect(() => {
    void reload()
  }, [reload])

  const addPart = async (draft: JobNeededPartDraft): Promise<boolean> => {
    if (valveRowId == null || valveRowId <= 0) {
      showToast('Open a job traveler to add parts')
      return false
    }
    setSaving(true)
    const result = await insertJobNeededPart({
      valveRowId,
      draft: {
        ...draft,
        itpItemId: draft.itpItemId || needPartItem?.id,
        itpItemName: draft.itpItemName || needPartItem?.name,
      },
      requestedByName: username?.trim() || user?.email || '',
      requestedByUserId: user?.id ?? null,
    })
    setSaving(false)
    if (result.error || !result.row) {
      showToast(result.error || 'Could not add that part')
      return false
    }
    setRows((prev) => [...prev, result.row!])
    showToast('Added to needs parts')
    return true
  }

  const upsertPart = async (draft: JobNeededPartDraft): Promise<boolean> => {
    if (valveRowId == null || valveRowId <= 0) {
      showToast('Open a job traveler to add parts')
      return false
    }
    setSaving(true)
    const result = await upsertJobNeededPartByItemId({
      valveRowId,
      draft: {
        ...draft,
        itpItemId: draft.itpItemId || needPartItem?.id,
        itpItemName: draft.itpItemName || needPartItem?.name,
      },
      requestedByName: username?.trim() || user?.email || '',
      requestedByUserId: user?.id ?? null,
    })
    setSaving(false)
    if (result.error || !result.row) {
      showToast(result.error || 'Could not save that part')
      return false
    }
    setRows((prev) => {
      const without = prev.filter((row) => row.id !== result.row!.id)
      return [...without, result.row!]
    })
    showToast('Saved to needs parts')
    return true
  }

  const removePart = async (id: string) => {
    setSaving(true)
    const result = await deleteJobNeededPart(id)
    setSaving(false)
    if (result.error) {
      showToast(result.error)
      return
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  return {
    rows,
    saving,
    needPartItem,
    setNeedPartItem,
    addPart,
    upsertPart,
    removePart,
  }
}
