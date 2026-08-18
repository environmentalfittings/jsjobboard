import {
  findLibraryItem,
  getTemplateKey,
  ITP_LIBRARY_TEMPLATES,
  type ItpLibraryJobType,
} from '../constants/itpLibrary'
import { supabase } from './supabase'
import {
  emptyItemSel,
  isItpLibrarySectionId,
  type ItpLibraryCustomItem,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import { normalizeMeasFields } from '../types/itpMeasFields'

/** Sentinel row storing admin-added master catalog items (left panel). */
export const ITP_LIBRARY_MASTER_JOB = '__master__'
export const ITP_LIBRARY_MASTER_VALVE = '__master__'

/** Default display name for the first / unnamed template per valve type. */
export const ITP_LIBRARY_DEFAULT_TEMPLATE_NAME = 'Default'

/**
 * Columns the app selects on every list/load/save.
 * Requires migration-itp-library-templates-named.sql (adds name + is_default).
 * Base migration-itp-library-templates.sql alone only has:
 * id, job_type, valve_type, scope, created_at, updated_at — selecting name/is_default → HTTP 400.
 */
const TEMPLATE_SELECT =
  'id,job_type,valve_type,name,is_default,scope,updated_at'

const TEMPLATE_SELECT_LEGACY_PROBE = 'id,job_type,valve_type,scope,updated_at'

export const ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT =
  'Supabase itp_library_templates is missing columns name and/or is_default. Open the Supabase SQL Editor and run supabase/migration-itp-library-templates-named.sql, then reload this page.'

export function isItpLibraryTemplateSchemaError(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : error instanceof Error
        ? error.message
        : String(error ?? '')
  return /column .*?(name|is_default).*does not exist|Could not find the .*column.*?(name|is_default)|itp_library_templates is missing columns name/i.test(
    message,
  )
}

function mapTemplateError(error: unknown): Error {
  if (isItpLibraryTemplateSchemaError(error)) {
    return new Error(ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT)
  }
  if (error instanceof Error) return error
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(String((error as { message?: unknown }).message ?? 'Request failed'))
  }
  return new Error(String(error ?? 'Request failed'))
}

/** Lightweight check used by the admin builder to show a blocking banner. */
export async function probeItpLibraryTemplateSchema(): Promise<{
  ok: boolean
  message: string | null
}> {
  const named = await supabase.from('itp_library_templates').select(TEMPLATE_SELECT).limit(1)
  if (!named.error) return { ok: true, message: null }

  if (isItpLibraryTemplateSchemaError(named.error)) {
    const legacy = await supabase.from('itp_library_templates').select(TEMPLATE_SELECT_LEGACY_PROBE).limit(1)
    if (!legacy.error) {
      return { ok: false, message: ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT }
    }
    return { ok: false, message: mapTemplateError(named.error).message }
  }

  if (/relation .*itp_library_templates.* does not exist|Could not find the table/i.test(named.error.message)) {
    return {
      ok: false,
      message:
        'Table itp_library_templates does not exist. Run supabase/migration-itp-library-templates.sql, then supabase/migration-itp-library-templates-named.sql.',
    }
  }

  return { ok: false, message: mapTemplateError(named.error).message }
}

export type ItpLibraryTemplateScope = {
  sel: Record<string, ItpLibraryItemSel>
  custom: ItpLibraryCustomItem[]
  /** Full editable master catalog (only used on the __master__ row). */
  catalog?: unknown
  /** Ordered shop stations for the master list (only used on the __master__ row). */
  areas?: unknown
}

export type ItpLibraryTemplateRow = {
  id: number
  job_type: string
  valve_type: string
  name: string
  is_default: boolean
  scope: ItpLibraryTemplateScope
  updated_at: string
}

function normalizeTemplateName(raw: unknown): string {
  const value = String(raw ?? '').trim()
  return value || ITP_LIBRARY_DEFAULT_TEMPLATE_NAME
}

function mapTemplateRow(row: Record<string, unknown>): ItpLibraryTemplateRow {
  return {
    id: Number(row.id),
    job_type: String(row.job_type ?? ''),
    valve_type: String(row.valve_type ?? ''),
    name: normalizeTemplateName(row.name),
    is_default: Boolean(row.is_default),
    scope: normalizeTemplateScope(row.scope),
    updated_at: String(row.updated_at ?? ''),
  }
}

function isMasterKey(jobType: string, valveType: string) {
  return jobType === ITP_LIBRARY_MASTER_JOB && valveType === ITP_LIBRARY_MASTER_VALVE
}

function pickPreferredTemplate(rows: ItpLibraryTemplateRow[]): ItpLibraryTemplateRow | null {
  if (!rows.length) return null
  const byDefault = rows.find((row) => row.is_default)
  if (byDefault) return byDefault
  const namedDefault = rows.find((row) => row.name === ITP_LIBRARY_DEFAULT_TEMPLATE_NAME)
  if (namedDefault) return namedDefault
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))[0] ?? null
}

function normalizeSel(raw: unknown): ItpLibraryItemSel {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<ItpLibraryItemSel> & {
    minPhotos?: unknown
    measFields?: unknown
  }
  const minPhotosRaw = Number(o.minPhotos)
  return {
    included: Boolean(o.included),
    holdPoint: Boolean(o.holdPoint),
    beforeMeas: Boolean(o.beforeMeas),
    afterMeas: Boolean(o.afterMeas),
    measVerify: Boolean(o.measVerify),
    subReqs: Array.isArray(o.subReqs) ? o.subReqs.map((s) => String(s)) : [],
    notes: String(o.notes ?? ''),
    requirePicture: Boolean(o.requirePicture),
    pictureLabel: String(o.pictureLabel ?? '').trim(),
    minPhotos: Number.isFinite(minPhotosRaw) && minPhotosRaw > 0 ? Math.floor(minPhotosRaw) : 1,
    measFields: normalizeMeasFields(o.measFields),
    blockNext: Boolean(o.blockNext),
    sectionId: (() => {
      const raw = String(o.sectionId ?? '').trim()
      return isItpLibrarySectionId(raw) ? raw : ''
    })(),
  }
}

export function emptyTemplateScope(): ItpLibraryTemplateScope {
  return { sel: {}, custom: [] }
}

export function normalizeTemplateScope(raw: unknown): ItpLibraryTemplateScope {
  const o = (raw && typeof raw === 'object' ? raw : {}) as {
    sel?: Record<string, unknown>
    custom?: unknown[]
    catalog?: unknown
    areas?: unknown
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
  return {
    sel,
    custom,
    ...(o.catalog !== undefined ? { catalog: o.catalog } : {}),
    ...(o.areas !== undefined ? { areas: o.areas } : {}),
  }
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
      value.requirePicture ||
      value.blockNext ||
      value.measFields.length > 0 ||
      value.subReqs.length > 0 ||
      value.notes.trim()
    ) {
      sel[id] = value
    }
  }
  return {
    sel,
    custom: scope.custom.filter((c) => c.name.trim()),
    ...(scope.catalog !== undefined ? { catalog: scope.catalog } : {}),
    ...(scope.areas !== undefined ? { areas: scope.areas } : {}),
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

export function formatItpLibraryTemplateLabel(row: Pick<ItpLibraryTemplateRow, 'valve_type' | 'name' | 'is_default'>) {
  const suffix = row.is_default ? ' (default)' : ''
  return `${row.valve_type} — ${row.name}${suffix}`
}

export async function listItpLibraryTemplates(filters?: {
  jobType?: string
  valveType?: string
}): Promise<ItpLibraryTemplateRow[]> {
  let query = supabase
    .from('itp_library_templates')
    .select(TEMPLATE_SELECT)
    .order('job_type', { ascending: true })
    .order('valve_type', { ascending: true })
    .order('name', { ascending: true })

  const jobType = String(filters?.jobType ?? '').trim()
  const valveType = String(filters?.valveType ?? '').trim()
  if (jobType) query = query.eq('job_type', jobType)
  if (valveType) query = query.eq('valve_type', valveType)

  const { data, error } = await query
  if (error) throw mapTemplateError(error)
  return (data ?? [])
    .map((row) => mapTemplateRow(row as Record<string, unknown>))
    .filter((row) => !isMasterKey(row.job_type, row.valve_type))
}

export async function loadItpLibraryTemplate(
  jobType: ItpLibraryJobType | string,
  valveType: string,
  name?: string | null,
): Promise<ItpLibraryTemplateRow | null> {
  const jt = String(jobType ?? '').trim()
  const vt = String(valveType ?? '').trim()
  if (!jt || !vt) return null

  const requestedName = name == null ? null : String(name).trim()

  if (requestedName) {
    const { data, error } = await supabase
      .from('itp_library_templates')
      .select(TEMPLATE_SELECT)
      .eq('job_type', jt)
      .eq('valve_type', vt)
      .eq('name', requestedName)
      .maybeSingle()
    if (error) throw mapTemplateError(error)
    if (!data) return null
    return mapTemplateRow(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('itp_library_templates')
    .select(TEMPLATE_SELECT)
    .eq('job_type', jt)
    .eq('valve_type', vt)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw mapTemplateError(error)
  const rows = (data ?? []).map((row) => mapTemplateRow(row as Record<string, unknown>))
  return pickPreferredTemplate(rows)
}

async function clearDefaultFlags(jobType: string, valveType: string, exceptName?: string) {
  let query = supabase
    .from('itp_library_templates')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('job_type', jobType)
    .eq('valve_type', valveType)
    .eq('is_default', true)
  if (exceptName) {
    query = query.neq('name', exceptName)
  }
  const { error } = await query
  if (error) throw mapTemplateError(error)
}

export async function saveItpLibraryTemplate(
  jobType: ItpLibraryJobType | string,
  valveType: string,
  scope: ItpLibraryTemplateScope,
  options?: { name?: string; isDefault?: boolean },
): Promise<ItpLibraryTemplateRow> {
  const jt = String(jobType ?? '').trim()
  const vt = String(valveType ?? '').trim()
  const templateName = normalizeTemplateName(options?.name)
  if (!jt) throw new Error('Job type is required')
  if (!vt) throw new Error('Valve type is required')

  const master = isMasterKey(jt, vt)
  let isDefault = Boolean(options?.isDefault)
  if (master) {
    isDefault = false
  } else if (options?.isDefault == null) {
    const existing = await listItpLibraryTemplates({ jobType: jt, valveType: vt })
    const self = existing.find((row) => row.name === templateName)
    if (self) {
      isDefault = self.is_default
    } else {
      isDefault = existing.length === 0
    }
  }

  if (isDefault && !master) {
    await clearDefaultFlags(jt, vt, templateName)
  }

  const payload = {
    job_type: jt,
    valve_type: vt,
    name: templateName,
    is_default: isDefault,
    scope: compactTemplateScope(scope),
    updated_at: new Date().toISOString(),
  }

  // Touch auth session first so a stalled gotrue lock can recover before the upsert.
  // Do not require a session — RLS allows authenticated/anon writes for this table.
  await supabase.auth.getSession()

  const { data, error } = await supabase
    .from('itp_library_templates')
    .upsert(payload, { onConflict: 'job_type,valve_type,name' })
    .select(TEMPLATE_SELECT)
    .single()
  if (error) throw mapTemplateError(error)
  return mapTemplateRow(data as Record<string, unknown>)
}

export async function setDefaultItpLibraryTemplate(
  jobType: string,
  valveType: string,
  name: string,
): Promise<ItpLibraryTemplateRow | null> {
  const jt = String(jobType ?? '').trim()
  const vt = String(valveType ?? '').trim()
  const templateName = normalizeTemplateName(name)
  if (!jt || !vt) return null

  const existing = await loadItpLibraryTemplate(jt, vt, templateName)
  if (!existing) return null

  await clearDefaultFlags(jt, vt)
  const { data, error } = await supabase
    .from('itp_library_templates')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('job_type', jt)
    .eq('valve_type', vt)
    .eq('name', templateName)
    .select(TEMPLATE_SELECT)
    .single()
  if (error) throw mapTemplateError(error)
  return mapTemplateRow(data as Record<string, unknown>)
}

export async function deleteItpLibraryTemplate(
  jobType: string,
  valveType: string,
  name?: string | null,
): Promise<void> {
  const jt = String(jobType ?? '').trim()
  const vt = String(valveType ?? '').trim()
  let query = supabase.from('itp_library_templates').delete().eq('job_type', jt).eq('valve_type', vt)
  const templateName = name == null ? null : String(name).trim()
  if (templateName) {
    query = query.eq('name', templateName)
  }
  const { error } = await query
  if (error) throw mapTemplateError(error)
}

/** @deprecated Prefer loadItpMasterCatalog from itpMasterCatalog.ts */
export async function loadItpLibraryMasterItems(): Promise<ItpLibraryCustomItem[]> {
  try {
    const row = await loadItpLibraryTemplate(
      ITP_LIBRARY_MASTER_JOB,
      ITP_LIBRARY_MASTER_VALVE,
      ITP_LIBRARY_DEFAULT_TEMPLATE_NAME,
    )
    return row?.scope.custom ?? []
  } catch {
    return []
  }
}

/** @deprecated Prefer saveItpMasterCatalog from itpMasterCatalog.ts */
export async function saveItpLibraryMasterItems(items: ItpLibraryCustomItem[]): Promise<void> {
  const custom = items
    .map((row) => ({
      id: String(row.id ?? '').trim(),
      secId: row.secId,
      name: String(row.name ?? '').trim(),
    }))
    .filter((row) => row.id && row.secId && row.name)
  await saveItpLibraryTemplate(
    ITP_LIBRARY_MASTER_JOB,
    ITP_LIBRARY_MASTER_VALVE,
    {
      sel: {},
      custom,
    },
    { name: ITP_LIBRARY_DEFAULT_TEMPLATE_NAME, isDefault: false },
  )
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
        requirePicture: templateSel.requirePicture || prev.requirePicture,
        pictureLabel: templateSel.pictureLabel.trim() || prev.pictureLabel,
        minPhotos: templateSel.requirePicture
          ? templateSel.minPhotos || prev.minPhotos || 1
          : prev.minPhotos || 1,
        measFields:
          templateSel.measFields.length > 0
            ? templateSel.measFields.map((f) => ({ ...f }))
            : prev.measFields,
        blockNext: templateSel.blockNext || prev.blockNext,
        sectionId: templateSel.sectionId || prev.sectionId,
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
  options?: { replaceIncludes?: boolean; templateName?: string | null },
): Promise<ItpLibraryPlanPayload> {
  try {
    const stored = await loadItpLibraryTemplate(plan.jobType, plan.valveType, options?.templateName)
    if (stored && countIncludedInScope(stored.scope) > 0) {
      return applyScopeToPlan(plan, stored.scope, options)
    }
  } catch {
    // Table may not exist yet — fall back to code templates.
  }

  const codeScope = scopeFromCodeTemplate(plan.jobType, plan.valveType)
  return applyScopeToPlan(plan, codeScope, options)
}
