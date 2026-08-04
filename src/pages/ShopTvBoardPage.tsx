import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FinishCellBadge } from '../components/FinishCellBadge'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { fetchAllValves } from '../lib/fetchAllValves'
import { displayJobStatus, isActiveShopWork } from '../lib/jobDisplayStatus'
import {
  compareValvesWithPriorityOrder,
  isEligiblePriorityValve,
  persistPriorityQueueOrder,
  reorderPriorityQueueIds,
  syncPriorityQueueWithValves,
} from '../lib/priorityQueue'
import { canWriteShop } from '../lib/roles'
import { supabase } from '../lib/supabase'
import type { Valve } from '../types'

type TvColumn = {
  id: string
  label: string
  statuses: readonly string[]
}

/** Active floor columns for the shop TV board (priority within each status group). */
const TV_COLUMNS: readonly TvColumn[] = [
  { id: 'teardown', label: 'Teardown', statuses: ['Teardown', 'PRV Teardown'] },
  {
    id: 'machine-shop',
    label: 'Machine shop',
    statuses: ['Machine 1', 'Machine 2', 'Water Jet', 'Grinding'],
  },
  { id: 'welding', label: 'Welding', statuses: ['Welding'] },
  {
    id: 'assembly',
    label: 'Assembly / Fitting',
    statuses: ['Assembly', 'PRV Assembly', 'Fitting', 'Adaption', 'Actuation'],
  },
  { id: 'testing', label: 'Testing', statuses: ['Testing'] },
  { id: 'painting', label: 'Painting', statuses: ['Painting'] },
]

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

function TvColumnScroller({
  children,
  paused,
}: {
  children: ReactNode
  paused: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [needsScroll, setNeedsScroll] = useState(false)

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

  useEffect(() => {
    if (!needsScroll || paused) return
    const viewport = viewportRef.current
    if (!viewport) return

    let frame = 0
    let last = performance.now()
    const speedPxPerSec = 28

    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 1000
      last = now
      const max = viewport.scrollHeight - viewport.clientHeight
      if (max <= 0) {
        frame = requestAnimationFrame(tick)
        return
      }
      let next = viewport.scrollTop + speedPxPerSec * dt
      if (next >= max) next = 0
      viewport.scrollTop = next
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [needsScroll, paused])

  return (
    <div
      ref={viewportRef}
      className={`shop-tv-column-scroll${needsScroll && !paused ? ' shop-tv-column-scroll--moving' : ''}`}
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
  const [loading, setLoading] = useState(true)
  const [savingPriority, setSavingPriority] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [scrollPaused, setScrollPaused] = useState(false)
  const [priorityOnly, setPriorityOnly] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await fetchAllValves()
    if (error) {
      showToast(`Could not load jobs: ${error.message}`)
      setValves([])
      setPriorityQueueIds([])
      setLoading(false)
      return
    }
    const rows = data ?? []
    setValves(rows)
    setPriorityQueueIds(await syncPriorityQueueWithValves(rows))
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
    return TV_COLUMNS.map((column) => {
      const statusSet = new Set(column.statuses)
      let rows = active.filter((valve) => statusSet.has(displayJobStatus(valve)))
      if (priorityOnly) {
        rows = rows.filter((valve) => priorityRank.has(valve.valve_id))
      }
      rows = [...rows].sort((a, b) => compareValvesWithPriorityOrder(a, b, priorityQueueIds))
      return { ...column, rows }
    })
  }, [valves, priorityQueueIds, priorityOnly, priorityRank])

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
            Priority order by status · finish cell shown on every card · auto-scrolls for TV
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
          <label className="shop-tv-toggle">
            <input
              type="checkbox"
              checked={scrollPaused}
              onChange={(e) => setScrollPaused(e.target.checked)}
            />
            Pause scroll
          </label>
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

      {loading ? <div className="loading">Loading shop board…</div> : null}

      <div className="shop-tv-columns" aria-label="Shop priority columns by status">
        {columns.map((column) => (
          <section key={column.id} className="shop-tv-column">
            <header className="shop-tv-column-header">
              <h3>{column.label}</h3>
              <span className="shop-tv-column-count">{column.rows.length}</span>
            </header>
            <TvColumnScroller paused={scrollPaused}>
              {column.rows.length === 0 ? (
                <p className="shop-tv-empty">No jobs</p>
              ) : (
                column.rows.map((valve) => {
                  const rank = priorityRank.get(valve.valve_id)
                  const due = formatDue(valve.due_date)
                  const overdue = isOverdue(valve.due_date)
                  const onPriority = rank != null
                  const columnPriorityIds = column.rows
                    .map((row) => row.valve_id)
                    .filter((id) => priorityRank.has(id))
                  const columnPriorityIndex = columnPriorityIds.indexOf(valve.valve_id)
                  return (
                    <article
                      key={valve.id}
                      className={`shop-tv-card${onPriority ? ' shop-tv-card--priority' : ''}`}
                    >
                      <div className="shop-tv-card-top">
                        <div className="shop-tv-card-ids">
                          {onPriority ? <span className="shop-tv-rank">#{rank}</span> : null}
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
                          {onPriority ? (
                            <>
                              <button
                                type="button"
                                className="shop-tv-prio-btn"
                                disabled={savingPriority || columnPriorityIndex <= 0}
                                onClick={() => void movePriorityInColumn(valve.valve_id, column.rows, 'top')}
                                title="Move to top of this status column"
                              >
                                ⇈
                              </button>
                              <button
                                type="button"
                                className="shop-tv-prio-btn"
                                disabled={savingPriority || columnPriorityIndex <= 0}
                                onClick={() => void movePriorityInColumn(valve.valve_id, column.rows, 'up')}
                                title="Move priority up in this status"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="shop-tv-prio-btn"
                                disabled={
                                  savingPriority ||
                                  columnPriorityIndex < 0 ||
                                  columnPriorityIndex >= columnPriorityIds.length - 1
                                }
                                onClick={() => void movePriorityInColumn(valve.valve_id, column.rows, 'down')}
                                title="Move priority down in this status"
                              >
                                ↓
                              </button>
                            </>
                          ) : isEligiblePriorityValve(valve) ? (
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
