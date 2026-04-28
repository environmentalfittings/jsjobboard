import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import { supabase } from '../lib/supabase'
import { ItpItemGlyph, ItpOverallTabIcon } from './itpItemGlyphs'
import { ValveTypeProceduresPanel } from './ValveTypeProceduresPanel'
import {
  computeItpProgress,
  countFlaggedItems,
  createDefaultItpPayload,
  itemInspectionStatus,
  mergeItpPayload,
  type ItpItemInspectionStatus,
} from '../lib/itpPayload'
import { resolveItpTemplateIdFromValve } from '../constants/itpTemplates'
import type { Valve } from '../types'
import type { FlangeFaceState, ItpItemState, ItpPayload } from '../types/itp'
import { ITP_CONDITIONS, ITP_FACING_TYPES, ITP_REPAIR_ACTIONS } from '../constants/itpOptions'
import { ItpFlangeDimensionsDiagram } from './ItpFlangeDimensionsDiagram'
import {
  getFlangeFaceState,
  ITP_PORT_OTHER,
  ITP_PORT_STANDARD,
  ITP_VALVE_PORT_OPTIONS,
  normalizedPortConfig,
  visibleFlangeIds,
} from '../lib/itpTwinsealFlanges'

const ITP_SELECT_OTHER = 'Other'

function repairActionLabel(f: FlangeFaceState): string {
  const r = f.repairAction.trim()
  if (!r) return ''
  if (r === ITP_SELECT_OTHER) return f.repairActionOther.trim() || r
  return r
}

interface ItpEditorModalProps {
  valve: Valve
  onClose: () => void
}

const AUTH_USER_STORAGE_KEY = 'js-valve-auth-user-v1'
const ITP_RESOURCES_TAB_ID = 'resources'

function ItpFullscreenIcons({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
      </svg>
    )
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}

function measurementWarning(measure1: string, measure2: string): string | null {
  const a = parseFloat(measure1.replace(/,/g, ''))
  const b = parseFloat(measure2.replace(/,/g, ''))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a < b) return 'Below acceptable limit'
  return null
}

function overviewStatusLabel(s: ItpItemInspectionStatus): string {
  if (s === 'pending') return 'Pending'
  if (s === 'acceptable') return 'Acceptable'
  return 'Needs attention'
}

function overviewStatusClass(s: ItpItemInspectionStatus): string {
  if (s === 'pending') return 'itp-overview-status itp-os-pending'
  if (s === 'acceptable') return 'itp-overview-status itp-os-ok'
  return 'itp-overview-status itp-os-warn'
}

function firstTwinsealFlangeRepairBadge(data: ItpItemState): string | null {
  const cfg = normalizedPortConfig(data.valvePortConfig)
  for (const fid of visibleFlangeIds(cfg)) {
    const f = getFlangeFaceState(data, fid)
    const rep = repairActionLabel(f)
    if (f.condition && f.condition !== 'Acceptable' && rep) {
      return rep
    }
  }
  return null
}

function updateItemField(
  payload: ItpPayload,
  tabId: string,
  itemId: string,
  field: keyof ItpItemState,
  value: string,
): ItpPayload {
  return {
    ...payload,
    tabs: payload.tabs.map((tab) =>
      tab.id !== tabId
        ? tab
        : {
            ...tab,
            items: tab.items.map((item) =>
              item.id !== itemId ? item : { ...item, data: { ...item.data, [field]: value } },
            ),
          },
    ),
  }
}

function updateTwinsealFlangeField(
  payload: ItpPayload,
  tabId: string,
  itemId: string,
  face: 'A' | 'B' | 'C' | 'D',
  field: keyof FlangeFaceState,
  value: string,
): ItpPayload {
  return {
    ...payload,
    tabs: payload.tabs.map((tab) =>
      tab.id !== tabId
        ? tab
        : {
            ...tab,
            items: tab.items.map((item) => {
              if (item.id !== itemId) return item
              if (face === 'A') {
                return { ...item, data: { ...item.data, [field]: value } }
              }
              if (face === 'B') {
                return { ...item, data: { ...item.data, flangeB: { ...item.data.flangeB, [field]: value } } }
              }
              if (face === 'C') {
                return { ...item, data: { ...item.data, flangeC: { ...item.data.flangeC, [field]: value } } }
              }
              return { ...item, data: { ...item.data, flangeD: { ...item.data.flangeD, [field]: value } } }
            }),
          },
    ),
  }
}

export function ItpEditorModal({ valve, onClose }: ItpEditorModalProps) {
  const { showToast } = useToast()
  const templateId = useMemo(
    () => resolveItpTemplateIdFromValve(valve.bowl_type ?? null, valve.valve_type ?? null),
    [valve.bowl_type, valve.valve_type],
  )
  const isTwinsealUi = templateId === 'twinseal'
  const [sessionTechName, setSessionTechName] = useState('')
  const generalNotesRef = useRef<HTMLDivElement>(null)
  const [payload, setPayload] = useState<ItpPayload>(() => createDefaultItpPayload())
  const [activeTabId, setActiveTabId] = useState('body')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    setIsMaximized(false)
  }, [valve.id])

  useEffect(() => {
    setSessionTechName(window.localStorage.getItem(AUTH_USER_STORAGE_KEY)?.trim() ?? '')
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      // Use * so missing `itp_data` column does not break the whole request.
      const { data, error } = await supabase.from('valve_itp').select('*').eq('valve_row_id', valve.id).maybeSingle()

      if (cancelled) return

      if (error) {
        showToast('Could not load ITP')
        const fallback = createDefaultItpPayload(templateId)
        setPayload(fallback)
        setActiveTabId(fallback.tabs[0]?.id ?? 'body')
        setSelectedItemId(fallback.tabs[0]?.items[0]?.id ?? null)
        setLoading(false)
        return
      }

      const row = data as { content?: string; itp_data?: unknown } | null
      const merged = mergeItpPayload(row?.itp_data, row?.content ?? '', templateId)
      setPayload(merged)
      const firstTab = merged.tabs[0]
      setActiveTabId(firstTab?.id ?? 'body')
      setSelectedItemId(firstTab?.items[0]?.id ?? null)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [valve.id, showToast, templateId])

  useEffect(() => {
    if (loading) return
    if (activeTabId === ITP_RESOURCES_TAB_ID) {
      setSelectedItemId(null)
      return
    }
    setSelectedItemId((prev) => {
      const tab = payload.tabs.find((t) => t.id === activeTabId) ?? payload.tabs[0]
      if (!tab?.items.length) return null
      if (prev && tab.items.some((i) => i.id === prev)) return prev
      return tab.items[0].id
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync selection when tab/load changes only (not every payload edit)
  }, [loading, activeTabId])

  const isResourcesTab = activeTabId === ITP_RESOURCES_TAB_ID

  const activeTab = useMemo(() => {
    if (activeTabId === ITP_RESOURCES_TAB_ID) return undefined
    return payload.tabs.find((t) => t.id === activeTabId) ?? payload.tabs[0]
  }, [payload.tabs, activeTabId])

  const selectedItem = useMemo(() => {
    if (!activeTab || !selectedItemId) return undefined
    return activeTab.items.find((i) => i.id === selectedItemId)
  }, [activeTab, selectedItemId])

  const progress = useMemo(() => computeItpProgress(payload), [payload])
  const sectionTabs = useMemo(() => payload.tabs.filter((t) => t.items.length > 0), [payload.tabs])
  const showOverview = Boolean(!isResourcesTab && activeTab && activeTab.items.length === 0)

  const goToInspectionItem = (tabId: string, itemId: string) => {
    setActiveTabId(tabId)
    setSelectedItemId(itemId)
  }

  const selectTab = (tabId: string) => {
    setActiveTabId(tabId)
    if (tabId === ITP_RESOURCES_TAB_ID) {
      setSelectedItemId(null)
      return
    }
    const tab = payload.tabs.find((t) => t.id === tabId)
    if (!tab?.items.length) {
      setSelectedItemId(null)
      return
    }
    setSelectedItemId(tab.items[0]?.id ?? null)
  }

  const setField = (field: keyof ItpItemState, value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => updateItemField(p, activeTab.id, selectedItemId, field, value))
  }

  const setFlangeField = (face: 'A' | 'B' | 'C' | 'D', field: keyof FlangeFaceState, value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => updateTwinsealFlangeField(p, activeTab.id, selectedItemId, face, field, value))
  }

  const setValvePortConfig = (value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateItemField(p, activeTab.id, selectedItemId, 'valvePortConfig', value)
      if (value !== ITP_PORT_OTHER) {
        n = updateItemField(n, activeTab.id, selectedItemId, 'valvePortConfigOther', '')
      }
      return n
    })
  }

  const setFlangeFacingType = (face: 'A' | 'B' | 'C' | 'D', value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateTwinsealFlangeField(p, activeTab.id, selectedItemId, face, 'facingType', value)
      if (value !== ITP_SELECT_OTHER) {
        n = updateTwinsealFlangeField(n, activeTab.id, selectedItemId, face, 'facingTypeOther', '')
      }
      return n
    })
  }

  const setFlangeCondition = (face: 'A' | 'B' | 'C' | 'D', value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateTwinsealFlangeField(p, activeTab.id, selectedItemId, face, 'condition', value)
      if (value !== ITP_SELECT_OTHER) {
        n = updateTwinsealFlangeField(n, activeTab.id, selectedItemId, face, 'conditionOther', '')
      }
      return n
    })
  }

  const setFlangeRepairAction = (face: 'A' | 'B' | 'C' | 'D', value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateTwinsealFlangeField(p, activeTab.id, selectedItemId, face, 'repairAction', value)
      if (value !== ITP_SELECT_OTHER) {
        n = updateTwinsealFlangeField(n, activeTab.id, selectedItemId, face, 'repairActionOther', '')
      }
      return n
    })
  }

  const setRootFacingType = (value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateItemField(p, activeTab.id, selectedItemId, 'facingType', value)
      if (value !== ITP_SELECT_OTHER) {
        n = updateItemField(n, activeTab.id, selectedItemId, 'facingTypeOther', '')
      }
      return n
    })
  }

  const setRootCondition = (value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateItemField(p, activeTab.id, selectedItemId, 'condition', value)
      if (value !== ITP_SELECT_OTHER) {
        n = updateItemField(n, activeTab.id, selectedItemId, 'conditionOther', '')
      }
      return n
    })
  }

  const setRootRepairAction = (value: string) => {
    if (!activeTab || !selectedItemId) return
    setPayload((p) => {
      let n = updateItemField(p, activeTab.id, selectedItemId, 'repairAction', value)
      if (value !== ITP_SELECT_OTHER) {
        n = updateItemField(n, activeTab.id, selectedItemId, 'repairActionOther', '')
      }
      return n
    })
  }

  const persist = async (message: string) => {
    setSaving(true)
    const withJsonb = {
      valve_row_id: valve.id,
      content: payload.generalNotes,
      itp_data: payload as unknown as Record<string, unknown>,
    }
    let { error } = await supabase.from('valve_itp').upsert(withJsonb, { onConflict: 'valve_row_id' })

    if (error) {
      const msg = `${error.message ?? ''} ${(error as { details?: string }).details ?? ''}`
      const likelyMissingColumn =
        /itp_data|column|schema cache|PGRST204/i.test(msg) || (error as { code?: string }).code === 'PGRST204'
      if (likelyMissingColumn) {
        const fallbackRow = {
          valve_row_id: valve.id,
          content: JSON.stringify(payload),
        }
        const second = await supabase.from('valve_itp').upsert(fallbackRow, { onConflict: 'valve_row_id' })
        error = second.error
        if (!error) {
          showToast(`${message} — add column itp_data (see supabase/schema.sql) when you can.`)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    if (error) {
      showToast(`Could not save ITP: ${error.message}`)
      return
    }
    showToast(message)
  }

  const flagged = countFlaggedItems(payload)

  const scrollToReviewIssues = useCallback(() => {
    generalNotesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (flagged > 0) {
      showToast(`${flagged} checklist item${flagged === 1 ? '' : 's'} still need attention`)
    }
  }, [flagged, showToast])

  const measureHint =
    selectedItem &&
    measurementWarning(selectedItem.data.measure1, selectedItem.data.measure2)

  const showFacing = selectedItem?.label.toLowerCase() === 'flanges'
  const showBodyMultiFlanges =
    !isResourcesTab && activeTab?.id === 'body' && selectedItem?.label.toLowerCase() === 'flanges'

  const multiFlangeHeaderRepair = useMemo(() => {
    if (!showBodyMultiFlanges || !selectedItem) return null
    return firstTwinsealFlangeRepairBadge(selectedItem.data)
  }, [showBodyMultiFlanges, selectedItem])

  const bodyFlangesItemCtx = (tabId: string, itemLabel: string) => ({
    aggregateBodyFlanges: tabId === 'body' && itemLabel.toLowerCase() === 'flanges',
  })

  return (
    <div
      className={`modal-overlay itp-modal-overlay${isMaximized ? ' modal-overlay--job-max' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="itp-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal-card itp-modal-card${isTwinsealUi ? ' itp-modal-card--twinseal' : ''}${isMaximized ? ' itp-modal-card--max' : ''}`}
      >
        <div className={`itp-surface-header${isTwinsealUi ? ' itp-surface-header--twinseal' : ''}`}>
          {isTwinsealUi ? (
            <div className="itp-ts-header">
              <button
                type="button"
                className="itp-ts-back"
                onClick={onClose}
                aria-label="Back"
                disabled={saving}
              >
                ←
              </button>
              <div className="itp-ts-header-center">
                <p className="itp-ts-job-line">Inspection for Job #{valve.valve_id}</p>
                <h2 id="itp-modal-title" className="itp-ts-title">
                  {valve.valve_type?.trim() || 'Twinseal'}
                </h2>
              </div>
              <div className="itp-ts-header-aside">
                {valve.customer?.trim() ? <span className="itp-ts-aside-customer">{valve.customer.trim()}</span> : null}
                <div className="itp-ts-aside-sub">
                  {valve.size?.trim() ? <span>Size: {valve.size.trim()}</span> : null}
                  {sessionTechName ? (
                    <>
                      {valve.size?.trim() ? <span className="itp-ts-dot">•</span> : null}
                      <span className="itp-ts-tech-pill">Tech: {sessionTechName}</span>
                    </>
                  ) : null}
                </div>
                {(valve.description ?? '').trim() ? (
                  <p className="itp-ts-aside-desc" title={(valve.description ?? '').trim()}>
                    {(valve.description ?? '').trim()}
                  </p>
                ) : null}
                {valve.cell?.trim() ? (
                  <p className="itp-ts-aside-cell">Cell: {valve.cell.trim()}</p>
                ) : null}
              </div>
              <div className="itp-ts-header-trail">
                <button
                  type="button"
                  className="itp-header-max"
                  onClick={() => setIsMaximized((m) => !m)}
                  disabled={saving}
                  aria-label={isMaximized ? 'Exit full screen' : 'Full screen'}
                  title={isMaximized ? 'Exit full screen' : 'Full screen'}
                >
                  <ItpFullscreenIcons expanded={isMaximized} />
                </button>
                <button
                  type="button"
                  className="itp-header-close itp-header-close--twinseal"
                  onClick={onClose}
                  aria-label="Close ITP"
                  disabled={saving}
                >
                  ×
                </button>
              </div>
            </div>
          ) : (
            <div className="itp-surface-header-top">
              <div className="itp-surface-header-text">
                <div className="itp-surface-kicker">Inspection</div>
                <h2 id="itp-modal-title" className="itp-surface-job">
                  Inspection for Job #{valve.valve_id}
                </h2>
                <p className="itp-surface-valve-type">{valve.valve_type?.trim() || '—'}</p>
                <div className="itp-surface-meta-row" aria-label="Valve type, size, and description">
                  {valve.size?.trim() ? <span>Size: {valve.size.trim()}</span> : null}
                  {(valve.description ?? '').trim() ? (
                    <span className="itp-surface-meta-desc" title={(valve.description ?? '').trim()}>
                      {(valve.description ?? '').trim()}
                    </span>
                  ) : (
                    <span className="itp-surface-meta-muted">No description</span>
                  )}
                </div>
                {valve.customer?.trim() || valve.cell?.trim() ? (
                  <div className="itp-surface-meta-secondary" aria-label="Customer and finish cell">
                    {valve.customer?.trim() ? <span>{valve.customer.trim()}</span> : null}
                    {valve.customer?.trim() && valve.cell?.trim() ? (
                      <span className="itp-surface-meta-dot">·</span>
                    ) : null}
                    {valve.cell?.trim() ? <span>Cell: {valve.cell.trim()}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="itp-surface-header-actions">
                <button
                  type="button"
                  className="itp-header-max"
                  onClick={() => setIsMaximized((m) => !m)}
                  disabled={saving}
                  aria-label={isMaximized ? 'Exit full screen' : 'Full screen'}
                  title={isMaximized ? 'Exit full screen' : 'Full screen'}
                >
                  <ItpFullscreenIcons expanded={isMaximized} />
                </button>
                <button
                  type="button"
                  className="itp-header-close"
                  onClick={onClose}
                  aria-label="Close ITP"
                  disabled={saving}
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>

        {!isTwinsealUi ? (
          <div className="itp-modal-toolbar">
            <p className="itp-modal-lead">
              Walk through each area, record condition, measurements, and repair intent. Photos stay on the job card
              (Attachments).
            </p>
          </div>
        ) : null}

        {loading ? (
          <p className="placeholder-copy itp-loading">Loading…</p>
        ) : (
          <>
            <div
              className={`itp-tabs itp-tabs-v2${isTwinsealUi ? ' itp-tabs--twinseal' : ''}`}
              role="tablist"
              aria-label="ITP sections"
            >
              {payload.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={tab.id === activeTabId}
                  className={`itp-tab ${tab.id === activeTabId ? 'itp-tab-active' : ''}`}
                  onClick={() => selectTab(tab.id)}
                  disabled={saving}
                >
                  {isTwinsealUi && tab.id === 'overall' ? (
                    <span className="itp-tab-inner">
                      <ItpOverallTabIcon />
                      <span>{tab.label}</span>
                    </span>
                  ) : (
                    tab.label
                  )}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={isResourcesTab}
                className={`itp-tab ${isResourcesTab ? 'itp-tab-active' : ''}`}
                onClick={() => selectTab(ITP_RESOURCES_TAB_ID)}
                disabled={saving}
              >
                Resources
              </button>
            </div>

            <div className="itp-modal-scroll">
              {!isResourcesTab ? (
              <div
                className={`itp-progress-card${isTwinsealUi ? ' itp-progress-card--twinseal' : ''}`}
                aria-label="Inspection progress"
              >
                {isTwinsealUi ? <h3 className="itp-progress-card-title">Inspection progress</h3> : null}
                <div className="itp-progress-stats">
                  <div>
                    <div
                      className={`itp-progress-stat-value itp-stat-inspected${isTwinsealUi ? ' itp-ts-stat-num' : ''}`}
                    >
                      {progress.inspected}
                    </div>
                    <div className="itp-progress-stat-label">Inspected</div>
                  </div>
                  <div>
                    <div
                      className={`itp-progress-stat-value itp-stat-repair${isTwinsealUi ? ' itp-ts-stat-num' : ''}`}
                    >
                      {progress.needRepair}
                    </div>
                    <div className="itp-progress-stat-label">Need repair</div>
                  </div>
                  <div>
                    <div className={`itp-progress-stat-value itp-stat-ok${isTwinsealUi ? ' itp-ts-stat-num' : ''}`}>
                      {progress.acceptable}
                    </div>
                    <div className="itp-progress-stat-label">Acceptable</div>
                  </div>
                  <div>
                    <div
                      className={`itp-progress-stat-value itp-stat-remain${isTwinsealUi ? ' itp-ts-stat-remain' : ''}`}
                    >
                      {progress.remaining}
                    </div>
                    <div className="itp-progress-stat-label">Remaining</div>
                  </div>
                </div>
                <div className="itp-progress-bar-track" aria-hidden>
                  <div className="itp-progress-bar-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="itp-progress-pct">{progress.pct}% complete</p>
                {flagged > 0 && !isTwinsealUi ? (
                  <p className="itp-progress-attention">
                    {flagged} area{flagged === 1 ? '' : 's'} outside Acceptable — open sections below to resolve.
                  </p>
                ) : null}
              </div>
              ) : null}

              {isResourcesTab ? (
                <ValveTypeProceduresPanel
                  variant="itp"
                  initialValveType={valve.valve_type?.trim() ? valve.valve_type : undefined}
                  selectId="itp-resources-valve-type"
                />
              ) : showOverview ? (
                <div className={`itp-overview${isTwinsealUi ? ' itp-overview--twinseal' : ''}`}>
                  {sectionTabs.map((tab) => (
                    <section key={tab.id} className="itp-overview-section">
                      <div className="itp-overview-section-head">
                        <span>{tab.label}</span>
                        <button
                          type="button"
                          className="itp-overview-open-btn"
                          onClick={() => goToInspectionItem(tab.id, tab.items[0].id)}
                          disabled={saving || !tab.items.length}
                        >
                          Open ›
                        </button>
                      </div>
                      {tab.items.map((item) => {
                        const st = itemInspectionStatus(item.data, bodyFlangesItemCtx(tab.id, item.label))
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="itp-overview-row"
                            onClick={() => goToInspectionItem(tab.id, item.id)}
                            disabled={saving}
                          >
                            <span className="itp-overview-row-main">
                              {isTwinsealUi ? <ItpItemGlyph label={item.label} /> : null}
                              <span className="itp-overview-row-label">{item.label}</span>
                            </span>
                            <span className={overviewStatusClass(st)}>
                              {overviewStatusLabel(st)} ›
                            </span>
                          </button>
                        )
                      })}
                    </section>
                  ))}
                </div>
              ) : activeTab ? (
                <div className={`itp-shell${isTwinsealUi ? ' itp-shell--twinseal' : ''}`}>
                  <nav className="itp-item-list" aria-label="Areas in this section">
                    {activeTab.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`itp-item-row ${item.id === selectedItemId ? 'itp-item-row-active' : ''}`}
                        onClick={() => setSelectedItemId(item.id)}
                        disabled={saving}
                      >
                        {isTwinsealUi ? <ItpItemGlyph label={item.label} /> : null}
                        <span className="itp-item-row-label">{item.label}</span>
                        <span
                          className={`itp-item-row-status ${overviewStatusClass(
                            itemInspectionStatus(item.data, bodyFlangesItemCtx(activeTab.id, item.label)),
                          )}`}
                        >
                          {overviewStatusLabel(
                            itemInspectionStatus(item.data, bodyFlangesItemCtx(activeTab.id, item.label)),
                          )}
                        </span>
                        <span className="itp-item-row-chevron" aria-hidden>
                          ›
                        </span>
                      </button>
                    ))}
                  </nav>

                  <div className="itp-detail">
                    {selectedItem ? (
                      showBodyMultiFlanges ? (
                        <>
                          <div className="itp-detail-head">
                            <h3 className="itp-detail-title">
                              {activeTab.label} — {selectedItem.label}
                            </h3>
                            {multiFlangeHeaderRepair ? (
                              <span className="itp-badge-repair">{multiFlangeHeaderRepair}</span>
                            ) : null}
                          </div>

                          <label className="itp-field">
                            <span className="itp-field-label">Valve configuration</span>
                            <select
                              className="itp-select"
                              value={selectedItem.data.valvePortConfig || ITP_PORT_STANDARD}
                              onChange={(e) => setValvePortConfig(e.target.value)}
                              disabled={saving}
                              aria-label="Valve configuration"
                            >
                              {ITP_VALVE_PORT_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedItem.data.valvePortConfig === ITP_PORT_OTHER ? (
                            <label className="itp-field">
                              <span className="itp-field-label">Describe configuration</span>
                              <input
                                type="text"
                                className="itp-input"
                                value={selectedItem.data.valvePortConfigOther}
                                onChange={(e) => setField('valvePortConfigOther', e.target.value)}
                                placeholder="e.g. special port count, custom layout…"
                                disabled={saving}
                                autoComplete="off"
                              />
                            </label>
                          ) : null}

                          <ItpFlangeDimensionsDiagram />

                          {visibleFlangeIds(normalizedPortConfig(selectedItem.data.valvePortConfig)).map((fid) => {
                            const face = getFlangeFaceState(selectedItem.data, fid)
                            const flangeHint = measurementWarning(face.measure1, face.measure2)
                            return (
                              <div key={fid} className="itp-flange-section">
                                <h4 className="itp-flange-section-title">Flange {fid}</h4>
                                <label className="itp-field">
                                  <span className="itp-field-label">Facing type</span>
                                  <select
                                    className="itp-select"
                                    value={face.facingType}
                                    onChange={(e) => setFlangeFacingType(fid, e.target.value)}
                                    disabled={saving}
                                  >
                                    {ITP_FACING_TYPES.map((opt) => (
                                      <option key={opt || 'empty'} value={opt}>
                                        {opt || '— Select —'}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {face.facingType === ITP_SELECT_OTHER ? (
                                  <label className="itp-field">
                                    <span className="itp-field-label">Facing type (specify)</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.facingTypeOther}
                                      onChange={(e) => setFlangeField(fid, 'facingTypeOther', e.target.value)}
                                      placeholder="Describe facing type…"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                ) : null}
                                <label className="itp-field">
                                  <span className="itp-field-label">Condition</span>
                                  <select
                                    className="itp-select"
                                    value={face.condition}
                                    onChange={(e) => setFlangeCondition(fid, e.target.value)}
                                    disabled={saving}
                                  >
                                    {ITP_CONDITIONS.map((opt) => (
                                      <option key={opt || 'empty'} value={opt}>
                                        {opt || '— Select —'}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {face.condition === ITP_SELECT_OTHER ? (
                                  <label className="itp-field">
                                    <span className="itp-field-label">Condition (specify)</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.conditionOther}
                                      onChange={(e) => setFlangeField(fid, 'conditionOther', e.target.value)}
                                      placeholder="Describe condition…"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                ) : null}
                                <div className="itp-measure-grid">
                                  <label className="itp-field">
                                    <span className="itp-field-label">Measurement (as found)</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.measure1}
                                      onChange={(e) => setFlangeField(fid, 'measure1', e.target.value)}
                                      placeholder="e.g. 0.49 in"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">Minimum allowable</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.measure2}
                                      onChange={(e) => setFlangeField(fid, 'measure2', e.target.value)}
                                      placeholder="e.g. 0.51 in"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                </div>
                                {flangeHint ? <p className="itp-measure-warn">{flangeHint}</p> : null}
                                <label className="itp-field">
                                  <span className="itp-field-label">Measurement notes</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={face.measurementNote}
                                    onChange={(e) => setFlangeField(fid, 'measurementNote', e.target.value)}
                                    placeholder="Method, location, standard…"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Repair action</span>
                                  <select
                                    className="itp-select"
                                    value={face.repairAction}
                                    onChange={(e) => setFlangeRepairAction(fid, e.target.value)}
                                    disabled={saving}
                                  >
                                    {ITP_REPAIR_ACTIONS.map((opt) => (
                                      <option key={opt || 'empty'} value={opt}>
                                        {opt || '— Select —'}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {face.repairAction === ITP_SELECT_OTHER ? (
                                  <label className="itp-field">
                                    <span className="itp-field-label">Repair action (specify)</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.repairActionOther}
                                      onChange={(e) => setFlangeField(fid, 'repairActionOther', e.target.value)}
                                      placeholder="Describe repair action…"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                ) : null}
                                <label className="itp-field">
                                  <span className="itp-field-label">Notes</span>
                                  <textarea
                                    className="itp-notes"
                                    value={face.notes}
                                    onChange={(e) => setFlangeField(fid, 'notes', e.target.value)}
                                    rows={3}
                                    placeholder="Observations for this flange…"
                                    disabled={saving}
                                  />
                                </label>
                              </div>
                            )
                          })}
                        </>
                      ) : (
                        <>
                          <div className="itp-detail-head">
                            <h3 className="itp-detail-title">
                              {activeTab.label} — {selectedItem.label}
                            </h3>
                            {selectedItem.data.condition &&
                            selectedItem.data.condition !== 'Acceptable' &&
                            repairActionLabel(selectedItem.data) ? (
                              <span className="itp-badge-repair">{repairActionLabel(selectedItem.data)}</span>
                            ) : null}
                          </div>

                          {showFacing ? (
                            <>
                              <label className="itp-field">
                                <span className="itp-field-label">Facing type</span>
                                <select
                                  className="itp-select"
                                  value={selectedItem.data.facingType}
                                  onChange={(e) => setRootFacingType(e.target.value)}
                                  disabled={saving}
                                >
                                  {ITP_FACING_TYPES.map((opt) => (
                                    <option key={opt || 'empty'} value={opt}>
                                      {opt || '— Select —'}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {selectedItem.data.facingType === ITP_SELECT_OTHER ? (
                                <label className="itp-field">
                                  <span className="itp-field-label">Facing type (specify)</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.facingTypeOther}
                                    onChange={(e) => setField('facingTypeOther', e.target.value)}
                                    placeholder="Describe facing type…"
                                    disabled={saving}
                                    autoComplete="off"
                                  />
                                </label>
                              ) : null}
                            </>
                          ) : null}

                          <label className="itp-field">
                            <span className="itp-field-label">Condition</span>
                            <select
                              className="itp-select"
                              value={selectedItem.data.condition}
                              onChange={(e) => setRootCondition(e.target.value)}
                              disabled={saving}
                            >
                              {ITP_CONDITIONS.map((opt) => (
                                <option key={opt || 'empty'} value={opt}>
                                  {opt || '— Select —'}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedItem.data.condition === ITP_SELECT_OTHER ? (
                            <label className="itp-field">
                              <span className="itp-field-label">Condition (specify)</span>
                              <input
                                type="text"
                                className="itp-input"
                                value={selectedItem.data.conditionOther}
                                onChange={(e) => setField('conditionOther', e.target.value)}
                                placeholder="Describe condition…"
                                disabled={saving}
                                autoComplete="off"
                              />
                            </label>
                          ) : null}

                          {showFacing ? <ItpFlangeDimensionsDiagram /> : null}

                          <div className="itp-measure-grid">
                            <label className="itp-field">
                              <span className="itp-field-label">Measurement (as found)</span>
                              <input
                                type="text"
                                className="itp-input"
                                value={selectedItem.data.measure1}
                                onChange={(e) => setField('measure1', e.target.value)}
                                placeholder="e.g. 0.49 in"
                                disabled={saving}
                                autoComplete="off"
                              />
                            </label>
                            <label className="itp-field">
                              <span className="itp-field-label">Minimum allowable</span>
                              <input
                                type="text"
                                className="itp-input"
                                value={selectedItem.data.measure2}
                                onChange={(e) => setField('measure2', e.target.value)}
                                placeholder="e.g. 0.51 in"
                                disabled={saving}
                                autoComplete="off"
                              />
                            </label>
                          </div>
                          {measureHint ? <p className="itp-measure-warn">{measureHint}</p> : null}

                          <label className="itp-field">
                            <span className="itp-field-label">Measurement notes</span>
                            <input
                              type="text"
                              className="itp-input"
                              value={selectedItem.data.measurementNote}
                              onChange={(e) => setField('measurementNote', e.target.value)}
                              placeholder="Method, location, standard…"
                              disabled={saving}
                            />
                          </label>

                          <label className="itp-field">
                            <span className="itp-field-label">Repair action</span>
                            <select
                              className="itp-select"
                              value={selectedItem.data.repairAction}
                              onChange={(e) => setRootRepairAction(e.target.value)}
                              disabled={saving}
                            >
                              {ITP_REPAIR_ACTIONS.map((opt) => (
                                <option key={opt || 'empty'} value={opt}>
                                  {opt || '— Select —'}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedItem.data.repairAction === ITP_SELECT_OTHER ? (
                            <label className="itp-field">
                              <span className="itp-field-label">Repair action (specify)</span>
                              <input
                                type="text"
                                className="itp-input"
                                value={selectedItem.data.repairActionOther}
                                onChange={(e) => setField('repairActionOther', e.target.value)}
                                placeholder="Describe repair action…"
                                disabled={saving}
                                autoComplete="off"
                              />
                            </label>
                          ) : null}

                          <label className="itp-field">
                            <span className="itp-field-label">Notes</span>
                            <textarea
                              className="itp-notes"
                              value={selectedItem.data.notes}
                              onChange={(e) => setField('notes', e.target.value)}
                              rows={4}
                              placeholder="Observations, hold points, sign-off reminders…"
                              disabled={saving}
                            />
                          </label>
                        </>
                      )
                    ) : (
                      <p className="itp-detail-empty">Select an area from the list.</p>
                    )}
                  </div>
                </div>
              ) : null}

            <div ref={generalNotesRef} className="itp-general-notes-anchor">
              <label className="itp-field itp-general-notes">
                <span className="itp-field-label">General notes / issue summary</span>
                <textarea
                  className="itp-notes itp-notes-general"
                  value={payload.generalNotes}
                  onChange={(e) => setPayload((p) => ({ ...p, generalNotes: e.target.value }))}
                  rows={3}
                  placeholder="Overall findings, traveler notes, submit checklist…"
                  disabled={saving}
                />
              </label>
            </div>
            </div>

            <div className={`itp-sheet-footer${isTwinsealUi ? ' itp-sheet-footer--twinseal' : ''}`}>
              {isTwinsealUi ? (
                <>
                  <div className="itp-footer-actions itp-footer-actions--twinseal">
                    <button type="button" className="itp-btn-back-outline" onClick={onClose} disabled={saving}>
                      ← Back
                    </button>
                    <button type="button" className="button-itp-soft" onClick={scrollToReviewIssues} disabled={saving}>
                      Review issues
                    </button>
                    <button
                      type="button"
                      className="button-primary itp-btn-continue"
                      onClick={() => void persist('Inspection & Test Plan saved')}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Continue'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="itp-ts-submit-link"
                    onClick={() => void persist('ITP submitted for this job')}
                    disabled={saving}
                  >
                    Submit ITP for shop floor
                  </button>
                </>
              ) : (
                <>
                  <div className="itp-footer-summary">
                    Linked to job <strong>{valve.valve_id}</strong>. Save often; Submit ITP when the plan is ready for the
                    floor.
                  </div>
                  <div className="itp-footer-actions">
                    <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
                      Done
                    </button>
                    <button
                      type="button"
                      className="button-itp-soft"
                      onClick={() => void persist('Inspection & Test Plan saved')}
                      disabled={saving}
                    >
                      {saving ? 'Saving…' : 'Save ITP'}
                    </button>
                    <button
                      type="button"
                      className="button-itp-submit"
                      onClick={() => void persist('ITP submitted for this job')}
                      disabled={saving}
                    >
                      Submit ITP
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
