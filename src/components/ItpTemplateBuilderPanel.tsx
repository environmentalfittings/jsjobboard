import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  ITP_LIBRARY,
  findLibraryItem,
  type ItpLibraryJobType,
  type ItpLibrarySectionId,
} from '../constants/itpLibrary'
import { ITP_SHOP_AREAS, itpShopAreaLabel, type ItpShopArea } from '../constants/itpShopAreas'
import { VALVE_TYPES } from '../constants/jobLookups'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import {
  loadItpMasterCatalog,
  moveCatalogItemInArea,
  reindexCatalog,
  saveItpMasterCatalog,
  type ItpMasterCatalogItem,
} from '../lib/itpMasterCatalog'
import {
  countIncludedInScope,
  deleteItpLibraryTemplate,
  emptyTemplateScope,
  formatItpLibraryTemplateLabel,
  ITP_LIBRARY_DEFAULT_TEMPLATE_NAME,
  listItpLibraryTemplates,
  loadItpLibraryTemplate,
  saveItpLibraryTemplate,
  scopeFromCodeTemplate,
  setDefaultItpLibraryTemplate,
  type ItpLibraryTemplateRow,
  type ItpLibraryTemplateScope,
} from '../lib/itpLibraryTemplates'
import { emptyItemSel, type ItpLibraryItemSel } from '../types/itpLibraryPlan'

const JOB_TYPE_OPTIONS: { value: ItpLibraryJobType; label: string }[] = [
  { value: 'repair', label: 'Valve Repair' },
  { value: 'testonly', label: 'Test Only' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'other', label: 'Other' },
]

const NEW_TEMPLATE_OPTION = '__new__'

function migrationHint(message: string) {
  if (/column .*name.* does not exist|Could not find the .*column.*name/i.test(message)) {
    return 'Run supabase/migration-itp-library-templates-named.sql in Supabase, then try again'
  }
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return 'Run migration-itp-library-templates.sql (and the named templates migration) in Supabase, then try again'
  }
  return message
}

function itemRequiresMeasurements(sel: ItpLibraryItemSel) {
  return sel.beforeMeas || sel.afterMeas || sel.measVerify
}

function getSel(scope: ItpLibraryTemplateScope, itemId: string): ItpLibraryItemSel {
  return scope.sel[itemId] ?? emptyItemSel()
}

type NewMasterDraft = {
  name: string
  area: ItpShopArea
  secId: ItpLibrarySectionId
  ref: string
}

function defaultSectionForArea(area: ItpShopArea): ItpLibrarySectionId {
  switch (area) {
    case 'teardown':
      return 'disassembly'
    case 'machine_shop':
    case 'welding':
      return 'repair'
    case 'assembly':
      return 'assembly'
    case 'actuation':
      return 'actuatorsec'
    case 'prv':
      return 'reliefsafety'
    case 'testing':
      return 'testing'
    case 'painting':
      return 'final'
    case 'qa_qc':
      return 'inspection'
    default:
      return 'receipt'
  }
}

const emptyNewMasterDraft = (): NewMasterDraft => ({
  name: '',
  area: 'teardown',
  secId: 'disassembly',
  ref: '',
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
  const [savedRows, setSavedRows] = useState<ItpLibraryTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [masterDirty, setMasterDirty] = useState(false)
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
  const [newItem, setNewItem] = useState<NewMasterDraft>(() => emptyNewMasterDraft())

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

  const catalogByArea = useMemo(() => {
    const sorted = catalog.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    return ITP_SHOP_AREAS.map((area) => ({
      area: area.value,
      label: area.label,
      items: sorted.filter((item) => item.area === area.value),
    }))
  }, [catalog])

  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog])

  const refreshSavedList = useCallback(async () => {
    try {
      setSavedRows(await listItpLibraryTemplates())
    } catch {
      setSavedRows([])
    }
  }, [])

  const refreshCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      setCatalog(await loadItpMasterCatalog())
      setMasterDirty(false)
    } catch {
      showToast('Could not load master list')
    } finally {
      setCatalogLoading(false)
    }
  }, [showToast])

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
    let subReqs = current.subReqs
    if (included && subReqs.length === 0) {
      if (catalogItem?.defaultSubReqs?.length) subReqs = [...catalogItem.defaultSubReqs]
      else {
        const found = findLibraryItem(itemId)
        if (found?.item.defaultSubReqs?.length) subReqs = [...found.item.defaultSubReqs]
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
          [itemId]: { ...(prev.sel[itemId] ?? emptyItemSel()), included, subReqs },
        },
      }
    })
    setDirty(true)
  }

  const toggleHoldPoint = (itemId: string) => {
    const current = getSel(scope, itemId)
    updateSel(itemId, { holdPoint: !current.holdPoint })
  }

  const toggleRequiresMeasurements = (itemId: string) => {
    const current = getSel(scope, itemId)
    const next = !itemRequiresMeasurements(current)
    updateSel(itemId, { beforeMeas: next, afterMeas: next, measVerify: next })
  }

  const selectAllInArea = (area: ItpShopArea, select: boolean) => {
    if (!valveType.trim()) {
      showToast('Select a valve type first, then check items to build its template')
      return
    }
    const areaItems = catalog.filter((item) => item.area === area)
    setScope((prev) => {
      let custom = [...prev.custom]
      const sel = { ...prev.sel }
      for (const item of areaItems) {
        const current = sel[item.id] ?? emptyItemSel()
        let subReqs = current.subReqs
        if (select && subReqs.length === 0 && item.defaultSubReqs?.length) {
          subReqs = [...item.defaultSubReqs]
        }
        sel[item.id] = { ...current, included: select, subReqs }
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
    const area = newItem.area
    const id = `master-${area}-${Date.now().toString(36)}`
    const nextOrder = catalog.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
    setCatalog((prev) =>
      reindexCatalog([
        ...prev,
        {
          id,
          name,
          ref: newItem.ref.trim() || 'Custom',
          secId: newItem.secId,
          area,
          sortOrder: nextOrder,
          builtIn: false,
        },
      ]),
    )
    setNewItem(emptyNewMasterDraft())
    setMasterDirty(true)
    showToast(`Added to ${ITP_SHOP_AREAS.find((a) => a.value === area)?.label ?? area} — click Save master list`)
  }

  const removeMasterItem = (itemId: string) => {
    const item = catalogById.get(itemId)
    if (!item) return
    if (item.builtIn) {
      showToast('Built-in items stay on the master list — change their area or order instead')
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

  const changeItemSection = (itemId: string, secId: ItpLibrarySectionId) => {
    setCatalog((prev) => prev.map((item) => (item.id === itemId ? { ...item, secId } : item)))
    setMasterDirty(true)
  }

  const moveItem = (itemId: string, direction: -1 | 1) => {
    setCatalog((prev) => moveCatalogItemInArea(prev, itemId, direction))
    setMasterDirty(true)
  }

  const handleSaveMaster = async () => {
    setSaving(true)
    try {
      await saveItpMasterCatalog(catalog)
      setMasterDirty(false)
      showToast('Master list saved')
    } catch (error) {
      showToast(migrationHint(error instanceof Error ? error.message : 'Could not save master list'))
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
        await saveItpMasterCatalog(catalog)
        setMasterDirty(false)
      }
      const includedCustom = catalog
        .filter((item) => !item.builtIn && getSel(scope, item.id).included)
        .map((item) => ({ id: item.id, secId: item.secId, name: item.name }))
      const mergedCustom = [...scope.custom]
      for (const row of includedCustom) {
        if (!mergedCustom.some((c) => c.id === row.id)) mergedCustom.push(row)
      }
      const toSave = { ...scope, custom: mergedCustom }
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
      showToast(migrationHint(error instanceof Error ? error.message : 'Could not save template'))
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
    return ITP_LIBRARY.map((section) => {
      const items = catalog
        .filter((item) => item.secId === section.id && getSel(scope, item.id).included)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          name: item.name,
          ref: item.ref,
          area: item.area,
        }))
      return { section, items }
    }).filter((row) => row.items.length > 0)
  }, [catalog, scope])

  return (
    <section className="dashboard-panel admin-lists-panel itp-template-builder">
      <h3>ITP template builder</h3>
      <p className="placeholder-copy">
        Master list is grouped by shop <strong>station</strong> (Teardown, Machine Shop, Welding, Assembly, Actuation,
        PRV, Testing, Painting, QA/QC). Add items, reorder with ↑↓, and assign stations. Pick a{' '}
        <strong>valve type</strong>, then name templates for that valve (for example Twinseal, MJ, Nordstrom) and check
        items into the template on the right.
      </p>

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
            {valveTypes.map((vt) => (
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
            disabled={saving || !masterDirty}
            onClick={() => void handleSaveMaster()}
          >
            {masterDirty ? 'Save master list' : 'Master saved'}
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!valveType || saving || loading}
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

      {savedRows.length > 0 ? (
        <p className="itp-template-builder-saved-meta">
          Saved templates ({jobType}):{' '}
          {savedRows
            .filter((r) => r.job_type === jobType)
            .map((r) => formatItpLibraryTemplateLabel(r))
            .join(' · ') || 'none yet'}
        </p>
      ) : null}

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
          <div className="itp-library-panel-body">
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
                  <span>Category</span>
                  <select
                    value={newItem.area}
                    onChange={(e) => {
                      const area = e.target.value as ItpShopArea
                      setNewItem((prev) => ({
                        ...prev,
                        area,
                        secId: defaultSectionForArea(area),
                      }))
                    }}
                  >
                    {ITP_SHOP_AREAS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="itp-master-global-field">
                  <span>ITP section</span>
                  <select
                    value={newItem.secId}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, secId: e.target.value as ItpLibrarySectionId }))
                    }
                  >
                    {ITP_LIBRARY.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
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
            </div>

            {catalogLoading ? (
              <p className="placeholder-copy">Loading master list…</p>
            ) : (
              catalogByArea.map(({ area, label, items }) => {
                const selCount = items.filter((item) => getSel(scope, item.id).included).length
                const allSel = items.length > 0 && selCount === items.length
                return (
                  <div key={area} className="itp-library-lib-sec">
                    <div className="itp-library-lib-sec-hdr">
                      <h4>{label}</h4>
                      <div className="itp-library-lshr">
                        <span>
                          {selCount}/{items.length}
                        </span>
                        <button
                          type="button"
                          className="itp-library-sel-all"
                          onClick={() => selectAllInArea(area, !allSel)}
                        >
                          {allSel ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <p className="itp-master-empty-area">No items in {label} yet.</p>
                    ) : null}

                    {items.map((item, indexInArea) => {
                      const sel = getSel(scope, item.id)
                      return (
                        <div key={item.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                          <div className="itp-master-item-toolbar">
                            <button
                              type="button"
                              className="itp-master-order-btn"
                              disabled={indexInArea === 0}
                              onClick={() => moveItem(item.id, -1)}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="itp-master-order-btn"
                              disabled={indexInArea >= items.length - 1}
                              onClick={() => moveItem(item.id, 1)}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <select
                              className="itp-master-area-select"
                              value={item.area}
                              onChange={(e) => changeItemArea(item.id, e.target.value as ItpShopArea)}
                              title="Shop area"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ITP_SHOP_AREAS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <select
                              className="itp-master-section-select"
                              value={item.secId}
                              onChange={(e) =>
                                changeItemSection(item.id, e.target.value as ItpLibrarySectionId)
                              }
                              title="ITP section"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ITP_LIBRARY.map((section) => (
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
                              </div>
                            </div>
                          </div>
                          {sel.included ? (
                            <>
                              <div className="itp-library-attr-bar">
                                <button
                                  type="button"
                                  className={`itp-library-attr-toggle hp${sel.holdPoint ? ' on' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleHoldPoint(item.id)
                                  }}
                                >
                                  Hold Point
                                </button>
                                <button
                                  type="button"
                                  className={`itp-library-attr-toggle meas${itemRequiresMeasurements(sel) ? ' on' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleRequiresMeasurements(item.id)
                                  }}
                                >
                                  Requires Measurements
                                </button>
                              </div>
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
              <div className="itp-library-panel-body">
                {checklistSections.map(({ section, items }) => (
                  <div key={section.id} className="itp-library-itp-sec">
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
                                    Station: {itpShopAreaLabel(item.area)}
                                  </span>
                                  {sel.holdPoint ? (
                                    <span className="itp-library-hp-badge">HOLD POINT</span>
                                  ) : null}
                                  {itemRequiresMeasurements(sel) ? (
                                    <span className="itp-library-attr-badge meas">Measurements</span>
                                  ) : null}
                                </div>
                                <label className="itp-template-station-field">
                                  <span>Assigned station</span>
                                  <select
                                    value={item.area}
                                    onChange={(e) =>
                                      changeItemArea(item.id, e.target.value as ItpShopArea)
                                    }
                                    title="Change station assignment"
                                  >
                                    {ITP_SHOP_AREAS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
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
