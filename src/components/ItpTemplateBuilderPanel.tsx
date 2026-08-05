import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  ITP_LIBRARY,
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

export function ItpTemplateBuilderPanel() {
  const { showToast } = useToast()
  const [jobType, setJobType] = useState<ItpLibraryJobType>('repair')
  const [valveType, setValveType] = useState('')
  const [valveTypes, setValveTypes] = useState<string[]>([...VALVE_TYPES])
  const [scope, setScope] = useState<ItpLibraryTemplateScope>(() => emptyTemplateScope())
  const [savedRows, setSavedRows] = useState<ItpLibraryTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({})

  const selectedCount = useMemo(() => countIncludedInScope(scope), [scope])

  const refreshSavedList = useCallback(async () => {
    try {
      const rows = await listItpLibraryTemplates()
      setSavedRows(rows)
    } catch {
      setSavedRows([])
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
  }, [refreshSavedList])

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
        setCustomDrafts({})
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

  const toggleInclude = (itemId: string) => {
    const current = getSel(scope, itemId)
    const included = !current.included
    let subReqs = current.subReqs
    if (included && subReqs.length === 0) {
      const found = ITP_LIBRARY.flatMap((s) => s.items).find((it) => it.id === itemId)
      if (found?.defaultSubReqs?.length) subReqs = [...found.defaultSubReqs]
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
    const section = ITP_LIBRARY.find((s) => s.id === secId)
    if (!section) return
    setScope((prev) => {
      const sel = { ...prev.sel }
      for (const item of section.items) {
        const current = sel[item.id] ?? emptyItemSel()
        let subReqs = current.subReqs
        if (select && subReqs.length === 0 && item.defaultSubReqs?.length) {
          subReqs = [...item.defaultSubReqs]
        }
        sel[item.id] = { ...current, included: select, subReqs }
      }
      for (const custom of prev.custom.filter((c) => c.secId === secId)) {
        const current = sel[custom.id] ?? emptyItemSel()
        sel[custom.id] = { ...current, included: select }
      }
      return { ...prev, sel }
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

  const addCustomItem = (secId: ItpLibrarySectionId) => {
    const name = (customDrafts[secId] ?? '').trim()
    if (!name) return
    const id = `custom-${secId}-${Date.now().toString(36)}`
    setScope((prev) => ({
      custom: [...prev.custom, { id, secId, name }],
      sel: { ...prev.sel, [id]: { ...emptyItemSel(), included: true } },
    }))
    setCustomDrafts((prev) => ({ ...prev, [secId]: '' }))
    setDirty(true)
  }

  const removeCustomItem = (itemId: string) => {
    setScope((prev) => {
      const sel = { ...prev.sel }
      delete sel[itemId]
      return {
        sel,
        custom: prev.custom.filter((c) => c.id !== itemId),
      }
    })
    setDirty(true)
  }

  const handleSave = async () => {
    if (!valveType.trim()) {
      showToast('Select a valve type first')
      return
    }
    setSaving(true)
    try {
      await saveItpLibraryTemplate(jobType, valveType, scope)
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
    if (!window.confirm('Reset this editor to the built-in family default for this valve type?')) return
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

  return (
    <section className="dashboard-panel admin-lists-panel itp-template-builder">
      <h3>ITP template builder</h3>
      <p className="placeholder-copy">
        Choose a job type and valve type, then select the same Build Scope fields used on live ITPs
        (include, hold point, measurements, notes, sub-requirements, and custom items). Save a different
        template for each valve type — new ITPs for that type will start from this template.
      </p>

      <div className="itp-template-builder-toolbar">
        <label className="itp-template-builder-field">
          <span>Job type</span>
          <select
            value={jobType}
            onChange={(e) => {
              if (dirty && !window.confirm('Discard unsaved changes?')) return
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
              if (dirty && !window.confirm('Discard unsaved changes?')) return
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
          <button type="button" className="button-primary" disabled={!valveType || saving || loading} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : dirty ? 'Save template' : 'Saved'}
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

      {!valveType ? (
        <p className="placeholder-copy">Select a valve type to start building its ITP template.</p>
      ) : loading ? (
        <p className="placeholder-copy">Loading template…</p>
      ) : (
        <div className="itp-library-panel itp-library-panel-left itp-template-builder-scope">
          <div className="itp-library-panel-hdr">
            <h3>Build Scope</h3>
            <div className="itp-library-ph-actions">
              <span className="itp-library-ph-count">{selectedCount} selected</span>
              {selectedCount > 0 ? (
                <button type="button" className="itp-library-deselect-all" onClick={deselectAll}>
                  Deselect all
                </button>
              ) : null}
            </div>
          </div>
          <div className="itp-library-panel-body">
            {ITP_LIBRARY.map((section) => {
              const customInSec = scope.custom.filter((c) => c.secId === section.id)
              const selCount =
                section.items.filter((it) => getSel(scope, it.id).included).length +
                customInSec.filter((c) => getSel(scope, c.id).included).length
              const allSel =
                section.items.length > 0 && section.items.every((it) => getSel(scope, it.id).included)

              return (
                <div key={section.id} className="itp-library-lib-sec">
                  <div className="itp-library-lib-sec-hdr">
                    <h4>{section.title}</h4>
                    <div className="itp-library-lshr">
                      <span>
                        {selCount}/{section.items.length + customInSec.length}
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
                          role="button"
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
                                <button type="button" className="itp-library-add-sr-btn" onClick={() => addSubReq(item.id)}>
                                  Add
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })}

                  {customInSec.map((custom) => {
                    const sel = getSel(scope, custom.id)
                    return (
                      <div key={custom.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                        <div
                          className="itp-library-lib-item-top"
                          onClick={() => toggleInclude(custom.id)}
                          role="button"
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
                              {custom.name} <span className="itp-library-custom-tag">(custom)</span>
                            </div>
                            <div className="itp-library-lref">
                              Custom ·{' '}
                              <button
                                type="button"
                                className="link-button-danger"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeCustomItem(custom.id)
                                }}
                              >
                                remove
                              </button>
                            </div>
                          </div>
                        </div>
                        {sel.included ? (
                          <div className="itp-library-sub-reqs-area">
                            <label className="itp-library-scope-notes">
                              Notes
                              <textarea
                                rows={2}
                                value={sel.notes}
                                placeholder="Add notes for this line…"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateSel(custom.id, { notes: e.target.value })}
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <div className="itp-library-add-row">
                    <input
                      className="itp-library-add-inp"
                      type="text"
                      placeholder="+ Add custom item…"
                      value={customDrafts[section.id] ?? ''}
                      onChange={(e) => setCustomDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addCustomItem(section.id)
                        }
                      }}
                    />
                    <button type="button" className="itp-library-add-btn" onClick={() => addCustomItem(section.id)}>
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
