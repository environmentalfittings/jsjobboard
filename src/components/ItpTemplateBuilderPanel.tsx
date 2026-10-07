import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  findLibraryItem,
  mapShopJobTypeToLibrary,
  type ItpLibraryJobType,
} from '../constants/itpLibrary'
import {
  defaultProcessSections,
  isSpecialtyProcessSectionId,
  moveProcessSection,
  moveProcessSectionTo,
  normalizeProcessSections,
  processSectionTitle,
  resolveLibrarySectionId,
  uniqueProcessSectionId,
  type ItpProcessSectionDef,
} from '../constants/itpProcessSections'
import {
  defaultShopAreas,
  ensureShopAreaDef,
  normalizeShopAreaValue,
  normalizeShopAreas,
  type ItpShopArea,
  type ItpShopAreaDef,
} from '../constants/itpShopAreas'
import { VALVE_TYPES } from '../constants/jobLookups'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import {
  defaultAreaForSection,
  emptyMasterCatalogState,
  loadItpMasterCatalog,
  moveCatalogItemInSection,
  normalizeMasterCatalog,
  reindexCatalog,
  requirementDefaultsFromCatalogItem,
  saveItpMasterCatalog,
  type ItpMasterCatalogItem,
} from '../lib/itpMasterCatalog'
import {
  countHoldPointsInScope,
  countIncludedInScope,
  deleteItpLibraryTemplate,
  emptyTemplateScope,
  includedItemIds,
  ITP_LIBRARY_DEFAULT_TEMPLATE_NAME,
  ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT,
  ITP_LIBRARY_VALVE_MASTER_NAME,
  isItpLibraryTemplateSchemaError,
  listItpLibraryTemplates,
  loadItpLibraryTemplate,
  loadJobTypeMaster,
  loadValveTypeMaster,
  probeItpLibraryTemplateSchema,
  saveItpLibraryTemplate,
  saveJobTypeMaster,
  saveValveTypeMaster,
  scopeFromCodeTemplate,
  setDefaultItpLibraryTemplate,
  unionIncludedScopes,
  type ItpLibraryTemplateRow,
  type ItpLibraryTemplateScope,
} from '../lib/itpLibraryTemplates'
import {
  clampLinePhotoMax,
  clampLinePhotoMin,
  DEFAULT_ITP_MEAS_FIELDS,
  emptyMeasField,
  ITP_MEAS_FIELD_TYPE_OPTIONS,
  itemRequiresMeasurements,
  measFieldTypePatch,
  newMeasFieldId,
  selFromRequirementDefaults,
  type ItpMeasFieldDef,
  type ItpMeasFieldType,
} from '../lib/itpItemRequirements'
import { NAMEPLATE_TRAVELER_FIELDS } from '../lib/itpTravelerNameplate'
import {
  buildTemplatePreviewPlan,
  ITP_TEMPLATE_PREVIEW_PATH,
  writeTemplatePreviewPayload,
} from '../lib/itpTemplatePreview'
import {
  ItpTemplateTravelerManagePanel,
  type TravelerRequirementDraft,
} from './ItpTemplateTravelerManagePanel'
import { ItpLineTravelerBuilderModal } from './ItpLineTravelerBuilderModal'
import { ItpMeasDropdownSourceFields } from './ItpMeasDropdownSourceFields'
import { ItpMeasJobCardSourceSelect } from './ItpMeasJobCardSourceSelect'
import { ItpMeasRequiredToggle } from './ItpMeasRequiredToggle'
import { ItpPhotoMinMaxFields } from './ItpPhotoMinMaxFields'
import { ItpOemProcedureDocs } from './ItpOemProcedureDocs'
import { ItpStationSelect } from './ItpStationSelect'
import { migrateFastenerRecordSel } from '../lib/itpFastenerRecord'
import { stepUsesOemOrProcedure } from '../lib/itpOemProcedure'
import {
  effectiveScopeSectionId,
  emptyItemSel,
  type ItpLibraryCustomItem,
  type ItpLibraryItemSel,
} from '../types/itpLibraryPlan'

const JOB_TYPE_OPTIONS: { value: ItpLibraryJobType; label: string }[] = [
  { value: 'repair', label: 'Valve Repair' },
  { value: 'testonly', label: 'Test Only' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'other', label: 'Other' },
]

function jobTypeLabel(jobType: ItpLibraryJobType) {
  return JOB_TYPE_OPTIONS.find((opt) => opt.value === jobType)?.label ?? jobType
}

type BuilderLayer = 'global' | 'job_master' | 'valve_master' | 'templates'

type PropagatePrompt = {
  kind: 'add' | 'edit'
  item: ItpMasterCatalogItem
  patch?: Partial<ItpMasterCatalogItem>
  insertBelowItemId?: string
}

function parentMasterLabels(
  layer: BuilderLayer,
  jobType: ItpLibraryJobType,
  valveType: string,
): string[] {
  if (layer === 'job_master') return ['Global master']
  if (layer === 'valve_master') return [`${jobTypeLabel(jobType)} job type master`, 'Global master']
  if (layer === 'templates') {
    const valve = valveType.trim() || 'valve type'
    return [
      `${valve} valve type master`,
      `${jobTypeLabel(jobType)} job type master`,
      'Global master',
    ]
  }
  return []
}

function catalogItemFromCustom(custom: ItpLibraryCustomItem): ItpMasterCatalogItem {
  const detail =
    custom.detail && typeof custom.detail === 'object'
      ? (custom.detail as Partial<ItpMasterCatalogItem>)
      : {}
  return {
    id: custom.id,
    name: custom.name || String(detail.name ?? 'Custom requirement'),
    ref: String(detail.ref ?? 'Custom'),
    secId: custom.secId || String(detail.secId ?? 'receipt'),
    area: (typeof detail.area === 'string' && detail.area
      ? normalizeShopAreaValue(detail.area) || detail.area
      : defaultAreaForSection(String(detail.secId ?? custom.secId ?? 'receipt'))) as ItpShopArea,
    sortOrder: Number.isFinite(Number(detail.sortOrder)) ? Number(detail.sortOrder) : 10_000,
    builtIn: false,
    defaultSubReqs: Array.isArray(detail.defaultSubReqs)
      ? detail.defaultSubReqs.map((value) => String(value))
      : undefined,
    requirePicture: Boolean(detail.requirePicture) || undefined,
    pictureLabel: detail.pictureLabel ? String(detail.pictureLabel) : undefined,
    minPhotos: detail.minPhotos != null ? Number(detail.minPhotos) : undefined,
    maxPhotos: detail.maxPhotos != null ? Number(detail.maxPhotos) : undefined,
    requireMeasurement: Boolean(detail.requireMeasurement) || undefined,
    measFields: Array.isArray(detail.measFields) ? detail.measFields : undefined,
    holdPoint: Boolean(detail.holdPoint) || undefined,
    blockNext: Boolean(detail.blockNext) || undefined,
    requireNameplate: Boolean(detail.requireNameplate) || undefined,
  }
}

function snapshotCustomItem(item: ItpMasterCatalogItem): ItpLibraryCustomItem {
  return {
    id: item.id,
    secId: item.secId,
    name: item.name,
    detail: { ...item },
  }
}

function upsertCustomItem(
  prev: ItpLibraryCustomItem[],
  item: ItpMasterCatalogItem,
  withDetail: boolean,
): ItpLibraryCustomItem[] {
  const next = [...prev]
  const idx = next.findIndex((row) => row.id === item.id)
  if (!withDetail && item.builtIn && idx < 0) return prev
  const row: ItpLibraryCustomItem = withDetail
    ? snapshotCustomItem(item)
    : { id: item.id, secId: item.secId, name: item.name }
  if (idx >= 0) {
    next[idx] = withDetail ? row : { ...row, ...(next[idx].detail ? { detail: next[idx].detail } : {}) }
    return next
  }
  next.push(row)
  return next
}

function applyScopeOrder(prev: ItpLibraryTemplateScope, orderedIds: string[]): ItpLibraryTemplateScope {
  const sel = { ...prev.sel }
  orderedIds.forEach((id, sortIndex) => {
    sel[id] = { ...(sel[id] ?? emptyItemSel()), sortIndex }
  })
  return { ...prev, sel }
}

function compareItemsForLayer(
  a: { id: string; sortOrder: number; name: string },
  b: { id: string; sortOrder: number; name: string },
  scope: ItpLibraryTemplateScope,
) {
  const sortA = scope.sel[a.id]?.sortIndex
  const sortB = scope.sel[b.id]?.sortIndex
  if (sortA != null && sortB != null && sortA !== sortB) return sortA - sortB
  if (sortA != null && sortB == null) return -1
  if (sortA == null && sortB != null) return 1
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
}

function mergeCatalogWithCustom(
  items: ItpMasterCatalogItem[],
  ...scopes: ItpLibraryTemplateScope[]
): ItpMasterCatalogItem[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const scope of scopes) {
    for (const custom of scope.custom) {
      const existing = byId.get(custom.id)
      const fromCustom = catalogItemFromCustom(custom)
      if (!existing) {
        byId.set(custom.id, fromCustom)
        continue
      }
      if (!custom.detail && custom.name === existing.name) continue
      byId.set(custom.id, {
        ...existing,
        ...fromCustom,
        id: custom.id,
        builtIn: existing.builtIn,
      })
    }
  }
  return [...byId.values()]
}

const NEW_TEMPLATE_OPTION = '__new__'
const MASTER_CATALOG_DRAFT_KEY = 'jsjb-itp-master-catalog-draft-v3'
const LEGACY_MASTER_CATALOG_DRAFT_KEY = 'jsjb-itp-master-catalog-draft-v2'
const SAVED_TEMPLATES_COLLAPSED_KEY = 'jsjb-itp-saved-templates-collapsed'

function readSavedTemplatesCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SAVED_TEMPLATES_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeSavedTemplatesCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SAVED_TEMPLATES_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

function formatSavedTemplateUpdated(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim()
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10) || '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

type MasterCatalogDraft = {
  items: ItpMasterCatalogItem[]
  areas: ItpShopAreaDef[]
  processSections: ItpProcessSectionDef[]
}

function parseAreaDefs(raw: unknown): ItpShopAreaDef[] {
  return normalizeShopAreas(raw)
}

function withCatalogShopAreas(
  scope: ItpLibraryTemplateScope,
  items: ItpMasterCatalogItem[],
): ItpLibraryTemplateScope {
  const sel = { ...scope.sel }
  for (const item of items) {
    const current = sel[item.id]
    if (!current?.included || current.shopArea.trim()) continue
    const area = normalizeShopAreaValue(item.area) || item.area
    if (!area) continue
    sel[item.id] = { ...current, shopArea: area }
  }
  return { ...scope, sel }
}

function resolvedItemStation(shopArea: string | undefined, catalogArea: string | undefined): string {
  return (
    normalizeShopAreaValue(shopArea) ||
    normalizeShopAreaValue(catalogArea) ||
    catalogArea ||
    ''
  )
}

function parseProcessSectionDefs(raw: unknown, items: ItpMasterCatalogItem[]): ItpProcessSectionDef[] {
  return normalizeProcessSections(
    raw,
    items.map((item) => item.secId),
  )
}

function catalogFingerprint(
  items: ItpMasterCatalogItem[],
  areas: ItpShopAreaDef[],
  processSections: ItpProcessSectionDef[],
) {
  return [
    processSections.map((section) => `${section.id}|${section.title}`).join(','),
    areas.map((area) => `${area.value}|${area.label}`).join(','),
    items
      .map(
        (item) =>
          `${item.id}|${item.name}|${item.secId}|${item.area}|${item.requirePicture ? 1 : 0}|${item.requireMeasurement ? 1 : 0}|${item.requireNameplate ? 1 : 0}|${item.holdPoint ? 1 : 0}|${item.blockNext ? 1 : 0}|${(item.measFields ?? []).map((f) => f.label).join(',')}`,
      )
      .sort()
      .join('\n'),
  ].join('\n---\n')
}

function readMasterCatalogDraft(): MasterCatalogDraft | null {
  try {
    const raw =
      window.localStorage.getItem(MASTER_CATALOG_DRAFT_KEY) ??
      window.localStorage.getItem(LEGACY_MASTER_CATALOG_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { items?: unknown; areas?: unknown; processSections?: unknown }
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null
    const items = normalizeMasterCatalog(parsed.items)
    return {
      items,
      areas: parseAreaDefs(parsed.areas),
      processSections: parseProcessSectionDefs(parsed.processSections, items),
    }
  } catch {
    return null
  }
}

function writeMasterCatalogDraft(
  items: ItpMasterCatalogItem[],
  areas: ItpShopAreaDef[],
  processSections: ItpProcessSectionDef[],
) {
  try {
    window.localStorage.setItem(
      MASTER_CATALOG_DRAFT_KEY,
      JSON.stringify({ savedAt: new Date().toISOString(), items, areas, processSections }),
    )
  } catch {
    // Quota / private mode — ignore; beforeunload still warns.
  }
}

function migrationHint(message: string) {
  if (isItpLibraryTemplateSchemaError(message) || /missing columns name/i.test(message)) {
    return ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT
  }
  if (/column .*name.* does not exist|Could not find the .*column.*name/i.test(message)) {
    return ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT
  }
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return 'Run migration-itp-library-templates.sql (and the named templates migration) in Supabase, then try again'
  }
  if (/JWT|session|not authenticated|invalid claim|refresh_token|Auth session/i.test(message)) {
    return `${message} — sign in again, then click Save master list (Add to master only stages until save).`
  }
  return message
}

function formatSaveError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return migrationHint(error instanceof Error ? error.message : 'Could not save')
  }
  const e = error as { message?: string; code?: string; details?: string; hint?: string }
  const parts = [e.message, e.code ? `(${e.code})` : '', e.details, e.hint].filter(Boolean)
  return migrationHint(parts.join(' ') || 'Could not save')
}

function clearMasterCatalogDraft() {
  try {
    window.localStorage.removeItem(MASTER_CATALOG_DRAFT_KEY)
    window.localStorage.removeItem(LEGACY_MASTER_CATALOG_DRAFT_KEY)
  } catch {
    // ignore
  }
}

function scrollChildIntoView(root: HTMLElement | null, selector: string) {
  if (!root) return
  const el = root.querySelector<HTMLElement>(selector)
  if (!el) return
  const nextTop = root.scrollTop + (el.getBoundingClientRect().top - root.getBoundingClientRect().top) - 6
  root.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}

function getSel(scope: ItpLibraryTemplateScope, itemId: string): ItpLibraryItemSel {
  return migrateFastenerRecordSel(itemId, scope.sel[itemId] ?? emptyItemSel())
}

function applyCatalogReqToSel(
  sel: ItpLibraryItemSel,
  patch: Partial<ItpMasterCatalogItem>,
): ItpLibraryItemSel {
  const next: ItpLibraryItemSel = { ...sel }
  if ('holdPoint' in patch) next.holdPoint = Boolean(patch.holdPoint)
  if ('blockNext' in patch) next.blockNext = Boolean(patch.blockNext)
  if ('requirePicture' in patch) {
    next.requirePicture = Boolean(patch.requirePicture)
    if (!next.requirePicture) {
      next.pictureLabel = ''
      next.minPhotos = 1
      next.maxPhotos = 4
    }
  }
  if ('pictureLabel' in patch) next.pictureLabel = String(patch.pictureLabel ?? '')
  if ('minPhotos' in patch) next.minPhotos = clampLinePhotoMin(patch.minPhotos)
  if ('maxPhotos' in patch) next.maxPhotos = clampLinePhotoMax(patch.maxPhotos, next.minPhotos)
  if ('requireMeasurement' in patch || 'measFields' in patch) {
    const requireMeasurement =
      patch.requireMeasurement ?? Boolean(patch.measFields && patch.measFields.length > 0)
    if (!requireMeasurement && !('requireNameplate' in patch && patch.requireNameplate)) {
      next.beforeMeas = false
      next.afterMeas = false
      next.measVerify = false
      if (!next.requireNameplate) next.measFields = []
    } else {
      const measFields =
        patch.measFields && patch.measFields.length > 0
          ? patch.measFields.map((field) => ({ ...field }))
          : next.measFields.length > 0
            ? next.measFields
            : DEFAULT_ITP_MEAS_FIELDS.map((field) => ({ ...field }))
      next.beforeMeas = true
      next.afterMeas = true
      next.measVerify = true
      next.measFields = measFields
    }
  }
  if ('requireNameplate' in patch) {
    next.requireNameplate = Boolean(patch.requireNameplate)
    if (next.requireNameplate) {
      next.beforeMeas = true
      next.afterMeas = true
      next.measVerify = true
      next.measFields = NAMEPLATE_TRAVELER_FIELDS.map((field) => ({ ...field }))
    }
  }
  return next
}

type NewMasterDraft = {
  name: string
  area: ItpShopArea
  secId: string
  ref: string
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  maxPhotos: number
  requireMeasurement: boolean
  requireNameplate: boolean
  measFields: ItpMeasFieldDef[]
  holdPoint: boolean
  blockNext: boolean
}

const emptyNewMasterDraft = (): NewMasterDraft => ({
  name: '',
  area: defaultAreaForSection('receipt'),
  secId: 'receipt',
  ref: '',
  requirePicture: false,
  pictureLabel: '',
  minPhotos: 1,
  maxPhotos: 4,
  requireMeasurement: false,
  requireNameplate: false,
  measFields: DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f })),
  holdPoint: false,
  blockNext: false,
})

type ChecklistEditDraft = {
  mode: 'edit' | 'add'
  id: string
  afterItemId?: string
  secId: string
  area: ItpShopArea
  name: string
  ref: string
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  maxPhotos: number
  requireMeasurement: boolean
  requireNameplate: boolean
  measFields: ItpMeasFieldDef[]
  holdPoint: boolean
  blockNext: boolean
}

function draftFromCatalogItem(item: ItpMasterCatalogItem): ChecklistEditDraft {
  return {
    mode: 'edit',
    id: item.id,
    secId: item.secId,
    area: item.area,
    name: item.name,
    ref: item.ref === 'Custom' ? '' : item.ref,
    requirePicture: Boolean(item.requirePicture),
    pictureLabel: item.pictureLabel ?? '',
    minPhotos: clampLinePhotoMin(item.minPhotos),
    maxPhotos: clampLinePhotoMax(item.maxPhotos, item.minPhotos),
    requireMeasurement: Boolean(item.requireMeasurement),
    requireNameplate: Boolean(item.requireNameplate),
    measFields: (item.measFields && item.measFields.length > 0
      ? item.measFields
      : DEFAULT_ITP_MEAS_FIELDS
    ).map((field) => ({ ...field })),
    holdPoint: Boolean(item.holdPoint),
    blockNext: Boolean(item.blockNext),
  }
}

function emptyChecklistAddDraft(
  afterItemId: string,
  secId: string,
  area: ItpShopArea,
): ChecklistEditDraft {
  return {
    mode: 'add',
    id: '',
    afterItemId,
    secId,
    area,
    name: '',
    ref: '',
    requirePicture: false,
    pictureLabel: '',
    minPhotos: 1,
    maxPhotos: 4,
    requireMeasurement: false,
    requireNameplate: false,
    measFields: DEFAULT_ITP_MEAS_FIELDS.map((field) => ({ ...field })),
    holdPoint: false,
    blockNext: false,
  }
}

export type ItpTemplateBuilderFocus = {
  jobType?: string
  valveType?: string
  templateName?: string
}

export function ItpTemplateBuilderPanel({
  focus = null,
}: {
  focus?: ItpTemplateBuilderFocus | null
}) {
  const { showToast } = useToast()
  const [jobType, setJobType] = useState<ItpLibraryJobType>('repair')
  const [valveType, setValveType] = useState('')
  const [templateName, setTemplateName] = useState(ITP_LIBRARY_DEFAULT_TEMPLATE_NAME)
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null)
  const [isDefaultTemplate, setIsDefaultTemplate] = useState(false)
  const [savedTemplateFilter, setSavedTemplateFilter] = useState('')
  const [savedTemplatesCollapsed, setSavedTemplatesCollapsed] = useState(readSavedTemplatesCollapsed)
  const [workspaceMode, setWorkspaceMode] = useState<'edit' | 'traveler'>('edit')
  const [builderLayer, setBuilderLayer] = useState<BuilderLayer>('templates')
  const [travelerFocusItemId, setTravelerFocusItemId] = useState<string | null>(null)
  const [valveTypes, setValveTypes] = useState<string[]>([...VALVE_TYPES])
  const [scope, setScope] = useState<ItpLibraryTemplateScope>(() => emptyTemplateScope())
  const [jobMasterScope, setJobMasterScope] = useState<ItpLibraryTemplateScope>(() => emptyTemplateScope())
  const [jobMasterDirty, setJobMasterDirty] = useState(false)
  const [jobMasterExists, setJobMasterExists] = useState(false)
  const [valveMasterScope, setValveMasterScope] = useState<ItpLibraryTemplateScope>(() => emptyTemplateScope())
  const [valveMasterDirty, setValveMasterDirty] = useState(false)
  const [valveMasterExists, setValveMasterExists] = useState(false)
  const [catalog, setCatalog] = useState<ItpMasterCatalogItem[]>([])
  const [areas, setAreas] = useState<ItpShopAreaDef[]>(() => defaultShopAreas())
  const [processSections, setProcessSections] = useState<ItpProcessSectionDef[]>(() => defaultProcessSections())
  const [newSectionName, setNewSectionName] = useState('')
  const [newStationName, setNewStationName] = useState('')
  const [draggingSection, setDraggingSection] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const skipSectionChipClickRef = useRef(false)
  const masterBodyRef = useRef<HTMLDivElement | null>(null)
  const checklistBodyRef = useRef<HTMLDivElement | null>(null)
  /** When set, the next jobType/valveType load uses this template name (null = preferred default). */
  const pendingTemplateNameRef = useRef<string | null | undefined>(undefined)
  const appliedFocusKeyRef = useRef<string | null>(null)
  const [savedRows, setSavedRows] = useState<ItpLibraryTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [masterDirty, setMasterDirty] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
  const [itemNameDrafts, setItemNameDrafts] = useState<Record<string, string>>({})
  const [propagatePrompt, setPropagatePrompt] = useState<PropagatePrompt | null>(null)
  const [checklistEdit, setChecklistEdit] = useState<ChecklistEditDraft | null>(null)
  const [lineTravelerItemId, setLineTravelerItemId] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<NewMasterDraft>(() => emptyNewMasterDraft())

  useEffect(() => {
    if (!areas.length) return
    if (areas.some((area) => area.value === newItem.area)) return
    const first = areas[0]
    setNewItem((prev) => ({ ...prev, area: first.value }))
  }, [areas, newItem.area])

  useEffect(() => {
    if (!processSections.length) return
    if (processSections.some((section) => section.id === newItem.secId)) return
    const first = processSections[0]
    setNewItem((prev) => ({ ...prev, secId: first.id }))
  }, [processSections, newItem.secId])

  const selectedCount = useMemo(() => countIncludedInScope(scope), [scope])
  const jobMasterCount = useMemo(() => countIncludedInScope(jobMasterScope), [jobMasterScope])
  const jobMasterIds = useMemo(() => includedItemIds(jobMasterScope), [jobMasterScope])
  const valveMasterCount = useMemo(() => countIncludedInScope(valveMasterScope), [valveMasterScope])
  const valveMasterIds = useMemo(() => includedItemIds(valveMasterScope), [valveMasterScope])
  const canEditCatalog = builderLayer === 'global'
  const canAddOrEditRequirement = true
  const valveMasterCustomIds = useMemo(
    () => new Set(valveMasterScope.custom.map((row) => row.id)),
    [valveMasterScope.custom],
  )
  const templateCustomIds = useMemo(
    () => new Set(scope.custom.map((row) => row.id)),
    [scope.custom],
  )
  const showIncludeChecks =
    builderLayer === 'job_master' || builderLayer === 'valve_master' || builderLayer === 'templates'
  const editingScope =
    builderLayer === 'job_master'
      ? jobMasterScope
      : builderLayer === 'valve_master'
        ? valveMasterScope
        : scope
  const editingSelectedCount =
    builderLayer === 'job_master'
      ? jobMasterCount
      : builderLayer === 'valve_master'
        ? valveMasterCount
        : selectedCount
  const holdPointCount = useMemo(
    () => Object.values(editingScope.sel).filter((s) => s.included && s.holdPoint).length,
    [editingScope.sel],
  )
  const templatesForValve = useMemo(
    () =>
      savedRows
        .filter((row) => row.job_type === jobType && row.valve_type === valveType)
        .slice()
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)),
    [savedRows, jobType, valveType],
  )
  const savedForCurrent = useMemo(
    () =>
      templatesForValve.find(
        (row) => row.name.toLowerCase() === templateName.trim().toLowerCase(),
      ) ?? null,
    [templatesForValve, templateName],
  )
  const pickerValue = loadedTemplateName ?? NEW_TEMPLATE_OPTION

  const catalogForLayer = useMemo(() => {
    if (builderLayer === 'global') return catalog
    if (builderLayer === 'job_master') return mergeCatalogWithCustom(catalog, jobMasterScope)
    if (builderLayer === 'valve_master') {
      const merged = mergeCatalogWithCustom(catalog, jobMasterScope, valveMasterScope)
      if (jobMasterIds.size === 0) return merged
      return merged.filter(
        (item) => jobMasterIds.has(item.id) || valveMasterCustomIds.has(item.id),
      )
    }
    const merged = mergeCatalogWithCustom(catalog, jobMasterScope, valveMasterScope, scope)
    if (valveMasterIds.size > 0) {
      return merged.filter((item) => valveMasterIds.has(item.id) || templateCustomIds.has(item.id))
    }
    if (jobMasterIds.size > 0) {
      return merged.filter((item) => jobMasterIds.has(item.id) || templateCustomIds.has(item.id))
    }
    return merged
  }, [
    builderLayer,
    catalog,
    jobMasterScope,
    valveMasterScope,
    scope,
    jobMasterIds,
    valveMasterIds,
    valveMasterCustomIds,
    templateCustomIds,
  ])

  const catalogBySection = useMemo(() => {
    const sorted = catalogForLayer
      .slice()
      .map((item) => ({ ...item, secId: resolveLibrarySectionId(item.secId) || item.secId }))
      .sort((a, b) =>
        builderLayer === 'global'
          ? a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
          : compareItemsForLayer(a, b, editingScope),
      )
    const known = new Set(processSections.map((section) => section.id))
    const extra = [
      ...new Set(
        sorted
          .map((item) => item.secId)
          .filter((secId) => secId && !known.has(secId) && !isSpecialtyProcessSectionId(secId)),
      ),
    ].map((secId) => ({
      id: secId,
      title: processSectionTitle(secId, processSections),
      items: sorted.filter((item) => item.secId === secId),
    }))
    return [
      ...processSections.map((section) => ({
        id: section.id,
        title: section.title,
        items: sorted.filter((item) => item.secId === section.id),
      })),
      ...extra,
    ]
  }, [builderLayer, catalogForLayer, processSections, editingScope])

  const valveTypeOptions = useMemo(() => {
    const fromSaved = savedRows
      .filter((row) => row.job_type === jobType)
      .map((row) => row.valve_type.trim())
      .filter(Boolean)
    const merged = [...valveTypes]
    for (const vt of fromSaved) {
      if (!merged.some((existing) => existing.toLowerCase() === vt.toLowerCase())) {
        merged.push(vt)
      }
    }
    return merged
  }, [valveTypes, savedRows, jobType])

  const savedRowsForJob = useMemo(
    () =>
      savedRows
        .filter((row) => row.job_type === jobType)
        .slice()
        .sort((a, b) => a.valve_type.localeCompare(b.valve_type) || a.name.localeCompare(b.name)),
    [savedRows, jobType],
  )

  const filteredSavedRowsForJob = useMemo(() => {
    const q = savedTemplateFilter.trim().toLowerCase()
    if (!q) return savedRowsForJob
    return savedRowsForJob.filter((row) => {
      const hay = `${row.valve_type} ${row.name}${row.is_default ? ' default' : ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [savedRowsForJob, savedTemplateFilter])

  const catalogById = useMemo(() => {
    const merged = mergeCatalogWithCustom(catalog, jobMasterScope, valveMasterScope, scope)
    return new Map(merged.map((item) => [item.id, item]))
  }, [catalog, jobMasterScope, valveMasterScope, scope])

  const refreshSavedList = useCallback(async () => {
    try {
      setSavedRows(await listItpLibraryTemplates())
      setSchemaError(null)
    } catch (error) {
      setSavedRows([])
      if (isItpLibraryTemplateSchemaError(error)) {
        setSchemaError(ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT)
      }
    }
  }, [])

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const probe = await probeItpLibraryTemplateSchema()
      if (!probe.ok) {
        setSchemaError(probe.message)
        // Still seed the in-memory catalog so the UI is usable offline until migration runs.
        const fallback = await loadItpMasterCatalog().catch(() => emptyMasterCatalogState())
        setCatalog(fallback.items)
        setAreas(fallback.areas)
        setProcessSections(fallback.processSections)
        setCatalogLoading(false)
        return
      }
      setSchemaError(null)
      const server = await loadItpMasterCatalog()
      const draft = readMasterCatalogDraft()
      const draftFingerprint = draft
        ? catalogFingerprint(draft.items, draft.areas, draft.processSections)
        : ''
      const serverFingerprint = catalogFingerprint(server.items, server.areas, server.processSections)
      if (draft && draftFingerprint && draftFingerprint !== serverFingerprint) {
        setCatalog(reindexCatalog(draft.items))
        setAreas(draft.areas.length ? draft.areas : server.areas)
        setProcessSections(draft.processSections.length ? draft.processSections : server.processSections)
        setMasterDirty(true)
        showToast('Restored unsaved master list draft — click Save master list to keep it')
      } else {
        clearMasterCatalogDraft()
        setCatalog(server.items)
        setAreas(server.areas)
        setProcessSections(server.processSections)
        setMasterDirty(false)
      }
    } catch (error) {
      if (isItpLibraryTemplateSchemaError(error)) {
        setSchemaError(ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT)
      } else {
        showToast('Could not load master list')
      }
    } finally {
      setCatalogLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    if (!masterDirty) return
    writeMasterCatalogDraft(catalog, areas, processSections)
  }, [catalog, areas, processSections, masterDirty])

  useEffect(() => {
    if (!masterDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [masterDirty])

  useEffect(() => {
    void (async () => {
      try {
        const map = await loadLookupOptionsMap()
        const fromDb = (map.valve_type ?? []).map((v) => v.trim()).filter(Boolean)
        setValveTypes(fromDb.length ? fromDb : [...VALVE_TYPES])
      } catch {
        setValveTypes([...VALVE_TYPES])
      }
    })()
    void refreshSavedList()
    void refreshCatalog()
  }, [refreshSavedList, refreshCatalog])

  const loadTemplate = useCallback(
    async (jt: ItpLibraryJobType, vt: string, name?: string | null) => {
      if (!vt.trim()) {
        setScope(emptyTemplateScope())
        setTemplateName(ITP_LIBRARY_DEFAULT_TEMPLATE_NAME)
        setLoadedTemplateName(null)
        setIsDefaultTemplate(false)
        setDirty(false)
        return
      }
      setLoading(true)
      try {
        const requestedName = name == null ? null : String(name).trim()
        const stored = await loadItpLibraryTemplate(jt, vt, requestedName || null)
        if (stored && stored.name !== ITP_LIBRARY_VALVE_MASTER_NAME) {
          setScope(stored.scope)
          setTemplateName(stored.name)
          setLoadedTemplateName(stored.name)
          setIsDefaultTemplate(stored.is_default)
        } else {
          setScope(scopeFromCodeTemplate(jt, vt))
          const fallbackName = requestedName || ITP_LIBRARY_DEFAULT_TEMPLATE_NAME
          setTemplateName(fallbackName)
          setLoadedTemplateName(null)
          setIsDefaultTemplate(false)
        }
        setDirty(false)
        setSubReqDrafts({})
      } catch (error) {
        showToast(migrationHint(error instanceof Error ? error.message : 'Could not load template'))
        setScope(scopeFromCodeTemplate(jt, vt))
        setTemplateName(ITP_LIBRARY_DEFAULT_TEMPLATE_NAME)
        setLoadedTemplateName(null)
        setIsDefaultTemplate(false)
        setDirty(false)
      } finally {
        setLoading(false)
      }
    },
    [showToast],
  )

  const loadJobMaster = useCallback(
    async (jt: ItpLibraryJobType) => {
      try {
        const stored = await loadJobTypeMaster(jt)
        if (stored && countIncludedInScope(stored.scope) > 0) {
          setJobMasterScope(stored.scope)
          setJobMasterExists(true)
          setJobMasterDirty(false)
          return
        }
        setJobMasterScope(emptyTemplateScope())
        setJobMasterExists(false)
        setJobMasterDirty(false)
      } catch (error) {
        showToast(migrationHint(error instanceof Error ? error.message : 'Could not load job type master'))
        setJobMasterScope(emptyTemplateScope())
        setJobMasterExists(false)
        setJobMasterDirty(false)
      }
    },
    [showToast],
  )

  const loadValveMaster = useCallback(
    async (jt: ItpLibraryJobType, vt: string) => {
      if (!vt.trim()) {
        setValveMasterScope(emptyTemplateScope())
        setValveMasterExists(false)
        setValveMasterDirty(false)
        return
      }
      try {
        const stored = await loadValveTypeMaster(jt, vt)
        if (stored && countIncludedInScope(stored.scope) > 0) {
          setValveMasterScope(stored.scope)
          setValveMasterExists(true)
          setValveMasterDirty(false)
          return
        }
        setValveMasterScope(emptyTemplateScope())
        setValveMasterExists(false)
        setValveMasterDirty(false)
      } catch (error) {
        showToast(migrationHint(error instanceof Error ? error.message : 'Could not load valve type master'))
        setValveMasterScope(emptyTemplateScope())
        setValveMasterExists(false)
        setValveMasterDirty(false)
      }
    },
    [showToast],
  )

  useEffect(() => {
    void loadJobMaster(jobType)
  }, [jobType, loadJobMaster])

  useEffect(() => {
    void loadValveMaster(jobType, valveType)
  }, [jobType, valveType, loadValveMaster])

  useEffect(() => {
    if (jobMasterExists || jobMasterDirty) return
    const fromTemplates = unionIncludedScopes(
      savedRows.filter((row) => row.job_type === jobType).map((row) => row.scope),
    )
    if (countIncludedInScope(fromTemplates) === 0) return
    setJobMasterScope(fromTemplates)
    setJobMasterDirty(true)
  }, [savedRows, jobType, jobMasterExists, jobMasterDirty])

  useEffect(() => {
    if (!valveType.trim() || valveMasterExists || valveMasterDirty) return
    const fromTemplates = unionIncludedScopes(
      savedRows
        .filter((row) => row.job_type === jobType && row.valve_type === valveType)
        .map((row) => row.scope),
    )
    if (countIncludedInScope(fromTemplates) === 0) return
    setValveMasterScope(fromTemplates)
    setValveMasterDirty(true)
  }, [savedRows, jobType, valveType, valveMasterExists, valveMasterDirty])

  useEffect(() => {
    const named = pendingTemplateNameRef.current
    pendingTemplateNameRef.current = undefined
    void loadTemplate(jobType, valveType, named === undefined ? null : named)
  }, [jobType, valveType, loadTemplate])

  useEffect(() => {
    if (!focus) return
    const jtRaw = focus.jobType?.trim() ?? ''
    const vt = focus.valveType?.trim() ?? ''
    const tn = focus.templateName?.trim() ?? ''
    if (!jtRaw && !vt && !tn) return
    const key = `${jtRaw}|${vt}|${tn}`
    if (appliedFocusKeyRef.current === key) return
    appliedFocusKeyRef.current = key
    const jt = mapShopJobTypeToLibrary(jtRaw || jobType)
    const nextValve = vt || valveType
    pendingTemplateNameRef.current = tn || null
    setBuilderLayer('templates')
    if (jt === jobType && nextValve === valveType) {
      void loadTemplate(jt, nextValve, tn || null)
      return
    }
    setJobType(jt)
    setValveType(nextValve)
  }, [focus, jobType, valveType, loadTemplate])

  const startNewTemplate = () => {
    if (!valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    setWorkspaceMode('edit')
    setTravelerFocusItemId(null)
    setScope(scopeFromCodeTemplate(jobType, valveType))
    setTemplateName('')
    setLoadedTemplateName(null)
    setIsDefaultTemplate(templatesForValve.length === 0)
    setDirty(true)
    setSubReqDrafts({})
  }

  const openSavedTemplate = (
    row: ItpLibraryTemplateRow,
    mode: 'edit' | 'traveler' = 'edit',
  ) => {
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    setBuilderLayer('templates')
    setWorkspaceMode(mode)
    setTravelerFocusItemId(null)
    const jt = mapShopJobTypeToLibrary(row.job_type)
    pendingTemplateNameRef.current = row.name
    if (jt === jobType && row.valve_type === valveType) {
      void loadTemplate(jt, row.valve_type, row.name)
      return
    }
    setJobType(jt)
    setValveType(row.valve_type)
  }

  const selectExistingTemplate = (name: string) => {
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    setWorkspaceMode('edit')
    void loadTemplate(jobType, valveType, name)
  }

  const updateSel = (itemId: string, patch: Partial<ItpLibraryItemSel>) => {
    const apply = (prev: ItpLibraryTemplateScope) => ({
      ...prev,
      sel: {
        ...prev.sel,
        [itemId]: { ...(prev.sel[itemId] ?? emptyItemSel()), ...patch },
      },
    })
    if (builderLayer === 'job_master') {
      setJobMasterScope(apply)
      setJobMasterDirty(true)
      return
    }
    if (builderLayer === 'valve_master') {
      setValveMasterScope(apply)
      setValveMasterDirty(true)
      return
    }
    setScope(apply)
    setDirty(true)
  }

  const ensureCustomOnScope = (item: ItpMasterCatalogItem, prev: ItpLibraryTemplateScope) => {
    if (item.builtIn) return prev.custom
    if (prev.custom.some((c) => c.id === item.id)) return prev.custom
    return [...prev.custom, { id: item.id, secId: item.secId, name: item.name }]
  }

  const applyIncludeToScope = (
    prev: ItpLibraryTemplateScope,
    itemId: string,
    included: boolean,
    catalogItem: ItpMasterCatalogItem | undefined,
  ): ItpLibraryTemplateScope => {
    const current = getSel(prev, itemId)
    let nextSel: ItpLibraryItemSel = { ...current, included }
    if (included) {
      let subReqs = current.subReqs
      if (subReqs.length === 0) {
        if (catalogItem?.defaultSubReqs?.length) subReqs = [...catalogItem.defaultSubReqs]
        else {
          const found = findLibraryItem(itemId)
          if (found?.item.defaultSubReqs?.length) subReqs = [...found.item.defaultSubReqs]
        }
      }
      nextSel = migrateFastenerRecordSel(itemId, {
        ...selFromRequirementDefaults(
          { ...current, included: true, subReqs },
          catalogItem ? requirementDefaultsFromCatalogItem(catalogItem) : null,
        ),
        included: true,
        subReqs,
        shopArea: current.shopArea.trim() || String(catalogItem?.area ?? '').trim(),
      })
    }
    const custom = included && catalogItem ? ensureCustomOnScope(catalogItem, prev) : prev.custom
    return {
      ...prev,
      custom,
      sel: {
        ...prev.sel,
        [itemId]: nextSel,
      },
    }
  }

  const toggleInclude = (itemId: string) => {
    if (builderLayer === 'global') return
    if ((builderLayer === 'valve_master' || builderLayer === 'templates') && !valveType.trim()) {
      showToast('Select a valve type first, then check items')
      return
    }
    if (!catalogForLayer.some((item) => item.id === itemId)) {
      if (builderLayer === 'valve_master') showToast('Add this item to the Job Type Master first')
      else if (valveMasterIds.size > 0) showToast('Add this item to the Valve Type Master first')
      else showToast('Add this item to the Job Type Master first')
      return
    }
    const catalogItem = catalogById.get(itemId)
    const current = getSel(editingScope, itemId)
    const included = !current.included
    if (builderLayer === 'job_master') {
      setJobMasterScope((prev) => applyIncludeToScope(prev, itemId, included, catalogItem))
      setJobMasterDirty(true)
      return
    }
    if (builderLayer === 'valve_master') {
      setValveMasterScope((prev) => applyIncludeToScope(prev, itemId, included, catalogItem))
      setValveMasterDirty(true)
      return
    }
    setScope((prev) => applyIncludeToScope(prev, itemId, included, catalogItem))
    setDirty(true)
  }

  const selectAllInSection = (secId: string, select: boolean) => {
    if (builderLayer === 'global') return
    if ((builderLayer === 'valve_master' || builderLayer === 'templates') && !valveType.trim()) {
      showToast('Select a valve type first, then check items')
      return
    }
    const sectionItems = catalogForLayer.filter((item) => item.secId === secId)
    const apply = (prev: ItpLibraryTemplateScope) => {
      let custom = [...prev.custom]
      const sel = { ...prev.sel }
      for (const item of sectionItems) {
        const current = sel[item.id] ?? emptyItemSel()
        let nextSel: ItpLibraryItemSel = { ...current, included: select }
        if (select) {
          let subReqs = current.subReqs
          if (subReqs.length === 0 && item.defaultSubReqs?.length) {
            subReqs = [...item.defaultSubReqs]
          }
          nextSel = migrateFastenerRecordSel(item.id, {
            ...selFromRequirementDefaults(
              { ...current, included: true, subReqs },
              requirementDefaultsFromCatalogItem(item),
            ),
            included: true,
            subReqs,
            shopArea: current.shopArea.trim() || String(item.area ?? '').trim(),
          })
        }
        sel[item.id] = nextSel
        if (select && !item.builtIn && !custom.some((c) => c.id === item.id)) {
          custom = [...custom, { id: item.id, secId: item.secId, name: item.name }]
        }
      }
      return { ...prev, sel, custom }
    }
    if (builderLayer === 'job_master') {
      setJobMasterScope(apply)
      setJobMasterDirty(true)
      return
    }
    if (builderLayer === 'valve_master') {
      setValveMasterScope(apply)
      setValveMasterDirty(true)
      return
    }
    setScope(apply)
    setDirty(true)
  }

  const deselectAll = () => {
    const clear = (prev: ItpLibraryTemplateScope) => {
      const sel = { ...prev.sel }
      for (const [id, value] of Object.entries(sel)) {
        sel[id] = { ...value, included: false }
      }
      return { ...prev, sel }
    }
    if (builderLayer === 'job_master') {
      setJobMasterScope(clear)
      setJobMasterDirty(true)
      return
    }
    if (builderLayer === 'valve_master') {
      setValveMasterScope(clear)
      setValveMasterDirty(true)
      return
    }
    setScope(clear)
    setDirty(true)
  }

  const addSubReq = (itemId: string) => {
    const text = (subReqDrafts[itemId] ?? '').trim()
    if (!text) return
    const current = getSel(editingScope, itemId)
    updateSel(itemId, { subReqs: [...current.subReqs, text] })
    setSubReqDrafts((prev) => ({ ...prev, [itemId]: '' }))
  }

  const removeSubReq = (itemId: string, index: number) => {
    const current = getSel(editingScope, itemId)
    updateSel(itemId, { subReqs: current.subReqs.filter((_, i) => i !== index) })
  }

  const addMasterItem = () => {
    const name = newItem.name.trim()
    if (!name) {
      showToast('Enter the requirement text')
      return
    }
    if ((builderLayer === 'valve_master' || builderLayer === 'templates') && !valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    const secId = newItem.secId
    const id = `master-${secId}-${Date.now().toString(36)}`
    const nextOrder =
      Math.max(
        catalog.reduce((max, item) => Math.max(max, item.sortOrder), -1),
        catalogForLayer.reduce((max, item) => Math.max(max, item.sortOrder), -1),
      ) + 1
    const measFields =
      newItem.requireNameplate
        ? NAMEPLATE_TRAVELER_FIELDS.map((f) => ({ ...f }))
        : newItem.requireMeasurement
          ? newItem.measFields
              .map((f) =>
                emptyMeasField({
                  id: f.id || newMeasFieldId(),
                  label: f.label.trim(),
                  type: f.type,
                  options: f.options,
                  required: f.required,
                }),
              )
              .filter((f) => f.label)
          : undefined
    if (newItem.requireMeasurement && !newItem.requireNameplate && (!measFields || measFields.length === 0)) {
      showToast('Add at least one measurement field label')
      return
    }
    const catalogItem: ItpMasterCatalogItem = {
      id,
      name,
      ref: newItem.ref.trim() || 'Custom',
      secId,
      area: newItem.area,
      sortOrder: nextOrder,
      builtIn: false,
      requirePicture: newItem.requirePicture || undefined,
      pictureLabel: newItem.requirePicture ? newItem.pictureLabel.trim() || undefined : undefined,
      minPhotos: newItem.requirePicture ? clampLinePhotoMin(newItem.minPhotos) : undefined,
      maxPhotos: newItem.requirePicture ? clampLinePhotoMax(newItem.maxPhotos, newItem.minPhotos) : undefined,
      requireMeasurement: newItem.requireMeasurement || newItem.requireNameplate || undefined,
      requireNameplate: newItem.requireNameplate || undefined,
      measFields,
      holdPoint: newItem.holdPoint || undefined,
      blockNext: newItem.blockNext || undefined,
    }
    if (builderLayer === 'global') {
      setCatalog((prev) => reindexCatalog([...prev, catalogItem]))
      setNewItem(emptyNewMasterDraft())
      setMasterDirty(true)
      showToast(
        `Staged in ${processSectionTitle(secId, processSections)} — not saved yet. Click Save global master.`,
      )
      return
    }
    setPropagatePrompt({ kind: 'add', item: catalogItem })
  }

  /** Manage Traveler: create a catalog item, include it on this template, and put inputs on the traveler. */
  const addTravelerRequirement = (draft: TravelerRequirementDraft): string | null => {
    const name = draft.name.trim()
    if (!name) {
      showToast('Enter the requirement text')
      return null
    }
    if (!valveType.trim()) {
      showToast('Select a valve type first')
      return null
    }
    const secId = draft.secId
    const id = `master-${secId}-${Date.now().toString(36)}`
    const nextOrder = catalog.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
    const measFields =
      draft.requireNameplate
        ? NAMEPLATE_TRAVELER_FIELDS.map((f) => ({ ...f }))
        : draft.requireMeasurement
          ? draft.measFields
              .map((f) =>
                emptyMeasField({
                  id: f.id || newMeasFieldId(),
                  label: f.label.trim(),
                  type: f.type,
                  options: f.options,
                  required: f.required,
                }),
              )
              .filter((f) => f.label)
          : undefined
    if (draft.requireMeasurement && !draft.requireNameplate && (!measFields || measFields.length === 0)) {
      showToast('Add at least one measurement field label')
      return null
    }
    const catalogItem: ItpMasterCatalogItem = {
      id,
      name,
      ref: draft.ref.trim() || 'Custom',
      secId,
      area: draft.area,
      sortOrder: nextOrder,
      builtIn: false,
      requirePicture: draft.requirePicture || undefined,
      pictureLabel: draft.requirePicture ? draft.pictureLabel.trim() || undefined : undefined,
      minPhotos: draft.requirePicture ? clampLinePhotoMin(draft.minPhotos) : undefined,
      maxPhotos: draft.requirePicture ? clampLinePhotoMax(draft.maxPhotos, draft.minPhotos) : undefined,
      requireMeasurement: draft.requireMeasurement || draft.requireNameplate || undefined,
      requireNameplate: draft.requireNameplate || undefined,
      measFields,
      holdPoint: draft.holdPoint || undefined,
      blockNext: draft.blockNext || undefined,
    }
    setCatalog((prev) => reindexCatalog([...prev, catalogItem]))
    const hasTravelerInputs =
      Boolean(draft.requirePicture) ||
      Boolean(draft.requireMeasurement) ||
      Boolean(draft.requireNameplate) ||
      Boolean(draft.holdPoint)
    setScope((prev) => {
      const base = emptyItemSel()
      const withReqs = selFromRequirementDefaults(base, requirementDefaultsFromCatalogItem(catalogItem))
      return {
        ...prev,
        custom: [...prev.custom, { id, secId, name }],
        sel: {
          ...prev.sel,
          [id]: {
            ...withReqs,
            included: true,
            addToTraveler: hasTravelerInputs,
          },
        },
      }
    })
    setMasterDirty(true)
    setDirty(true)
    setTravelerFocusItemId(id)
    showToast(`Added “${name}” to traveler — Save template when ready`)
    return id
  }

  const removeMasterItem = (itemId: string) => {
    const item = catalogById.get(itemId)
    if (!item) return
    if (item.builtIn) {
      showToast('Built-in items stay on the master list — change their section or order instead')
      return
    }
    if (!window.confirm(`Remove “${item.name}” from the master list?`)) return
    setCatalog((prev) => reindexCatalog(prev.filter((row) => row.id !== itemId)))
    setScope((prev) => ({
      ...prev,
      custom: prev.custom.filter((c) => c.id !== itemId),
      sel: Object.fromEntries(Object.entries(prev.sel).filter(([id]) => id !== itemId)),
    }))
    setMasterDirty(true)
    setDirty(true)
  }

  const changeChecklistStation = (itemId: string, area: ItpShopArea) => {
    updateSel(itemId, { shopArea: normalizeShopAreaValue(area) || area })
  }

  const changeItemArea = (itemId: string, area: ItpShopArea) => {
    const next = normalizeShopAreaValue(area) || area
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, area: next } : item)))
    setMasterDirty(true)
  }

  const changeRowStation = (itemId: string, area: ItpShopArea) => {
    if (builderLayer === 'global') changeItemArea(itemId, area)
    else changeChecklistStation(itemId, area)
  }

  const changeItemSection = (itemId: string, secId: string) => {
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, secId } : item)))
    setMasterDirty(true)
  }

  const patchCatalogAndLinkedSels = (itemId: string, patch: Partial<ItpMasterCatalogItem>) => {
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
    setMasterDirty(true)
    const applySel = (prev: ItpLibraryTemplateScope): ItpLibraryTemplateScope => {
      const current = prev.sel[itemId]
      if (!current?.included) return prev
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: applyCatalogReqToSel(current, patch),
        },
      }
    }
    setScope((prev) => applySel(prev))
    setJobMasterScope((prev) => applySel(prev))
    setValveMasterScope((prev) => applySel(prev))
    if (getSel(scope, itemId).included) setDirty(true)
    if (getSel(jobMasterScope, itemId).included) setJobMasterDirty(true)
    if (getSel(valveMasterScope, itemId).included) setValveMasterDirty(true)
  }

  const insertNewItemBelow = (
    prev: ItpLibraryTemplateScope,
    newId: string,
    belowId: string,
    sectionId: string,
  ): ItpLibraryTemplateScope => {
    const rows = catalogForLayer
      .filter((row) => {
        if (row.id === newId) return false
        const sel = getSel(prev, row.id)
        if (!sel.included) return false
        return effectiveScopeSectionId(row.secId, sel) === sectionId
      })
      .slice()
      .sort((a, b) => compareItemsForLayer(a, b, prev))
      .map((row) => row.id)
    const idx = rows.indexOf(belowId)
    rows.splice(idx < 0 ? rows.length : idx + 1, 0, newId)
    return applyScopeOrder(prev, rows)
  }

  const applyRequirementChange = (
    item: ItpMasterCatalogItem,
    patch: Partial<ItpMasterCatalogItem>,
    propagate: boolean,
    kind: 'add' | 'edit',
    options?: { silent?: boolean; insertBelowItemId?: string },
  ) => {
    const itemInCatalog = catalog.some((row) => row.id === item.id)
    const populateParents = propagate && (kind === 'add' || !itemInCatalog)
    const withDetail = !propagate

    const touchScope = (
      setter: typeof setScope,
      dirtySetter: typeof setDirty,
      include: boolean,
    ) => {
      setter((prev) => {
        let next = prev
        if (include) next = applyIncludeToScope(next, item.id, true, item)
        next = { ...next, custom: upsertCustomItem(next.custom, item, withDetail) }
        if (Object.keys(patch).length > 0) {
          const current = next.sel[item.id]
          if (current) {
            next = {
              ...next,
              sel: {
                ...next.sel,
                [item.id]: applyCatalogReqToSel(current, patch),
              },
            }
          }
        }
        if (!withDetail) {
          next = {
            ...next,
            custom: next.custom.map((row) =>
              row.id === item.id ? { id: item.id, secId: item.secId, name: item.name } : row,
            ),
          }
        }
        if (kind === 'add' && include && options?.insertBelowItemId) {
          next = insertNewItemBelow(next, item.id, options.insertBelowItemId, item.secId)
        }
        return next
      })
      dirtySetter(true)
    }

    if (propagate) {
      setCatalog((prev) => {
        const exists = prev.some((row) => row.id === item.id)
        return reindexCatalog(
          exists ? prev.map((row) => (row.id === item.id ? { ...row, ...item } : row)) : [...prev, item],
        )
      })
      setMasterDirty(true)
    }

    if (builderLayer === 'job_master') {
      touchScope(setJobMasterScope, setJobMasterDirty, kind === 'add')
    } else if (builderLayer === 'valve_master') {
      touchScope(setValveMasterScope, setValveMasterDirty, kind === 'add')
      if (populateParents) touchScope(setJobMasterScope, setJobMasterDirty, true)
      else if (propagate) touchScope(setJobMasterScope, setJobMasterDirty, false)
    } else if (builderLayer === 'templates') {
      touchScope(setScope, setDirty, kind === 'add')
      if (populateParents) {
        touchScope(setValveMasterScope, setValveMasterDirty, true)
        touchScope(setJobMasterScope, setJobMasterDirty, true)
      } else if (propagate) {
        touchScope(setValveMasterScope, setValveMasterDirty, false)
        touchScope(setJobMasterScope, setJobMasterDirty, false)
      }
    }

    if (options?.silent) return
    if (kind === 'add') {
      setNewItem(emptyNewMasterDraft())
      showToast(
        propagate
          ? `Added “${item.name}” here and to parent masters — save each step that shows unsaved`
          : `Added “${item.name}” on this master only — not saved yet`,
      )
    } else {
      showToast(
        propagate
          ? `Updated “${item.name}” on this master and parents — save to keep the change`
          : `Updated “${item.name}” on this master only — not saved yet`,
      )
    }
  }

  const resolvePropagatePrompt = (propagate: boolean) => {
    if (!propagatePrompt) return
    const { kind, item, patch } = propagatePrompt
    setPropagatePrompt(null)
    if (kind === 'edit') {
      setItemNameDrafts((prev) => {
        if (!(item.id in prev)) return prev
        const next = { ...prev }
        delete next[item.id]
        return next
      })
    }
    applyRequirementChange(item, patch ?? {}, propagate, kind, {
      insertBelowItemId: propagatePrompt.insertBelowItemId,
    })
  }

  const patchMasterItem = (
    itemId: string,
    patch: Partial<ItpMasterCatalogItem>,
    options?: { prompt?: boolean },
  ) => {
    if (builderLayer === 'global') {
      patchCatalogAndLinkedSels(itemId, patch)
      return
    }
    const item = catalogById.get(itemId)
    if (!item) return
    const nextItem = { ...item, ...patch }
    if (options?.prompt === false) {
      applyRequirementChange(nextItem, patch, false, 'edit', { silent: true })
      return
    }
    setPropagatePrompt({ kind: 'edit', item: nextItem, patch })
  }

  const commitItemName = (item: ItpMasterCatalogItem) => {
    const nextName = (itemNameDrafts[item.id] ?? item.name).trim()
    if (!nextName || nextName === item.name) {
      setItemNameDrafts((prev) => {
        if (!(item.id in prev)) return prev
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }
    if (builderLayer === 'global') {
      patchCatalogAndLinkedSels(item.id, { name: nextName })
      setItemNameDrafts((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }
    setPropagatePrompt({
      kind: 'edit',
      item: { ...item, name: nextName },
      patch: { name: nextName },
    })
  }

  const openChecklistEdit = (itemId: string) => {
    const item = catalogById.get(itemId)
    if (!item) {
      showToast('Could not find that requirement')
      return
    }
    setChecklistEdit(draftFromCatalogItem(item))
  }

  const openChecklistAddBelow = (itemId: string, secId: string, area: ItpShopArea) => {
    if ((builderLayer === 'valve_master' || builderLayer === 'templates') && !valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    setChecklistEdit(emptyChecklistAddDraft(itemId, secId, area))
  }

  const saveChecklistEdit = () => {
    if (!checklistEdit) return
    const name = checklistEdit.name.trim()
    if (!name) {
      showToast('Enter the requirement text')
      return
    }
    const measFields =
      checklistEdit.requireNameplate
        ? NAMEPLATE_TRAVELER_FIELDS.map((field) => ({ ...field }))
        : checklistEdit.requireMeasurement
          ? checklistEdit.measFields
              .map((field) =>
                emptyMeasField({
                  id: field.id || newMeasFieldId(),
                  label: field.label.trim(),
                  type: field.type,
                  options: field.options,
                  required: field.required,
                }),
              )
              .filter((field) => field.label)
          : undefined
    if (
      checklistEdit.requireMeasurement &&
      !checklistEdit.requireNameplate &&
      (!measFields || measFields.length === 0)
    ) {
      showToast('Add at least one measurement field label')
      return
    }
    if (checklistEdit.mode === 'add') {
      const secId = checklistEdit.secId
      const id = `master-${secId}-${Date.now().toString(36)}`
      const nextOrder =
        Math.max(
          catalog.reduce((max, item) => Math.max(max, item.sortOrder), -1),
          catalogForLayer.reduce((max, item) => Math.max(max, item.sortOrder), -1),
        ) + 1
      const catalogItem: ItpMasterCatalogItem = {
        id,
        name,
        ref: checklistEdit.ref.trim() || 'Custom',
        secId,
        area: checklistEdit.area,
        sortOrder: nextOrder,
        builtIn: false,
        requirePicture: checklistEdit.requirePicture || undefined,
        pictureLabel: checklistEdit.requirePicture
          ? checklistEdit.pictureLabel.trim() || undefined
          : undefined,
        minPhotos: checklistEdit.requirePicture ? clampLinePhotoMin(checklistEdit.minPhotos) : undefined,
        maxPhotos: checklistEdit.requirePicture
          ? clampLinePhotoMax(checklistEdit.maxPhotos, checklistEdit.minPhotos)
          : undefined,
        requireMeasurement: checklistEdit.requireMeasurement || checklistEdit.requireNameplate || undefined,
        requireNameplate: checklistEdit.requireNameplate || undefined,
        measFields,
        holdPoint: checklistEdit.holdPoint || undefined,
        blockNext: checklistEdit.blockNext || undefined,
      }
      const afterId = checklistEdit.afterItemId
      setChecklistEdit(null)
      if (builderLayer === 'global') {
        setCatalog((prev) => reindexCatalog([...prev, catalogItem]))
        setMasterDirty(true)
        showToast(`Staged “${name}” — click Save global master`)
        return
      }
      setPropagatePrompt({ kind: 'add', item: catalogItem, insertBelowItemId: afterId })
      return
    }
    const original = catalogById.get(checklistEdit.id)
    if (!original) {
      setChecklistEdit(null)
      return
    }
    const patch: Partial<ItpMasterCatalogItem> = {
      name,
      ref: checklistEdit.ref.trim() || original.ref || 'Custom',
      requirePicture: checklistEdit.requirePicture || undefined,
      pictureLabel: checklistEdit.requirePicture
        ? checklistEdit.pictureLabel.trim() || undefined
        : undefined,
      minPhotos: checklistEdit.requirePicture ? clampLinePhotoMin(checklistEdit.minPhotos) : undefined,
      maxPhotos: checklistEdit.requirePicture
        ? clampLinePhotoMax(checklistEdit.maxPhotos, checklistEdit.minPhotos)
        : undefined,
      requireMeasurement: checklistEdit.requireMeasurement || checklistEdit.requireNameplate || undefined,
      requireNameplate: checklistEdit.requireNameplate || undefined,
      measFields,
      holdPoint: checklistEdit.holdPoint || undefined,
      blockNext: checklistEdit.blockNext || undefined,
    }
    const nextItem: ItpMasterCatalogItem = { ...original, ...patch }
    setChecklistEdit(null)
    if (builderLayer === 'global') {
      patchCatalogAndLinkedSels(original.id, patch)
      showToast(`Updated “${name}”`)
      return
    }
    setPropagatePrompt({ kind: 'edit', item: nextItem, patch })
  }

  /** Template-only: move a checklist line between ITP sections without changing the master catalog. */
  const changeTemplateItemSection = (itemId: string, secId: string) => {
    updateSel(itemId, { sectionId: secId })
  }

  const moveItem = (itemId: string, direction: -1 | 1) => {
    setCatalog((prev) => moveCatalogItemInSection(prev, itemId, direction))
    setMasterDirty(true)
  }

  const moveLayerItemInSection = (
    sectionId: string,
    itemId: string,
    direction: -1 | 1,
    includedOnly: boolean,
  ) => {
    if (builderLayer === 'global') {
      moveItem(itemId, direction)
      return
    }
    const rows = catalogForLayer
      .filter((item) => {
        const sel = getSel(editingScope, item.id)
        if (includedOnly) {
          if (!sel.included) return false
          return effectiveScopeSectionId(item.secId, sel) === sectionId
        }
        return (resolveLibrarySectionId(item.secId) || item.secId) === sectionId
      })
      .slice()
      .sort((a, b) => compareItemsForLayer(a, b, editingScope))
    const index = rows.findIndex((row) => row.id === itemId)
    const swapWith = index + direction
    if (index < 0 || swapWith < 0 || swapWith >= rows.length) return
    const ordered = [...rows]
    const current = ordered[index]
    ordered[index] = ordered[swapWith]
    ordered[swapWith] = current
    const orderedIds = ordered.map((row) => row.id)
    if (builderLayer === 'job_master') {
      setJobMasterScope((prev) => applyScopeOrder(prev, orderedIds))
      setJobMasterDirty(true)
      return
    }
    if (builderLayer === 'valve_master') {
      setValveMasterScope((prev) => applyScopeOrder(prev, orderedIds))
      setValveMasterDirty(true)
      return
    }
    setScope((prev) => applyScopeOrder(prev, orderedIds))
    setDirty(true)
  }

  const scrollMasterSection = (secId: string) => {
    scrollChildIntoView(masterBodyRef.current, `#itp-master-sec-${CSS.escape(secId)}`)
  }

  const scrollChecklistSection = (sectionId: string) => {
    scrollChildIntoView(checklistBodyRef.current, `#itp-check-sec-${CSS.escape(sectionId)}`)
  }

  const addMasterSection = () => {
    const title = newSectionName.trim()
    if (!title) {
      showToast('Enter a section name')
      return
    }
    if (processSections.some((section) => section.title.toLowerCase() === title.toLowerCase())) {
      showToast(`“${title}” is already a section`)
      return
    }
    const id = uniqueProcessSectionId(title, processSections)
    const nextAreas = ensureShopAreaDef(areas, title)
    const matchingStation = nextAreas.find(
      (area) =>
        area.label.toLowerCase() === title.toLowerCase() || area.value.toLowerCase() === title.toLowerCase(),
    )
    setProcessSections((prev) => [...prev, { id, title }])
    setAreas(nextAreas)
    setNewItem((prev) => ({
      ...prev,
      secId: id,
      ...(matchingStation ? { area: matchingStation.value } : {}),
    }))
    setNewSectionName('')
    setMasterDirty(true)
    showToast(`Added “${title}” as section and station — click Save master list`)
    window.setTimeout(() => scrollMasterSection(id), 50)
  }

  const addMasterStation = () => {
    const title = newStationName.trim()
    if (!title) {
      showToast('Enter a station name')
      return
    }
    const before = areas.length
    const next = ensureShopAreaDef(areas, title)
    if (next.length === before) {
      showToast(`“${title}” is already a station`)
      return
    }
    const added = next[next.length - 1]
    setAreas(next)
    setNewItem((prev) => ({ ...prev, area: added.value }))
    setNewStationName('')
    setMasterDirty(true)
    showToast(`Added station “${title}” — click Save master list`)
  }

  const moveMasterSection = (secId: string, direction: -1 | 1) => {
    setProcessSections((prev) => moveProcessSection(prev, secId, direction))
    setMasterDirty(true)
  }

  const dropMasterSection = (fromId: string, toId: string) => {
    if (!fromId || fromId === toId) return
    setProcessSections((prev) => moveProcessSectionTo(prev, fromId, toId))
    setMasterDirty(true)
  }

  const removeMasterSection = (secId: string) => {
    const current = processSections.find((row) => row.id === secId)
    if (!current) return
    if (processSections.length <= 1) {
      showToast('Keep at least one section')
      return
    }
    const itemCount = catalog.filter((item) => item.secId === secId).length
    const fallback = processSections.find((row) => row.id !== secId)
    if (!fallback) return
    if (itemCount > 0) {
      if (
        !window.confirm(
          `Remove “${current.title}” and move ${itemCount} item${itemCount === 1 ? '' : 's'} to “${fallback.title}”?`,
        )
      ) {
        return
      }
      setCatalog((prev) => prev.map((item) => (item.secId === secId ? { ...item, secId: fallback.id } : item)))
    } else if (!window.confirm(`Remove empty section “${current.title}”?`)) {
      return
    }
    setProcessSections((prev) => prev.filter((row) => row.id !== secId))
    setNewItem((prev) => (prev.secId === secId ? { ...prev, secId: fallback.id } : prev))
    setMasterDirty(true)
  }

  const handleSaveMaster = async () => {
    setSaving(true)
    try {
      await saveItpMasterCatalog(catalog, areas, processSections)
      setMasterDirty(false)
      clearMasterCatalogDraft()
      showToast('Global master saved')
    } catch (error) {
      showToast(formatSaveError(error))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveJobTypeMaster = async () => {
    setSaving(true)
    try {
      if (masterDirty) {
        await saveItpMasterCatalog(catalog, areas, processSections)
        setMasterDirty(false)
        clearMasterCatalogDraft()
      }
      const includedCustom = catalog
        .filter((item) => !item.builtIn && getSel(jobMasterScope, item.id).included)
        .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
      const mergedCustom = [...jobMasterScope.custom]
      for (const row of includedCustom) {
        if (!mergedCustom.some((c) => c.id === row.id)) mergedCustom.push(row)
      }
      const toSave = withCatalogShopAreas(
        { ...jobMasterScope, custom: mergedCustom },
        catalog,
      )
      await saveJobTypeMaster(jobType, toSave)
      setJobMasterScope(toSave)
      setJobMasterExists(true)
      setJobMasterDirty(false)
      showToast(`Saved ${jobTypeLabel(jobType)} job type master`)
    } catch (error) {
      showToast(formatSaveError(error))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveValveTypeMaster = async () => {
    if (!valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    setSaving(true)
    try {
      if (masterDirty) {
        await saveItpMasterCatalog(catalog, areas, processSections)
        setMasterDirty(false)
        clearMasterCatalogDraft()
      }
      if (jobMasterDirty) {
        const jobIncludedCustom = catalog
          .filter((item) => !item.builtIn && getSel(jobMasterScope, item.id).included)
          .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
        const jobMergedCustom = [...jobMasterScope.custom]
        for (const row of jobIncludedCustom) {
          if (!jobMergedCustom.some((c) => c.id === row.id)) jobMergedCustom.push(row)
        }
        const jobToSave = { ...jobMasterScope, custom: jobMergedCustom }
        await saveJobTypeMaster(jobType, jobToSave)
        setJobMasterScope(jobToSave)
        setJobMasterExists(true)
        setJobMasterDirty(false)
      }
      const includedCustom = catalog
        .filter((item) => !item.builtIn && getSel(valveMasterScope, item.id).included)
        .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
      const mergedCustom = [...valveMasterScope.custom]
      for (const row of includedCustom) {
        if (!mergedCustom.some((c) => c.id === row.id)) mergedCustom.push(row)
      }
      const toSave = withCatalogShopAreas(
        { ...valveMasterScope, custom: mergedCustom },
        catalog,
      )
      await saveValveTypeMaster(jobType, valveType, toSave)
      setValveMasterScope(toSave)
      setValveMasterExists(true)
      setValveMasterDirty(false)
      showToast(`Saved ${valveType} valve type master`)
    } catch (error) {
      showToast(formatSaveError(error))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    const name = templateName.trim()
    if (!name) {
      showToast('Enter a template name (for example Wedge Gate or Parallel Gate)')
      return
    }
    if (name === ITP_LIBRARY_VALVE_MASTER_NAME) {
      showToast('That name is reserved for the valve type master')
      return
    }
    setSaving(true)
    try {
      if (masterDirty) {
        await saveItpMasterCatalog(catalog, areas, processSections)
        setMasterDirty(false)
        clearMasterCatalogDraft()
      }
      if (jobMasterDirty) {
        await saveJobTypeMaster(jobType, jobMasterScope)
        setJobMasterExists(true)
        setJobMasterDirty(false)
      }
      if (valveMasterDirty && valveType.trim()) {
        await saveValveTypeMaster(jobType, valveType, valveMasterScope)
        setValveMasterExists(true)
        setValveMasterDirty(false)
      }
      const includedCustom = catalog
        .filter((item) => !item.builtIn && getSel(scope, item.id).included)
        .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
      const mergedCustom = [...scope.custom]
      for (const row of includedCustom) {
        if (!mergedCustom.some((c) => c.id === row.id)) mergedCustom.push(row)
      }
      const filled = withCatalogShopAreas({ ...scope, custom: mergedCustom }, catalog)
      const toSave = { ...filled, processSections }
      const saved = await saveItpLibraryTemplate(jobType, valveType, toSave, {
        name,
        isDefault: isDefaultTemplate || templatesForValve.length === 0,
      })
      // If the user renamed an existing template, remove the old name row.
      if (loadedTemplateName && loadedTemplateName !== saved.name) {
        await deleteItpLibraryTemplate(jobType, valveType, loadedTemplateName)
      }
      setScope(toSave)
      setTemplateName(saved.name)
      setLoadedTemplateName(saved.name)
      setIsDefaultTemplate(saved.is_default)
      setDirty(false)
      await refreshSavedList()
      showToast(`Saved “${saved.name}” for ${valveType}`)
    } catch (error) {
      showToast(formatSaveError(error))
    } finally {
      setSaving(false)
    }
  }

  const saveCurrentLayer = () => {
    if (builderLayer === 'global') void handleSaveMaster()
    else if (builderLayer === 'job_master') void handleSaveJobTypeMaster()
    else if (builderLayer === 'valve_master') void handleSaveValveTypeMaster()
    else void handleSaveTemplate()
  }

  const saveCurrentLayerDisabled =
    saving ||
    loading ||
    Boolean(schemaError) ||
    (builderLayer === 'global' && !masterDirty) ||
    (builderLayer !== 'global' && builderLayer !== 'job_master' && !valveType)

  const saveCurrentLayerLabel = saving
    ? 'Saving…'
    : builderLayer === 'global'
      ? masterDirty
        ? 'Save'
        : 'Saved'
      : builderLayer === 'job_master'
        ? jobMasterDirty
          ? 'Save'
          : 'Saved'
        : builderLayer === 'valve_master'
          ? valveMasterDirty
            ? 'Save'
            : 'Saved'
          : dirty || masterDirty || jobMasterDirty || valveMasterDirty
            ? 'Save'
            : 'Saved'

  const saveCurrentLayerTitle =
    builderLayer === 'global'
      ? 'Save the global master'
      : builderLayer === 'job_master'
        ? `Save the ${jobTypeLabel(jobType)} job type master`
        : builderLayer === 'valve_master'
          ? 'Save the valve type master'
          : 'Save this ITP template'

  const handleSetDefault = async () => {
    if (!valveType.trim() || !loadedTemplateName) {
      showToast('Save the template first, then set it as default')
      return
    }
    setSaving(true)
    try {
      const saved = await setDefaultItpLibraryTemplate(jobType, valveType, loadedTemplateName)
      if (!saved) {
        showToast('Save the template first, then set it as default')
        return
      }
      setIsDefaultTemplate(true)
      await refreshSavedList()
      showToast(`“${saved.name}” is now the default for ${valveType}`)
    } catch (error) {
      showToast(migrationHint(error instanceof Error ? error.message : 'Could not set default template'))
    } finally {
      setSaving(false)
    }
  }

  const handleResetToCodeDefault = () => {
    if (!valveType.trim()) return
    if (!window.confirm('Reset this template to the built-in family default for this valve type?')) return
    setScope(scopeFromCodeTemplate(jobType, valveType))
    setDirty(true)
  }

  const handleDeleteSaved = async () => {
    if (!valveType.trim() || !loadedTemplateName) return
    if (
      !window.confirm(
        `Delete the saved template “${loadedTemplateName}” for ${valveType}? New ITPs will use the default template or the built-in list.`,
      )
    ) {
      return
    }
    try {
      await deleteItpLibraryTemplate(jobType, valveType, loadedTemplateName)
      await refreshSavedList()
      const remaining = (await listItpLibraryTemplates({ jobType, valveType })).filter(
        (row) => row.name !== loadedTemplateName,
      )
      if (remaining.length) {
        const next = remaining.find((row) => row.is_default) ?? remaining[0]
        await loadTemplate(jobType, valveType, next.name)
      } else {
        setScope(scopeFromCodeTemplate(jobType, valveType))
        setTemplateName(ITP_LIBRARY_DEFAULT_TEMPLATE_NAME)
        setLoadedTemplateName(null)
        setIsDefaultTemplate(false)
        setDirty(false)
      }
      showToast('Saved template deleted')
    } catch (error) {
      showToast(migrationHint(error instanceof Error ? error.message : 'Could not delete template'))
    }
  }

  const checklistSections = useMemo(() => {
    const included = catalogForLayer.filter((item) => getSel(editingScope, item.id).included)
    return catalogBySection
      .map((section) => {
        const items = included
          .filter(
            (item) => effectiveScopeSectionId(item.secId, getSel(editingScope, item.id)) === section.id,
          )
          .sort((a, b) => compareItemsForLayer(a, b, editingScope))
          .map((item) => ({
            id: item.id,
            name: item.name,
            ref: item.ref,
            area: item.area,
            catalogSecId: item.secId,
          }))
        return { section: { id: section.id, title: section.title }, items }
      })
      .filter((row) => row.items.length > 0)
  }, [catalogForLayer, catalogBySection, editingScope])

  const openItpPreview = () => {
    if (editingSelectedCount === 0) {
      showToast('Check items into the ITP before previewing')
      return
    }
    const previewName =
      builderLayer === 'job_master'
        ? `${jobTypeLabel(jobType)} job type master`
        : builderLayer === 'valve_master'
          ? `${valveType.trim() || 'Valve type'} master`
          : templateName.trim() || loadedTemplateName || 'Untitled'
    writeTemplatePreviewPayload(
      buildTemplatePreviewPlan({
        jobType,
        valveType: valveType.trim() || 'Preview',
        templateName: previewName,
        scope: editingScope,
        catalogItems: catalogForLayer,
      }),
    )
    const previewUrl = `${ITP_TEMPLATE_PREVIEW_PATH}?t=${Date.now()}`
    const opened = window.open(previewUrl, 'itp-template-preview')
    if (!opened) {
      showToast('Allow pop-ups to open the ITP preview')
      return
    }
    try {
      opened.location.replace(previewUrl)
    } catch {
      // Same-window open still loads the URL from window.open.
    }
    opened.focus()
  }

  useEffect(() => {
    if (workspaceMode !== 'traveler') return
    const ids = checklistSections.flatMap((row) => row.items.map((item) => item.id))
    if (ids.length === 0) {
      setTravelerFocusItemId(null)
      return
    }
    if (travelerFocusItemId && ids.includes(travelerFocusItemId)) return
    setTravelerFocusItemId(ids[0] ?? null)
  }, [workspaceMode, checklistSections, travelerFocusItemId])

  return (
    <section className="dashboard-panel admin-lists-panel itp-template-builder">
      <h3>ITP template builder</h3>
      <p className="placeholder-copy">
        Work in this order: <strong>Global master</strong> (every checklist item) → <strong>Job type master</strong>{' '}
        (items for Valve Repair, Test Only, …) → <strong>Valve type master</strong> (Gate, Relief Valve, Twinseal, …) →{' '}
        <strong>Specific templates</strong> (Wedge Gate, Parallel Gate, Pressure Seal Wedge Gate, …) → those templates
        create the ITP on a job. Check items on the left to add them to the current step. You can add or edit a
        requirement on Job type master, Valve type master, or a Specific template; a popup will ask whether to copy
        it up to the parent masters.
      </p>

      <nav className="itp-builder-layer-nav" aria-label="ITP builder steps">
        {(
          [
            { id: 'global', step: '1', title: 'Global master', hint: `${catalog.length} items` },
            {
              id: 'job_master',
              step: '2',
              title: 'Job type master',
              hint: `${jobTypeLabel(jobType)} · ${jobMasterCount} items`,
            },
            {
              id: 'valve_master',
              step: '3',
              title: 'Valve type master',
              hint: valveType
                ? `${valveType} · ${valveMasterCount} items`
                : 'Gate, Relief Valve, …',
            },
            {
              id: 'templates',
              step: '4',
              title: 'Specific templates',
              hint: 'Wedge Gate, Parallel Gate, …',
            },
          ] as const
        ).map((layer) => (
          <button
            key={layer.id}
            type="button"
            className={`itp-builder-layer-btn${builderLayer === layer.id ? ' is-active' : ''}`}
            onClick={() => {
              setBuilderLayer(layer.id)
              if (layer.id !== 'templates') setWorkspaceMode('edit')
            }}
          >
            <span className="itp-builder-layer-step">{layer.step}</span>
            <span className="itp-builder-layer-copy">
              <strong>{layer.title}</strong>
              <span>{layer.hint}</span>
            </span>
          </button>
        ))}
      </nav>

      {schemaError ? (
        <div className="itp-template-schema-error" role="alert">
          <strong>Database migration required.</strong> {schemaError}
          <div className="itp-template-schema-error-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                void refreshSavedList()
                void refreshCatalog()
              }}
            >
              Recheck schema
            </button>
          </div>
        </div>
      ) : null}

      <div className="itp-template-builder-toolbar">
        {builderLayer !== 'global' ? (
        <label className="itp-template-builder-field">
          <span>Job type</span>
          <select
            value={jobType}
            onChange={(e) => {
              if ((dirty || jobMasterDirty || valveMasterDirty) && !window.confirm('Discard unsaved template or master changes?')) return
              setJobType(e.target.value as ItpLibraryJobType)
            }}
          >
            {JOB_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        ) : null}
        {builderLayer === 'valve_master' || builderLayer === 'templates' ? (
        <label className="itp-template-builder-field">
          <span>Valve type</span>
          <select
            value={valveType}
            onChange={(e) => {
              const next = e.target.value
              if (builderLayer === 'valve_master') {
                if (valveMasterDirty && !window.confirm('Discard unsaved valve type master changes?')) return
              } else if (dirty && !window.confirm('Discard unsaved template changes?')) return
              setValveType(next)
            }}
          >
            <option value="">Select valve type…</option>
            {valveTypeOptions.map((vt) => (
              <option key={vt} value={vt}>
                {vt}
                {savedRows.some((r) => r.job_type === jobType && r.valve_type === vt) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        ) : null}
        {builderLayer === 'templates' ? (
          <>
        <label className="itp-template-builder-field">
          <span>Saved template</span>
          <select
            value={pickerValue}
            disabled={!valveType || loading}
            onChange={(e) => {
              const value = e.target.value
              if (value === NEW_TEMPLATE_OPTION) {
                startNewTemplate()
                return
              }
              selectExistingTemplate(value)
            }}
          >
            <option value={NEW_TEMPLATE_OPTION}>＋ New template…</option>
            {templatesForValve.map((row) => (
              <option key={row.id} value={row.name}>
                {row.name}
                {row.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="itp-template-builder-field itp-template-builder-field--name">
          <span>Template name</span>
          <input
            type="text"
            value={templateName}
            disabled={!valveType || loading}
            placeholder="e.g. Wedge Gate, Parallel Gate"
            onChange={(e) => {
              setTemplateName(e.target.value)
              setDirty(true)
            }}
          />
        </label>
        <label className="itp-template-builder-default">
          <input
            type="checkbox"
            checked={isDefaultTemplate}
            disabled={!valveType || loading}
            onChange={(e) => {
              setIsDefaultTemplate(e.target.checked)
              setDirty(true)
            }}
          />
          <span>Default for this valve type</span>
        </label>
          </>
        ) : null}
        <div className="itp-template-builder-actions">
          {builderLayer === 'global' ? (
          <button
            type="button"
            className="button-primary"
            disabled={saving || !masterDirty || Boolean(schemaError)}
            onClick={() => void handleSaveMaster()}
          >
            {masterDirty ? 'Save global master' : 'Global master saved'}
          </button>
          ) : null}
          {builderLayer === 'job_master' ? (
          <button
            type="button"
            className="button-primary"
            disabled={saving || loading || Boolean(schemaError)}
            onClick={() => void handleSaveJobTypeMaster()}
          >
            {saving ? 'Saving…' : jobMasterDirty ? 'Save job type master' : 'Job type master saved'}
          </button>
          ) : null}
          {builderLayer === 'valve_master' ? (
          <button
            type="button"
            className="button-primary"
            disabled={!valveType || saving || loading || Boolean(schemaError)}
            onClick={() => void handleSaveValveTypeMaster()}
          >
            {saving ? 'Saving…' : valveMasterDirty ? 'Save valve type master' : 'Valve type master saved'}
          </button>
          ) : null}
          {builderLayer === 'templates' ? (
          <>
          <button
            type="button"
            className="button-primary"
            disabled={!valveType || saving || loading || Boolean(schemaError)}
            onClick={() => void handleSaveTemplate()}
          >
            {saving ? 'Saving…' : dirty || masterDirty || jobMasterDirty || valveMasterDirty ? 'Save template' : 'Template saved'}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={!valveType || !loadedTemplateName || isDefaultTemplate || saving}
            onClick={() => void handleSetDefault()}
          >
            Set as default
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={!valveType || loading}
            onClick={handleResetToCodeDefault}
          >
            Load built-in default
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={!savedForCurrent || saving}
            onClick={() => void handleDeleteSaved()}
          >
            Delete saved
          </button>
          </>
          ) : null}
        </div>
      </div>

      {masterDirty && builderLayer === 'global' ? (
        <p className="itp-master-unsaved-banner" role="status">
          Unsaved global master changes — <strong>Add to master</strong> only stages items until you click{' '}
          <strong>Save global master</strong>. A local draft is kept if this page closes before save.
        </p>
      ) : null}

      {jobMasterDirty && builderLayer === 'job_master' ? (
        <p className="itp-master-unsaved-banner" role="status">
          Unsaved {jobTypeLabel(jobType)} job type master — check items from the global list, then click{' '}
          <strong>Save job type master</strong>.
        </p>
      ) : null}

      {valveMasterDirty && builderLayer === 'valve_master' ? (
        <p className="itp-master-unsaved-banner" role="status">
          Unsaved {valveType || 'valve type'} master — check items from the Job Type Master, then click{' '}
          <strong>Save valve type master</strong>. Gate can hold Wedge, Parallel, Pressure Seal, and other variants on
          step 4.
        </p>
      ) : null}

      {builderLayer === 'valve_master' && !valveType ? (
        <p className="itp-master-unsaved-banner" role="status">
          Select a valve type (for example Gate or Relief Valve), then check which Job Type Master items belong to that
          family.
        </p>
      ) : null}

      {builderLayer === 'templates' && !jobMasterExists && jobMasterCount === 0 ? (
        <p className="itp-master-unsaved-banner" role="status">
          No Job Type Master yet for {jobTypeLabel(jobType)}. Showing the global list until you build one on step 2.
        </p>
      ) : null}

      {builderLayer === 'templates' && valveType && !valveMasterExists && valveMasterCount === 0 && jobMasterCount > 0 ? (
        <p className="itp-master-unsaved-banner" role="status">
          No Valve Type Master yet for {valveType}. Showing Job Type Master items until you build one on step 3. Then
          add specific templates such as Wedge Gate or Parallel Gate here.
        </p>
      ) : null}

      {builderLayer === 'templates' && savedRowsForJob.length > 0 ? (
        <div
          className={`itp-template-saved-table-panel${savedTemplatesCollapsed ? ' is-collapsed' : ''}`}
        >
          <div className="itp-template-saved-table-hdr">
            <div>
              <h4>Saved templates ({jobType})</h4>
              <p className="placeholder-copy">
                {savedTemplatesCollapsed
                  ? `${savedRowsForJob.length} template${savedRowsForJob.length === 1 ? '' : 's'} — collapsed to make room for the ITP.`
                  : filteredSavedRowsForJob.length === savedRowsForJob.length
                    ? `${savedRowsForJob.length} template${savedRowsForJob.length === 1 ? '' : 's'} — Edit checklist, or Manage Traveler to build traveler inputs.`
                    : `${filteredSavedRowsForJob.length} of ${savedRowsForJob.length} templates — Edit checklist, or Manage Traveler to build traveler inputs.`}
              </p>
            </div>
            <div className="itp-template-saved-table-hdr-actions">
              {!savedTemplatesCollapsed ? (
                <label className="itp-template-saved-table-filter">
                  <span>Filter</span>
                  <input
                    type="search"
                    value={savedTemplateFilter}
                    placeholder="Valve type or template name…"
                    onChange={(e) => setSavedTemplateFilter(e.target.value)}
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="button-secondary itp-template-saved-collapse-btn"
                aria-expanded={!savedTemplatesCollapsed}
                onClick={() => {
                  setSavedTemplatesCollapsed((prev) => {
                    const next = !prev
                    writeSavedTemplatesCollapsed(next)
                    return next
                  })
                }}
              >
                {savedTemplatesCollapsed ? 'Expand templates' : 'Collapse templates'}
              </button>
            </div>
          </div>
          {savedTemplatesCollapsed ? null : (
          <div className="dashboard-table-wrap itp-template-saved-table-wrap">
            <table className="dashboard-table itp-template-saved-table">
              <thead>
                <tr>
                  <th>Valve type</th>
                  <th>Template</th>
                  <th>Default</th>
                  <th>Items</th>
                  <th>Hold pts</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSavedRowsForJob.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="itp-template-saved-table-empty">
                      No templates match “{savedTemplateFilter.trim()}”.
                    </td>
                  </tr>
                ) : (
                  filteredSavedRowsForJob.map((row) => {
                    const isActive = valveType === row.valve_type && loadedTemplateName === row.name
                    const items = countIncludedInScope(row.scope)
                    const holdPts = countHoldPointsInScope(row.scope)
                    const updated = formatSavedTemplateUpdated(row.updated_at)
                    return (
                      <tr key={row.id} className={isActive ? 'is-active' : undefined}>
                        <td>{row.valve_type}</td>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td>{row.is_default ? 'Yes' : '—'}</td>
                        <td>{items}</td>
                        <td>{holdPts}</td>
                        <td>{updated}</td>
                        <td className="itp-template-saved-actions">
                          <button
                            type="button"
                            className={`button-secondary itp-template-saved-open-btn${
                              isActive && workspaceMode === 'edit' ? ' is-active' : ''
                            }`}
                            onClick={() => openSavedTemplate(row, 'edit')}
                          >
                            {isActive && workspaceMode === 'edit' ? 'Edit (current)' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className={`button-secondary itp-template-saved-open-btn${
                              isActive && workspaceMode === 'traveler' ? ' is-active' : ''
                            }`}
                            onClick={() => openSavedTemplate(row, 'traveler')}
                          >
                            {isActive && workspaceMode === 'traveler'
                              ? 'Manage Traveler (current)'
                              : 'Manage Traveler'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ) : builderLayer === 'templates' ? (
        <p className="itp-template-builder-saved-meta">
          Saved templates ({jobType}): none yet — pick a valve type, check items from the Valve Type Master, then Save
          template (for example Wedge Gate or Parallel Gate).
        </p>
      ) : null}

      {workspaceMode === 'traveler' && valveType ? (
        <div className="itp-traveler-manage-banner" role="status">
          <div>
            <strong>Manage Traveler</strong> — {valveType}
            {loadedTemplateName || templateName.trim()
              ? ` · ${loadedTemplateName || templateName.trim()}`
              : ''}
            . Template checklist on the left; traveler inputs on the right.
          </div>
          <button type="button" className="button-secondary" onClick={() => setWorkspaceMode('edit')}>
            ← Back to Edit checklist
          </button>
        </div>
      ) : null}

      {workspaceMode === 'traveler' && valveType ? (
        <ItpTemplateTravelerManagePanel
          valveType={valveType}
          templateName={loadedTemplateName || templateName.trim() || 'Untitled'}
          sections={checklistSections}
          processSections={processSections.map((section) => ({
            id: section.id,
            title: section.title,
          }))}
          selectedItemId={travelerFocusItemId}
          onSelectItem={setTravelerFocusItemId}
          getSel={(itemId) => getSel(scope, itemId)}
          catalogById={catalogById}
          areas={areas}
          onUpdateSel={updateSel}
          onAddRequirement={addTravelerRequirement}
          onBackToEdit={() => setWorkspaceMode('edit')}
          onSaveTemplate={() => void handleSaveTemplate()}
          saving={saving}
          dirty={dirty || masterDirty}
        />
      ) : (
      <div
        className={`itp-library-split itp-template-builder-layout${
          builderLayer === 'global' ? ' is-master-only' : ' is-valve-selected'
        }`}
      >
        <div className="itp-library-panel itp-library-panel-left">
          <div className="itp-library-panel-hdr">
            <h3>
              {builderLayer === 'global'
                ? 'Build Scope · Global master'
                : builderLayer === 'job_master'
                  ? `Build Scope · ${jobTypeLabel(jobType)} master`
                  : builderLayer === 'valve_master'
                    ? `Build Scope · ${valveType || 'Valve type'} master`
                    : 'Build Scope · Valve type master'}
            </h3>
            <div className="itp-library-ph-actions">
              <span className="itp-library-ph-count">
                {catalogForLayer.length} items
                {showIncludeChecks ? ` · ${editingSelectedCount} selected` : ''}
              </span>
              {showIncludeChecks && editingSelectedCount > 0 ? (
                <button type="button" className="itp-library-deselect-all" onClick={deselectAll}>
                  Deselect all
                </button>
              ) : null}
            </div>
          </div>
          <nav className="itp-section-nav" aria-label="Master list sections">
            <div className="itp-section-nav-chips">
              {catalogBySection.map(({ id, title, items }) => (
                <div
                  key={id}
                  draggable
                  role="button"
                  tabIndex={0}
                  className={`itp-section-nav-chip${draggingSection === id ? ' is-dragging' : ''}${
                    dragOverSection === id && draggingSection !== id ? ' is-drop-target' : ''
                  }`}
                  onClick={() => {
                    if (skipSectionChipClickRef.current) {
                      skipSectionChipClickRef.current = false
                      return
                    }
                    scrollMasterSection(id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    scrollMasterSection(id)
                  }}
                  title={`Click to jump to ${title}. Drag to reorder. Use × to delete.`}
                  onDragStart={(event) => {
                    skipSectionChipClickRef.current = false
                    setDraggingSection(id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', id)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (dragOverSection !== id) setDragOverSection(id)
                  }}
                  onDragLeave={() => {
                    setDragOverSection((current) => (current === id ? null : current))
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const from = event.dataTransfer.getData('text/plain') || draggingSection
                    skipSectionChipClickRef.current = true
                    if (from) dropMasterSection(from, id)
                    setDraggingSection(null)
                    setDragOverSection(null)
                  }}
                  onDragEnd={() => {
                    setDraggingSection(null)
                    setDragOverSection(null)
                  }}
                >
                  {title.replace(/^\d+\.\s*/, '')}
                  <span className="itp-section-nav-chip-count">{items.length}</span>
                  <button
                    type="button"
                    className="itp-section-nav-chip-remove"
                    title={`Delete ${title}`}
                    aria-label={`Delete ${title}`}
                    onMouseDown={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      skipSectionChipClickRef.current = true
                      removeMasterSection(id)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <p className="itp-section-nav-hint">
              Sections follow the ITP process. Drag to reorder, click to jump, or use × to delete. New section names
              are also added to the Assigned station dropdown (same as job-card statuses).
            </p>
            {canEditCatalog ? (
            <>
            <div className="itp-section-nav-add">
              <input
                type="text"
                value={newSectionName}
                placeholder="e.g. Machine 1…"
                aria-label="New section name"
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMasterSection()
                  }
                }}
              />
              <button type="button" className="button-secondary" onClick={addMasterSection}>
                Add section
              </button>
            </div>
            <div className="itp-section-nav-add itp-station-nav-add">
              <input
                type="text"
                value={newStationName}
                placeholder="Station only (e.g. Machine 3)…"
                aria-label="New station name"
                onChange={(e) => setNewStationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMasterStation()
                  }
                }}
              />
              <button type="button" className="button-secondary" onClick={addMasterStation}>
                Add station
              </button>
            </div>
            </>
            ) : null}
          </nav>
            {canAddOrEditRequirement ? (
            <div className="itp-master-global-add">
              <div className="itp-master-global-add-title">
                {builderLayer === 'global' ? 'Add item to master list' : 'Add requirement to this master'}
              </div>
              <div className="itp-master-global-add-row">
                <label className="itp-master-global-field itp-master-global-field--wide">
                  <span>Requirement</span>
                  <input
                    type="text"
                    value={newItem.name}
                    placeholder="Type the requirement…"
                    onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addMasterItem()
                      }
                    }}
                  />
                </label>
                <label className="itp-master-global-field">
                  <span>ITP section</span>
                  <select
                    value={newItem.secId}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, secId: e.target.value }))}
                  >
                    {catalogBySection.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="itp-master-global-field">
                  <ItpStationSelect
                    variant="field"
                    value={newItem.area}
                    areas={areas}
                    onChange={(area) => setNewItem((prev) => ({ ...prev, area }))}
                  />
                </div>
                <label className="itp-master-global-field">
                  <span>Short label</span>
                  <input
                    type="text"
                    value={newItem.ref}
                    placeholder="Optional"
                    onChange={(e) => setNewItem((prev) => ({ ...prev, ref: e.target.value }))}
                  />
                </label>
                <button type="button" className="button-primary itp-master-global-add-btn" onClick={addMasterItem}>
                  {builderLayer === 'global' ? 'Add to master' : 'Add requirement'}
                </button>
              </div>
              <div className="itp-master-req-toggles">
                <span className="itp-master-req-toggles-label">Requirement types</span>
                <div className="itp-master-req-toggle-row">
                  <button type="button" className="itp-library-attr-toggle on" disabled title="Every item is a requirement">
                    Requirement
                  </button>
                  <button
                    type="button"
                    className={`itp-library-attr-toggle photo${newItem.requirePicture ? ' on' : ''}`}
                    onClick={() =>
                      setNewItem((prev) => ({ ...prev, requirePicture: !prev.requirePicture }))
                    }
                  >
                    Picture requirement
                  </button>
                  <button
                    type="button"
                    className={`itp-library-attr-toggle meas${newItem.requireMeasurement ? ' on' : ''}`}
                    onClick={() =>
                      setNewItem((prev) => ({
                        ...prev,
                        requireMeasurement: !prev.requireMeasurement,
                        measFields:
                          prev.measFields.length > 0
                            ? prev.measFields
                            : DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f })),
                      }))
                    }
                  >
                    Measurement requirement
                  </button>
                  <button
                    type="button"
                    className={`itp-library-attr-toggle${newItem.requireNameplate ? ' on' : ''}`}
                    onClick={() =>
                      setNewItem((prev) => {
                        const nextOn = !prev.requireNameplate
                        return {
                          ...prev,
                          requireNameplate: nextOn,
                          requireMeasurement: nextOn ? true : prev.requireMeasurement,
                          measFields: nextOn
                            ? NAMEPLATE_TRAVELER_FIELDS.map((f) => ({ ...f }))
                            : prev.measFields,
                        }
                      })
                    }
                  >
                    Nameplate / job card
                  </button>
                  <button
                    type="button"
                    className={`itp-library-attr-toggle hp${newItem.holdPoint ? ' on' : ''}`}
                    onClick={() => setNewItem((prev) => ({ ...prev, holdPoint: !prev.holdPoint }))}
                  >
                    QA/QC hold point
                  </button>
                  <button
                    type="button"
                    className="button-primary itp-master-req-save"
                    disabled={saveCurrentLayerDisabled}
                    onClick={saveCurrentLayer}
                    title={saveCurrentLayerTitle}
                  >
                    {saveCurrentLayerLabel}
                  </button>
                </div>
                <label className="itp-master-block-next">
                  <input
                    type="checkbox"
                    checked={newItem.blockNext}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, blockNext: e.target.checked }))}
                  />
                  <span>Block the next item until this item&apos;s requirements are met</span>
                </label>
                {newItem.requirePicture ? (
                  <div className="itp-master-req-detail-row">
                    <label className="itp-master-global-field itp-master-global-field--wide">
                      <span>Photo label</span>
                      <input
                        type="text"
                        value={newItem.pictureLabel}
                        placeholder="e.g. As-received body photo"
                        onChange={(e) => setNewItem((prev) => ({ ...prev, pictureLabel: e.target.value }))}
                      />
                    </label>
                    <ItpPhotoMinMaxFields
                      minPhotos={newItem.minPhotos}
                      maxPhotos={newItem.maxPhotos}
                      onChange={(next) => setNewItem((prev) => ({ ...prev, ...next }))}
                    />
                  </div>
                ) : null}
                {newItem.requireMeasurement ? (
                  <div className="itp-master-meas-fields">
                    <div className="itp-master-meas-fields-hdr">Technician input fields</div>
                    <p className="placeholder-copy itp-master-meas-fields-hint">
                      Add labeled controls the tech fills on the traveler (text, dropdown, picture, etc.). Map Size,
                      Customer, Due Date, Pressure Class, or Body Material to the job card to prefill them.
                    </p>
                    <div className="itp-master-meas-fields-list">
                      {newItem.measFields.map((field, idx) => (
                        <div key={field.id} className="itp-master-meas-field-row itp-master-meas-field-row--typed">
                          <input
                            type="text"
                            value={field.label}
                            placeholder="Field label"
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const label = e.target.value
                              setNewItem((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((f, i) =>
                                  i === idx ? { ...f, label } : f,
                                ),
                              }))
                            }}
                          />
                          <select
                            value={field.type || 'text'}
                            aria-label="Field type"
                            onChange={(e) => {
                              const type = e.target.value as ItpMeasFieldType
                              setNewItem((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((f, i) =>
                                  i === idx ? { ...f, ...measFieldTypePatch(f, type) } : f,
                                ),
                              }))
                            }}
                          >
                            {ITP_MEAS_FIELD_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <ItpMeasDropdownSourceFields
                            field={field}
                            onChange={(patch) =>
                              setNewItem((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((f, i) =>
                                  i === idx ? { ...f, ...patch } : f,
                                ),
                              }))
                            }
                          />
                          <ItpMeasJobCardSourceSelect
                            field={field}
                            onChange={(patch) =>
                              setNewItem((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((f, i) =>
                                  i === idx ? { ...f, ...patch } : f,
                                ),
                              }))
                            }
                          />
                          <ItpMeasRequiredToggle
                            required={field.required !== false}
                            onChange={(required) =>
                              setNewItem((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((f, i) =>
                                  i === idx ? { ...f, required } : f,
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="itp-library-sr-del"
                            title="Remove field"
                            disabled={newItem.measFields.length <= 1}
                            onClick={() =>
                              setNewItem((prev) => ({
                                ...prev,
                                measFields: prev.measFields.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="itp-library-add-sr-btn"
                      onClick={() =>
                        setNewItem((prev) => ({
                          ...prev,
                          measFields: [...prev.measFields, emptyMeasField({ label: '' })],
                        }))
                      }
                    >
                      + Add field
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            ) : null}

          <div className="itp-library-panel-body" ref={masterBodyRef}>
            {catalogLoading ? (
              <p className="placeholder-copy">Loading master list…</p>
            ) : (
              catalogBySection.map(({ id, title, items }, sectionIndex) => {
                const selCount = items.filter((item) => getSel(editingScope, item.id).included).length
                const allSel = items.length > 0 && selCount === items.length
                return (
                  <div key={id} id={`itp-master-sec-${id}`} className="itp-library-lib-sec">
                    <div className="itp-library-lib-sec-hdr">
                      <div className="itp-library-lib-sec-hdr-main">
                        <button
                          type="button"
                          className="itp-master-order-btn itp-section-order-btn"
                          disabled={sectionIndex === 0}
                          onClick={() => moveMasterSection(id, -1)}
                          title="Move section up"
                          aria-label={`Move ${title} up`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="itp-master-order-btn itp-section-order-btn"
                          disabled={sectionIndex >= catalogBySection.length - 1}
                          onClick={() => moveMasterSection(id, 1)}
                          title="Move section down"
                          aria-label={`Move ${title} down`}
                        >
                          ↓
                        </button>
                        <h4>{title}</h4>
                      </div>
                      <div className="itp-library-lshr">
                        <span>
                          {selCount}/{items.length}
                        </span>
                        {showIncludeChecks ? (
                        <button
                          type="button"
                          className="itp-library-sel-all"
                          onClick={() => selectAllInSection(id, !allSel)}
                        >
                          {allSel ? 'Deselect All' : 'Select All'}
                        </button>
                        ) : null}
                        {canEditCatalog ? (
                        <button
                          type="button"
                          className="itp-library-sel-all itp-section-remove"
                          onClick={() => removeMasterSection(id)}
                          title="Remove section"
                        >
                          Remove
                        </button>
                        ) : null}
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <p className="itp-master-empty-area">No items in {title} yet.</p>
                    ) : null}

                    {items.map((item, indexInSection) => {
                      const sel = getSel(editingScope, item.id)
                      return (
                        <div key={item.id} className={`itp-library-lib-item${showIncludeChecks && sel.included ? ' sel' : ''}`}>
                          <div className="itp-master-item-toolbar">
                            <button
                              type="button"
                              className="itp-master-order-btn"
                              disabled={indexInSection === 0}
                              onClick={(e) => {
                                e.stopPropagation()
                                moveLayerItemInSection(id, item.id, -1, false)
                              }}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="itp-master-order-btn"
                              disabled={indexInSection >= items.length - 1}
                              onClick={(e) => {
                                e.stopPropagation()
                                moveLayerItemInSection(id, item.id, 1, false)
                              }}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <ItpStationSelect
                              variant="toolbar"
                              value={resolvedItemStation(sel.shopArea, item.area)}
                              areas={areas}
                              onChange={(area) => changeRowStation(item.id, area)}
                            />
                            {canEditCatalog ? (
                            <>
                            <select
                              className="itp-master-section-select"
                              value={item.secId}
                              onChange={(e) => changeItemSection(item.id, e.target.value)}
                              title="ITP section"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {catalogBySection.map((section) => (
                                <option key={section.id} value={section.id}>
                                  {section.title}
                                </option>
                              ))}
                            </select>
                            {!item.builtIn ? (
                              <button
                                type="button"
                                className="link-button-danger itp-master-remove"
                                onClick={() => removeMasterItem(item.id)}
                              >
                                Remove
                              </button>
                            ) : null}
                            </>
                            ) : null}
                          </div>
                          <div
                            className="itp-library-lib-item-top"
                            onClick={() => {
                              if (showIncludeChecks) toggleInclude(item.id)
                            }}
                            onKeyDown={(e) => {
                              if (!showIncludeChecks) return
                              const typing =
                                e.target instanceof HTMLElement &&
                                Boolean(e.target.closest('input, textarea, select'))
                              if (typing) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleInclude(item.id)
                              }
                            }}
                            role={showIncludeChecks ? 'checkbox' : undefined}
                            aria-checked={showIncludeChecks ? sel.included : undefined}
                            tabIndex={showIncludeChecks ? 0 : undefined}
                          >
                            {showIncludeChecks ? (
                            <div className="itp-library-cb-cell">
                              <span className="itp-library-cb" />
                            </div>
                            ) : null}
                            <div className="itp-library-lib-item-name">
                              <input
                                className="itp-library-lin-input"
                                type="text"
                                value={itemNameDrafts[item.id] ?? item.name}
                                aria-label="Requirement text"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setItemNameDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                onBlur={() => commitItemName(item)}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    commitItemName(item)
                                  }
                                }}
                              />
                              <div className="itp-library-lref">
                                {item.ref}
                                {!item.builtIn ? ' · custom' : ''}
                                {item.holdPoint ? ' · hold point' : ''}
                                {item.requirePicture ? ' · photo' : ''}
                                {item.requireMeasurement ? ' · measurements' : ''}
                                {item.requireNameplate ? ' · nameplate' : ''}
                                {item.blockNext ? ' · blocks next' : ''}
                                <ItpStationSelect
                                  variant="badge"
                                  value={resolvedItemStation(sel.shopArea, item.area)}
                                  areas={areas}
                                  onChange={(area) => changeRowStation(item.id, area)}
                                />
                              </div>
                            </div>
                          </div>
                          {canAddOrEditRequirement ? (
                          <div className="itp-master-item-reqs">
                            <div className="itp-library-attr-bar">
                              <button
                                type="button"
                                className={`itp-library-attr-toggle photo${item.requirePicture ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  patchMasterItem(item.id, {
                                    requirePicture: !item.requirePicture,
                                    pictureLabel: !item.requirePicture
                                      ? item.pictureLabel || ''
                                      : undefined,
                                    minPhotos: !item.requirePicture
                                      ? clampLinePhotoMin(item.minPhotos)
                                      : undefined,
                                    maxPhotos: !item.requirePicture
                                      ? clampLinePhotoMax(item.maxPhotos, item.minPhotos)
                                      : undefined,
                                  })
                                }}
                              >
                                Picture requirement
                              </button>
                              <button
                                type="button"
                                className={`itp-library-attr-toggle meas${item.requireMeasurement ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const nextOn = !item.requireMeasurement
                                  patchMasterItem(item.id, {
                                    requireMeasurement: nextOn,
                                    measFields: nextOn
                                      ? item.measFields && item.measFields.length > 0
                                        ? item.measFields
                                        : DEFAULT_ITP_MEAS_FIELDS.map((field) => ({ ...field }))
                                      : item.requireNameplate
                                        ? NAMEPLATE_TRAVELER_FIELDS.map((field) => ({ ...field }))
                                        : [],
                                  })
                                }}
                              >
                                Measurement requirement
                              </button>
                              <button
                                type="button"
                                className={`itp-library-attr-toggle${item.requireNameplate ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const nextOn = !item.requireNameplate
                                  patchMasterItem(item.id, {
                                    requireNameplate: nextOn,
                                    requireMeasurement: nextOn ? true : item.requireMeasurement,
                                    measFields: nextOn
                                      ? NAMEPLATE_TRAVELER_FIELDS.map((field) => ({ ...field }))
                                      : item.requireMeasurement
                                        ? item.measFields && item.measFields.length > 0
                                          ? item.measFields
                                          : DEFAULT_ITP_MEAS_FIELDS.map((field) => ({ ...field }))
                                        : [],
                                  })
                                }}
                              >
                                Nameplate / job card
                              </button>
                              <button
                                type="button"
                                className={`itp-library-attr-toggle hp${item.holdPoint ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  patchMasterItem(item.id, { holdPoint: !item.holdPoint })
                                }}
                              >
                                QA/QC hold point
                              </button>
                              <button
                                type="button"
                                className={`itp-library-attr-toggle${item.blockNext ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  patchMasterItem(item.id, { blockNext: !item.blockNext })
                                }}
                              >
                                Block next
                              </button>
                            </div>
                            {item.requirePicture ? (
                              <div className="itp-master-req-detail-row">
                                <label className="itp-master-global-field itp-master-global-field--wide">
                                  <span>Photo label</span>
                                  <input
                                    type="text"
                                    value={item.pictureLabel ?? ''}
                                    placeholder="e.g. As-received body photo"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      patchMasterItem(item.id, { pictureLabel: e.target.value }, { prompt: false })
                                    }
                                  />
                                </label>
                                <ItpPhotoMinMaxFields
                                  minPhotos={item.minPhotos || 1}
                                  maxPhotos={item.maxPhotos}
                                  stopClick
                                  onChange={(next) => patchMasterItem(item.id, next, { prompt: false })}
                                />
                              </div>
                            ) : null}
                            {item.requireMeasurement ? (
                              <div className="itp-master-meas-fields">
                                <div className="itp-master-meas-fields-hdr">Technician input fields</div>
                                <p className="placeholder-copy itp-master-meas-fields-hint">
                                  Add labeled controls the tech fills on the traveler (text, dropdown, picture, etc.).
                                  Map Size, Customer, Due Date, Pressure Class, or Body Material to the job card to
                                  prefill them.
                                </p>
                                <div className="itp-master-meas-fields-list">
                                  {(item.measFields && item.measFields.length > 0
                                    ? item.measFields
                                    : DEFAULT_ITP_MEAS_FIELDS
                                  ).map((field, idx) => {
                                    const typed = emptyMeasField(field)
                                    return (
                                    <div
                                      key={typed.id || `${item.id}-meas-${idx}`}
                                      className="itp-master-meas-field-row itp-master-meas-field-row--typed"
                                    >
                                      <input
                                        type="text"
                                        value={field.label}
                                        placeholder="Field label"
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields.map((row) => ({
                                                  ...emptyMeasField(row),
                                                  label: row.label,
                                                }))
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(
                                            item.id,
                                            {
                                            measFields: current.map((row, i) =>
                                              i === idx ? { ...row, label: e.target.value } : row,
                                            ),
                                            },
                                            { prompt: false },
                                          )
                                        }}
                                      />
                                      <select
                                        value={typed.type}
                                        aria-label="Field type"
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          const type = e.target.value as ItpMeasFieldType
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields.map((row) => emptyMeasField(row))
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(
                                            item.id,
                                            {
                                            measFields: current.map((row, i) =>
                                              i === idx ? { ...row, ...measFieldTypePatch(row, type) } : row,
                                            ),
                                            },
                                            { prompt: false },
                                          )
                                        }}
                                      >
                                        {ITP_MEAS_FIELD_TYPE_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                      <ItpMeasDropdownSourceFields
                                        field={typed}
                                        onChange={(patch) => {
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields.map((row) => emptyMeasField(row))
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(
                                            item.id,
                                            {
                                              measFields: current.map((row, i) =>
                                                i === idx ? { ...row, ...patch } : row,
                                              ),
                                            },
                                            { prompt: false },
                                          )
                                        }}
                                      />
                                      <ItpMeasJobCardSourceSelect
                                        field={typed}
                                        onChange={(patch) => {
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields.map((row) => emptyMeasField(row))
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(
                                            item.id,
                                            {
                                              measFields: current.map((row, i) =>
                                                i === idx ? { ...row, ...patch } : row,
                                              ),
                                            },
                                            { prompt: false },
                                          )
                                        }}
                                      />
                                      <ItpMeasRequiredToggle
                                        required={typed.required !== false}
                                        onChange={(required) => {
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields.map((row) => emptyMeasField(row))
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(
                                            item.id,
                                            {
                                              measFields: current.map((row, i) =>
                                                i === idx ? { ...row, required } : row,
                                              ),
                                            },
                                            { prompt: false },
                                          )
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="itp-library-sr-del"
                                        title="Remove field"
                                        disabled={(item.measFields?.length ?? DEFAULT_ITP_MEAS_FIELDS.length) <= 1}
                                        onClick={() => {
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields.map((row) => emptyMeasField(row))
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(
                                            item.id,
                                            {
                                            measFields: current.filter((_, i) => i !== idx),
                                            },
                                            { prompt: false },
                                          )
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    )
                                  })}
                                </div>
                                <button
                                  type="button"
                                  className="itp-library-add-sr-btn"
                                  onClick={() => {
                                    const current =
                                      item.measFields && item.measFields.length > 0
                                        ? item.measFields.map((row) => emptyMeasField(row))
                                        : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                    patchMasterItem(
                                      item.id,
                                      {
                                      measFields: [...current, emptyMeasField({ label: '' })],
                                      },
                                      { prompt: false },
                                    )
                                  }}
                                >
                                  + Add field
                                </button>
                              </div>
                            ) : null}
                          </div>
                          ) : null}
                          {showIncludeChecks && sel.included ? (
                            <>
                              <div className="itp-library-sub-reqs-area">
                                <label className="itp-library-scope-notes">
                                  Notes
                                  <textarea
                                    rows={2}
                                    value={sel.notes}
                                    placeholder="Add notes for this line…"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updateSel(item.id, { notes: e.target.value })}
                                  />
                                </label>
                                {stepUsesOemOrProcedure(item.name) || (sel.resourceDocs?.length ?? 0) > 0 ? (
                                  <ItpOemProcedureDocs
                                    docs={sel.resourceDocs ?? []}
                                    valveType={valveType}
                                    onChange={(resourceDocs) => updateSel(item.id, { resourceDocs })}
                                  />
                                ) : null}
                                {sel.subReqs.map((sr, idx) => (
                                  <div key={`${item.id}-sr-${idx}`} className="itp-library-sub-req-row">
                                    <span>• {sr}</span>
                                    <button
                                      type="button"
                                      className="itp-library-sr-del"
                                      onClick={() => removeSubReq(item.id, idx)}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                <div className="itp-library-add-sr-row">
                                  <input
                                    className="itp-library-add-sr-inp"
                                    type="text"
                                    placeholder="+ Add sub-requirement…"
                                    value={subReqDrafts[item.id] ?? ''}
                                    onChange={(e) =>
                                      setSubReqDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault()
                                        addSubReq(item.id)
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="itp-library-add-sr-btn"
                                    onClick={() => addSubReq(item.id)}
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="itp-library-panel itp-library-panel-right">
          <div className="itp-library-panel-hdr">
            <h3>
              {builderLayer === 'job_master'
                ? `${jobTypeLabel(jobType)} · Job type master`
                : builderLayer === 'valve_master'
                  ? valveType
                    ? `${valveType} · Valve type master`
                    : 'Valve type master'
                  : valveType
                    ? `ITP Checklist · ${valveType}${templateName.trim() ? ` · ${templateName.trim()}` : ''}`
                    : 'ITP Checklist'}
            </h3>
            <span className="itp-library-ph-count">
              {builderLayer === 'job_master'
                ? `${jobMasterCount} items · ${holdPointCount} hold pts`
                : builderLayer === 'valve_master'
                  ? valveType
                    ? `${valveMasterCount} items · ${holdPointCount} hold pts`
                    : 'Pick a valve type'
                  : valveType
                    ? `${selectedCount} items · ${holdPointCount} hold pts`
                    : 'Pick a valve type'}
            </span>
          </div>

          {builderLayer === 'valve_master' && !valveType ? (
            <div className="itp-library-empty">
              <p>
                Select a valve type (for example Gate). Check items from the Job Type Master on the left. Then on step 4
                make specific templates such as Wedge Gate, Parallel Gate, or Pressure Seal Wedge Gate.
              </p>
            </div>
          ) : builderLayer === 'templates' && !valveType ? (
            <div className="itp-library-empty">
              <p>
                Select a valve type above, then add a specific template name (Wedge Gate, Parallel Gate, Pressure Seal
                Wedge Gate, …) and check items from the Valve Type Master. Job ITPs use this saved template.
              </p>
            </div>
          ) : builderLayer === 'templates' && loading ? (
            <div className="itp-library-empty">
              <p>Loading template…</p>
            </div>
          ) : editingSelectedCount === 0 ? (
            <div className="itp-library-empty">
              <p>
                {builderLayer === 'job_master'
                  ? `Check items on the left to add them to the ${jobTypeLabel(jobType)} job type master.`
                  : builderLayer === 'valve_master'
                    ? `Check items on the left to add them to the ${valveType || 'valve type'} master.`
                    : `Check items on the left to add them to ${
                        templateName.trim() ? `“${templateName.trim()}”` : 'this template'
                      }.`}
              </p>
            </div>
          ) : (
            <>
              <div className="itp-library-summary">
                <div className="itp-library-ss">
                  <div className="itp-library-sv">{editingSelectedCount}</div>
                  <div className="itp-library-sl">Items</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-hp">{holdPointCount}</div>
                  <div className="itp-library-sl">Hold Pts</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-warn">{editingSelectedCount}</div>
                  <div className="itp-library-sl">
                    {builderLayer === 'job_master'
                      ? 'In job master'
                      : builderLayer === 'valve_master'
                        ? 'In valve master'
                        : 'In template'}
                  </div>
                </div>
                <div className="itp-library-ss itp-library-ss-preview">
                  <button
                    type="button"
                    className="button-primary itp-template-preview-itp-btn"
                    disabled={saveCurrentLayerDisabled}
                    onClick={saveCurrentLayer}
                    title={saveCurrentLayerTitle}
                  >
                    {saveCurrentLayerLabel}
                  </button>
                  <button
                    type="button"
                    className="button-secondary itp-template-preview-itp-btn"
                    onClick={openItpPreview}
                    title="Open the technician traveler for this ITP in a new window"
                  >
                    Preview ITP
                  </button>
                </div>
              </div>
              {checklistSections.length > 1 ? (
                <nav className="itp-section-nav itp-section-nav--checklist" aria-label="Template checklist sections">
                  <div className="itp-section-nav-chips">
                    {checklistSections.map(({ section, items }) => (
                      <button
                        key={section.id}
                        type="button"
                        className="itp-section-nav-chip"
                        onClick={() => scrollChecklistSection(section.id)}
                        title={`Jump to ${section.title}`}
                      >
                        {section.title.replace(/^\d+\.\s*/, '')}
                        <span>{items.length}</span>
                      </button>
                    ))}
                  </div>
                </nav>
              ) : null}
              <div className="itp-library-panel-body" ref={checklistBodyRef}>
                {checklistSections.map(({ section, items }) => (
                  <div key={section.id} id={`itp-check-sec-${section.id}`} className="itp-library-itp-sec">
                    <div className="itp-library-itp-sec-hdr">
                      <h4>{section.title}</h4>
                      <span className="itp-library-isp">
                        0/{items.length}
                      </span>
                    </div>
                    {items.map((item, indexInSection) => {
                      const sel = getSel(editingScope, item.id)
                      const station = resolvedItemStation(sel.shopArea, item.area)
                      return (
                        <div key={item.id} className="itp-library-exec-item itp-template-preview-item">
                          <div className={`itp-library-exec-row${sel.holdPoint ? ' hold-point' : ''}`}>
                            <div className="itp-library-exec-top">
                              <span className="itp-library-cb" aria-hidden />
                              <div className="itp-library-exec-body">
                                <div className="itp-library-en">{item.name}</div>
                                <div className="itp-template-preview-meta">
                                  <span className="itp-library-er">[{item.ref}]</span>
                                  <ItpStationSelect
                                    variant="badge"
                                    value={station}
                                    areas={areas}
                                    onChange={(area) => changeRowStation(item.id, area)}
                                  />
                                  {sel.holdPoint ? (
                                    <span className="itp-library-hp-badge">HOLD POINT</span>
                                  ) : null}
                                  {sel.requirePicture || sel.measFields.length > 0 || sel.addToTraveler ? (
                                    <span className="itp-library-attr-badge traveler">
                                      Traveler
                                      {sel.requirePicture
                                        ? ` · ${clampLinePhotoMin(sel.minPhotos)}–${clampLinePhotoMax(
                                            sel.maxPhotos,
                                            sel.minPhotos,
                                          )} photos`
                                        : ''}
                                      {sel.measFields.length > 0
                                        ? ` · ${sel.measFields.length} field${
                                            sel.measFields.length === 1 ? '' : 's'
                                          }`
                                        : ''}
                                    </span>
                                  ) : itemRequiresMeasurements(sel) ? (
                                    <span className="itp-library-attr-badge meas">Measurements</span>
                                  ) : null}
                                </div>
                                <div className="itp-template-preview-fields">
                                  <div className="itp-template-station-field">
                                    <ItpStationSelect
                                      variant="field"
                                      value={station}
                                      areas={areas}
                                      onChange={(area) => changeRowStation(item.id, area)}
                                    />
                                  </div>
                                  <label className="itp-template-station-field">
                                    <span>ITP section</span>
                                    <select
                                      value={effectiveScopeSectionId(item.catalogSecId, sel)}
                                      onChange={(e) => changeTemplateItemSection(item.id, e.target.value)}
                                      title="Move this item to another ITP section (this template only)"
                                    >
                                      {catalogBySection.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {opt.title}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <input
                                  className="itp-library-enote"
                                  type="text"
                                  value={sel.notes}
                                  placeholder="Notes, observations…"
                                  onChange={(e) => updateSel(item.id, { notes: e.target.value })}
                                />
                                {stepUsesOemOrProcedure(item.name) || (sel.resourceDocs?.length ?? 0) > 0 ? (
                                  <ItpOemProcedureDocs
                                    docs={sel.resourceDocs ?? []}
                                    valveType={valveType}
                                    onChange={(resourceDocs) => updateSel(item.id, { resourceDocs })}
                                  />
                                ) : null}
                                {sel.subReqs.length > 0 ? (
                                  <div className="itp-library-exec-subreqs">
                                    {sel.subReqs.map((sr, idx) => (
                                      <div key={`${item.id}-preview-sr-${idx}`} className="itp-library-exec-sr-row">
                                        <span className="itp-library-srcb" aria-hidden />
                                        <span>• {sr}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className="itp-library-exec-acts">
                                <button
                                  type="button"
                                  className="itp-library-edit-btn"
                                  title="Edit requirement"
                                  onClick={() => openChecklistEdit(item.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className={`itp-library-edit-btn${
                                    sel.requirePicture || sel.measFields.length > 0 || sel.addToTraveler
                                      ? ' on'
                                      : ''
                                  }`}
                                  title="Traveler requirements: photos, labels, text boxes"
                                  onClick={() => setLineTravelerItemId(item.id)}
                                >
                                  Traveler
                                </button>
                                <button
                                  type="button"
                                  className="itp-master-order-btn"
                                  disabled={indexInSection === 0}
                                  onClick={() => moveLayerItemInSection(section.id, item.id, -1, true)}
                                  title="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="itp-master-order-btn"
                                  disabled={indexInSection >= items.length - 1}
                                  onClick={() => moveLayerItemInSection(section.id, item.id, 1, true)}
                                  title="Move down"
                                >
                                  ↓
                                </button>
                                <div className="itp-library-exec-acts-row">
                                  <button
                                    type="button"
                                    className="itp-master-order-btn"
                                    title="Add item below"
                                    onClick={() =>
                                      openChecklistAddBelow(
                                        item.id,
                                        effectiveScopeSectionId(item.catalogSecId, sel),
                                        item.area,
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    className="itp-library-rm-btn"
                                    title="Remove from template"
                                    onClick={() => toggleInclude(item.id)}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )}
      {propagatePrompt ? (
        <div
          className="modal-overlay itp-modal-overlay"
          role="presentation"
          onClick={() => {
            if (propagatePrompt.kind === 'edit') {
              setItemNameDrafts((prev) => {
                const next = { ...prev }
                delete next[propagatePrompt.item.id]
                return next
              })
            }
            setPropagatePrompt(null)
          }}
        >
          <div
            className="modal-card itp-propagate-modal"
            role="dialog"
            aria-labelledby="itp-propagate-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-with-close">
              <div className="modal-header-text">
                <h3 id="itp-propagate-title">
                  {propagatePrompt.kind === 'add' ? 'Add to parent masters?' : 'Apply to parent masters?'}
                </h3>
                <p className="modal-subtitle">{propagatePrompt.item.name}</p>
              </div>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => {
                  if (propagatePrompt.kind === 'edit') {
                    setItemNameDrafts((prev) => {
                      const next = { ...prev }
                      delete next[propagatePrompt.item.id]
                      return next
                    })
                  }
                  setPropagatePrompt(null)
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="placeholder-copy" style={{ marginTop: 0 }}>
              {propagatePrompt.kind === 'add' ? 'Add' : 'Apply this change to'} “{propagatePrompt.item.name}”{' '}
              {propagatePrompt.kind === 'add' ? 'to' : 'on'}{' '}
              {parentMasterLabels(builderLayer, jobType, valveType).join(', ')} as well?
            </p>
            <div className="itp-propagate-modal-actions">
              <button type="button" className="button-secondary" onClick={() => resolvePropagatePrompt(false)}>
                This level only
              </button>
              <button type="button" className="button-primary" onClick={() => resolvePropagatePrompt(true)}>
                {propagatePrompt.kind === 'add' ? 'Yes, add to parents' : 'Yes, apply to parents'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {checklistEdit ? (
        <div
          className="modal-overlay itp-modal-overlay"
          role="presentation"
          onClick={() => setChecklistEdit(null)}
        >
          <div
            className="modal-card itp-checklist-edit-modal"
            role="dialog"
            aria-labelledby="itp-checklist-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-with-close">
              <div className="modal-header-text">
                <h3 id="itp-checklist-edit-title">
                  {checklistEdit.mode === 'add' ? 'Add requirement below' : 'Edit requirement'}
                </h3>
                <p className="modal-subtitle">
                  {checklistEdit.mode === 'add'
                    ? 'Add a requirement under this line, then choose whether to copy it to parent masters.'
                    : 'Change the requirement text or types, then choose whether to copy it to parent masters.'}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-x"
                onClick={() => setChecklistEdit(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="itp-master-global-add-row">
              <label className="itp-master-global-field itp-master-global-field--wide">
                <span>Requirement</span>
                <input
                  type="text"
                  value={checklistEdit.name}
                  placeholder="Type the requirement…"
                  onChange={(e) => setChecklistEdit((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveChecklistEdit()
                    }
                  }}
                />
              </label>
              <label className="itp-master-global-field">
                <span>Short label</span>
                <input
                  type="text"
                  value={checklistEdit.ref}
                  placeholder="Optional"
                  onChange={(e) => setChecklistEdit((prev) => (prev ? { ...prev, ref: e.target.value } : prev))}
                />
              </label>
            </div>
            <div className="itp-master-req-toggles">
              <span className="itp-master-req-toggles-label">Requirement types</span>
              <div className="itp-master-req-toggle-row">
                <button
                  type="button"
                  className={`itp-library-attr-toggle photo${checklistEdit.requirePicture ? ' on' : ''}`}
                  onClick={() =>
                    setChecklistEdit((prev) =>
                      prev ? { ...prev, requirePicture: !prev.requirePicture } : prev,
                    )
                  }
                >
                  Picture requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle meas${checklistEdit.requireMeasurement ? ' on' : ''}`}
                  onClick={() =>
                    setChecklistEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            requireMeasurement: !prev.requireMeasurement,
                            measFields:
                              prev.measFields.length > 0
                                ? prev.measFields
                                : DEFAULT_ITP_MEAS_FIELDS.map((field) => ({ ...field })),
                          }
                        : prev,
                    )
                  }
                >
                  Measurement requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle${checklistEdit.requireNameplate ? ' on' : ''}`}
                  onClick={() =>
                    setChecklistEdit((prev) =>
                      prev
                        ? {
                            ...prev,
                            requireNameplate: !prev.requireNameplate,
                            requireMeasurement: !prev.requireNameplate ? true : prev.requireMeasurement,
                            measFields: !prev.requireNameplate
                              ? NAMEPLATE_TRAVELER_FIELDS.map((field) => ({ ...field }))
                              : prev.measFields,
                          }
                        : prev,
                    )
                  }
                >
                  Nameplate / job card
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle hp${checklistEdit.holdPoint ? ' on' : ''}`}
                  onClick={() =>
                    setChecklistEdit((prev) => (prev ? { ...prev, holdPoint: !prev.holdPoint } : prev))
                  }
                >
                  QA/QC hold point
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle${checklistEdit.blockNext ? ' on' : ''}`}
                  onClick={() =>
                    setChecklistEdit((prev) => (prev ? { ...prev, blockNext: !prev.blockNext } : prev))
                  }
                >
                  Block next
                </button>
              </div>
            </div>
            {checklistEdit.requirePicture ? (
              <div className="itp-master-req-detail-row" style={{ marginTop: 10 }}>
                <label className="itp-master-global-field itp-master-global-field--wide">
                  <span>Photo label</span>
                  <input
                    type="text"
                    value={checklistEdit.pictureLabel}
                    placeholder="e.g. As-received body photo"
                    onChange={(e) =>
                      setChecklistEdit((prev) => (prev ? { ...prev, pictureLabel: e.target.value } : prev))
                    }
                  />
                </label>
                <ItpPhotoMinMaxFields
                  minPhotos={checklistEdit.minPhotos}
                  maxPhotos={checklistEdit.maxPhotos}
                  onChange={(next) =>
                    setChecklistEdit((prev) => (prev ? { ...prev, ...next } : prev))
                  }
                />
              </div>
            ) : null}
            <div className="itp-propagate-modal-actions">
              <button type="button" className="button-secondary" onClick={() => setChecklistEdit(null)}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={saveChecklistEdit}>
                {checklistEdit.mode === 'add' ? 'Add requirement' : 'Save requirement'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {lineTravelerItemId ? (
        <ItpLineTravelerBuilderModal
          itemName={catalogById.get(lineTravelerItemId)?.name ?? 'Requirement'}
          sel={getSel(editingScope, lineTravelerItemId)}
          catalogItem={catalogById.get(lineTravelerItemId)}
          onCancel={() => setLineTravelerItemId(null)}
          onSave={(patch) => {
            updateSel(lineTravelerItemId, patch)
            setLineTravelerItemId(null)
          }}
        />
      ) : null}
    </section>
  )
}
