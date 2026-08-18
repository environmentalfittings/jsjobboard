import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import { findLibraryItem, type ItpLibraryJobType } from '../constants/itpLibrary'
import {
  defaultProcessSections,
  moveProcessSection,
  moveProcessSectionTo,
  processSectionTitle,
  uniqueProcessSectionId,
  type ItpProcessSectionDef,
} from '../constants/itpProcessSections'
import {
  defaultShopAreas,
  itpShopAreaLabel,
  type ItpShopArea,
  type ItpShopAreaDef,
} from '../constants/itpShopAreas'
import { VALVE_TYPES } from '../constants/jobLookups'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import {
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
  countIncludedInScope,
  deleteItpLibraryTemplate,
  emptyTemplateScope,
  formatItpLibraryTemplateLabel,
  ITP_LIBRARY_DEFAULT_TEMPLATE_NAME,
  ITP_LIBRARY_NAMED_TEMPLATE_MIGRATION_HINT,
  isItpLibraryTemplateSchemaError,
  listItpLibraryTemplates,
  loadItpLibraryTemplate,
  probeItpLibraryTemplateSchema,
  saveItpLibraryTemplate,
  scopeFromCodeTemplate,
  setDefaultItpLibraryTemplate,
  type ItpLibraryTemplateRow,
  type ItpLibraryTemplateScope,
} from '../lib/itpLibraryTemplates'
import {
  DEFAULT_ITP_MEAS_FIELDS,
  itemRequiresMeasurements,
  newMeasFieldId,
  selFromRequirementDefaults,
} from '../lib/itpItemRequirements'
import {
  effectiveScopeSectionId,
  emptyItemSel,
  type ItpLibraryItemSel,
} from '../types/itpLibraryPlan'

const JOB_TYPE_OPTIONS: { value: ItpLibraryJobType; label: string }[] = [
  { value: 'repair', label: 'Valve Repair' },
  { value: 'testonly', label: 'Test Only' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'other', label: 'Other' },
]

const NEW_TEMPLATE_OPTION = '__new__'
const MASTER_CATALOG_DRAFT_KEY = 'jsjb-itp-master-catalog-draft-v3'
const LEGACY_MASTER_CATALOG_DRAFT_KEY = 'jsjb-itp-master-catalog-draft-v2'

type MasterCatalogDraft = {
  items: ItpMasterCatalogItem[]
  areas: ItpShopAreaDef[]
  processSections: ItpProcessSectionDef[]
}

function parseAreaDefs(raw: unknown): ItpShopAreaDef[] {
  if (!Array.isArray(raw)) return defaultShopAreas()
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const value = String((row as { value?: unknown }).value ?? '').trim()
      const label = String((row as { label?: unknown }).label ?? '').trim()
      if (!value) return null
      return { value, label: label || itpShopAreaLabel(value) }
    })
    .filter((row): row is ItpShopAreaDef => Boolean(row))
}

function parseProcessSectionDefs(raw: unknown, items: ItpMasterCatalogItem[]): ItpProcessSectionDef[] {
  if (!Array.isArray(raw)) {
    return defaultProcessSections()
  }
  const parsed = raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const id = String((row as { id?: unknown }).id ?? '').trim()
      const title = String((row as { title?: unknown }).title ?? '').trim()
      if (!id) return null
      return { id, title: title || processSectionTitle(id) }
    })
    .filter((row): row is ItpProcessSectionDef => Boolean(row))
  if (parsed.length === 0) return defaultProcessSections()
  const seen = new Set(parsed.map((row) => row.id))
  const extras = items
    .map((item) => item.secId)
    .filter((id) => id && !seen.has(id))
    .map((id) => ({ id, title: processSectionTitle(id) }))
  return extras.length ? [...parsed, ...extras] : parsed
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
          `${item.id}|${item.name}|${item.secId}|${item.area}|${item.requirePicture ? 1 : 0}|${item.requireMeasurement ? 1 : 0}|${item.holdPoint ? 1 : 0}|${item.blockNext ? 1 : 0}|${(item.measFields ?? []).map((f) => f.label).join(',')}`,
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
  return scope.sel[itemId] ?? emptyItemSel()
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
    }
  }
  if ('pictureLabel' in patch) next.pictureLabel = String(patch.pictureLabel ?? '')
  if ('minPhotos' in patch) next.minPhotos = Math.max(1, Number(patch.minPhotos) || 1)
  if ('requireMeasurement' in patch || 'measFields' in patch) {
    const requireMeasurement =
      patch.requireMeasurement ?? Boolean(patch.measFields && patch.measFields.length > 0)
    if (!requireMeasurement) {
      next.beforeMeas = false
      next.afterMeas = false
      next.measVerify = false
      next.measFields = []
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
  requireMeasurement: boolean
  measFields: { id: string; label: string }[]
  holdPoint: boolean
  blockNext: boolean
}

const emptyNewMasterDraft = (): NewMasterDraft => ({
  name: '',
  area: 'teardown',
  secId: 'receipt',
  ref: '',
  requirePicture: false,
  pictureLabel: '',
  minPhotos: 1,
  requireMeasurement: false,
  measFields: DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f })),
  holdPoint: false,
  blockNext: false,
})

export function ItpTemplateBuilderPanel() {
  const { showToast } = useToast()
  const [jobType, setJobType] = useState<ItpLibraryJobType>('repair')
  const [valveType, setValveType] = useState('')
  const [templateName, setTemplateName] = useState(ITP_LIBRARY_DEFAULT_TEMPLATE_NAME)
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null)
  const [isDefaultTemplate, setIsDefaultTemplate] = useState(false)
  const [valveTypes, setValveTypes] = useState<string[]>([...VALVE_TYPES])
  const [scope, setScope] = useState<ItpLibraryTemplateScope>(() => emptyTemplateScope())
  const [catalog, setCatalog] = useState<ItpMasterCatalogItem[]>([])
  const [areas, setAreas] = useState<ItpShopAreaDef[]>(() => defaultShopAreas())
  const [processSections, setProcessSections] = useState<ItpProcessSectionDef[]>(() => defaultProcessSections())
  const [newSectionName, setNewSectionName] = useState('')
  const [draggingSection, setDraggingSection] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)
  const skipSectionChipClickRef = useRef(false)
  const masterBodyRef = useRef<HTMLDivElement | null>(null)
  const checklistBodyRef = useRef<HTMLDivElement | null>(null)
  const [savedRows, setSavedRows] = useState<ItpLibraryTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [masterDirty, setMasterDirty] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
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
  const holdPointCount = useMemo(
    () => Object.values(scope.sel).filter((s) => s.included && s.holdPoint).length,
    [scope.sel],
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

  const catalogBySection = useMemo(() => {
    const sorted = catalog.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    const known = new Set(processSections.map((section) => section.id))
    const extra = [...new Set(sorted.map((item) => item.secId).filter((secId) => secId && !known.has(secId)))].map(
      (secId) => ({
        id: secId,
        title: processSectionTitle(secId, processSections),
        items: sorted.filter((item) => item.secId === secId),
      }),
    )
    return [
      ...processSections.map((section) => ({
        id: section.id,
        title: section.title,
        items: sorted.filter((item) => item.secId === section.id),
      })),
      ...extra,
    ]
  }, [catalog, processSections])

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

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog])

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
        if (stored) {
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

  useEffect(() => {
    void loadTemplate(jobType, valveType)
  }, [jobType, valveType, loadTemplate])

  const startNewTemplate = () => {
    if (!valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    setScope(scopeFromCodeTemplate(jobType, valveType))
    setTemplateName('')
    setLoadedTemplateName(null)
    setIsDefaultTemplate(templatesForValve.length === 0)
    setDirty(true)
    setSubReqDrafts({})
  }

  const openSavedTemplate = (row: ItpLibraryTemplateRow) => {
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    const jt = row.job_type as ItpLibraryJobType
    if (jt !== jobType) setJobType(jt)
    setValveType(row.valve_type)
    void loadTemplate(jt, row.valve_type, row.name)
  }

  const selectExistingTemplate = (name: string) => {
    if (dirty && !window.confirm('Discard unsaved template changes?')) return
    void loadTemplate(jobType, valveType, name)
  }

  const updateSel = (itemId: string, patch: Partial<ItpLibraryItemSel>) => {
    setScope((prev) => ({
      ...prev,
      sel: {
        ...prev.sel,
        [itemId]: { ...(prev.sel[itemId] ?? emptyItemSel()), ...patch },
      },
    }))
    setDirty(true)
  }

  const ensureCustomOnScope = (item: ItpMasterCatalogItem, prev: ItpLibraryTemplateScope) => {
    if (item.builtIn) return prev.custom
    if (prev.custom.some((c) => c.id === item.id)) return prev.custom
    return [...prev.custom, { id: item.id, secId: item.secId, name: item.name }]
  }

  const toggleInclude = (itemId: string) => {
    if (!valveType.trim()) {
      showToast('Select a valve type first, then check items to build its template')
      return
    }
    const catalogItem = catalogById.get(itemId)
    const current = getSel(scope, itemId)
    const included = !current.included
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
      nextSel = {
        ...selFromRequirementDefaults(
          { ...current, included: true, subReqs },
          catalogItem ? requirementDefaultsFromCatalogItem(catalogItem) : null,
        ),
        included: true,
        subReqs,
      }
    }
    setScope((prev) => {
      const custom =
        included && catalogItem ? ensureCustomOnScope(catalogItem, prev) : prev.custom
      return {
        ...prev,
        custom,
        sel: {
          ...prev.sel,
          [itemId]: nextSel,
        },
      }
    })
    setDirty(true)
  }

  const selectAllInSection = (secId: string, select: boolean) => {
    if (!valveType.trim()) {
      showToast('Select a valve type first, then check items to build its template')
      return
    }
    const sectionItems = catalog.filter((item) => item.secId === secId)
    setScope((prev) => {
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
          nextSel = {
            ...selFromRequirementDefaults(
              { ...current, included: true, subReqs },
              requirementDefaultsFromCatalogItem(item),
            ),
            included: true,
            subReqs,
          }
        }
        sel[item.id] = nextSel
        if (select && !item.builtIn && !custom.some((c) => c.id === item.id)) {
          custom = [...custom, { id: item.id, secId: item.secId, name: item.name }]
        }
      }
      return { ...prev, sel, custom }
    })
    setDirty(true)
  }

  const deselectAll = () => {
    setScope((prev) => {
      const sel = { ...prev.sel }
      for (const [id, value] of Object.entries(sel)) {
        sel[id] = { ...value, included: false }
      }
      return { ...prev, sel }
    })
    setDirty(true)
  }

  const addSubReq = (itemId: string) => {
    const text = (subReqDrafts[itemId] ?? '').trim()
    if (!text) return
    const current = getSel(scope, itemId)
    updateSel(itemId, { subReqs: [...current.subReqs, text] })
    setSubReqDrafts((prev) => ({ ...prev, [itemId]: '' }))
  }

  const removeSubReq = (itemId: string, index: number) => {
    const current = getSel(scope, itemId)
    updateSel(itemId, { subReqs: current.subReqs.filter((_, i) => i !== index) })
  }

  const addMasterItem = () => {
    const name = newItem.name.trim()
    if (!name) {
      showToast('Enter the requirement text')
      return
    }
    const secId = newItem.secId
    const id = `master-${secId}-${Date.now().toString(36)}`
    const nextOrder = catalog.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
    const measFields = newItem.requireMeasurement
      ? newItem.measFields
          .map((f) => ({ id: f.id || newMeasFieldId(), label: f.label.trim() }))
          .filter((f) => f.label)
      : undefined
    if (newItem.requireMeasurement && (!measFields || measFields.length === 0)) {
      showToast('Add at least one measurement field label')
      return
    }
    setCatalog((prev) =>
      reindexCatalog([
        ...prev,
        {
          id,
          name,
          ref: newItem.ref.trim() || 'Custom',
          secId,
          area: newItem.area,
          sortOrder: nextOrder,
          builtIn: false,
          requirePicture: newItem.requirePicture || undefined,
          pictureLabel: newItem.requirePicture
            ? newItem.pictureLabel.trim() || undefined
            : undefined,
          minPhotos: newItem.requirePicture ? Math.max(1, newItem.minPhotos || 1) : undefined,
          requireMeasurement: newItem.requireMeasurement || undefined,
          measFields,
          holdPoint: newItem.holdPoint || undefined,
          blockNext: newItem.blockNext || undefined,
        },
      ]),
    )
    setNewItem(emptyNewMasterDraft())
    setMasterDirty(true)
    showToast(
      `Staged in ${processSectionTitle(secId, processSections)} — not saved yet. Click Save master list.`,
    )
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

  const changeItemArea = (itemId: string, area: ItpShopArea) => {
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, area } : item)))
    setMasterDirty(true)
  }

  const changeItemSection = (itemId: string, secId: string) => {
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, secId } : item)))
    setMasterDirty(true)
  }

  const patchMasterItem = (itemId: string, patch: Partial<ItpMasterCatalogItem>) => {
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
    setMasterDirty(true)
    const included = getSel(scope, itemId).included
    if (!included) return
    setScope((prev) => {
      const current = prev.sel[itemId]
      if (!current?.included) return prev
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: applyCatalogReqToSel(current, patch),
        },
      }
    })
    setDirty(true)
  }

  /** Template-only: move a checklist line between ITP sections without changing the master catalog. */
  const changeTemplateItemSection = (itemId: string, secId: string) => {
    setScope((prev) => ({
      ...prev,
      sel: {
        ...prev.sel,
        [itemId]: { ...(prev.sel[itemId] ?? emptyItemSel()), sectionId: secId },
      },
      custom: prev.custom.map((row) => (row.id === itemId ? { ...row, secId } : row)),
    }))
    setDirty(true)
  }

  const moveItem = (itemId: string, direction: -1 | 1) => {
    setCatalog((prev) => moveCatalogItemInSection(prev, itemId, direction))
    setMasterDirty(true)
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
    setProcessSections((prev) => [...prev, { id, title }])
    setNewItem((prev) => ({ ...prev, secId: id }))
    setNewSectionName('')
    setMasterDirty(true)
    showToast(`Added section “${title}” — click Save master list`)
    window.setTimeout(() => scrollMasterSection(id), 50)
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
      showToast('Master list saved')
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
      showToast('Enter a template name (for example Twinseal Template)')
      return
    }
    setSaving(true)
    try {
      if (masterDirty) {
        await saveItpMasterCatalog(catalog, areas, processSections)
        setMasterDirty(false)
        clearMasterCatalogDraft()
      }
      const includedCustom = catalog
        .filter((item) => !item.builtIn && getSel(scope, item.id).included)
        .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
      const mergedCustom = [...scope.custom]
      for (const row of includedCustom) {
        if (!mergedCustom.some((c) => c.id === row.id)) mergedCustom.push(row)
      }
      const toSave = { ...scope, custom: mergedCustom, processSections }
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
    const sorted = catalog.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    return catalogBySection
      .map((section) => {
        const items = sorted
          .filter((item) => {
            if (!getSel(scope, item.id).included) return false
            return effectiveScopeSectionId(item.secId, getSel(scope, item.id)) === section.id
          })
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
  }, [catalog, catalogBySection, scope])

  return (
    <section className="dashboard-panel admin-lists-panel itp-template-builder">
      <h3>ITP template builder</h3>
      <p className="placeholder-copy">
        Master list is grouped by <strong>ITP process sections</strong> (Incoming Inspection, Disassembly, Repair,
        and so on). Shop stations stay as an assignment on each item, so machining can go Machine 1 → Welding →
        Machine 2. Add or reorder sections, then pick a <strong>valve type</strong> and check items into the
        template on the right.
      </p>

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
        <label className="itp-template-builder-field">
          <span>Job type</span>
          <select
            value={jobType}
            onChange={(e) => {
              if (dirty && !window.confirm('Discard unsaved template changes?')) return
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
        <label className="itp-template-builder-field">
          <span>Valve type</span>
          <select
            value={valveType}
            onChange={(e) => {
              if (dirty && !window.confirm('Discard unsaved template changes?')) return
              setValveType(e.target.value)
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
            placeholder="e.g. Twinseal Template"
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
        <div className="itp-template-builder-actions">
          <button
            type="button"
            className="button-secondary"
            disabled={saving || !masterDirty || Boolean(schemaError)}
            onClick={() => void handleSaveMaster()}
          >
            {masterDirty ? 'Save master list' : 'Master saved'}
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!valveType || saving || loading || Boolean(schemaError)}
            onClick={() => void handleSaveTemplate()}
          >
            {saving ? 'Saving…' : dirty || masterDirty ? 'Save template' : 'Template saved'}
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
        </div>
      </div>

      {masterDirty ? (
        <p className="itp-master-unsaved-banner" role="status">
          Unsaved master list changes — <strong>Add to master</strong> only stages items until you click{' '}
          <strong>Save master list</strong>. A local draft is kept if this page closes before save.
        </p>
      ) : null}

      {savedRowsForJob.length > 0 ? (
        <div className="itp-template-builder-saved-meta">
          <span>Saved templates ({jobType}) — click to open:</span>
          <div className="itp-template-builder-saved-links">
            {savedRowsForJob.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`itp-template-saved-link${
                  valveType === row.valve_type && loadedTemplateName === row.name ? ' is-active' : ''
                }`}
                onClick={() => openSavedTemplate(row)}
                title={`Open ${row.valve_type} — ${row.name}`}
              >
                {formatItpLibraryTemplateLabel(row)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="itp-template-builder-saved-meta">
          Saved templates ({jobType}): none yet — pick a valve type, check items, then Save template.
        </p>
      )}

      <div
        className={`itp-library-split itp-template-builder-layout${valveType ? ' is-valve-selected' : ' is-master-only'}`}
      >
        <div className="itp-library-panel itp-library-panel-left">
          <div className="itp-library-panel-hdr">
            <h3>Build Scope · Master</h3>
            <div className="itp-library-ph-actions">
              <span className="itp-library-ph-count">
                {catalog.length} items
                {valveType ? ` · ${selectedCount} selected` : ''}
              </span>
              {valveType && selectedCount > 0 ? (
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
              Sections follow the ITP process. Drag to reorder, click to jump, or use × to delete. Assigned station
              stays on each item.
            </p>
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
          </nav>
          <div className="itp-library-panel-body" ref={masterBodyRef}>
            <div className="itp-master-global-add">
              <div className="itp-master-global-add-title">Add item to master list</div>
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
                <label className="itp-master-global-field">
                  <span>Assigned station</span>
                  <select
                    value={newItem.area}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, area: e.target.value as ItpShopArea }))}
                  >
                    {areas.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                  Add to master
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
                    className={`itp-library-attr-toggle hp${newItem.holdPoint ? ' on' : ''}`}
                    onClick={() => setNewItem((prev) => ({ ...prev, holdPoint: !prev.holdPoint }))}
                  >
                    QA/QC hold point
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
                    <label className="itp-master-global-field">
                      <span>Minimum photos</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={newItem.minPhotos}
                        onChange={(e) =>
                          setNewItem((prev) => ({
                            ...prev,
                            minPhotos: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}
                {newItem.requireMeasurement ? (
                  <div className="itp-master-meas-fields">
                    <div className="itp-master-meas-fields-hdr">Measurement / nameplate fields</div>
                    <div className="itp-master-meas-fields-list">
                      {newItem.measFields.map((field, idx) => (
                        <div key={field.id} className="itp-master-meas-field-row">
                          <input
                            type="text"
                            value={field.label}
                            placeholder="Field label"
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
                          measFields: [...prev.measFields, { id: newMeasFieldId(), label: '' }],
                        }))
                      }
                    >
                      + Add field
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {catalogLoading ? (
              <p className="placeholder-copy">Loading master list…</p>
            ) : (
              catalogBySection.map(({ id, title, items }, sectionIndex) => {
                const selCount = items.filter((item) => getSel(scope, item.id).included).length
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
                        <button
                          type="button"
                          className="itp-library-sel-all"
                          onClick={() => selectAllInSection(id, !allSel)}
                        >
                          {allSel ? 'Deselect All' : 'Select All'}
                        </button>
                        <button
                          type="button"
                          className="itp-library-sel-all itp-section-remove"
                          onClick={() => removeMasterSection(id)}
                          title="Remove section"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <p className="itp-master-empty-area">No items in {title} yet.</p>
                    ) : null}

                    {items.map((item, indexInSection) => {
                      const sel = getSel(scope, item.id)
                      return (
                        <div key={item.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                          <div className="itp-master-item-toolbar">
                            <button
                              type="button"
                              className="itp-master-order-btn"
                              disabled={indexInSection === 0}
                              onClick={() => moveItem(item.id, -1)}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="itp-master-order-btn"
                              disabled={indexInSection >= items.length - 1}
                              onClick={() => moveItem(item.id, 1)}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <select
                              className="itp-master-area-select"
                              value={item.area}
                              onChange={(e) => changeItemArea(item.id, e.target.value as ItpShopArea)}
                              title="Assigned station"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {areas.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
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
                          </div>
                          <div
                            className="itp-library-lib-item-top"
                            onClick={() => toggleInclude(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleInclude(item.id)
                              }
                            }}
                            role="checkbox"
                            aria-checked={sel.included}
                            tabIndex={0}
                          >
                            <div className="itp-library-cb-cell">
                              <span className="itp-library-cb" />
                            </div>
                            <div className="itp-library-lib-item-name">
                              <div className="itp-library-lin">{item.name}</div>
                              <div className="itp-library-lref">
                                {item.ref}
                                {!item.builtIn ? ' · custom' : ''}
                                {item.holdPoint ? ' · hold point' : ''}
                                {item.requirePicture ? ' · photo' : ''}
                                {item.requireMeasurement ? ' · measurements' : ''}
                                {item.blockNext ? ' · blocks next' : ''}
                              </div>
                            </div>
                          </div>
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
                                    minPhotos: !item.requirePicture ? Math.max(1, item.minPhotos || 1) : undefined,
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
                                      : [],
                                  })
                                }}
                              >
                                Measurement requirement
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
                                      patchMasterItem(item.id, { pictureLabel: e.target.value })
                                    }
                                  />
                                </label>
                                <label className="itp-master-global-field">
                                  <span>Minimum photos</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={Math.max(1, item.minPhotos || 1)}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      patchMasterItem(item.id, {
                                        minPhotos: Math.max(1, Number(e.target.value) || 1),
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            ) : null}
                            {item.requireMeasurement ? (
                              <div className="itp-master-meas-fields">
                                <div className="itp-master-meas-fields-hdr">Measurement / nameplate fields</div>
                                <div className="itp-master-meas-fields-list">
                                  {(item.measFields && item.measFields.length > 0
                                    ? item.measFields
                                    : DEFAULT_ITP_MEAS_FIELDS
                                  ).map((field, idx) => (
                                    <div key={field.id || `${item.id}-meas-${idx}`} className="itp-master-meas-field-row">
                                      <input
                                        type="text"
                                        value={field.label}
                                        placeholder="Field label"
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          const current =
                                            item.measFields && item.measFields.length > 0
                                              ? item.measFields
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(item.id, {
                                            measFields: current.map((row, i) =>
                                              i === idx ? { ...row, label: e.target.value } : row,
                                            ),
                                          })
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
                                              ? item.measFields
                                              : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                          patchMasterItem(item.id, {
                                            measFields: current.filter((_, i) => i !== idx),
                                          })
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="itp-library-add-sr-btn"
                                  onClick={() => {
                                    const current =
                                      item.measFields && item.measFields.length > 0
                                        ? item.measFields
                                        : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                                    patchMasterItem(item.id, {
                                      measFields: [...current, { id: newMeasFieldId(), label: '' }],
                                    })
                                  }}
                                >
                                  + Add field
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {sel.included ? (
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
              ITP Checklist
              {valveType
                ? ` · ${valveType}${templateName.trim() ? ` · ${templateName.trim()}` : ''}`
                : ''}
            </h3>
            <span className="itp-library-ph-count">
              {valveType ? `${selectedCount} items · ${holdPointCount} hold pts` : 'Pick a valve type'}
            </span>
          </div>

          {!valveType ? (
            <div className="itp-library-empty">
              <p>
                Select a valve type above, name the template (for example Twinseal Template), then check items on the
                left to build it here.
              </p>
            </div>
          ) : loading ? (
            <div className="itp-library-empty">
              <p>Loading template…</p>
            </div>
          ) : selectedCount === 0 ? (
            <div className="itp-library-empty">
              <p>
                Check items on the left to add them to{' '}
                {templateName.trim() ? `“${templateName.trim()}”` : 'this template'}.
              </p>
            </div>
          ) : (
            <>
              <div className="itp-library-summary">
                <div className="itp-library-ss">
                  <div className="itp-library-sv">{selectedCount}</div>
                  <div className="itp-library-sl">Items</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-hp">{holdPointCount}</div>
                  <div className="itp-library-sl">Hold Pts</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-warn">{selectedCount}</div>
                  <div className="itp-library-sl">In template</div>
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
                    {items.map((item) => {
                      const sel = getSel(scope, item.id)
                      return (
                        <div key={item.id} className="itp-library-exec-item itp-template-preview-item">
                          <div className={`itp-library-exec-row${sel.holdPoint ? ' hold-point' : ''}`}>
                            <div className="itp-library-exec-top">
                              <span className="itp-library-cb" aria-hidden />
                              <div className="itp-library-exec-body">
                                <div className="itp-library-en">{item.name}</div>
                                <div className="itp-template-preview-meta">
                                  <span className="itp-library-er">[{item.ref}]</span>
                                  <span className="itp-template-station-badge">
                                    Station: {itpShopAreaLabel(item.area, areas)}
                                  </span>
                                  {sel.holdPoint ? (
                                    <span className="itp-library-hp-badge">HOLD POINT</span>
                                  ) : null}
                                  {itemRequiresMeasurements(sel) ? (
                                    <span className="itp-library-attr-badge meas">Measurements</span>
                                  ) : null}
                                </div>
                                <div className="itp-template-preview-fields">
                                  <label className="itp-template-station-field">
                                    <span>Assigned station</span>
                                    <select
                                      value={item.area}
                                      onChange={(e) =>
                                        changeItemArea(item.id, e.target.value as ItpShopArea)
                                      }
                                      title="Change station assignment"
                                    >
                                      {areas.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
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
                      )
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
