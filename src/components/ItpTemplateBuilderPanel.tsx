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
  listItpLibraryTemplates,
  loadItpLibraryTemplate,
  saveItpLibraryTemplate,
  scopeFromCodeTemplate,
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
    async (jt: ItpLibraryJobType, vt: string) => {
      if (!vt.trim()) {
        setScope(emptyTemplateScope())
        setDirty(false)
        return
      }
      setLoading(true)
      try {
        const stored = await loadItpLibraryTemplate(jt, vt)
        setScope(stored ? stored.scope : scopeFromCodeTemplate(jt, vt))
        setDirty(false)
        setSubReqDrafts({})
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not load template')
        setScope(scopeFromCodeTemplate(jt, vt))
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
      const message = error instanceof Error ? error.message : 'Could not save master list'
      if (/relation .* does not exist|Could not find the table/i.test(message)) {
        showToast('Run migration-itp-library-templates.sql in Supabase, then try again')
      } else {
        showToast(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!valveType.trim()) {
      showToast('Select a valve type first')
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
      await saveItpLibraryTemplate(jobType, valveType, toSave)
      setScope(toSave)
      setDirty(false)
      await refreshSavedList()
      showToast(`Saved ITP template for ${valveType}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save template'
      if (/relation .* does not exist|Could not find the table/i.test(message)) {
        showToast('Run migration-itp-library-templates.sql in Supabase, then try again')
      } else {
        showToast(message)
      }
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
    if (!valveType.trim()) return
    if (!window.confirm(`Delete the saved template for ${valveType}? New ITPs will use the built-in default.`)) {
      return
    }
    try {
      await deleteItpLibraryTemplate(jobType, valveType)
      setScope(scopeFromCodeTemplate(jobType, valveType))
      setDirty(false)
      await refreshSavedList()
      showToast('Saved template deleted')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete template')
    }
  }

  const savedForCurrent = savedRows.find((r) => r.job_type === jobType && r.valve_type === valveType)

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
        <strong>valve type</strong> to split the screen and check items into that template on the right.
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
            .map((r) => r.valve_type)
            .join(', ') || 'none yet'}
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
            <h3>ITP Checklist{valveType ? ` · ${valveType}` : ''}</h3>
            <span className="itp-library-ph-count">
              {valveType ? `${selectedCount} items · ${holdPointCount} hold pts` : 'Pick a valve type'}
            </span>
          </div>

          {!valveType ? (
            <div className="itp-library-empty">
              <p>Select a valve type above, then check items on the left to build that template here.</p>
            </div>
          ) : loading ? (
            <div className="itp-library-empty">
              <p>Loading template…</p>
            </div>
          ) : selectedCount === 0 ? (
            <div className="itp-library-empty">
              <p>Check items on the left to add them to this valve type&apos;s template.</p>
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
