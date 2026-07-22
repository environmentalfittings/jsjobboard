import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import {
  findLibraryItem,
  ITP_LIBRARY,
  ITP_LIBRARY_JOB_TYPE_COLORS,
  ITP_LIBRARY_JOB_TYPE_LABELS,
  type ItpLibraryJobType,
  type ItpLibrarySectionId,
} from '../constants/itpLibrary'
import { loadItpLibraryPlan, saveItpLibraryPlan } from '../lib/itpLibraryStorage'
import { buildItpPageUrl, createItpQrDataUrl } from '../lib/itpQrCode'
import {
  allScopeItems,
  applyLibraryTemplate,
  emptyItemExec,
  emptyItemSel,
  execStats,
  getExec,
  getSel,
  type ItpLibraryItemSel,
  type ItpLibraryPlanPayload,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'

type ItpLibraryEditorProps = {
  valve: Valve
  onClose: () => void
  readOnly?: boolean
}

type AttrFlag = keyof Pick<ItpLibraryItemSel, 'holdPoint' | 'beforeMeas' | 'afterMeas' | 'measVerify'>

function JobTypeBadge({ jobType }: { jobType: ItpLibraryJobType }) {
  const color = ITP_LIBRARY_JOB_TYPE_COLORS[jobType]
  return (
    <span className="itp-library-jt-badge" style={{ background: `${color}20`, color, borderColor: `${color}40` }}>
      {ITP_LIBRARY_JOB_TYPE_LABELS[jobType]}
    </span>
  )
}

export function ItpLibraryEditor({ valve, onClose, readOnly = false }: ItpLibraryEditorProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<ItpLibraryPlanPayload | null>(null)
  const [hasLegacyInspection, setHasLegacyInspection] = useState(false)
  const [hasLegacyProcessPlan, setHasLegacyProcessPlan] = useState(false)
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({})
  const [subReqDrafts, setSubReqDrafts] = useState<Record<string, string>>({})
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const itpPageUrl = useMemo(() => buildItpPageUrl(valve.id), [valve.id])

  useEffect(() => {
    let cancelled = false
    void createItpQrDataUrl(itpPageUrl, 168)
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [itpPageUrl])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const result = await loadItpLibraryPlan(valve)
        if (cancelled) return
        setPlan(result.plan)
        setHasLegacyInspection(result.hasLegacyInspection)
        setHasLegacyProcessPlan(result.hasLegacyProcessPlan)
      } catch (error) {
        if (!cancelled) {
          showToast(error instanceof Error ? error.message : 'Failed to load ITP')
          setPlan(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [valve, showToast])

  const updatePlan = useCallback((updater: (prev: ItpLibraryPlanPayload) => ItpLibraryPlanPayload) => {
    setPlan((prev) => (prev ? updater(prev) : prev))
  }, [])

  const ensureSel = (prev: ItpLibraryPlanPayload, itemId: string): ItpLibraryItemSel =>
    prev.sel[itemId] ?? emptyItemSel()

  const scopeItems = useMemo(() => (plan ? allScopeItems(plan) : []), [plan])
  const stats = useMemo(() => (plan ? execStats(plan) : null), [plan])

  const handleSave = async () => {
    if (!plan || readOnly) return
    setSaving(true)
    try {
      await saveItpLibraryPlan(valve, plan)
      showToast('ITP saved')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save ITP')
    } finally {
      setSaving(false)
    }
  }

  const toggleInclude = (itemId: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      const included = !current.included
      let subReqs = current.subReqs
      if (included && subReqs.length === 0) {
        const found = findLibraryItem(itemId)
        if (found?.item.defaultSubReqs?.length) subReqs = [...found.item.defaultSubReqs]
      }
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...current, included, subReqs },
        },
      }
    })
  }

  const toggleAttr = (itemId: string, attr: AttrFlag) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...current, [attr]: !current[attr] },
        },
      }
    })
  }

  const selectAllInSection = (secId: ItpLibrarySectionId, select: boolean) => {
    if (readOnly) return
    const section = ITP_LIBRARY.find((s) => s.id === secId)
    if (!section) return
    updatePlan((prev) => {
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
  }

  const addCustomItem = (secId: ItpLibrarySectionId) => {
    if (readOnly) return
    const name = (customDrafts[secId] ?? '').trim()
    if (!name) return
    const id = `custom_${crypto.randomUUID()}`
    updatePlan((prev) => ({
      ...prev,
      custom: [...prev.custom, { id, secId, name }],
      sel: {
        ...prev.sel,
        [id]: { ...emptyItemSel(), included: true },
      },
    }))
    setCustomDrafts((prev) => ({ ...prev, [secId]: '' }))
  }

  const removeCustomItem = (itemId: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const sel = { ...prev.sel }
      const exec = { ...prev.exec }
      delete sel[itemId]
      delete exec[itemId]
      return {
        ...prev,
        custom: prev.custom.filter((c) => c.id !== itemId),
        sel,
        exec,
      }
    })
  }

  const removeFromScope = (itemId: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: { ...prev.sel, [itemId]: { ...current, included: false } },
      }
    })
  }

  const addSubReq = (itemId: string) => {
    if (readOnly) return
    const text = (subReqDrafts[itemId] ?? '').trim()
    if (!text) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...current, subReqs: [...current.subReqs, text] },
        },
      }
    })
    setSubReqDrafts((prev) => ({ ...prev, [itemId]: '' }))
  }

  const removeSubReq = (itemId: string, index: number) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = ensureSel(prev, itemId)
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: {
            ...current,
            subReqs: current.subReqs.filter((_, i) => i !== index),
          },
        },
      }
    })
  }

  const toggleDone = (itemId: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: { ...current, done: !current.done },
        },
      }
    })
  }

  const toggleFlag = (itemId: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: { ...current, flagged: !current.flagged },
        },
      }
    })
  }

  const setExecField = (itemId: string, field: 'beforeVal' | 'afterVal' | 'verifyVal', value: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: { ...current, [field]: value },
        },
      }
    })
  }

  const setItemNotes = (itemId: string, notes: string) => {
    if (readOnly) return
    updatePlan((prev) => {
      const sel = ensureSel(prev, itemId)
      const exec = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        sel: {
          ...prev.sel,
          [itemId]: { ...sel, notes },
        },
        // Keep exec.notes in sync for older print/checklist paths.
        exec: {
          ...prev.exec,
          [itemId]: { ...exec, notes },
        },
      }
    })
  }

  const toggleSubDone = (itemId: string, index: number) => {
    if (readOnly) return
    const key = String(index)
    updatePlan((prev) => {
      const current = prev.exec[itemId] ?? emptyItemExec()
      return {
        ...prev,
        exec: {
          ...prev.exec,
          [itemId]: {
            ...current,
            subDone: { ...current.subDone, [key]: !current.subDone[key] },
          },
        },
      }
    })
  }

  const reapplyTemplate = () => {
    if (readOnly || !plan) return
    if (!window.confirm('Re-apply the template for this job/valve type? Existing selections stay; template items will be included.')) {
      return
    }
    updatePlan((prev) => applyLibraryTemplate(prev))
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading ITP…</p>
        </section>
      </section>
    )
  }

  if (!plan || !stats) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Could not load ITP.</p>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </section>
      </section>
    )
  }

  const pctColor = stats.flagged > 0 ? 'var(--itp-lib-fail)' : stats.done === stats.total && stats.total > 0 ? 'var(--itp-lib-pass)' : 'var(--itp-lib-accent)'
  const overallLabel =
    stats.flagged > 0
      ? `⚑ ${stats.flagged} flagged`
      : stats.done === stats.total && stats.total > 0
        ? '✓ Complete'
        : `${stats.open} remaining`

  const snap = plan.valveSnapshot

  return (
    <section className="dashboard-page itp-library-page">
      <div className="itp-library-job-bar">
        <div className="itp-library-job-bar-main">
          <div className="itp-library-jb-title">
            <h2 className="dashboard-title">ITP — {snap.valveId}</h2>
            <JobTypeBadge jobType={plan.jobType} />
          </div>
          <p className="itp-library-jb-meta">
            {(snap.customer ?? '—') +
              ' · ' +
              (plan.valveType || snap.valveType || '—') +
              ' · ' +
              (snap.size || '—') +
              (snap.pressureClass ? ` / ${snap.pressureClass}` : '') +
              (snap.material ? ` · ${snap.material}` : '')}
          </p>
          <p className="itp-library-jb-note">
            Build scope on the left; the checklist on the right updates as you select items.{' '}
            <Link to={`/traveler/${encodeURIComponent(valve.valve_id)}/inspection`}>Traveler inspection</Link>
            {hasLegacyInspection ? ' · detailed inspection data on file' : null}
          </p>
        </div>
        <div className="itp-library-job-bar-side">
          {qrDataUrl ? (
            <div className="itp-library-qr-block">
              <img className="itp-library-qr-img" src={qrDataUrl} alt={`QR code for ITP ${snap.valveId}`} />
              <div className="itp-library-qr-caption">
                <strong>Scan to open ITP</strong>
                <span className="itp-library-qr-url">{itpPageUrl}</span>
              </div>
            </div>
          ) : null}
          <div className="itp-library-jb-actions">
            <button type="button" className="button-secondary" onClick={() => window.print()}>
              Print ITP
            </button>
            {!readOnly ? (
              <button type="button" className="button-secondary" onClick={reapplyTemplate}>
                Re-apply template
              </button>
            ) : null}
            {!readOnly ? (
              <button type="button" className="button-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : 'Save ITP'}
              </button>
            ) : null}
            <button type="button" className="button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {hasLegacyProcessPlan ? (
        <div className="status-breakdown-note itp-library-legacy-banner" role="status">
          A previous overall-steps / parts process plan is still saved for this valve. This page uses the new library
          checklist. Use Traveler inspection for the detailed part checklist.
        </div>
      ) : null}

      {readOnly ? (
        <p className="placeholder-copy">View only — ask an Admin or Manager to edit this ITP.</p>
      ) : null}

      <div className="itp-library-split">
        <div className="itp-library-panel itp-library-panel-left">
          <div className="itp-library-panel-hdr">
            <h3>Build Scope</h3>
            <span className="itp-library-ph-count">{scopeItems.length} selected</span>
          </div>
          <div className="itp-library-panel-body">
            {ITP_LIBRARY.map((section) => {
              const customInSec = plan.custom.filter((c) => c.secId === section.id)
              const selCount =
                section.items.filter((it) => getSel(plan, it.id).included).length +
                customInSec.filter((c) => getSel(plan, c.id).included).length
              const allSel = section.items.length > 0 && section.items.every((it) => getSel(plan, it.id).included)

              return (
                <div key={section.id} className="itp-library-lib-sec">
                  <div className="itp-library-lib-sec-hdr">
                    <h4>{section.title}</h4>
                    <div className="itp-library-lshr">
                      <span>
                        {selCount}/{section.items.length + customInSec.length}
                      </span>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="itp-library-sel-all"
                          onClick={() => selectAllInSection(section.id, !allSel)}
                        >
                          {allSel ? 'Deselect All' : 'Select All'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {section.items.map((item) => {
                    const sel = getSel(plan, item.id)
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
                          tabIndex={readOnly ? -1 : 0}
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
                              {(
                                [
                                  ['holdPoint', 'Hold Point', 'hp'],
                                  ['beforeMeas', 'Before Meas.', 'bef'],
                                  ['afterMeas', 'After Meas.', 'aft'],
                                  ['measVerify', 'Meas. Verify', 'ver'],
                                ] as const
                              ).map(([flag, label, cls]) => (
                                <button
                                  key={flag}
                                  type="button"
                                  className={`itp-library-attr-toggle ${cls}${sel[flag] ? ' on' : ''}`}
                                  disabled={readOnly}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleAttr(item.id, flag)
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <div className="itp-library-sub-reqs-area">
                              <label className="itp-library-scope-notes">
                                Notes
                                <textarea
                                  rows={2}
                                  value={sel.notes}
                                  disabled={readOnly}
                                  placeholder="Add notes for this line…"
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setItemNotes(item.id, e.target.value)}
                                />
                              </label>
                              {sel.subReqs.map((sr, idx) => (
                                <div key={`${item.id}-sr-${idx}`} className="itp-library-sub-req-row">
                                  <span>• {sr}</span>
                                  {!readOnly ? (
                                    <button
                                      type="button"
                                      className="itp-library-sr-del"
                                      onClick={() => removeSubReq(item.id, idx)}
                                    >
                                      ✕
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                              {!readOnly ? (
                                <div className="itp-library-add-sr-row">
                                  <input
                                    className="itp-library-add-sr-inp"
                                    type="text"
                                    placeholder="+ Add sub-requirement…"
                                    value={subReqDrafts[item.id] ?? ''}
                                    onChange={(e) => setSubReqDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
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
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })}

                  {customInSec.map((custom) => {
                    const sel = getSel(plan, custom.id)
                    return (
                      <div key={custom.id} className={`itp-library-lib-item${sel.included ? ' sel' : ''}`}>
                        <div
                          className="itp-library-lib-item-top"
                          onClick={() => toggleInclude(custom.id)}
                          role="button"
                          tabIndex={readOnly ? -1 : 0}
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
                              Custom
                              {!readOnly ? (
                                <>
                                  {' · '}
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
                                </>
                              ) : null}
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
                                disabled={readOnly}
                                placeholder="Add notes for this line…"
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setItemNotes(custom.id, e.target.value)}
                              />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  {!readOnly ? (
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
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="itp-library-panel itp-library-panel-right">
          <div className="itp-library-panel-hdr">
            <h3>ITP Checklist</h3>
            <span className="itp-library-ph-count" style={{ color: pctColor }}>
              {stats.done}/{stats.total} · {stats.pct}%
            </span>
          </div>

          {scopeItems.length === 0 ? (
            <div className="itp-library-empty">
              <p>Check items on the left to build your ITP scope.</p>
            </div>
          ) : (
            <>
              <div className="itp-library-summary">
                <div className="itp-library-ss">
                  <div className="itp-library-sv">{stats.total}</div>
                  <div className="itp-library-sl">Items</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-pass">{stats.done}</div>
                  <div className="itp-library-sl">Done</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-fail">{stats.flagged}</div>
                  <div className="itp-library-sl">Flagged</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-hp">{stats.holdPts}</div>
                  <div className="itp-library-sl">Hold Pts</div>
                </div>
                <div className="itp-library-ss">
                  <div className="itp-library-sv c-warn">{stats.open}</div>
                  <div className="itp-library-sl">Open</div>
                </div>
              </div>
              <div className="itp-library-pbar-strip">
                <div className="itp-library-pbar-fill" style={{ width: `${stats.pct}%`, background: pctColor }} />
              </div>

              <div className="itp-library-panel-body">
                <div className="itp-library-job-details">
                  <button type="button" className="itp-library-jd-hdr" onClick={() => setDetailsOpen((v) => !v)}>
                    {detailsOpen ? '▾' : '▸'} Job Details
                  </button>
                  {detailsOpen ? (
                    <div className="itp-library-jd-grid">
                      <div className="itp-library-jdf">
                        <label>Valve ID</label>
                        <input value={snap.valveId} readOnly />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Customer</label>
                        <input value={snap.customer ?? ''} readOnly />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Job Type</label>
                        <select
                          value={plan.jobType}
                          disabled={readOnly}
                          onChange={(e) =>
                            updatePlan((prev) => ({
                              ...prev,
                              jobType: e.target.value as ItpLibraryJobType,
                            }))
                          }
                        >
                          <option value="repair">Repair</option>
                          <option value="testonly">Test Only</option>
                          <option value="manufacturing">Manufacturing</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="itp-library-jdf">
                        <label>Valve Type</label>
                        <input
                          value={plan.valveType}
                          disabled={readOnly}
                          onChange={(e) => updatePlan((prev) => ({ ...prev, valveType: e.target.value }))}
                        />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Size / Class</label>
                        <input
                          value={[snap.size, snap.pressureClass].filter(Boolean).join(' / ')}
                          readOnly
                        />
                      </div>
                      <div className="itp-library-jdf">
                        <label>Material</label>
                        <input value={snap.material ?? ''} readOnly />
                      </div>
                      <div className="itp-library-jdf s2">
                        <label>Plan notes</label>
                        <textarea
                          rows={2}
                          value={plan.notes}
                          disabled={readOnly}
                          onChange={(e) => updatePlan((prev) => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                {ITP_LIBRARY.map((section) => {
                  const items = scopeItems.filter((it) => it.secId === section.id)
                  if (!items.length) return null
                  const secDone = items.filter((it) => getExec(plan, it.id).done).length
                  const secFlag = items.filter((it) => getExec(plan, it.id).flagged).length

                  return (
                    <div key={section.id} className="itp-library-itp-sec">
                      <div className="itp-library-itp-sec-hdr">
                        <h4>{section.title}</h4>
                        <div className="itp-library-isp-wrap screen-only">
                          {secFlag > 0 ? <span className="itp-library-sec-flag">⚑{secFlag}</span> : null}
                          <span className="itp-library-isp">
                            {secDone}/{items.length}
                          </span>
                        </div>
                      </div>
                      {items.map((it) => {
                        const ex = getExec(plan, it.id)
                        const sel = it.sel
                        return (
                          <div key={it.id} className="itp-library-exec-item">
                            {sel.holdPoint ? (
                              <div className="itp-library-hp-divider">
                                QA/QC HOLD POINT — Inspector sign-off required before proceeding
                              </div>
                            ) : null}
                            <div
                              className={`itp-library-exec-row${ex.done ? ' done' : ''}${ex.flagged ? ' flagged' : ''}${sel.holdPoint ? ' hold-point' : ''}`}
                            >
                              <div className="itp-library-exec-top">
                                <button
                                  type="button"
                                  className="itp-library-exec-cb"
                                  disabled={readOnly}
                                  onClick={() => toggleDone(it.id)}
                                  aria-label={ex.done ? 'Mark incomplete' : 'Mark done'}
                                >
                                  <span className={`itp-library-cb${ex.done ? ' sel' : ''}`} />
                                </button>
                                <div className="itp-library-exec-body">
                                  <div className="itp-library-en">
                                    {it.name}{' '}
                                    {sel.holdPoint ? <span className="itp-library-hp-badge">HOLD POINT</span> : null}
                                    {sel.beforeMeas ? <span className="itp-library-attr-badge bef">Before</span> : null}
                                    {sel.afterMeas ? <span className="itp-library-attr-badge aft">After</span> : null}
                                    {sel.measVerify ? <span className="itp-library-attr-badge ver">Verify</span> : null}
                                  </div>
                                  <div className="itp-library-er">[{it.ref}]</div>
                                  {sel.beforeMeas || sel.afterMeas || sel.measVerify ? (
                                    <div
                                      className={`itp-library-meas-fields${[sel.beforeMeas, sel.afterMeas, sel.measVerify].filter(Boolean).length === 1 ? ' one' : ''}`}
                                    >
                                      {sel.beforeMeas ? (
                                        <label className="itp-library-mf-wrap">
                                          Before Measurement
                                          <input
                                            type="text"
                                            value={ex.beforeVal}
                                            disabled={readOnly}
                                            placeholder="Value / units"
                                            onChange={(e) => setExecField(it.id, 'beforeVal', e.target.value)}
                                          />
                                          <span className="itp-library-print-field-line" aria-hidden="true">
                                            {ex.beforeVal || '\u00a0'}
                                          </span>
                                        </label>
                                      ) : null}
                                      {sel.afterMeas ? (
                                        <label className="itp-library-mf-wrap">
                                          After Measurement
                                          <input
                                            type="text"
                                            value={ex.afterVal}
                                            disabled={readOnly}
                                            placeholder="Value / units"
                                            onChange={(e) => setExecField(it.id, 'afterVal', e.target.value)}
                                          />
                                          <span className="itp-library-print-field-line" aria-hidden="true">
                                            {ex.afterVal || '\u00a0'}
                                          </span>
                                        </label>
                                      ) : null}
                                      {sel.measVerify ? (
                                        <label className="itp-library-mf-wrap">
                                          Verification / Acceptance
                                          <input
                                            type="text"
                                            className="verify"
                                            value={ex.verifyVal}
                                            disabled={readOnly}
                                            placeholder="Spec / result"
                                            onChange={(e) => setExecField(it.id, 'verifyVal', e.target.value)}
                                          />
                                          <span className="itp-library-print-field-line" aria-hidden="true">
                                            {ex.verifyVal || '\u00a0'}
                                          </span>
                                        </label>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <input
                                    className="itp-library-enote screen-only"
                                    type="text"
                                    value={sel.notes || ex.notes}
                                    disabled={readOnly}
                                    placeholder="Notes, observations…"
                                    onChange={(e) => setItemNotes(it.id, e.target.value)}
                                  />
                                  <div className="itp-library-print-notes" aria-hidden="true">
                                    <span className="itp-library-print-notes-label">Notes</span>
                                    <span className="itp-library-print-notes-line">{sel.notes || ex.notes || '\u00a0'}</span>
                                  </div>
                                  {sel.subReqs.length > 0 ? (
                                    <div className="itp-library-exec-subreqs">
                                      {sel.subReqs.map((sr, idx) => {
                                        const done = Boolean(ex.subDone[String(idx)])
                                        return (
                                          <div key={`${it.id}-exec-sr-${idx}`} className="itp-library-exec-sr-row">
                                            <button
                                              type="button"
                                              className={`itp-library-srcb${done ? ' on' : ''}`}
                                              disabled={readOnly}
                                              onClick={() => toggleSubDone(it.id, idx)}
                                              aria-label={done ? 'Uncheck sub-requirement' : 'Check sub-requirement'}
                                            >
                                              {done ? '✓' : ''}
                                            </button>
                                            <span className={done ? 'done-text' : ''}>• {sr}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="itp-library-exec-acts">
                                  <button
                                    type="button"
                                    className={`itp-library-flag-btn${ex.flagged ? ' on' : ''}`}
                                    disabled={readOnly}
                                    title="Flag issue"
                                    onClick={() => toggleFlag(it.id)}
                                  >
                                    ⚑
                                  </button>
                                  {!readOnly ? (
                                    <button
                                      type="button"
                                      className="itp-library-rm-btn"
                                      title="Remove from ITP"
                                      onClick={() => removeFromScope(it.id)}
                                    >
                                      ✕
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                <div className="itp-library-signoff">
                  <h4>QC Sign-Off</h4>
                  <div className="itp-library-so-grid">
                    <label className="itp-library-sof">
                      Inspector
                      <input
                        value={plan.inspector}
                        disabled={readOnly}
                        placeholder="Print name"
                        onChange={(e) => updatePlan((prev) => ({ ...prev, inspector: e.target.value }))}
                      />
                    </label>
                    <label className="itp-library-sof">
                      Inspection Date
                      <input
                        type="date"
                        value={plan.inspDate}
                        disabled={readOnly}
                        onChange={(e) => updatePlan((prev) => ({ ...prev, inspDate: e.target.value }))}
                      />
                    </label>
                    <label className="itp-library-sof">
                      QC Manager
                      <input
                        value={plan.qcMgr}
                        disabled={readOnly}
                        placeholder="Print name"
                        onChange={(e) => updatePlan((prev) => ({ ...prev, qcMgr: e.target.value }))}
                      />
                    </label>
                    <label className="itp-library-sof">
                      Review Date
                      <input
                        type="date"
                        value={plan.qcDate}
                        disabled={readOnly}
                        onChange={(e) => updatePlan((prev) => ({ ...prev, qcDate: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="itp-library-sig-rows">
                    <div>
                      <div className="itp-library-sig-label">Inspector Signature</div>
                      <div className="itp-library-sig-line" />
                    </div>
                    <div>
                      <div className="itp-library-sig-label">QC Manager Signature</div>
                      <div className="itp-library-sig-line" />
                    </div>
                  </div>
                  <div className="itp-library-signoff-foot">
                    Environmental Fittings · ITP library checklist
                    {' · '}
                    <strong>Overall:</strong>{' '}
                    <span style={{ color: pctColor, fontWeight: 700 }}>{overallLabel}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
