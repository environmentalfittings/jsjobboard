import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FinishCellBadge } from '../components/FinishCellBadge'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { finishCellTone } from '../constants/finishCellColors'
import { fetchAllValves } from '../lib/fetchAllValves'
import { displayJobStatus, isActiveShopWork } from '../lib/jobDisplayStatus'
import { localTodayBounds } from '../lib/managerDashboardMetrics'
import {
  compareValvesWithPriorityOrder,
  isEligiblePriorityValve,
  persistPriorityQueueOrder,
  reorderPriorityQueueIds,
  syncPriorityQueueWithValves,
} from '../lib/priorityQueue'
import { canWriteShop } from '../lib/roles'
import {
  buildShopTvColumns,
  countMovedOutToday,
  parseShopTvStatusMoves,
  valveMatchesTvColumn,
  type ShopTvDeptMoveRow,
  type ShopTvStatusMove,
} from '../lib/shopTvBoard'
import { supabase } from '../lib/supabase'
import type { Valve } from '../types'

function formatDue(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function isOverdue(value: string | null | undefined) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return parsed < today
}

const SCROLL_SPEED_STORAGE_KEY = 'js-shop-tv-scroll-speed'
const SCROLL_RATE_STORAGE_KEY = 'js-shop-tv-scroll-rate-v2'
const SCROLL_PAUSED_STORAGE_KEY = 'js-shop-tv-scroll-paused-v2'
const COLUMN_REST_ORDER_STORAGE_KEY = 'js-shop-tv-column-rest-order'

/** Pixels per second — slider allows slower than the old “Slow” preset. */
const SCROLL_RATE_MIN = 4
const SCROLL_RATE_MAX = 120
const SCROLL_RATE_DEFAULT = 18

type ColumnRestOrder = Record<string, string[]>

function clampScrollRate(value: number): number {
  if (!Number.isFinite(value)) return SCROLL_RATE_DEFAULT
  return Math.min(SCROLL_RATE_MAX, Math.max(SCROLL_RATE_MIN, Math.round(value)))
}

function readStoredScrollRate(): number {
  if (typeof window === 'undefined') return SCROLL_RATE_DEFAULT
  try {
    const raw = window.localStorage.getItem(SCROLL_RATE_STORAGE_KEY)
    if (raw != null && raw !== '') {
      const parsed = Number(raw)
      if (Number.isFinite(parsed)) return clampScrollRate(parsed)
    }
    // Migrate old preset dropdown values.
    const legacy = window.localStorage.getItem(SCROLL_SPEED_STORAGE_KEY)
    if (legacy === 'slow') return 22
    if (legacy === 'medium') return 48
    if (legacy === 'fast') return 90
  } catch {
    // ignore
  }
  return SCROLL_RATE_DEFAULT
}

function readStoredScrollPaused(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(SCROLL_PAUSED_STORAGE_KEY)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    const legacy = window.localStorage.getItem(SCROLL_SPEED_STORAGE_KEY)
    if (legacy === 'paused') return true
  } catch {
    // ignore
  }
  return false
}

function scrollRateLabel(rate: number): string {
  if (rate <= 12) return 'Crawl'
  if (rate <= 28) return 'Slow'
  if (rate <= 60) return 'Medium'
  return 'Fast'
}

const DEPT_CHART_COLORS: Record<string, string> = {
  'dept-teardown': '#f59e0b',
  'dept-welding': '#38bdf8',
  'dept-machine-shop': '#a78bfa',
  'dept-testing': '#34d399',
  'dept-painting': '#fb7185',
  'dept-prv': '#f87171',
}

const DEPT_CHART_BASE: readonly Omit<ShopTvDeptMoveRow, 'moveCount'>[] = [
  { id: 'dept-teardown', label: 'Teardown', kind: 'department' },
  { id: 'dept-welding', label: 'Welding', kind: 'department' },
  { id: 'dept-machine-shop', label: 'Machine shop', kind: 'department' },
  { id: 'dept-testing', label: 'Testing', kind: 'department' },
  { id: 'dept-painting', label: 'Painting', kind: 'department' },
  { id: 'dept-prv', label: 'PRV', kind: 'department' },
]

function niceChartMax(value: number): number {
  if (value <= 0) return 5
  const exp = 10 ** Math.floor(Math.log10(value))
  const scaled = value / exp
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return nice * exp
}

function barColorForDeptRow(row: ShopTvDeptMoveRow): string {
  if (row.kind === 'department') return DEPT_CHART_COLORS[row.id] ?? '#14b8a6'
  const tone = finishCellTone(row.cell ?? row.label)
  return tone?.background ?? '#94a3b8'
}

function buildDeptMoveChartRows(leaderboard: readonly ShopTvDeptMoveRow[]): ShopTvDeptMoveRow[] {
  const byId = new Map(leaderboard.map((row) => [row.id, row]))
  const departments = DEPT_CHART_BASE.map((base) => ({
    ...base,
    moveCount: byId.get(base.id)?.moveCount ?? 0,
  }))
  const cells = leaderboard
    .filter((row) => row.kind === 'finish-cell' && row.moveCount > 0)
    .slice(0, 8)
  // Winner (most moves) on the left → least on the right.
  return [...departments, ...cells].sort(
    (a, b) => b.moveCount - a.moveCount || a.label.localeCompare(b.label),
  )
}

function readStoredColumnRestOrder(): ColumnRestOrder {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(COLUMN_REST_ORDER_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ColumnRestOrder
    if (!parsed || typeof parsed !== 'object') return {}
    const next: ColumnRestOrder = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        next[key] = value.map((id) => String(id)).filter(Boolean)
      }
    }
    return next
  } catch {
    return {}
  }
}

function sortColumnRows(
  rows: Valve[],
  priorityQueueIds: readonly string[],
  restOrder: readonly string[],
): Valve[] {
  const prioritySet = new Set(priorityQueueIds)
  const priorityRows = rows
    .filter((row) => prioritySet.has(row.valve_id))
    .sort((a, b) => compareValvesWithPriorityOrder(a, b, priorityQueueIds))
  const restRows = rows.filter((row) => !prioritySet.has(row.valve_id))
  const restRank = new Map(restOrder.map((id, index) => [id, index]))
  restRows.sort((a, b) => {
    const aRank = restRank.get(a.valve_id)
    const bRank = restRank.get(b.valve_id)
    if (aRank != null && bRank != null) return aRank - bRank
    if (aRank != null) return -1
    if (bRank != null) return 1
    return compareValvesWithPriorityOrder(a, b, priorityQueueIds)
  })
  return [...priorityRows, ...restRows]
}

function reorderIds(order: readonly string[], valveId: string, direction: 'up' | 'down'): string[] | null {
  const index = order.indexOf(valveId)
  if (index < 0) return null
  if (direction === 'up') {
    if (index === 0) return null
    const next = [...order]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    return next
  }
  if (index >= order.length - 1) return null
  const next = [...order]
  ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
  return next
}

function TvColumnScroller({
  children,
  speedPxPerSec,
  paused: pausedProp,
}: {
  children: ReactNode
  speedPxPerSec: number
  paused: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [needsScroll, setNeedsScroll] = useState(false)
  const [hoverPaused, setHoverPaused] = useState(false)
  const paused = pausedProp || hoverPaused

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const measure = () => {
      setNeedsScroll(content.scrollHeight > viewport.clientHeight + 8)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(content)
    return () => observer.disconnect()
  }, [children])

  const hoverPausedRef = useRef(false)
  hoverPausedRef.current = hoverPaused

  useEffect(() => {
    if (!needsScroll || pausedProp) return
    const viewport = viewportRef.current
    if (!viewport) return

    let frame = 0
    let last = performance.now()
    // Keep a floating scroll position — browsers often floor scrollTop, which
    // made very slow rates appear stuck when the per-frame delta was < 1px.
    let scrollPos = viewport.scrollTop
    const rate = Math.max(0, speedPxPerSec)

    const tick = (now: number) => {
      const dt = Math.min(64, Math.max(0, now - last)) / 1000
      last = now
      if (!hoverPausedRef.current && rate > 0) {
        const max = viewport.scrollHeight - viewport.clientHeight
        if (max > 0) {
          scrollPos += rate * dt
          if (scrollPos >= max) scrollPos = 0
          viewport.scrollTop = scrollPos
          // Re-sync if the browser clamped or the user dragged the scrollbar.
          const applied = viewport.scrollTop
          if (Math.abs(applied - scrollPos) > 2) scrollPos = applied
        }
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [needsScroll, pausedProp, speedPxPerSec])

  return (
    <div
      ref={viewportRef}
      className={`shop-tv-column-scroll${needsScroll && !paused ? ' shop-tv-column-scroll--moving' : ''}`}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setHoverPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHoverPaused(false)
        }
      }}
      title="Hover or focus a column to pause scrolling while you adjust priorities"
    >
      <div ref={contentRef} className="shop-tv-column-scroll-inner">
        {children}
      </div>
    </div>
  )
}

export function ShopTvBoardPage() {
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const { showToast } = useToast()
  const [valves, setValves] = useState<Valve[]>([])
  const [priorityQueueIds, setPriorityQueueIds] = useState<string[]>([])
  const [movesToday, setMovesToday] = useState<ShopTvStatusMove[]>([])
  const [deptLeaderboard, setDeptLeaderboard] = useState<ShopTvDeptMoveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingPriority, setSavingPriority] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [scrollRate, setScrollRate] = useState(() => readStoredScrollRate())
  const [scrollPaused, setScrollPaused] = useState(() => readStoredScrollPaused())
  const [columnRestOrder, setColumnRestOrder] = useState<ColumnRestOrder>(() => readStoredColumnRestOrder())
  const [priorityOnly, setPriorityOnly] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(SCROLL_RATE_STORAGE_KEY, String(scrollRate))
      window.localStorage.setItem(SCROLL_PAUSED_STORAGE_KEY, scrollPaused ? '1' : '0')
    } catch {
      // ignore
    }
  }, [scrollRate, scrollPaused])

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_REST_ORDER_STORAGE_KEY, JSON.stringify(columnRestOrder))
    } catch {
      // ignore
    }
  }, [columnRestOrder])

  const load = useCallback(async () => {
    const { data, error } = await fetchAllValves()
    if (error) {
      showToast(`Could not load jobs: ${error.message}`)
      setValves([])
      setPriorityQueueIds([])
      setMovesToday([])
      setDeptLeaderboard([])
      setLoading(false)
      return
    }
    const rows = data ?? []
    setValves(rows)
    setPriorityQueueIds(await syncPriorityQueueWithValves(rows))

    const { startIso, endIso } = localTodayBounds()
    const todayRes = await supabase
      .from('valve_change_log')
      .select('valve_row_id,changed_at,changed_by_email,old_row,new_row')
      .eq('action', 'update')
      .gte('changed_at', startIso)
      .lt('changed_at', endIso)
      .order('changed_at', { ascending: true })

    if (todayRes.error) {
      setMovesToday([])
      setDeptLeaderboard([])
    } else {
      const parsed = parseShopTvStatusMoves(
        (todayRes.data ?? []) as Parameters<typeof parseShopTvStatusMoves>[0],
      )
      setMovesToday(parsed.moves)
      setDeptLeaderboard(parsed.deptLeaderboard)
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void load()
    }, 30000)
    return () => window.clearInterval(interval)
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('shop-tv-valves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'valves' }, () => {
        void load()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    document.body.classList.toggle('shop-tv-fullscreen-active', fullscreen)
    return () => document.body.classList.remove('shop-tv-fullscreen-active')
  }, [fullscreen])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const priorityRank = useMemo(() => {
    const map = new Map<string, number>()
    priorityQueueIds.forEach((id, index) => map.set(id, index + 1))
    return map
  }, [priorityQueueIds])

  const columns = useMemo(() => {
    const active = valves.filter(isActiveShopWork)
    const defs = buildShopTvColumns(active)
    return defs.map((column) => {
      let rows = active.filter((valve) => valveMatchesTvColumn(valve, column))
      if (priorityOnly) {
        rows = rows.filter((valve) => priorityRank.has(valve.valve_id))
      }
      rows = sortColumnRows(rows, priorityQueueIds, columnRestOrder[column.id] ?? [])
      const movedOutToday = countMovedOutToday(column, movesToday)
      return { ...column, rows, movedOutToday }
    })
  }, [valves, priorityQueueIds, priorityOnly, priorityRank, columnRestOrder, movesToday])

  const chartRows = useMemo(() => buildDeptMoveChartRows(deptLeaderboard), [deptLeaderboard])
  const chartMax = useMemo(
    () => niceChartMax(chartRows.reduce((max, row) => Math.max(max, row.moveCount), 0)),
    [chartRows],
  )
  const chartTopCount = useMemo(
    () => chartRows.reduce((max, row) => Math.max(max, row.moveCount), 0),
    [chartRows],
  )
  const chartTicks = useMemo(() => {
    const steps = 4
    return Array.from({ length: steps + 1 }, (_, i) => Math.round((chartMax * i) / steps))
  }, [chartMax])

  const movePriorityInColumn = useCallback(
    async (valveId: string, columnRows: Valve[], direction: 'top' | 'up' | 'down') => {
      if (!canWrite || savingPriority) return
      if (!priorityQueueIds.includes(valveId)) return

      const columnPriorityIds = columnRows
        .map((row) => row.valve_id)
        .filter((id) => priorityQueueIds.includes(id))
      const columnIndex = columnPriorityIds.indexOf(valveId)
      if (columnIndex < 0) return

      const previous = priorityQueueIds
      let next = [...priorityQueueIds]

      if (direction === 'top') {
        if (columnIndex === 0) {
          const reordered = reorderPriorityQueueIds(next, valveId, 'top')
          if (!reordered) return
          next = reordered
        } else {
          const firstInColumn = columnPriorityIds[0]
          next = next.filter((id) => id !== valveId)
          const insertAt = next.indexOf(firstInColumn)
          if (insertAt < 0) return
          next.splice(insertAt, 0, valveId)
        }
      } else if (direction === 'up') {
        if (columnIndex === 0) return
        const swapWith = columnPriorityIds[columnIndex - 1]
        const a = next.indexOf(valveId)
        const b = next.indexOf(swapWith)
        if (a < 0 || b < 0) return
        ;[next[a], next[b]] = [next[b], next[a]]
      } else {
        if (columnIndex >= columnPriorityIds.length - 1) return
        const swapWith = columnPriorityIds[columnIndex + 1]
        const a = next.indexOf(valveId)
        const b = next.indexOf(swapWith)
        if (a < 0 || b < 0) return
        ;[next[a], next[b]] = [next[b], next[a]]
      }

      if (next.join('\0') === previous.join('\0')) return

      setSavingPriority(true)
      setPriorityQueueIds(next)
      const { error } = await persistPriorityQueueOrder(previous, next)
      setSavingPriority(false)
      if (error) {
        setPriorityQueueIds(previous)
        showToast(`Could not save priority: ${error}`)
      }
    },
    [canWrite, savingPriority, priorityQueueIds, showToast],
  )

  const moveRestInColumn = useCallback(
    (columnId: string, columnRows: Valve[], valveId: string, direction: 'top' | 'up' | 'down') => {
      if (!canWrite) return
      if (priorityQueueIds.includes(valveId)) return

      const hasPriorityAbove = columnRows.some((row) => priorityQueueIds.includes(row.valve_id))
      const restIds = columnRows
        .map((row) => row.valve_id)
        .filter((id) => !priorityQueueIds.includes(id))
      const index = restIds.indexOf(valveId)
      if (index < 0) return

      if (direction === 'top') {
        if (hasPriorityAbove) {
          showToast('Add it to the priority list before moving it above priority jobs.')
          return
        }
        if (index === 0) return
        const nextRest = [valveId, ...restIds.filter((id) => id !== valveId)]
        setColumnRestOrder((prev) => ({ ...prev, [columnId]: nextRest }))
        return
      }

      if (direction === 'up' && index === 0) {
        if (hasPriorityAbove) {
          showToast('Add it to the priority list before moving it above priority jobs.')
        }
        return
      }

      if (direction === 'up' || direction === 'down') {
        const nextRest = reorderIds(restIds, valveId, direction)
        if (!nextRest) return
        setColumnRestOrder((prev) => ({ ...prev, [columnId]: nextRest }))
      }
    },
    [canWrite, priorityQueueIds, showToast],
  )

  const moveCardInColumn = useCallback(
    (columnId: string, columnRows: Valve[], valveId: string, direction: 'top' | 'up' | 'down') => {
      if (priorityQueueIds.includes(valveId)) {
        void movePriorityInColumn(valveId, columnRows, direction)
        return
      }
      moveRestInColumn(columnId, columnRows, valveId, direction)
    },
    [priorityQueueIds, movePriorityInColumn, moveRestInColumn],
  )

  const addToPriority = useCallback(
    async (valve: Valve) => {
      if (!canWrite || savingPriority) return
      if (!isEligiblePriorityValve(valve)) {
        showToast('This job cannot be added to the priority list')
        return
      }
      if (priorityQueueIds.includes(valve.valve_id)) return
      const previous = priorityQueueIds
      const next = [...priorityQueueIds, valve.valve_id]
      setSavingPriority(true)
      setPriorityQueueIds(next)
      const { error } = await persistPriorityQueueOrder(previous, next)
      setSavingPriority(false)
      if (error) {
        setPriorityQueueIds(previous)
        showToast(`Could not add priority: ${error}`)
      }
    },
    [canWrite, savingPriority, priorityQueueIds, showToast],
  )

  return (
    <section className={`shop-tv-board${fullscreen ? ' shop-tv-board--fullscreen' : ''}`}>
      <header className="shop-tv-toolbar">
        <div className="shop-tv-toolbar-left">
          <h2 className="shop-tv-title">Shop TV board</h2>
          <p className="shop-tv-subtitle">
            Pull from Customer Yard · Teardown · Welding · Machine shop · Testing · Painting · Assembly /
            Fitting / Waiting on Parts by finish cell · Other. Hover a column to pause scroll.
          </p>
        </div>
        <div className="shop-tv-toolbar-actions">
          <label className="shop-tv-toggle">
            <input
              type="checkbox"
              checked={priorityOnly}
              onChange={(e) => setPriorityOnly(e.target.checked)}
            />
            Priority list only
          </label>
          <label className="shop-tv-speed">
            <span>Scroll</span>
            <input
              type="range"
              className="shop-tv-speed-slider"
              min={SCROLL_RATE_MIN}
              max={SCROLL_RATE_MAX}
              step={1}
              value={scrollRate}
              disabled={scrollPaused}
              onChange={(e) => {
                setScrollRate(clampScrollRate(Number(e.target.value)))
                setScrollPaused(false)
              }}
              aria-label="Auto-scroll speed"
            />
            <span className="shop-tv-speed-value">
              {scrollPaused ? 'Paused' : scrollRateLabel(scrollRate)}
            </span>
          </label>
          <button
            type="button"
            className={scrollPaused ? 'button-primary' : 'button-secondary'}
            onClick={() => setScrollPaused((prev) => !prev)}
          >
            {scrollPaused ? 'Resume scroll' : 'Pause scroll'}
          </button>
          <button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? 'Exit TV mode' : 'TV / fullscreen'}
          </button>
          {!fullscreen ? (
            <Link to="/job-board" className="button-secondary">
              Status board
            </Link>
          ) : null}
        </div>
      </header>

      <section className="shop-tv-chart" aria-label="Department moves chart for today">
        <div className="shop-tv-chart-head">
          <div>
            <h3 className="shop-tv-chart-title">Today&apos;s department moves</h3>
            <p className="shop-tv-chart-sub">
              Ranked by moves today — winner on the left
            </p>
          </div>
          <span className="shop-tv-chart-yaxis-label">Moves</span>
        </div>
        {loading && deptLeaderboard.length === 0 ? (
          <p className="shop-tv-chart-empty">Loading…</p>
        ) : chartRows.every((row) => row.moveCount === 0) ? (
          <p className="shop-tv-chart-empty">No status moves logged yet today.</p>
        ) : (
          <div className="shop-tv-chart-body">
            <div className="shop-tv-chart-plot" role="img" aria-label="Bar chart of moves by department">
              <div className="shop-tv-chart-grid" aria-hidden="true">
                {chartTicks.map((tick, index) => (
                  <div
                    key={`${tick}-${index}`}
                    className="shop-tv-chart-gridline"
                    style={{ bottom: `${chartMax > 0 ? (tick / chartMax) * 100 : 0}%` }}
                  >
                    <span className="shop-tv-chart-tick">{tick}</span>
                  </div>
                ))}
              </div>
              <div className="shop-tv-chart-bars">
                {chartRows.map((row) => {
                  const heightPct = chartMax > 0 ? (row.moveCount / chartMax) * 100 : 0
                  const color = barColorForDeptRow(row)
                  const leader = row.moveCount > 0 && row.moveCount === chartTopCount
                  return (
                    <div
                      key={row.id}
                      className={`shop-tv-chart-col${leader ? ' is-leader' : ''}${row.moveCount === 0 ? ' is-zero' : ''}`}
                      title={`${row.label}: ${row.moveCount} move${row.moveCount === 1 ? '' : 's'}`}
                    >
                      <div className="shop-tv-chart-bar-wrap">
                        <div
                          className="shop-tv-chart-bar"
                          style={{
                            height: `${Math.max(heightPct, row.moveCount > 0 ? 3 : 0)}%`,
                            background: color,
                          }}
                        >
                          <span className="shop-tv-chart-value">{row.moveCount}</span>
                        </div>
                      </div>
                      <div className="shop-tv-chart-xlabel">
                        {row.kind === 'finish-cell' && row.cell && row.cell !== 'Unassigned' ? (
                          <FinishCellBadge cell={row.cell} />
                        ) : (
                          <span>{row.label}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {loading ? <div className="loading">Loading shop board…</div> : null}

      <div
        className="shop-tv-columns"
        aria-label="Shop priority columns by status"
        style={
          {
            ['--shop-tv-col-count']: String(Math.max(1, Math.ceil(columns.length / 2))),
          } as CSSProperties
        }
      >
        {columns.map((column) => (
          <section
            key={column.id}
            className={`shop-tv-column${column.kind === 'finish-cell' ? ' shop-tv-column--cell' : ''}${column.kind === 'other' ? ' shop-tv-column--other' : ''}`}
          >
            <header className="shop-tv-column-header">
              <div className="shop-tv-column-heading">
                <h3>{column.label}</h3>
                {column.kind === 'finish-cell' ? (
                  <span className="shop-tv-column-sub">Assembly · Fitting · Waiting on Parts</span>
                ) : null}
                {column.kind === 'other' ? (
                  <span className="shop-tv-column-sub">All remaining active statuses</span>
                ) : null}
              </div>
              <div className="shop-tv-column-stats">
                <span className="shop-tv-column-count" title="Jobs currently in this area">
                  {column.rows.length} in
                </span>
                <span className="shop-tv-column-moved" title="Jobs moved out of this area today">
                  {column.movedOutToday} out today
                </span>
              </div>
            </header>
            <TvColumnScroller speedPxPerSec={scrollRate} paused={scrollPaused}>
              {column.rows.length === 0 ? (
                <p className="shop-tv-empty">No jobs</p>
              ) : (
                column.rows.map((valve, listIndex) => {
                  const rank = priorityRank.get(valve.valve_id)
                  const due = formatDue(valve.due_date)
                  const overdue = isOverdue(valve.due_date)
                  const onPriority = rank != null
                  const listNumber = listIndex + 1
                  const columnPriorityIds = column.rows
                    .map((row) => row.valve_id)
                    .filter((id) => priorityRank.has(id))
                  const restIds = column.rows
                    .map((row) => row.valve_id)
                    .filter((id) => !priorityRank.has(id))
                  const columnPriorityIndex = columnPriorityIds.indexOf(valve.valve_id)
                  const restIndex = restIds.indexOf(valve.valve_id)
                  const canMoveUp = onPriority
                    ? columnPriorityIndex > 0
                    : restIndex > 0
                  const canMoveDown = onPriority
                    ? columnPriorityIndex >= 0 && columnPriorityIndex < columnPriorityIds.length - 1
                    : restIndex >= 0 && restIndex < restIds.length - 1
                  return (
                    <article
                      key={valve.id}
                      className={`shop-tv-card${onPriority ? ' shop-tv-card--priority' : ''}`}
                    >
                      <div className="shop-tv-card-top">
                        <div className="shop-tv-card-ids">
                          <span
                            className={`shop-tv-rank${onPriority ? ' shop-tv-rank--priority' : ''}`}
                            title={
                              onPriority
                                ? `Scroll #${listNumber} · Priority #${rank}`
                                : `Scroll #${listNumber}`
                            }
                          >
                            #{listNumber}
                          </span>
                          <strong className="shop-tv-valve-id">{valve.valve_id}</strong>
                        </div>
                        <FinishCellBadge cell={valve.cell} />
                      </div>
                      <div className="shop-tv-customer">{valve.customer?.trim() || '—'}</div>
                      <div className="shop-tv-meta">
                        <span className="shop-tv-status">{displayJobStatus(valve)}</span>
                        {due ? (
                          <span className={overdue ? 'shop-tv-due shop-tv-due--overdue' : 'shop-tv-due'}>
                            {overdue ? 'Overdue ' : 'Due '}
                            {due}
                          </span>
                        ) : null}
                      </div>
                      {valve.description?.trim() ? (
                        <p className="shop-tv-description">{valve.description.trim()}</p>
                      ) : null}
                      {canWrite ? (
                        <div className="shop-tv-card-actions">
                          <button
                            type="button"
                            className="shop-tv-prio-btn"
                            disabled={savingPriority}
                            onClick={() => moveCardInColumn(column.id, column.rows, valve.valve_id, 'top')}
                            title={
                              onPriority
                                ? 'Move to top of this status column'
                                : 'Requires priority list — blocked above priority jobs'
                            }
                          >
                            ⇈
                          </button>
                          <button
                            type="button"
                            className="shop-tv-prio-btn"
                            disabled={savingPriority || (onPriority && !canMoveUp)}
                            onClick={() => moveCardInColumn(column.id, column.rows, valve.valve_id, 'up')}
                            title={
                              onPriority
                                ? 'Move priority up in this status'
                                : canMoveUp
                                  ? 'Move up in this status'
                                  : 'Add to the priority list to move above priority jobs'
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="shop-tv-prio-btn"
                            disabled={savingPriority || !canMoveDown}
                            onClick={() => moveCardInColumn(column.id, column.rows, valve.valve_id, 'down')}
                            title="Move down in this status"
                          >
                            ↓
                          </button>
                          {!onPriority && isEligiblePriorityValve(valve) ? (
                            <button
                              type="button"
                              className="shop-tv-prio-btn shop-tv-prio-btn--add"
                              disabled={savingPriority}
                              onClick={() => void addToPriority(valve)}
                            >
                              Add priority
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  )
                })
              )}
            </TvColumnScroller>
          </section>
        ))}
      </div>
    </section>
  )
}
