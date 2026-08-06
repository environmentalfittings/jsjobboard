import {
  findLibraryItem,
  getTemplateKey,
  ITP_LIBRARY_TEMPLATES,
  type ItpLibraryJobType,
} from '../constants/itpLibrary'
import {
  emptyItemSel,
  type ItpLibraryCustomItem,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import { supabase } from './supabase'

export type ItpLibraryTemplateScope = {
  sel: Record<string, ItpLibraryItemSel>
  custom: ItpLibraryCustomItem[]
}

export type ItpLibraryTemplateRow = {
  id: number
  job_type: string
  valve_type: string
  scope: ItpLibraryTemplateScope
  updated_at: string
}

function normalizeSel(raw: unknown): ItpLibraryItemSel {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ItpLibraryItemSel>
  return {
    included: Boolean(o.included),
    holdPoint: Boolean(o.holdPoint),
    beforeMeas: Boolean(o.beforeMeas),
    afterMeas: Boolean(o.afterMeas),
    measVerify: Boolean(o.measVerify),
    subReqs: Array.isArray(o.subReqs) ? o.subReqs.map((s) => String(s)) : [],
    notes: String(o.notes ?? ''),
  }
}

export function emptyTemplateScope(): ItpLibraryTemplateScope {
  return { sel: {}, custom: [] }
}

export function normalizeTemplateScope(raw: unknown): ItpLibraryTemplateScope {
  const o = (raw && typeof raw === 'object' ? raw : {}) as {
    sel?: Record<string, unknown>
    custom?: unknown[]
  }
  const sel: Record<string, ItpLibraryItemSel> = {}
  if (o.sel && typeof o.sel === 'object') {
    for (const [id, value] of Object.entries(o.sel)) {
      sel[id] = normalizeSel(value)
    }
  }
  const custom: ItpLibraryCustomItem[] = []
  if (Array.isArray(o.custom)) {
    for (const row of o.custom) {
      if (!row || typeof row !== 'object') continue
      const c = row as Partial<ItpLibraryCustomItem>
      const id = String(c.id ?? '').trim()
      const secId = String(c.secId ?? '').trim()
      const name = String(c.name ?? '').trim()
      if (!id || !secId || !name) continue
      custom.push({
        id,
        secId: secId as ItpLibraryCustomItem['secId'],
        name,
      })
    }
  }
  return { sel, custom }
}

/** Compact scope for storage — only included (or configured) items. */
export function compactTemplateScope(scope: ItpLibraryTemplateScope): ItpLibraryTemplateScope {
  const sel: Record<string, ItpLibraryItemSel> = {}
  for (const [id, value] of Object.entries(scope.sel)) {
    if (
      value.included ||
      value.holdPoint ||
      value.beforeMeas ||
      value.afterMeas ||
      value.measVerify ||
      value.subReqs.length > 0 ||
      value.notes.trim()
    ) {
      sel[id] = value
    }
  }
  return {
    sel,
    custom: scope.custom.filter((c) => c.name.trim()),
  }
}

export function countIncludedInScope(scope: ItpLibraryTemplateScope): number {
  const includedIds = new Set(
    Object.entries(scope.sel)
      .filter(([, v]) => v.included)
      .map(([id]) => id),
  )
  for (const custom of scope.custom) {
    if (scope.sel[custom.id]?.included !== false) includedIds.add(custom.id)
  }
  return includedIds.size
}

export async function listItpLibraryTemplates(): Promise<ItpLibraryTemplateRow[]> {
  const { data, error } = await supabase
    .from('itp_library_templates')
    .select('id,job_type,valve_type,scope,updated_at')
    .order('job_type', { ascending: true })
    .order('valve_type', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    job_type: String(row.job_type ?? ''),
    valve_type: String(row.valve_type ?? ''),
    scope: normalizeTemplateScope(row.scope),
    updated_at: String(row.updated_at ?? ''),
  }))
}

export async function loadItpLibraryTemplate(
  jobType: ItpLibraryJobType | string,
  valveType: string,
): Promise<ItpLibraryTemplateRow | null> {
  const jt = String(jobType ?? '').trim()
  const vt = String(valveType ?? '').trim()
  if (!jt || !vt) return null
  const { data, error } = await supabase
    .from('itp_library_templates')
    .select('id,job_type,valve_type,scope,updated_at')
    .eq('job_type', jt)
    .eq('valve_type', vt)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: Number(data.id),
    job_type: String(data.job_type ?? ''),
    valve_type: String(data.valve_type ?? ''),
    scope: normalizeTemplateScope(data.scope),
    updated_at: String(data.updated_at ?? ''),
  }
}

export async function saveItpLibraryTemplate(
  jobType: ItpLibraryJobType | string,
  valveType: string,
  scope: ItpLibraryTemplateScope,
): Promise<ItpLibraryTemplateRow> {
  const jt = String(jobType ?? '').trim()
  const vt = String(valveType ?? '').trim()
  if (!jt) throw new Error('Job type is required')
  if (!vt) throw new Error('Valve type is required')
  const payload = {
    job_type: jt,
    valve_type: vt,
    scope: compactTemplateScope(scope),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('itp_library_templates')
    .upsert(payload, { onConflict: 'job_type,valve_type' })
    .select('id,job_type,valve_type,scope,updated_at')
    .single()
  if (error) throw error
  return {
    id: Number(data.id),
    job_type: String(data.job_type ?? ''),
    valve_type: String(data.valve_type ?? ''),
    scope: normalizeTemplateScope(data.scope),
    updated_at: String(data.updated_at ?? ''),
  }
}

export async function deleteItpLibraryTemplate(jobType: string, valveType: string): Promise<void> {
  const { error } = await supabase
    .from('itp_library_templates')
    .delete()
    .eq('job_type', jobType)
    .eq('valve_type', valveType)
  if (error) throw error
}

/** Seed scope from hardcoded family templates (included only). */
export function scopeFromCodeTemplate(
  jobType: ItpLibraryJobType,
  valveType: string,
): ItpLibraryTemplateScope {
  const key = getTemplateKey(jobType, valveType)
  const ids = ITP_LIBRARY_TEMPLATES[key] ?? []
  const sel: Record<string, ItpLibraryItemSel> = {}
  for (const itemId of ids) {
    const found = findLibraryItem(itemId)
    sel[itemId] = {
      ...emptyItemSel(),
      included: true,
      subReqs: found?.item.defaultSubReqs ? [...found.item.defaultSubReqs] : [],
    }
  }
  return { sel, custom: [] }
}

export function applyScopeToPlan(
  plan: ItpLibraryPlanPayload,
  scope: ItpLibraryTemplateScope,
  options?: { replaceIncludes?: boolean },
): ItpLibraryPlanPayload {
  const replace = Boolean(options?.replaceIncludes)
  const sel = { ...plan.sel }

  if (replace) {
    for (const [id, prev] of Object.entries(sel)) {
      sel[id] = { ...prev, included: false }
    }
  }

  for (const [itemId, templateSel] of Object.entries(scope.sel)) {
    const prev = sel[itemId] ?? emptyItemSel()
    const found = findLibraryItem(itemId)
    const subReqs =
      templateSel.subReqs.length > 0
        ? [...templateSel.subReqs]
        : prev.subReqs.length > 0
          ? prev.subReqs
          : found?.item.defaultSubReqs
            ? [...found.item.defaultSubReqs]
            : []
    if (replace) {
      sel[itemId] = {
        ...emptyItemSel(),
        ...templateSel,
        subReqs,
      }
    } else {
      sel[itemId] = {
        ...prev,
        included: templateSel.included || prev.included,
        holdPoint: templateSel.holdPoint || prev.holdPoint,
        beforeMeas: templateSel.beforeMeas || prev.beforeMeas,
        afterMeas: templateSel.afterMeas || prev.afterMeas,
        measVerify: templateSel.measVerify || prev.measVerify,
        subReqs,
        notes: templateSel.notes.trim() || prev.notes,
      }
    }
  }

  const existingCustomIds = new Set(plan.custom.map((c) => c.id))
  const custom = [...plan.custom]
  for (const row of scope.custom) {
    if (!existingCustomIds.has(row.id)) {
      custom.push(row)
      existingCustomIds.add(row.id)
    }
    const fromTemplate = scope.sel[row.id]
    const prev = sel[row.id] ?? emptyItemSel()
    sel[row.id] = replace
      ? { ...emptyItemSel(), ...(fromTemplate ?? { included: true }) }
      : {
          ...prev,
          ...(fromTemplate ?? {}),
          included: fromTemplate?.included ?? true,
        }
  }

  return { ...plan, sel, custom }
}

export async function applyLibraryTemplateAsync(
  plan: ItpLibraryPlanPayload,
  options?: { replaceIncludes?: boolean },
): Promise<ItpLibraryPlanPayload> {
  try {
    const stored = await loadItpLibraryTemplate(plan.jobType, plan.valveType)
    if (stored && countIncludedInScope(stored.scope) > 0) {
      return applyScopeToPlan(plan, stored.scope, options)
    }
  } catch {
    // Table may not exist yet — fall back to code templates.
  }

  const codeScope = scopeFromCodeTemplate(plan.jobType, plan.valveType)
  return applyScopeToPlan(plan, codeScope, options)
}
