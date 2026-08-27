import {
  buildItpDataForSave,
  extractLibraryPlanFromItpData,
  extractProcessPlanFromItpData,
  hasItpInspectionData,
  hasLegacyProcessPlan,
} from './valveItpStorage'
import { notifyQualityTeamItpReviewRequested } from './messages'
import { supabase } from './supabase'
import { applyLibraryTemplateAsync } from './itpLibraryTemplates'
import {
  createEmptyItpLibraryPlan,
  emptyQcReview,
  normalizeItpLibraryPlan,
  valveToLibrarySnapshot,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function loadItpLibraryPlan(valve: Valve): Promise<{
  plan: ItpLibraryPlanPayload
  isNew: boolean
  appliedTemplateName: string | null
  appliedTemplateSource: 'saved' | 'builtin' | null
  hasLegacyInspection: boolean
  hasLegacyProcessPlan: boolean
}> {
  const { data, error } = await supabase
    .from('valve_itp')
    .select('content,itp_data')
    .eq('valve_row_id', valve.id)
    .maybeSingle()

  if (error) throw error

  const fromJsonb = data?.itp_data
  const storedPlan = extractLibraryPlanFromItpData(fromJsonb)
  if (storedPlan) {
    return {
      plan: normalizeItpLibraryPlan({ ...storedPlan, valveSnapshot: valveToLibrarySnapshot(valve) }, valve),
      isNew: false,
      appliedTemplateName: storedPlan.scopeTemplateName ?? null,
      appliedTemplateSource: storedPlan.scopeTemplateName ? 'saved' : null,
      hasLegacyInspection: hasItpInspectionData(fromJsonb, data?.content),
      hasLegacyProcessPlan: hasLegacyProcessPlan(fromJsonb),
    }
  }

  const rawContent = String(data?.content ?? '').trim()
  const fromContent = rawContent ? tryParseJson(rawContent) : null
  const storedFromContent = extractLibraryPlanFromItpData(fromContent)
  if (storedFromContent) {
    return {
      plan: normalizeItpLibraryPlan(
        { ...storedFromContent, valveSnapshot: valveToLibrarySnapshot(valve) },
        valve,
      ),
      isNew: false,
      appliedTemplateName: storedFromContent.scopeTemplateName ?? null,
      appliedTemplateSource: storedFromContent.scopeTemplateName ? 'saved' : null,
      hasLegacyInspection: hasItpInspectionData(fromJsonb ?? fromContent, rawContent),
      hasLegacyProcessPlan: hasLegacyProcessPlan(fromJsonb ?? fromContent),
    }
  }

  const empty = createEmptyItpLibraryPlan(valve)
  const applied = await applyLibraryTemplateAsync(empty, { replaceIncludes: true })
  const plan = {
    ...applied.plan,
    scopeTemplateName: applied.templateName,
  }
  return {
    plan,
    isNew: true,
    appliedTemplateName: applied.templateName,
    appliedTemplateSource: applied.templateSource,
    hasLegacyInspection: hasItpInspectionData(fromJsonb, rawContent),
    hasLegacyProcessPlan: Boolean(extractProcessPlanFromItpData(fromJsonb) || extractProcessPlanFromItpData(fromContent)),
  }
}

export async function saveItpLibraryPlan(
  valve: Valve,
  plan: ItpLibraryPlanPayload,
  options?: {
    notifyQc?: { senderUserId: string; senderName: string }
  },
): Promise<{ plan: ItpLibraryPlanPayload; generatedForReview: boolean; notified: number }> {
  const { data: existing, error: loadError } = await supabase
    .from('valve_itp')
    .select('itp_data')
    .eq('valve_row_id', valve.id)
    .maybeSingle()
  if (loadError) throw loadError

  const hadLibraryPlan = Boolean(extractLibraryPlanFromItpData(existing?.itp_data))
  const now = new Date().toISOString()

  let payload = normalizeItpLibraryPlan(
    {
      ...plan,
      valveSnapshot: valveToLibrarySnapshot(valve),
      updatedAt: now,
    },
    valve,
  )

  const qcReview = { ...(payload.qcReview ?? emptyQcReview()) }
  let generatedForReview = false

  if (!hadLibraryPlan || (!qcReview.generatedAt && qcReview.status === 'draft')) {
    qcReview.status = 'pending_review'
    qcReview.generatedAt = qcReview.generatedAt ?? now
    if (!qcReview.generatedByName && options?.notifyQc) {
      qcReview.generatedByUserId = options.notifyQc.senderUserId
      qcReview.generatedByName = options.notifyQc.senderName.trim() || 'Shop'
    }
    generatedForReview = !hadLibraryPlan || !plan.qcReview?.notifiedAt
  } else if (
    qcReview.generatedAt &&
    !qcReview.generatedByName &&
    options?.notifyQc?.senderName
  ) {
    // Backfill generator on older ITPs the next time the creator saves with notify context.
    qcReview.generatedByUserId = options.notifyQc.senderUserId
    qcReview.generatedByName = options.notifyQc.senderName.trim() || 'Shop'
  }

  payload = { ...payload, qcReview }

  const included = Object.values(payload.sel).filter((s) => s.included).length
  const itp_data = buildItpDataForSave({
    existing: existing?.itp_data,
    libraryPlan: payload,
  })
  const row = {
    valve_row_id: valve.id,
    content: payload.notes.trim() || `ITP library plan for ${valve.valve_id} (${included} items)`,
    itp_data,
  }
  const { error } = await supabase.from('valve_itp').upsert(row, { onConflict: 'valve_row_id' })
  if (error) throw error

  let notified = 0
  if (
    generatedForReview &&
    options?.notifyQc?.senderUserId &&
    !payload.qcReview.notifiedAt
  ) {
    const result = await notifyQualityTeamItpReviewRequested({
      valveRowId: valve.id,
      valveId: valve.valve_id,
      customer: valve.customer,
      senderUserId: options.notifyQc.senderUserId,
      senderName: options.notifyQc.senderName,
    })
    notified = result.notified
    if (!result.error) {
      const withNotify = {
        ...payload,
        qcReview: {
          ...payload.qcReview,
          notifiedAt: now,
          status: 'pending_review' as const,
          generatedByUserId:
            payload.qcReview.generatedByUserId ?? options.notifyQc.senderUserId,
          generatedByName:
            payload.qcReview.generatedByName ??
            (options.notifyQc.senderName.trim() || 'Shop'),
        },
        updatedAt: new Date().toISOString(),
      }
      const notifyData = buildItpDataForSave({
        existing: itp_data,
        libraryPlan: withNotify,
      })
      await supabase.from('valve_itp').upsert(
        {
          valve_row_id: valve.id,
          content: row.content,
          itp_data: notifyData,
        },
        { onConflict: 'valve_row_id' },
      )
      payload = withNotify
    } else if (result.error) {
      // Persist review state even if messaging fails; surface error via throw only for hard failures.
      console.warn(result.error)
    }
  }

  return { plan: payload, generatedForReview, notified }
}
