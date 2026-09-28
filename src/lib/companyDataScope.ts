import type { CompanyWorkflowKey } from '../constants/companyWorkflows'
import type { TestGauge } from '../types/testGauge'
import type { Organization } from '../types/organizations'
import type { Valve } from '../types'
import { supabase } from './supabase'

/** Valve row ids created while local VSI was active (no org column in DB yet). */
export const LOCAL_COMPANY_VALVE_IDS_KEY = 'js-job-board-local-company-valve-ids'

/** Test gauge ids created while local VSI was active (no org column in DB yet). */
export const LOCAL_COMPANY_GAUGE_IDS_KEY = 'js-job-board-local-company-gauge-ids'

/** Shop to-do (daily_notes) ids created while local VSI was active. */
export const LOCAL_COMPANY_NOTE_IDS_KEY = 'js-job-board-local-company-note-ids'

type LocalCompanyValveMap = Partial<Record<CompanyWorkflowKey, number[]>>

function readLocalCompanyValveMap(): LocalCompanyValveMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPANY_VALVE_IDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyValveMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyValveMap(map: LocalCompanyValveMap) {
  try {
    window.localStorage.setItem(LOCAL_COMPANY_VALVE_IDS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function rememberValveForCompany(companyKey: CompanyWorkflowKey, valveRowId: number) {
  if (!Number.isFinite(valveRowId)) return
  const map = readLocalCompanyValveMap()
  const list = new Set(map[companyKey] ?? [])
  list.add(valveRowId)
  map[companyKey] = [...list]
  writeLocalCompanyValveMap(map)
}

export function localValveIdsForCompany(companyKey: CompanyWorkflowKey): Set<number> {
  return new Set(readLocalCompanyValveMap()[companyKey] ?? [])
}

function valveOrganizationId(valve: Valve): string | null {
  const raw = (valve as Valve & { organization_id?: string | null }).organization_id
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function otherLocalValveIds(workflowKey: CompanyWorkflowKey): Set<number> {
  const otherLocalIds = new Set<number>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localValveIdsForCompany(key)) otherLocalIds.add(id)
  }
  return otherLocalIds
}

/**
 * Whether a valve row id belongs to the active company (local / pre-migration rules).
 * Untagged historical ids stay on JS Valve; VSI-only ids are local-tracked creates.
 */
export function valveRowBelongsToCompany(
  valveRowId: number,
  options: {
    workflowKey: CompanyWorkflowKey
    /** Optional org id from valves.organization_id when present. */
    valveOrganizationId?: string | null
    activeOrganization: Organization | null
  },
): boolean {
  const { workflowKey, activeOrganization } = options
  const orgId = options.valveOrganizationId?.trim() || null
  if (orgId) {
    if (!activeOrganization?.id) return workflowKey === 'js-valve'
    return orgId === activeOrganization.id
  }

  const localIds = localValveIdsForCompany(workflowKey)
  if (localIds.has(valveRowId)) return true
  if (otherLocalValveIds(workflowKey).has(valveRowId)) return false
  return workflowKey === 'js-valve'
}

/**
 * Scope shop valves to the active company.
 * - If `organization_id` exists on a row, match it to the active org.
 * - Until migration: untagged rows belong to JS Valve; VSI uses local create tracking
 *   (and otherwise starts empty).
 */
export function filterValvesForCompany(
  valves: Valve[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): Valve[] {
  const { workflowKey, activeOrganization } = options
  return valves.filter((valve) =>
    valveRowBelongsToCompany(valve.id, {
      workflowKey,
      activeOrganization,
      valveOrganizationId: valveOrganizationId(valve),
    }),
  )
}

/** Scope rework / change-log style rows that only carry valve_row_id. */
export function filterRowsByCompanyValveId<T extends { valve_row_id: number }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) =>
    valveRowBelongsToCompany(row.valve_row_id, {
      workflowKey: options.workflowKey,
      activeOrganization: options.activeOrganization,
    }),
  )
}

type LocalCompanyGaugeMap = Partial<Record<CompanyWorkflowKey, string[]>>

function readLocalCompanyGaugeMap(): LocalCompanyGaugeMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPANY_GAUGE_IDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyGaugeMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyGaugeMap(map: LocalCompanyGaugeMap) {
  try {
    window.localStorage.setItem(LOCAL_COMPANY_GAUGE_IDS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function rememberGaugeForCompany(companyKey: CompanyWorkflowKey, gaugeId: string) {
  const id = String(gaugeId ?? '').trim()
  if (!id) return
  const map = readLocalCompanyGaugeMap()
  const list = new Set(map[companyKey] ?? [])
  list.add(id)
  map[companyKey] = [...list]
  writeLocalCompanyGaugeMap(map)
}

export function localGaugeIdsForCompany(companyKey: CompanyWorkflowKey): Set<string> {
  return new Set(readLocalCompanyGaugeMap()[companyKey] ?? [])
}

function otherLocalGaugeIds(workflowKey: CompanyWorkflowKey): Set<string> {
  const other = new Set<string>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localGaugeIdsForCompany(key)) other.add(id)
  }
  return other
}

export function gaugeBelongsToCompany(
  gaugeId: string,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  const { workflowKey } = options
  const id = String(gaugeId ?? '').trim()
  if (!id) return workflowKey === 'js-valve'
  if (localGaugeIdsForCompany(workflowKey).has(id)) return true
  if (otherLocalGaugeIds(workflowKey).has(id)) return false
  // Untagged historical gauges stay on JS Valve so VSI starts empty.
  return workflowKey === 'js-valve'
}

export function filterGaugesForCompany(
  gauges: TestGauge[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): TestGauge[] {
  return gauges.filter((gauge) =>
    gaugeBelongsToCompany(gauge.id, {
      workflowKey: options.workflowKey,
      activeOrganization: options.activeOrganization,
    }),
  )
}

type LocalCompanyNoteMap = Partial<Record<CompanyWorkflowKey, number[]>>

function readLocalCompanyNoteMap(): LocalCompanyNoteMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPANY_NOTE_IDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyNoteMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyNoteMap(map: LocalCompanyNoteMap) {
  try {
    window.localStorage.setItem(LOCAL_COMPANY_NOTE_IDS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function rememberNoteForCompany(companyKey: CompanyWorkflowKey, noteId: number) {
  if (!Number.isFinite(noteId)) return
  const map = readLocalCompanyNoteMap()
  const list = new Set(map[companyKey] ?? [])
  list.add(noteId)
  map[companyKey] = [...list]
  writeLocalCompanyNoteMap(map)
}

export function localNoteIdsForCompany(companyKey: CompanyWorkflowKey): Set<number> {
  return new Set(readLocalCompanyNoteMap()[companyKey] ?? [])
}

function otherLocalNoteIds(workflowKey: CompanyWorkflowKey): Set<number> {
  const other = new Set<number>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localNoteIdsForCompany(key)) other.add(id)
  }
  return other
}

export function noteBelongsToCompany(
  noteId: number,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  const { workflowKey } = options
  if (localNoteIdsForCompany(workflowKey).has(noteId)) return true
  if (otherLocalNoteIds(workflowKey).has(noteId)) return false
  return workflowKey === 'js-valve'
}

export function filterNotesForCompany<T extends { id: number }>(
  notes: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return notes.filter((note) =>
    noteBelongsToCompany(note.id, {
      workflowKey: options.workflowKey,
      activeOrganization: options.activeOrganization,
    }),
  )
}

/** Uppercase valve_id strings owned by VSI via local create tracking. */
async function loadLocalCompanyValveIdStrings(companyKey: CompanyWorkflowKey): Promise<Set<string>> {
  const rowIds = [...localValveIdsForCompany(companyKey)]
  if (!rowIds.length) return new Set()
  const { data, error } = await supabase.from('valves').select('id,valve_id').in('id', rowIds)
  if (error || !data?.length) return new Set()
  const ids = new Set<string>()
  for (const row of data) {
    const valveId = String((row as { valve_id?: string }).valve_id ?? '')
      .trim()
      .toUpperCase()
    if (valveId) ids.add(valveId)
  }
  return ids
}

/**
 * Scope test_logs rows (keyed by valve_id string) to the active company.
 * Untagged historical logs stay on JS Valve; VSI only sees logs for VSI-created valves.
 */
export async function filterTestLogsForCompany<T extends { valve_id: string }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): Promise<T[]> {
  const { workflowKey } = options
  const vsiValveIds = await loadLocalCompanyValveIdStrings('vsi')

  if (workflowKey === 'vsi') {
    if (!vsiValveIds.size) return []
    return rows.filter((row) => vsiValveIds.has(String(row.valve_id ?? '').trim().toUpperCase()))
  }

  if (!vsiValveIds.size) return rows
  return rows.filter((row) => !vsiValveIds.has(String(row.valve_id ?? '').trim().toUpperCase()))
}
