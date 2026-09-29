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

/** Employee training session ids created while local VSI was active. */
export const LOCAL_COMPANY_TRAINING_IDS_KEY = 'js-job-board-local-company-training-ids'

/** Employee training course ids created while local VSI was active. */
export const LOCAL_COMPANY_TRAINING_COURSE_IDS_KEY = 'js-job-board-local-company-training-course-ids'

/** Orphan training library/file ids created while local VSI was active (no training/course link). */
export const LOCAL_COMPANY_TRAINING_FILE_IDS_KEY = 'js-job-board-local-company-training-file-ids'

/** Employee training skill row ids created/updated while local VSI was active. */
export const LOCAL_COMPANY_TRAINING_SKILL_IDS_KEY = 'js-job-board-local-company-training-skill-ids'

/** Customer inventory row ids created while local VSI was active. */
export const LOCAL_COMPANY_INVENTORY_IDS_KEY = 'js-job-board-local-company-inventory-ids'

/** Received-valve log ids created while local VSI was active. */
export const LOCAL_COMPANY_RECEIVED_VALVE_IDS_KEY = 'js-job-board-local-company-received-valve-ids'

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

type LocalCompanyInventoryMap = Partial<Record<CompanyWorkflowKey, string[]>>

function readLocalCompanyInventoryMap(): LocalCompanyInventoryMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPANY_INVENTORY_IDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyInventoryMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyInventoryMap(map: LocalCompanyInventoryMap) {
  try {
    window.localStorage.setItem(LOCAL_COMPANY_INVENTORY_IDS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function rememberInventoryForCompany(companyKey: CompanyWorkflowKey, inventoryId: string) {
  const id = String(inventoryId ?? '').trim()
  if (!id) return
  const map = readLocalCompanyInventoryMap()
  const list = new Set(map[companyKey] ?? [])
  list.add(id)
  map[companyKey] = [...list]
  writeLocalCompanyInventoryMap(map)
}

export function localInventoryIdsForCompany(companyKey: CompanyWorkflowKey): Set<string> {
  return new Set(readLocalCompanyInventoryMap()[companyKey] ?? [])
}

function otherLocalInventoryIds(workflowKey: CompanyWorkflowKey): Set<string> {
  const other = new Set<string>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localInventoryIdsForCompany(key)) other.add(id)
  }
  return other
}

/**
 * Customer inventory: untagged historical rows stay on JS Valve; VSI starts empty
 * until items are created while VSI is active.
 */
export function inventoryBelongsToCompany(
  inventoryId: string,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  const { workflowKey } = options
  const id = String(inventoryId ?? '').trim()
  if (!id) return workflowKey === 'js-valve'
  if (localInventoryIdsForCompany(workflowKey).has(id)) return true
  if (otherLocalInventoryIds(workflowKey).has(id)) return false
  return workflowKey === 'js-valve'
}

export function filterInventoryForCompany<T extends { id: string }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) => inventoryBelongsToCompany(row.id, options))
}

export function filterInventoryEventsForCompany<T extends { inventory_id: string }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) => inventoryBelongsToCompany(row.inventory_id, options))
}

type LocalCompanyReceivedValveMap = Partial<Record<CompanyWorkflowKey, string[]>>

function readLocalCompanyReceivedValveMap(): LocalCompanyReceivedValveMap {
  try {
    const raw = window.localStorage.getItem(LOCAL_COMPANY_RECEIVED_VALVE_IDS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyReceivedValveMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyReceivedValveMap(map: LocalCompanyReceivedValveMap) {
  try {
    window.localStorage.setItem(LOCAL_COMPANY_RECEIVED_VALVE_IDS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function rememberReceivedValveForCompany(companyKey: CompanyWorkflowKey, receivedValveId: string) {
  const id = String(receivedValveId ?? '').trim()
  if (!id) return
  const map = readLocalCompanyReceivedValveMap()
  const list = new Set(map[companyKey] ?? [])
  list.add(id)
  map[companyKey] = [...list]
  writeLocalCompanyReceivedValveMap(map)
}

export function localReceivedValveIdsForCompany(companyKey: CompanyWorkflowKey): Set<string> {
  return new Set(readLocalCompanyReceivedValveMap()[companyKey] ?? [])
}

function otherLocalReceivedValveIds(workflowKey: CompanyWorkflowKey): Set<string> {
  const other = new Set<string>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localReceivedValveIdsForCompany(key)) other.add(id)
  }
  return other
}

/**
 * Received valve log: untagged historical rows stay on JS Valve; VSI starts empty
 * until items are created while VSI is active (or rows carry organization_id).
 */
export function receivedValveBelongsToCompany(
  receivedValveId: string,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
    organizationId?: string | null
  },
): boolean {
  const { workflowKey, activeOrganization } = options
  const orgId = options.organizationId?.trim() || null
  if (orgId) {
    if (!activeOrganization?.id) return workflowKey === 'js-valve'
    return orgId === activeOrganization.id
  }

  const id = String(receivedValveId ?? '').trim()
  if (!id) return workflowKey === 'js-valve'
  if (localReceivedValveIdsForCompany(workflowKey).has(id)) return true
  if (otherLocalReceivedValveIds(workflowKey).has(id)) return false
  return workflowKey === 'js-valve'
}

export function filterReceivedValvesForCompany<T extends { id: string; organizationId?: string | null }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) =>
    receivedValveBelongsToCompany(row.id, {
      workflowKey: options.workflowKey,
      activeOrganization: options.activeOrganization,
      organizationId: row.organizationId,
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

type LocalCompanyIdMap = Partial<Record<CompanyWorkflowKey, number[]>>

function readLocalCompanyIdMap(storageKey: string): LocalCompanyIdMap {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalCompanyIdMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalCompanyIdMap(storageKey: string, map: LocalCompanyIdMap) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(map))
  } catch {
    // ignore
  }
}

function rememberLocalCompanyId(storageKey: string, companyKey: CompanyWorkflowKey, id: number) {
  if (!Number.isFinite(id)) return
  const map = readLocalCompanyIdMap(storageKey)
  const list = new Set(map[companyKey] ?? [])
  list.add(id)
  map[companyKey] = [...list]
  writeLocalCompanyIdMap(storageKey, map)
}

function localCompanyIds(storageKey: string, companyKey: CompanyWorkflowKey): Set<number> {
  return new Set(readLocalCompanyIdMap(storageKey)[companyKey] ?? [])
}

function otherLocalCompanyIds(storageKey: string, workflowKey: CompanyWorkflowKey): Set<number> {
  const other = new Set<number>()
  for (const key of ['js-valve', 'vsi'] as const) {
    if (key === workflowKey) continue
    for (const id of localCompanyIds(storageKey, key)) other.add(id)
  }
  return other
}

function localIdBelongsToCompany(
  storageKey: string,
  id: number,
  workflowKey: CompanyWorkflowKey,
): boolean {
  if (localCompanyIds(storageKey, workflowKey).has(id)) return true
  if (otherLocalCompanyIds(storageKey, workflowKey).has(id)) return false
  return workflowKey === 'js-valve'
}

/** Employee trainings: untagged history stays on JS Valve; VSI starts empty. */
export function rememberTrainingForCompany(companyKey: CompanyWorkflowKey, trainingId: number) {
  rememberLocalCompanyId(LOCAL_COMPANY_TRAINING_IDS_KEY, companyKey, trainingId)
}

export function trainingBelongsToCompany(
  trainingId: number,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  return localIdBelongsToCompany(LOCAL_COMPANY_TRAINING_IDS_KEY, trainingId, options.workflowKey)
}

export function filterTrainingsForCompany<T extends { id: number }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) => trainingBelongsToCompany(row.id, options))
}

export function rememberTrainingCourseForCompany(companyKey: CompanyWorkflowKey, courseId: number) {
  rememberLocalCompanyId(LOCAL_COMPANY_TRAINING_COURSE_IDS_KEY, companyKey, courseId)
}

export function trainingCourseBelongsToCompany(
  courseId: number,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  return localIdBelongsToCompany(LOCAL_COMPANY_TRAINING_COURSE_IDS_KEY, courseId, options.workflowKey)
}

export function filterTrainingCoursesForCompany<T extends { id: number }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) => trainingCourseBelongsToCompany(row.id, options))
}

export function rememberTrainingFileForCompany(companyKey: CompanyWorkflowKey, fileId: number) {
  rememberLocalCompanyId(LOCAL_COMPANY_TRAINING_FILE_IDS_KEY, companyKey, fileId)
}

export function trainingFileBelongsToCompany(
  file: { id: number; training_id?: number | null; course_id?: number | null },
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  if (file.training_id != null) return trainingBelongsToCompany(file.training_id, options)
  if (file.course_id != null) return trainingCourseBelongsToCompany(file.course_id, options)
  return localIdBelongsToCompany(LOCAL_COMPANY_TRAINING_FILE_IDS_KEY, file.id, options.workflowKey)
}

export function filterTrainingFilesForCompany<
  T extends { id: number; training_id?: number | null; course_id?: number | null },
>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) => trainingFileBelongsToCompany(row, options))
}

export function rememberTrainingSkillForCompany(companyKey: CompanyWorkflowKey, skillId: number) {
  rememberLocalCompanyId(LOCAL_COMPANY_TRAINING_SKILL_IDS_KEY, companyKey, skillId)
}

export function trainingSkillBelongsToCompany(
  skillId: number,
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): boolean {
  return localIdBelongsToCompany(LOCAL_COMPANY_TRAINING_SKILL_IDS_KEY, skillId, options.workflowKey)
}

export function filterTrainingSkillsForCompany<T extends { id: number }>(
  rows: T[],
  options: {
    workflowKey: CompanyWorkflowKey
    activeOrganization: Organization | null
  },
): T[] {
  return rows.filter((row) => trainingSkillBelongsToCompany(row.id, options))
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
