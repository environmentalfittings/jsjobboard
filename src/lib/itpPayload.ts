import type { ItpItemState, ItpPayload } from '../types/itp'
import { ITP_SCHEMA_VERSION } from '../types/itp'
import {
  createEmptyPayloadForTemplate,
  DEFAULT_ITP_TEMPLATE_ID,
  normalizeTemplateId,
} from '../constants/itpTemplates'
import { emptyFlangeFaceState, emptyItemState } from './itpDefaultState'
import {
  aggregateTwinsealFlangesStatus,
  isBodyFlangesItpItem,
  twinsealFlangesIsFlagged,
  twinsealFlangesProgressTicks,
} from './itpTwinsealFlanges'

export function createDefaultItpPayload(templateId?: string) {
  return createEmptyPayloadForTemplate(templateId ?? DEFAULT_ITP_TEMPLATE_ID)
}

function tryParsePayloadFromContent(raw: string): Partial<ItpPayload> | null {
  const t = raw.trim()
  if (!t.startsWith('{')) return null
  try {
    const o = JSON.parse(t) as Partial<ItpPayload>
    if (o.v === ITP_SCHEMA_VERSION && Array.isArray(o.tabs)) return o
  } catch {
    /* not JSON */
  }
  return null
}

/** Migrate removed options and ensure newer fields exist on merged rows. */
function normalizeMergedItemData(d: ItpItemState): void {
  if (d.condition === 'Strip & Recoat') {
    d.condition = 'Other'
    if (!d.conditionOther?.trim()) d.conditionOther = 'Strip & Recoat'
  }
  if (typeof d.facingTypeOther !== 'string') d.facingTypeOther = ''
  if (typeof d.conditionOther !== 'string') d.conditionOther = ''
  if (typeof d.repairActionOther !== 'string') d.repairActionOther = ''
  if (typeof d.valvePortConfigOther !== 'string') d.valvePortConfigOther = ''
  for (const k of ['flangeB', 'flangeC', 'flangeD'] as const) {
    const f = d[k]
    if (f.condition === 'Strip & Recoat') {
      f.condition = 'Other'
      if (!f.conditionOther?.trim()) f.conditionOther = 'Strip & Recoat'
    }
    if (typeof f.facingTypeOther !== 'string') f.facingTypeOther = ''
    if (typeof f.conditionOther !== 'string') f.conditionOther = ''
    if (typeof f.repairActionOther !== 'string') f.repairActionOther = ''
  }
}

function applyV2SourceToBase(base: ItpPayload, s: Partial<ItpPayload>, plainTextFallback: string): ItpPayload {
  if (s.v !== ITP_SCHEMA_VERSION || !Array.isArray(s.tabs)) {
    if (plainTextFallback) base.generalNotes = plainTextFallback
    return base
  }

  if (typeof s.generalNotes === 'string' && s.generalNotes.trim()) base.generalNotes = s.generalNotes
  else if (plainTextFallback) base.generalNotes = plainTextFallback

  for (const tab of base.tabs) {
    const st = s.tabs.find((t) => t && t.id === tab.id)
    if (!st || !Array.isArray(st.items)) continue
    for (const item of tab.items) {
      const si = st.items.find((i) => i && i.id === item.id)
      if (si?.data && typeof si.data === 'object') {
        const raw = si.data as Partial<ItpItemState>
        const fb = emptyFlangeFaceState()
        item.data = {
          ...emptyItemState(),
          ...raw,
          flangeB: { ...fb, ...raw.flangeB },
          flangeC: { ...fb, ...raw.flangeC },
          flangeD: { ...fb, ...raw.flangeD },
        }
        normalizeMergedItemData(item.data)
      }
    }
  }
  return base
}

/**
 * @param templateId Bowl-type template used for tab structure (from valve.bowl_type / defaults).
 */
export function mergeItpPayload(
  stored: unknown,
  legacyContent: string,
  templateId: string = DEFAULT_ITP_TEMPLATE_ID,
): ItpPayload {
  const tid = normalizeTemplateId(templateId)
  const notes = legacyContent?.trim() ?? ''

  const fromContentJson = tryParsePayloadFromContent(notes)
  if (fromContentJson) {
    const base = createEmptyPayloadForTemplate(tid)
    const merged = applyV2SourceToBase(base, fromContentJson, '')
    merged.templateId = tid
    return merged
  }

  const base = createEmptyPayloadForTemplate(tid)
  if (!stored || typeof stored !== 'object') {
    if (notes) base.generalNotes = notes
    return base
  }

  const merged = applyV2SourceToBase(base, stored as Partial<ItpPayload>, notes)
  merged.templateId = tid
  return merged
}

export function countFlaggedItems(payload: ItpPayload): number {
  let n = 0
  for (const tab of payload.tabs) {
    for (const item of tab.items) {
      if (isBodyFlangesItpItem(tab.id, item)) {
        if (twinsealFlangesIsFlagged(item.data)) n += 1
        continue
      }
      const c = item.data.condition.trim()
      if (c && c !== 'Acceptable') n += 1
    }
  }
  return n
}

export type ItpItemInspectionStatus = 'pending' | 'acceptable' | 'attention'

export function itemInspectionStatus(
  data: ItpItemState,
  options?: { aggregateBodyFlanges?: boolean; twinsealBodyFlanges?: boolean },
): ItpItemInspectionStatus {
  if (options?.aggregateBodyFlanges || options?.twinsealBodyFlanges) {
    return aggregateTwinsealFlangesStatus(data)
  }
  const c = data.condition.trim()
  if (!c) return 'pending'
  if (c === 'Acceptable') return 'acceptable'
  return 'attention'
}

export function computeItpProgress(payload: ItpPayload) {
  let total = 0
  let inspected = 0
  let acceptable = 0
  let needRepair = 0
  for (const tab of payload.tabs) {
    for (const item of tab.items) {
      total++
      if (isBodyFlangesItpItem(tab.id, item)) {
        const t = twinsealFlangesProgressTicks(item.data)
        if (t.inspected) {
          inspected++
          if (t.acceptable) acceptable++
          if (t.needRepair) needRepair++
        }
        continue
      }
      const c = item.data.condition.trim()
      if (c) {
        inspected++
        if (c === 'Acceptable') acceptable++
        else needRepair++
      }
    }
  }
  const remaining = Math.max(0, total - inspected)
  const pct = total ? Math.round((inspected / total) * 100) : 0
  return { total, inspected, acceptable, needRepair, remaining, pct }
}
