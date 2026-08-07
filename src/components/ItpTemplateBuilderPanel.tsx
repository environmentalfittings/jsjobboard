import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  ITP_LIBRARY,
  findLibraryItem,
  type ItpLibraryJobType,
  type ItpLibrarySectionId,
} from '../constants/itpLibrary'
import { VALVE_TYPES } from '../constants/jobLookups'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import {
  countIncludedInScope,
  deleteItpLibraryTemplate,
  emptyTemplateScope,
  listItpLibraryTemplates,
  loadItpLibraryMasterItems,
  loadItpLibraryTemplate,
  saveItpLibraryMasterItems,
  saveItpLibraryTemplate,
  scopeFromCodeTemplate,
  type ItpLibraryTemplateRow,
  type ItpLibraryTemplateScope,
} from '../lib/itpLibraryTemplates'
import { emptyItemSel, type ItpLibraryCustomItem, type ItpLibraryItemSel } from '../types/itpLibraryPlan'

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

export function ItpTemplateBuilderPanel() {
  const { showToast } = useToast()
  const [jobType, setJobType] = useState<ItpLibraryJobType>('repair')
  const [valveType, setValveType] = useState('')
  const [valveTypes, setValveTypes] = useState<string[]>([...VALVE_TYPES])
  const [scope, setScope] = useState<ItpLibraryTemplateScope>(() => emptyTemplateScope())
  const [masterItems, setMasterItems] = useState<ItpLibraryCustomItem[]>([])
  const [savedRows, setSavedRows] = useState<ItpLibraryTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [masterDirty, setMasterDirty] = useState(false)
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
  const [masterDrafts, setMasterDrafts] = useState<Record<string, string>>({})

  const selectedCount = useMemo(() => countIncludedInScope(scope), [scope])

  const holdPointCount = useMemo(
    () => Object.values(scope.sel).filter((s) => s.included && s.holdPoint).length,
    [scope.sel],
  )

  const refreshSavedList = useCallback(async () => {
    try {
      const rows = await listItpLibraryTemplates()
      setSavedRows(rows)
    } catch {
      setSavedRows([])
    }
  }, [])

  const refreshMaster = useCallback(async () => {
    try {
      const items = await loadItpLibraryMasterItems()
      setMasterItems(items)
      setMasterDirty(false)
    } catch {
      setMasterItems([])
    }
  }, [])

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
    void refreshMaster()
  }, [refreshSavedList, refreshMaster])

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
        if (stored) {
          setScope(stored.scope)
        } else {
          setScope(scopeFromCodeTemplate(jt, vt))
        }
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

  /** Master catalog items for a section (global customs + any template-only customs). */
  const customsForSection = useCallback(
    (secId: ItpLibrarySectionId) => {
      const byId = new Map<string, ItpLibraryCustomItem>()
      for (const row of masterItems.filter((c) => c.secId === secId)) byId.set(row.id, row)
      for (const row of scope.custom.filter((c) => c.secId === secId)) {
        if (!byId.has(row.id)) byId.set(row.id, row)
      }
      return [...byId.values()]
    },
    [masterItems, scope.custom],
  )

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

  const toggleInclude = (itemId: string) => {
    if (!valveType.trim()) {
      showToast('Select a valve type first, then check items to build its template')
      return
    }
    const current = getSel(scope, itemId)
    const included = !current.included
    let subReqs = current.subReqs
    if (included && subReqs.length === 0) {
      const found = findLibraryItem(itemId)
      if (found?.item.defaultSubReqs?.length) subReqs = [...found.item.defaultSubReqs]
    }
    // Ensure custom items from master are on the template scope when included
    const master = masterItems.find((c) => c.id === itemId)
    if (included && master) {
      setScope((prev) => {
        const hasCustom = prev.custom.some((c) => c.id === itemId)
        return {
          custom: hasCustom ? prev.custom : [...prev.custom, master],
          sel: {
            ...prev.sel,
            [itemId]: { ...(prev.sel[itemId] ?? emptyItemSel()), included: true, subReqs },
          },
        }
      })
      setDirty(true)
      return
    }
    updateSel(itemId, { included, subReqs })
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

  const selectAllInSection = (secId: ItpLibrarySectionId, select: boolean) => {
    if (!valveType.trim()) {
      showToast('Select a valve type first, then check items to build its template')
      return
    }
    const section = ITP_LIBRARY.find((s) => s.id === secId)
    if (!section) return
    const customs = customsForSection(secId)
    setScope((prev) => {
      const sel = { ...prev.sel }
      let custom = [...prev.custom]
      for (const item of section.items) {
        const current = sel[item.id] ?? emptyItemSel()
        let subReqs = current.subReqs
        if (select && subReqs.length === 0 && item.defaultSubReqs?.length) {
          subReqs = [...item.defaultSubReqs]
        }
        sel[item.id] = { ...current, included: select, subReqs }
      }
      for (const row of customs) {
        const current = sel[row.id] ?? emptyItemSel()
        sel[row.id] = { ...current, included: select }
        if (select && !custom.some((c) => c.id === row.id)) custom = [...custom, row]
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

  const addMasterItem = (secId: ItpLibrarySectionId) => {
    const name = (masterDrafts[secId] ?? '').trim()
    if (!name) return
    const id = `master-${secId}-${Date.now().toString(36)}`
    const row: ItpLibraryCustomItem = { id, secId, name }
    setMasterItems((prev) => [...prev, row])
    setMasterDrafts((prev) => ({ ...prev, [secId]: '' }))
    setMasterDirty(true)
    showToast('Added to master list — Save master to keep it for everyone')
  }

  const removeMasterItem = (itemId: string) => {
    if (!window.confirm('Remove this item from the master list?')) return
    setMasterItems((prev) => prev.filter((c) => c.id !== itemId))
    setScope((prev) => ({
      custom: prev.custom.filter((c) => c.id !== itemId),
      sel: Object.fromEntries(Object.entries(prev.sel).filter(([id]) => id !== itemId)),
    }))
    setMasterDirty(true)
    setDirty(true)
  }

  const handleSaveMaster = async () => {
    setSaving(true)
    try {
      await saveItpLibraryMasterItems(masterItems)
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
        await saveItpLibraryMasterItems(masterItems)
        setMasterDirty(false)
      }
      // Keep included master customs on the template scope
      const includedMaster = masterItems.filter((m) => getSel(scope, m.id).included)
      const mergedCustom = [...scope.custom]
      for (const row of includedMaster) {
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
      const customs = customsForSection(section.id)
      const items: Array<{ id: string; name: string; ref: string; isCustom: boolean }> = []
      for (const item of section.items) {
        if (getSel(scope, item.id).included) {
          items.push({ id: item.id, name: item.name, ref: item.ref, isCustom: false })
        }
      }
      for (const custom of customs) {
        if (getSel(scope, custom.id).included) {
          items.push({ id: custom.id, name: custom.name, ref: 'Custom', isCustom: true })
        }
      }
      return { section, items }
    }).filter((row) => row.items.length > 0)
  }, [scope, customsForSection])

  return (
    <section className="dashboard-panel admin-lists-panel itp-template-builder">
      <h3>ITP template builder</h3>
      <p className="placeholder-copy">
        Left = master list (everything available). Pick a <strong>valve type</strong>, then check items on the left to
        build that type&apos;s template on the right. Add missing steps to the master list. New ITPs for that valve type
        start from the saved template.
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

      <div className="itp-library-layout itp-template-builder-layout">
          {/* LEFT — Master list (always populated) */}
          <div className="itp-library-panel itp-library-panel-left">
            <div className="itp-library-panel-hdr">
              <h3>Build Scope · Master</h3>
              <div className="itp-library-ph-actions">
                <span className="itp-library-ph-count">
                  {ITP_LIBRARY.reduce((n, s) => n + s.items.length, 0) + masterItems.length} items
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
              {ITP_LIBRARY.map((section) => {
                const customs = customsForSection(section.id)
                const total = section.items.length + customs.length
                const selCount =
                  section.items.filter((it) => getSel(scope, it.id).included).length +
                  customs.filter((c) => getSel(scope, c.id).included).length
                const allSel = total > 0 && selCount === total

                return (
                  <div key={section.id} className="itp-library-lib-sec">
                    <div className="itp-library-lib-sec-hdr">
                      <h4>{section.title}</h4>
                      <div className="itp-library-lshr">
                        <span>
                          {selCount}/{total}
                        </span>
                        <button
                          type="button"
                          className="itp-library-sel-all"
                          onClick={() => selectAllInSection(section.id, !allSel)}
                        >
                          {allSel ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                    </div>

                    <div className="itp-library-add-row itp-library-add-row--top">
                      <input
                        className="itp-library-add-inp"
                        type="text"
                        placeholder="+ Add item to master list…"
                        value={masterDrafts[section.id] ?? ''}
                        onChange={(e) => setMasterDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addMasterItem(section.id)
                          }
                        }}
                      />
                      <button type="button" className="itp-library-add-btn" onClick={() => addMasterItem(section.id)}>
                        Add
                      </button>
                    </div>

                    {section.items.map((item) => {
                      const sel = getSel(scope, item.id)
                      return (
                        <div key={item.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
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
                              <div className="itp-library-lref">{item.ref}</div>
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

                    {customs.map((custom) => {
                      const sel = getSel(scope, custom.id)
                      const isMaster = masterItems.some((m) => m.id === custom.id)
                      return (
                        <div key={custom.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                          <div
                            className="itp-library-lib-item-top"
                            onClick={() => toggleInclude(custom.id)}
                            role="checkbox"
                            aria-checked={sel.included}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                toggleInclude(custom.id)
                              }
                            }}
                          >
                            <div className="itp-library-cb-cell">
                              <span className="itp-library-cb" />
                            </div>
                            <div className="itp-library-lib-item-name">
                              <div className="itp-library-lin">
                                {custom.name}{' '}
                                <span className="itp-library-custom-tag">
                                  {isMaster ? '(master)' : '(custom)'}
                                </span>
                              </div>
                              <div className="itp-library-lref">
                                {isMaster ? (
                                  <button
                                    type="button"
                                    className="link-button-danger"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removeMasterItem(custom.id)
                                    }}
                                  >
                                    remove from master
                                  </button>
                                ) : (
                                  'Custom'
                                )}
                              </div>
                            </div>
                          </div>
                          {sel.included ? (
                            <div className="itp-library-attr-bar">
                              <button
                                type="button"
                                className={`itp-library-attr-toggle hp${sel.holdPoint ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleHoldPoint(custom.id)
                                }}
                              >
                                Hold Point
                              </button>
                              <button
                                type="button"
                                className={`itp-library-attr-toggle meas${itemRequiresMeasurements(sel) ? ' on' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRequiresMeasurements(custom.id)
                                }}
                              >
                                Requires Measurements
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT — Template preview */}
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
                    <div key={section.id} className="itp-library-chk-sec">
                      <div className="itp-library-chk-sec-hdr">
                        <h4>{section.title}</h4>
                        <span>0/{items.length}</span>
                      </div>
                      {items.map((item) => {
                        const sel = getSel(scope, item.id)
                        return (
                          <div key={item.id} className="itp-library-chk-item">
                            <div className="itp-library-chk-item-main">
                              <span className="itp-library-chk-box" aria-hidden />
                              <div className="itp-library-chk-text">
                                <div className="itp-library-chk-name">
                                  {item.name}{' '}
                                  <span className="itp-library-chk-ref">[{item.ref}]</span>
                                  {sel.holdPoint ? (
                                    <span className="itp-library-chip hp">Hold Point</span>
                                  ) : null}
                                  {itemRequiresMeasurements(sel) ? (
                                    <span className="itp-library-chip meas">Requires Measurements</span>
                                  ) : null}
                                </div>
                                <input
                                  className="itp-library-chk-notes"
                                  type="text"
                                  value={sel.notes}
                                  placeholder="Notes, observations…"
                                  onChange={(e) => updateSel(item.id, { notes: e.target.value })}
                                />
                              </div>
                              <button
                                type="button"
                                className="itp-library-chk-remove"
                                title="Remove from template"
                                onClick={() => toggleInclude(item.id)}
                              >
                                ✕
                              </button>
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
