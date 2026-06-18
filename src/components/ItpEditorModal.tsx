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
import {
  normalizeNps,
  normalizePressureClass,
  parseMeasurementNumber,
  type FlangeThicknessReferenceRow,
} from '../lib/flangeThicknessRefs'
import { findB1610FaceToFaceStandard, type B1610FaceToFaceReferenceRow } from '../lib/b1610FaceToFace'
import { findB1634WallThicknessStandard, type B1634WallThicknessReferenceRow } from '../lib/b1634WallThickness'

const ITP_SELECT_OTHER = 'Other'
const ITP_FACING_BUTT_WELD = 'Butt Weld'

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
  const a = parseMeasurementNumber(measure1)
  const b = parseMeasurementNumber(measure2)
  if (a == null || b == null) return null
  if (a < b) return 'Below acceptable limit'
  return null
}

function toleranceText(beforeMachining: string, afterMachining: string): string {
  const before = parseMeasurementNumber(beforeMachining)
  const after = parseMeasurementNumber(afterMachining)
  if (before == null || after == null) return ''
  const delta = before - after
  return `${delta.toFixed(3)}`
}

function toleranceVsMinimumSummary(
  measured: string,
  minimumAllowable: string,
  label: string,
): { tone: 'ok' | 'bad'; text: string } | null {
  const m = parseMeasurementNumber(measured)
  const min = parseMeasurementNumber(minimumAllowable)
  if (m == null || min == null) return null
  const delta = m - min
  const pass = delta >= 0
  const signed = `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`
  return {
    tone: pass ? 'ok' : 'bad',
    text: `${label}: ${pass ? 'PASS' : 'OUT OF TOLERANCE'} (${signed} vs minimum)`,
  }
}

function toleranceState(
  measured: string,
  minimumAllowable: string,
): { tone: 'ok' | 'bad' | null; delta: number | null } {
  const m = parseMeasurementNumber(measured)
  const min = parseMeasurementNumber(minimumAllowable)
  if (m == null || min == null) return { tone: null, delta: null }
  const delta = m - min
  return { tone: delta >= 0 ? 'ok' : 'bad', delta }
}

function maxRemovableText(measured: string, minimumAllowable: string): string {
  const m = parseMeasurementNumber(measured)
  const min = parseMeasurementNumber(minimumAllowable)
  if (m == null || min == null) return ''
  const removable = m - min
  if (removable >= 0) return removable.toFixed(3)
  return `0.000 (below min by ${Math.abs(removable).toFixed(3)})`
}

function referenceThicknessFeedback(asFound: string, afterMachining: string, minThickness: number): string[] {
  const notes: string[] = []
  const asFoundNum = parseMeasurementNumber(asFound)
  const afterMachNum = parseMeasurementNumber(afterMachining)
  if (asFoundNum != null) {
    const removable = asFoundNum - minThickness
    if (removable >= 0) {
      notes.push(`B16.5 check: thick enough. Max removable ≈ ${removable.toFixed(3)}`)
    } else {
      notes.push(`B16.5 check: too thin by ≈ ${Math.abs(removable).toFixed(3)}`)
    }
  }
  if (afterMachNum != null && afterMachNum < minThickness) {
    notes.push(`After machining is below minimum by ≈ ${(minThickness - afterMachNum).toFixed(3)}`)
  }
  return notes
}

function b1610ValidationState(
  asFound: string,
  standard: number,
  tolerance: number,
): { tone: 'ok' | 'bad' | null; delta: number | null } {
  const measured = parseMeasurementNumber(asFound)
  if (measured == null) return { tone: null, delta: null }
  const delta = measured - standard
  return { tone: Math.abs(delta) <= tolerance ? 'ok' : 'bad', delta }
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

function displayItpItemLabel(tabId: string, label: string): string {
  const clean = (label ?? '').trim()
  if (tabId === 'body' && /^(body|body\s*bore)$/i.test(clean)) return 'Wall Thickness'
  if (tabId === 'body' && /(threads?\s*\/?\s*tapped|threaded\s*holes?|port openings?|bored?\s*holes?)/i.test(clean))
    return 'Threaded Holes'
  return clean
}

function isThreadedHolesItem(tabId: string, label: string): boolean {
  return /threaded holes/i.test(displayItpItemLabel(tabId, label))
}

function isSeatSectionLabel(label: string): boolean {
  return /seat|lapping/i.test(label) && !/flanges/i.test(label)
}

function isStemSectionLabel(label: string): boolean {
  return /stem/i.test(label)
}

function isSpringSetSectionLabel(label: string): boolean {
  return /set pressure|spring|blowdown/i.test(label)
}

function isActuatorSectionLabel(label: string): boolean {
  return /stroke|travel|mounting/i.test(label)
}

function isDiscWedgeSectionLabel(label: string): boolean {
  return /disc|wedge|clapper|plug od|ball condition/i.test(label)
}

function conditionNeedsRepair(condition: string): boolean {
  const c = (condition ?? '').trim().toLowerCase()
  return c === 'not acceptable' || c === 'weld and repair'
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
  const [isMaximized, setIsMaximized] = useState(true)
  const [flangeRef, setFlangeRef] = useState<FlangeThicknessReferenceRow | null>(null)
  const [flangeRefLoading, setFlangeRefLoading] = useState(false)
  const [b1610Refs, setB1610Refs] = useState<B1610FaceToFaceReferenceRow[]>([])
  const [b1610Loading, setB1610Loading] = useState(false)
  const [b1634Refs, setB1634Refs] = useState<B1634WallThicknessReferenceRow[]>([])
  const [b1634Loading, setB1634Loading] = useState(false)
  const [attachmentCount, setAttachmentCount] = useState(0)

  useEffect(() => {
    setIsMaximized(true)
  }, [valve.id])

  useEffect(() => {
    setSessionTechName(window.localStorage.getItem(AUTH_USER_STORAGE_KEY)?.trim() ?? '')
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { count, error } = await supabase
        .from('valve_attachments')
        .select('id', { count: 'exact', head: true })
        .eq('valve_row_id', valve.id)
      if (cancelled) return
      if (error) {
        setAttachmentCount(0)
        return
      }
      setAttachmentCount(count ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [valve.id])

  useEffect(() => {
    const nps = normalizeNps(valve.size)
    const pressureClass = normalizePressureClass(valve.pressure_class)
    if (!nps || !pressureClass) {
      setFlangeRef(null)
      return
    }
    let cancelled = false
    setFlangeRefLoading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('flange_thickness_refs')
        .select('id,nps,pressure_class,min_thickness,notes,source,created_at,updated_at')
        .eq('nps', nps)
        .eq('pressure_class', pressureClass)
        .maybeSingle()
      if (cancelled) return
      setFlangeRefLoading(false)
      if (error) {
        setFlangeRef(null)
        return
      }
      setFlangeRef((data ?? null) as FlangeThicknessReferenceRow | null)
    })()
    return () => {
      cancelled = true
    }
  }, [valve.size, valve.pressure_class])

  useEffect(() => {
    let cancelled = false
    setB1610Loading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('b1610_face_to_face_refs')
        .select(
          'id,valve_type,nps,pressure_class,end_connection,standard_dimension,tolerance,notes,source,created_at,updated_at',
        )
      if (cancelled) return
      setB1610Loading(false)
      if (error) {
        setB1610Refs([])
        return
      }
      setB1610Refs((data ?? []) as B1610FaceToFaceReferenceRow[])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setB1634Loading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('b1634_wall_thickness_refs')
        .select('id,valve_type,nps,pressure_class,min_wall_thickness,notes,source,created_at,updated_at')
      if (cancelled) return
      setB1634Loading(false)
      if (error) {
        setB1634Refs([])
        return
      }
      setB1634Refs((data ?? []) as B1634WallThicknessReferenceRow[])
    })()
    return () => {
      cancelled = true
    }
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
      if (value !== ITP_FACING_BUTT_WELD) {
        n = updateTwinsealFlangeField(n, activeTab.id, selectedItemId, face, 'buttWeldSchedule', '')
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
      if (value !== ITP_FACING_BUTT_WELD) {
        n = updateItemField(n, activeTab.id, selectedItemId, 'buttWeldSchedule', '')
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
    const repairedThreadedHoles = payload.tabs.some((tab) =>
      tab.items.some((item) => isThreadedHolesItem(tab.id, item.label) && conditionNeedsRepair(item.data.condition)),
    )
    if (repairedThreadedHoles && attachmentCount <= 0) {
      showToast('Threaded holes marked for repair require at least one photo attachment before saving.')
      return
    }

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

  const showFacing = selectedItem?.label.toLowerCase() === 'flanges'
  const selectedDisplayLabel = selectedItem ? displayItpItemLabel(activeTab?.id ?? '', selectedItem.label) : ''
  const isWallThicknessSection = /wall thickness/i.test(selectedDisplayLabel)
  const isThreadedHolesSection = /threaded holes/i.test(selectedDisplayLabel)
  const isSeatSection = !showFacing && isSeatSectionLabel(selectedDisplayLabel)
  const isStemSection = isStemSectionLabel(selectedDisplayLabel)
  const isSpringSetSection = isSpringSetSectionLabel(selectedDisplayLabel)
  const isActuatorSection = isActuatorSectionLabel(selectedDisplayLabel)
  const isDiscWedgeSection = isDiscWedgeSectionLabel(selectedDisplayLabel)
  const b1634Ref =
    isWallThicknessSection && selectedItem
      ? findB1634WallThicknessStandard(
          {
            valveType: valve.valve_type,
            size: valve.size,
            pressureClass: valve.pressure_class,
          },
          b1634Refs,
        )
      : null
  const rootMinimum = selectedItem
    ? (selectedItem.data.measure2 || (b1634Ref ? String(b1634Ref.minimum) : '')).trim()
    : ''
  const rootAsFoundState = selectedItem
    ? toleranceState(selectedItem.data.measure1, rootMinimum)
    : { tone: null as 'ok' | 'bad' | null, delta: null as number | null }
  const rootAsFoundTol = selectedItem
    ? toleranceVsMinimumSummary(selectedItem.data.measure1, rootMinimum, 'As found tolerance')
    : null
  const measureHint = selectedItem && measurementWarning(selectedItem.data.measure1, rootMinimum)
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
                <h2 id="itp-modal-title" className="itp-ts-title">
                  Job #{valve.valve_id} · {valve.valve_type?.trim() || 'Twinseal'}
                </h2>
              </div>
              <div className="itp-ts-header-aside">
                <div className="itp-ts-aside-sub">
                  {valve.customer?.trim() ? <span>{valve.customer.trim()}</span> : null}
                  {valve.size?.trim() ? <span>Size: {valve.size.trim()}</span> : null}
                  {valve.cell?.trim() ? <span>Cell: {valve.cell.trim()}</span> : null}
                  {sessionTechName ? (
                    <>
                      <span className="itp-ts-tech-pill">Tech: {sessionTechName}</span>
                    </>
                  ) : null}
                </div>
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
                <h2 id="itp-modal-title" className="itp-surface-job">
                  Job #{valve.valve_id} · {valve.valve_type?.trim() || '—'}
                </h2>
                <div className="itp-surface-meta-row" aria-label="Valve type, size, and description">
                  {valve.size?.trim() ? <span>Size: {valve.size.trim()}</span> : null}
                  {valve.customer?.trim() ? <span>{valve.customer.trim()}</span> : null}
                  {valve.cell?.trim() ? <span>Cell: {valve.cell.trim()}</span> : null}
                </div>
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
                              <span className="itp-overview-row-label">{displayItpItemLabel(tab.id, item.label)}</span>
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
                        <span className="itp-item-row-label">{displayItpItemLabel(activeTab.id, item.label)}</span>
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
                              {activeTab.label} — {displayItpItemLabel(activeTab.id, selectedItem.label)}
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
                          <p className="itp-critical-dimensions-ref-note">
                            {flangeRefLoading
                              ? 'Loading B16.5 minimum thickness reference…'
                              : flangeRef
                                ? `B16.5 reference for ${valve.size ?? '-'} / Class ${valve.pressure_class ?? '-'}: minimum thickness ${flangeRef.min_thickness}`
                                : 'No B16.5 reference found for this size/class yet. Add it in Manage lists → Flange Thickness.'}
                          </p>

                          {visibleFlangeIds(normalizedPortConfig(selectedItem.data.valvePortConfig)).map((fid) => {
                            const face = getFlangeFaceState(selectedItem.data, fid)
                            const effectiveMinimum = (face.measure2 || (flangeRef ? String(flangeRef.min_thickness) : '')).trim()
                            const flangeHint = measurementWarning(face.measure1, face.measure2)
                            const asFoundState = toleranceState(face.measure1, effectiveMinimum)
                            const afterMachState = toleranceState(face.measureAfterMachining, effectiveMinimum)
                            const asFoundTol = toleranceVsMinimumSummary(
                              face.measure1,
                              effectiveMinimum,
                              'As found tolerance',
                            )
                            const afterMachTol = toleranceVsMinimumSummary(
                              face.measureAfterMachining,
                              effectiveMinimum,
                              'After machining tolerance',
                            )
                            const refNotes = flangeRef
                              ? referenceThicknessFeedback(face.measure1, face.measureAfterMachining, flangeRef.min_thickness)
                              : []
                            const flangeTitle =
                              fid === 'A' ? '1. Flange A' : fid === 'B' ? '2. Flange B' : `Flange ${fid}`
                            return (
                              <section key={fid} className="itp-flange-section">
                                <h4 className="itp-flange-section-title">{flangeTitle}</h4>
                                <label className="itp-field">
                                  <span className="itp-field-label">1. Facing type</span>
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
                                    <span className="itp-field-label">1a. Facing type (specify)</span>
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
                                {face.facingType === ITP_FACING_BUTT_WELD ? (
                                  <label className="itp-field">
                                    <span className="itp-field-label">1b. Schedule</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.buttWeldSchedule}
                                      onChange={(e) => setFlangeField(fid, 'buttWeldSchedule', e.target.value)}
                                      placeholder="e.g. Sch 40 / Sch 80"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                ) : null}
                                <label className="itp-field">
                                  <span className="itp-field-label">2. Condition</span>
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
                                    <span className="itp-field-label">2a. Condition (specify)</span>
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
                                <div className="itp-measure-grid itp-measure-grid--single">
                                  <label className="itp-field">
                                    <span className="itp-field-label">3. Measurement (as found)</span>
                                    <input
                                      type="text"
                                      className={`itp-input${asFoundState.tone === 'ok' ? ' itp-input-ok' : asFoundState.tone === 'bad' ? ' itp-input-bad' : ''}`}
                                      value={face.measure1}
                                      onChange={(e) => setFlangeField(fid, 'measure1', e.target.value)}
                                      placeholder="e.g. 0.49 in"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">4. Minimum allowable</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={face.measure2}
                                      onChange={(e) => setFlangeField(fid, 'measure2', e.target.value)}
                                      placeholder={flangeRef ? `B16.5 min ${flangeRef.min_thickness}` : 'e.g. 0.51 in'}
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                    {effectiveMinimum ? (
                                      <p className="itp-tolerance-note-inline">
                                        Min thickness: {effectiveMinimum}
                                        {asFoundState.delta != null ? ` | As-found tolerance: ${asFoundState.delta >= 0 ? '+' : ''}${asFoundState.delta.toFixed(3)}` : ''}
                                        {afterMachState.delta != null ? ` | After-machining tolerance: ${afterMachState.delta >= 0 ? '+' : ''}${afterMachState.delta.toFixed(3)}` : ''}
                                      </p>
                                    ) : null}
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">5. After machining</span>
                                    <input
                                      type="text"
                                      className={`itp-input${afterMachState.tone === 'ok' ? ' itp-input-ok' : afterMachState.tone === 'bad' ? ' itp-input-bad' : ''}`}
                                      value={face.measureAfterMachining}
                                      onChange={(e) => setFlangeField(fid, 'measureAfterMachining', e.target.value)}
                                      placeholder="e.g. 0.52 in"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">6. Max removable to minimum</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={maxRemovableText(face.measure1, effectiveMinimum)}
                                      placeholder="Auto-calculated from as-found and minimum"
                                      disabled
                                      readOnly
                                    />
                                  </label>
                                </div>
                                {flangeHint ? <p className="itp-measure-warn">{flangeHint}</p> : null}
                                {asFoundTol ? (
                                  <p className={`itp-tolerance-chip ${asFoundTol.tone === 'ok' ? 'ok' : 'bad'}`}>
                                    {asFoundTol.text}
                                  </p>
                                ) : null}
                                {afterMachTol ? (
                                  <p className={`itp-tolerance-chip ${afterMachTol.tone === 'ok' ? 'ok' : 'bad'}`}>
                                    {afterMachTol.text}
                                  </p>
                                ) : null}
                                {refNotes.map((note) => (
                                  <p key={`${fid}-${note}`} className="itp-measure-ref-note">{note}</p>
                                ))}
                                <label className="itp-field">
                                  <span className="itp-field-label">7. Measurement notes</span>
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
                                  <span className="itp-field-label">8. Repair action</span>
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
                                    <span className="itp-field-label">8a. Repair action (specify)</span>
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
                                  <span className="itp-field-label">9. Notes</span>
                                  <textarea
                                    className="itp-notes"
                                    value={face.notes}
                                    onChange={(e) => setFlangeField(fid, 'notes', e.target.value)}
                                    rows={3}
                                    placeholder="Observations for this flange…"
                                    disabled={saving}
                                  />
                                </label>
                              </section>
                            )
                          })}

                          <section className="itp-measure-section">
                            <h4 className="itp-measure-section-title">3. Face-to-Face Validation</h4>
                            {(() => {
                              const b1610Ref = findB1610FaceToFaceStandard(
                                {
                                  valveType: valve.valve_type,
                                  size: valve.size,
                                  pressureClass: valve.pressure_class,
                                  facingType: selectedItem.data.facingType,
                                },
                                b1610Refs,
                              )
                              const faceToFaceState: { tone: 'ok' | 'bad' | null; delta: number | null } = b1610Ref
                                ? b1610ValidationState(
                                    selectedItem.data.faceToFaceMeasurement,
                                    b1610Ref.standard,
                                    b1610Ref.tolerance,
                                  )
                                : { tone: null, delta: null }
                              return (
                                <>
                                  <label className="itp-field">
                                    <span className="itp-field-label">1. Overall Face-to-Face (As Found)</span>
                                    <input
                                      type="text"
                                      className={`itp-input${faceToFaceState.tone === 'ok' ? ' itp-input-ok' : faceToFaceState.tone === 'bad' ? ' itp-input-bad' : ''}`}
                                      value={selectedItem.data.faceToFaceMeasurement}
                                      onChange={(e) => setField('faceToFaceMeasurement', e.target.value)}
                                      placeholder='e.g. 12.75 in'
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">2. B16.10 Standard Dimension</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={b1610Ref ? `${b1610Ref.standard.toFixed(3)} in` : ''}
                                      placeholder={
                                        b1610Loading
                                          ? 'Loading B16.10 reference...'
                                          : 'No B16.10 reference for this size / class / type'
                                      }
                                      disabled
                                      readOnly
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">3. Deviation (As Found - Standard)</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={
                                        b1610Ref && faceToFaceState.delta != null
                                          ? `${faceToFaceState.delta >= 0 ? '+' : ''}${faceToFaceState.delta.toFixed(3)} in`
                                          : ''
                                      }
                                      placeholder="Auto-calculated"
                                      disabled
                                      readOnly
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">4. B16.10 Tolerance</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={b1610Ref ? `±${b1610Ref.tolerance.toFixed(4)} in` : ''}
                                      placeholder="Auto-calculated"
                                      disabled
                                      readOnly
                                    />
                                  </label>
                                  {b1610Ref && faceToFaceState.delta != null ? (
                                    <p className={`itp-tolerance-chip ${faceToFaceState.tone === 'ok' ? 'ok' : 'bad'}`}>
                                      B16.10 face-to-face check: {faceToFaceState.tone === 'ok' ? 'PASS' : 'FAIL'} (
                                      {faceToFaceState.delta >= 0 ? '+' : ''}
                                      {faceToFaceState.delta.toFixed(3)} vs standard, tol ±
                                      {b1610Ref.tolerance.toFixed(4)})
                                    </p>
                                  ) : null}
                                  {b1610Ref && faceToFaceState.tone === 'bad' ? (
                                    <p className="itp-measure-warn">
                                      Dimension exceeds B16.10 standard. Verify for body stretching or excessive previous
                                      machining.
                                    </p>
                                  ) : null}
                                  <label className="itp-field">
                                    <span className="itp-field-label">5. End to End (After Machining)</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={selectedItem.data.faceToFaceAfterMachining}
                                      onChange={(e) => setField('faceToFaceAfterMachining', e.target.value)}
                                      placeholder="e.g. 12.78 in"
                                      disabled={saving}
                                      autoComplete="off"
                                    />
                                  </label>
                                  <label className="itp-field">
                                    <span className="itp-field-label">6. End to End Tolerance</span>
                                    <input
                                      type="text"
                                      className="itp-input"
                                      value={toleranceText(
                                        selectedItem.data.faceToFaceMeasurement,
                                        selectedItem.data.faceToFaceAfterMachining,
                                      )}
                                      placeholder="Auto-calculated from before and after"
                                      disabled
                                      readOnly
                                    />
                                  </label>
                                </>
                              )
                            })()}
                          </section>
                        </>
                      ) : (
                        <>
                          <div className="itp-detail-head">
                            <h3 className="itp-detail-title">
                              {activeTab.label} — {displayItpItemLabel(activeTab.id, selectedItem.label)}
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
                              {selectedItem.data.facingType === ITP_FACING_BUTT_WELD ? (
                                <label className="itp-field">
                                  <span className="itp-field-label">Schedule</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.buttWeldSchedule}
                                    onChange={(e) => setField('buttWeldSchedule', e.target.value)}
                                    placeholder="e.g. Sch 40 / Sch 80"
                                    disabled={saving}
                                    autoComplete="off"
                                  />
                                </label>
                              ) : null}
                            </>
                          ) : null}

                          {!isSpringSetSection ? (
                            <>
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
                            </>
                          ) : null}
                          {isThreadedHolesSection ? (
                            <label className="itp-field">
                              <span className="itp-field-label">NPT threaded holes inspected</span>
                              <select
                                className="itp-select"
                                value={selectedItem.data.nptThreadInspection}
                                onChange={(e) => setField('nptThreadInspection', e.target.value)}
                                disabled={saving}
                              >
                                <option value="">— Select —</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                                <option value="N/A">N/A</option>
                              </select>
                            </label>
                          ) : null}

                          {showFacing ? <ItpFlangeDimensionsDiagram /> : null}
                          {isWallThicknessSection ? (
                            <p className="itp-critical-dimensions-ref-note">
                              {b1634Loading
                                ? 'Loading B16.34 minimum wall-thickness reference…'
                                : b1634Ref
                                  ? `B16.34 reference for ${valve.valve_type ?? '-'} / ${valve.size ?? '-'} / Class ${valve.pressure_class ?? '-'}: minimum wall ${b1634Ref.minimum}`
                                  : 'No B16.34 reference found for this valve type / size / class yet. Add it in Manage lists → B16.34 Wall.'}
                            </p>
                          ) : null}

                          {isSeatSection ? (
                            <>
                              <div className="itp-measure-grid">
                                <label className="itp-field">
                                  <span className="itp-field-label">Seat Lap Result</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.seatLapResult}
                                    onChange={(e) => setField('seatLapResult', e.target.value)}
                                    placeholder="Pass/fail or measured value"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Measurement (as found)</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.measure1}
                                    onChange={(e) => setField('measure1', e.target.value)}
                                    placeholder="e.g. 0.49 in"
                                    disabled={saving}
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
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">After machining</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.measureAfterMachining}
                                    onChange={(e) => setField('measureAfterMachining', e.target.value)}
                                    placeholder="e.g. 0.50 in"
                                    disabled={saving}
                                  />
                                </label>
                              </div>
                              <label className="itp-field">
                                <span className="itp-field-label">Notes</span>
                                <textarea
                                  className="itp-notes"
                                  value={selectedItem.data.notes}
                                  onChange={(e) => setField('notes', e.target.value)}
                                  rows={4}
                                  placeholder="Seat and lapping observations…"
                                  disabled={saving}
                                />
                              </label>
                            </>
                          ) : null}

                          {isStemSection ? (
                            <>
                              <div className="itp-measure-grid">
                                <label className="itp-field">
                                  <span className="itp-field-label">Stem Diameter (as found)</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.stemDiameter}
                                    onChange={(e) => setField('stemDiameter', e.target.value)}
                                    placeholder="e.g. 1.250 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Minimum Allowable Diameter</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.stemDiameterMin}
                                    onChange={(e) => setField('stemDiameterMin', e.target.value)}
                                    placeholder="e.g. 1.240 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Runout Measurement</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.stemRunout}
                                    onChange={(e) => setField('stemRunout', e.target.value)}
                                    placeholder="e.g. 0.003 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Packing Condition</span>
                                  <select
                                    className="itp-select"
                                    value={selectedItem.data.packingCondition}
                                    onChange={(e) => setField('packingCondition', e.target.value)}
                                    disabled={saving}
                                  >
                                    <option value="">— Select —</option>
                                    {ITP_CONDITIONS.filter(Boolean).map((opt) => (
                                      <option key={`packing-${opt}`} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <label className="itp-field">
                                <span className="itp-field-label">Notes</span>
                                <textarea
                                  className="itp-notes"
                                  value={selectedItem.data.notes}
                                  onChange={(e) => setField('notes', e.target.value)}
                                  rows={4}
                                  placeholder="Stem and packing observations…"
                                  disabled={saving}
                                />
                              </label>
                            </>
                          ) : null}

                          {isSpringSetSection ? (
                            <>
                              <div className="itp-measure-grid">
                                <label className="itp-field">
                                  <span className="itp-field-label">Set Pressure As-Found</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.springSetPressure}
                                    onChange={(e) => setField('springSetPressure', e.target.value)}
                                    placeholder="e.g. 150 psi"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Set Pressure Spec</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.springSetPressureSpec}
                                    onChange={(e) => setField('springSetPressureSpec', e.target.value)}
                                    placeholder="e.g. 155 psi"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Blowdown</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.blowdownPressure}
                                    onChange={(e) => setField('blowdownPressure', e.target.value)}
                                    placeholder="e.g. 8 psi"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Leak Test Result</span>
                                  <select
                                    className="itp-select"
                                    value={selectedItem.data.sealTestResult}
                                    onChange={(e) => setField('sealTestResult', e.target.value)}
                                    disabled={saving}
                                  >
                                    <option value="">— Select —</option>
                                    <option value="Pass">Pass</option>
                                    <option value="Fail">Fail</option>
                                  </select>
                                </label>
                              </div>
                              <label className="itp-field">
                                <span className="itp-field-label">Notes</span>
                                <textarea
                                  className="itp-notes"
                                  value={selectedItem.data.notes}
                                  onChange={(e) => setField('notes', e.target.value)}
                                  rows={4}
                                  placeholder="Set pressure and leak-test observations…"
                                  disabled={saving}
                                />
                              </label>
                            </>
                          ) : null}

                          {isActuatorSection ? (
                            <>
                              <div className="itp-measure-grid">
                                <label className="itp-field">
                                  <span className="itp-field-label">Stroke Measured</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.actuatorStrokeMeasured}
                                    onChange={(e) => setField('actuatorStrokeMeasured', e.target.value)}
                                    placeholder="e.g. 3.50 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Stroke Spec</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.actuatorStrokeSpec}
                                    onChange={(e) => setField('actuatorStrokeSpec', e.target.value)}
                                    placeholder="e.g. 3.50 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Torque Measured</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.torqueMeasured}
                                    onChange={(e) => setField('torqueMeasured', e.target.value)}
                                    placeholder="e.g. 220 ft-lb"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Torque Spec</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.torqueSpec}
                                    onChange={(e) => setField('torqueSpec', e.target.value)}
                                    placeholder="e.g. 200-250 ft-lb"
                                    disabled={saving}
                                  />
                                </label>
                              </div>
                              <label className="itp-field">
                                <span className="itp-field-label">Notes</span>
                                <textarea
                                  className="itp-notes"
                                  value={selectedItem.data.notes}
                                  onChange={(e) => setField('notes', e.target.value)}
                                  rows={4}
                                  placeholder="Actuator, stroke, and torque observations…"
                                  disabled={saving}
                                />
                              </label>
                            </>
                          ) : null}

                          {isDiscWedgeSection ? (
                            <>
                              <div className="itp-measure-grid">
                                <label className="itp-field">
                                  <span className="itp-field-label">Disc/Wedge Thickness</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.discWedgeThickness}
                                    onChange={(e) => setField('discWedgeThickness', e.target.value)}
                                    placeholder="e.g. 0.780 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">Minimum Allowable</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.discWedgeThicknessMin}
                                    onChange={(e) => setField('discWedgeThicknessMin', e.target.value)}
                                    placeholder="e.g. 0.760 in"
                                    disabled={saving}
                                  />
                                </label>
                                <label className="itp-field">
                                  <span className="itp-field-label">After Refacing Measurement</span>
                                  <input
                                    type="text"
                                    className="itp-input"
                                    value={selectedItem.data.measureAfterMachining}
                                    onChange={(e) => setField('measureAfterMachining', e.target.value)}
                                    placeholder="e.g. 0.770 in"
                                    disabled={saving}
                                  />
                                </label>
                              </div>
                              <label className="itp-field">
                                <span className="itp-field-label">Notes</span>
                                <textarea
                                  className="itp-notes"
                                  value={selectedItem.data.notes}
                                  onChange={(e) => setField('notes', e.target.value)}
                                  rows={4}
                                  placeholder="Disc/wedge refacing observations…"
                                  disabled={saving}
                                />
                              </label>
                            </>
                          ) : null}

                          <div className="itp-measure-grid">
                            <label className="itp-field">
                              <span className="itp-field-label">Measurement (as found)</span>
                              <input
                                type="text"
                                className={`itp-input${rootAsFoundState.tone === 'ok' ? ' itp-input-ok' : rootAsFoundState.tone === 'bad' ? ' itp-input-bad' : ''}`}
                                value={selectedItem.data.measure1}
                                onChange={(e) => setField('measure1', e.target.value)}
                                placeholder="e.g. 0.49 in"
                                disabled={saving}
                                autoComplete="off"
                              />
                            </label>
                            <label className="itp-field">
                              <span className="itp-field-label">
                                {isThreadedHolesSection ? 'Minimum thread wall' : 'Minimum allowable'}
                              </span>
                              <input
                                type="text"
                                className="itp-input"
                                value={selectedItem.data.measure2}
                                onChange={(e) => setField('measure2', e.target.value)}
                                placeholder={isWallThicknessSection && b1634Ref ? `B16.34 min ${b1634Ref.minimum}` : 'e.g. 0.51 in'}
                                disabled={saving}
                                autoComplete="off"
                              />
                              {rootMinimum ? (
                                <p className="itp-tolerance-note-inline">
                                  {isThreadedHolesSection ? 'Min thread wall' : 'Min thickness'}:{' '}
                                  {rootMinimum}
                                  {rootAsFoundState.delta != null
                                    ? ` | As-found tolerance: ${rootAsFoundState.delta >= 0 ? '+' : ''}${rootAsFoundState.delta.toFixed(3)}`
                                    : ''}
                                </p>
                              ) : null}
                            </label>
                            <label className="itp-field">
                              <span className="itp-field-label">Max removable to minimum</span>
                              <input
                                type="text"
                                className="itp-input"
                                value={maxRemovableText(selectedItem.data.measure1, rootMinimum)}
                                placeholder="Auto-calculated from as-found and minimum"
                                disabled
                                readOnly
                              />
                            </label>
                          </div>
                          {measureHint ? <p className="itp-measure-warn">{measureHint}</p> : null}
                          {rootAsFoundTol ? (
                            <p className={`itp-tolerance-chip ${rootAsFoundTol.tone === 'ok' ? 'ok' : 'bad'}`}>
                              {isThreadedHolesSection
                                ? rootAsFoundTol.text
                                    .replace('As found tolerance', 'Thread wall tolerance')
                                    .replace('vs minimum', 'vs minimum thread wall')
                                : rootAsFoundTol.text}
                            </p>
                          ) : null}
                          {rootAsFoundState.delta != null ? (
                            <p className="itp-measure-ref-note">
                              {rootAsFoundState.delta >= 0
                                ? `${
                                    isThreadedHolesSection ? 'Thread wall check' : 'Thickness check'
                                  }: acceptable by ${rootAsFoundState.delta.toFixed(3)}. Max removable ≈ ${rootAsFoundState.delta.toFixed(3)}`
                                : `${
                                    isThreadedHolesSection ? 'Thread wall check' : 'Thickness check'
                                  }: too thin by ${Math.abs(rootAsFoundState.delta).toFixed(3)}`}
                            </p>
                          ) : null}
                          {isThreadedHolesSection && conditionNeedsRepair(selectedItem.data.condition) ? (
                            <p className={`itp-tolerance-chip ${attachmentCount > 0 ? 'ok' : 'bad'}`}>
                              Repair photo requirement: {attachmentCount > 0 ? 'PASS' : 'FAIL'} (
                              {attachmentCount > 0
                                ? `${attachmentCount} photo${attachmentCount === 1 ? '' : 's'} attached`
                                : 'attach at least 1 photo before save/submit'}
                              )
                            </p>
                          ) : null}

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
