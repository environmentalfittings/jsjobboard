import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IN_SHOP_STATUSES, TESTING_STATUSES, WAITING_STATUSES } from '../constants/statuses'
import { useToast } from '../components/ToastNotification'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { Valve } from '../types'
import logo from '../assets/js-logo.png'

export function DashboardPage() {
  const navigate = useNavigate()
  const [valves, setValves] = useState<Valve[]>([])
  const [priorityQueueIds, setPriorityQueueIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [dragPriorityId, setDragPriorityId] = useState<string | null>(null)
  const [savingPriority, setSavingPriority] = useState(false)
  const { showToast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: valvesData, error: valvesError } = await supabase
      .from('valves')
      .select(VALVE_LIST_SELECT)
      .order('id', { ascending: false })

    const { data: queueData, error: queueError } = await supabase
      .from('priority_queue')
      .select('valve_id,created_at')
      .order('created_at', { ascending: true })

    if (valvesError) {
      showToast(`Could not load valves: ${valvesError.message}`)
    } else if (valvesData) {
      setValves(valvesData as Valve[])
    }
    if (queueError) {
      showToast(`Could not load priority queue: ${queueError.message}`)
    } else if (queueData) {
      setPriorityQueueIds(queueData.map((item: { valve_id: string }) => item.valve_id))
    }
    setLastRefreshed(new Date())
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchData()
    }, 60000)
    return () => window.clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshTick((n) => n + 1)
    }, 10000)
    return () => window.clearInterval(interval)
  }, [])

  const refreshHint = useMemo(() => {
    if (!lastRefreshed) return 'Loading...'
    const secondsAgo = Math.max(0, Math.floor((Date.now() - lastRefreshed.getTime()) / 1000))
    return `Last updated ${secondsAgo} second${secondsAgo === 1 ? '' : 's'} ago`
  }, [lastRefreshed, refreshTick])

  const metrics = useMemo(() => {
    const inProcess = valves.filter((v) => IN_SHOP_STATUSES.has(v.status) || TESTING_STATUSES.has(v.status)).length
    const onHold = valves.filter((v) => WAITING_STATUSES.has(v.status)).length
    const readyToShip = valves.filter((v) => v.status === 'Warehouse RTS').length
    const notArrived = valves.filter((v) => v.status === 'Not Arrived').length
    return { inProcess, onHold, readyToShip, notArrived }
  }, [valves])

  const cellRows = useMemo(() => {
    const counts = new Map<string, number>()
    valves.forEach((v) => {
      if (v.status === 'Completed' || v.status === 'Junked' || v.status === 'Replaced') return
      if (!v.cell) return
      counts.set(v.cell, (counts.get(v.cell) ?? 0) + 1)
    })
    return [...counts.entries()]
      .map(([cell, count]) => ({ cell, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [valves])

  const topCell = cellRows[0]?.count ?? 1

  const recentTested = useMemo(() => {
    return valves
      .filter((v) => v.date_tested)
      .sort((a, b) => new Date(b.date_tested ?? 0).getTime() - new Date(a.date_tested ?? 0).getTime())
      .slice(0, 5)
  }, [valves])

  const completedMetrics = useMemo(() => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()
    const lastYear = year - 1

    let monthCount = 0
    let yearCount = 0
    let lastYearCount = 0

    const completionDateForValve = (v: Valve): Date | null => {
      // Older records may miss date_closed. Fall back to other known timestamps.
      const raw =
        v.date_closed ??
        v.date_tested ??
        ((v as unknown as { updated_at?: string | null }).updated_at ?? null) ??
        ((v as unknown as { created_at?: string | null }).created_at ?? null)
      if (!raw) return null
      const parsed = new Date(raw)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    valves.forEach((v) => {
      if (v.status !== 'Completed') return
      const closed = completionDateForValve(v)
      if (!closed) return
      if (closed.getFullYear() === year) {
        yearCount += 1
        if (closed.getMonth() === month) monthCount += 1
      } else if (closed.getFullYear() === lastYear) {
        lastYearCount += 1
      }
    })

    return { monthCount, yearCount, lastYearCount }
  }, [valves])

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    valves.forEach((v) => {
      counts.set(v.status, (counts.get(v.status) ?? 0) + 1)
    })
    const rows = [...counts.entries()]
      .map(([status, count]) => ({
        status,
        label: status === 'Warehouse RTS' ? 'Ready to Ship' : status,
        count,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    const maxCount = rows[0]?.count ?? 1
    return { rows, maxCount }
  }, [valves])

  const priorityRows = useMemo(() => {
    const byValveId = new Map(valves.map((v) => [v.valve_id, v]))
    return priorityQueueIds
      .map((valveId) => byValveId.get(valveId))
      .filter((row): row is Valve => Boolean(row))
      .slice(0, 8)
  }, [priorityQueueIds, valves])

  const persistPriorityOrder = async (nextOrder: string[]) => {
    const unique = Array.from(new Set(nextOrder))
    const previous = priorityQueueIds
    setPriorityQueueIds(unique)
    setSavingPriority(true)

    const { error: deleteError } = await supabase.from('priority_queue').delete().in('valve_id', previous)
    if (deleteError) {
      setPriorityQueueIds(previous)
      setSavingPriority(false)
      showToast('Could not reorder priorities')
      return
    }

    if (unique.length > 0) {
      const baseTime = Date.now()
      const rows = unique.map((valveId, index) => ({
        valve_id: valveId,
        created_at: new Date(baseTime + index * 1000).toISOString(),
      }))
      const { error: insertError } = await supabase.from('priority_queue').insert(rows)
      if (insertError) {
        setPriorityQueueIds(previous)
        setSavingPriority(false)
        showToast('Could not reorder priorities')
        return
      }
    }

    setSavingPriority(false)
    showToast('Priority order updated')
  }

  const movePriority = async (valveId: string, direction: -1 | 1) => {
    const index = priorityQueueIds.indexOf(valveId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= priorityQueueIds.length) return

    const next = [...priorityQueueIds]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    await persistPriorityOrder(next)
  }

  const movePriorityBefore = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const next = priorityQueueIds.filter((id) => id !== draggedId)
    const targetIndex = next.indexOf(targetId)
    if (targetIndex < 0) return
    next.splice(targetIndex, 0, draggedId)
    await persistPriorityOrder(next)
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <img src={logo} alt="JS Valve logo" className="dashboard-logo" />
        <h2 className="dashboard-title">Dashboard</h2>
        <div className="dashboard-refresh-row">
          <span className="dashboard-refresh-hint">{refreshHint}</span>
          <button type="button" className="dashboard-refresh-button" onClick={() => void fetchData()} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading ? <div className="loading">Loading dashboard...</div> : null}

      <div className="dashboard-main-grid">
        <div className="dashboard-left">
          <div className="dashboard-kpis">
            <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=in-process">
              <div className="kpi-number blue">{metrics.inProcess}</div>
              <div className="kpi-label">In process</div>
            </Link>
            <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=on-hold">
              <div className="kpi-number amber">{metrics.onHold}</div>
              <div className="kpi-label">On hold</div>
            </Link>
            <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=ready-to-ship">
              <div className="kpi-number green">{metrics.readyToShip}</div>
              <div className="kpi-label">Ready to ship</div>
            </Link>
            <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=not-arrived">
              <div className="kpi-number red">{metrics.notArrived}</div>
              <div className="kpi-label">Not arrived</div>
            </Link>
          </div>

          <section className="dashboard-panel">
            <h3>Active jobs by work cell</h3>
            <div className="cell-bars">
              {cellRows.map((row) => (
                <Link
                  key={row.cell}
                  className="cell-row"
                  to={`/job-board?view=list&scope=all&cell=${encodeURIComponent(row.cell)}`}
                  title={`View active valves in ${row.cell}`}
                >
                  <div className="cell-name">{row.cell}</div>
                  <div className="cell-bar-track">
                    <div className="cell-bar-fill" style={{ width: `${Math.max(5, (row.count / topCell) * 100)}%` }} />
                  </div>
                  <div className="cell-count">{row.count}</div>
                </Link>
              ))}
            </div>
            <div className="status-breakdown-note">Click a cell to open its active valve list.</div>
          </section>

          <section className="dashboard-panel">
            <h3>Recent tested valves (last 5)</h3>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Valve ID</th>
                    <th>Customer</th>
                    <th>Cell</th>
                    <th>Status</th>
                    <th>Date tested</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTested.map((row) => (
                    <tr
                      key={row.id}
                      className="dashboard-table-row-open"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/job-board?open=${row.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          navigate(`/job-board?open=${row.id}`)
                        }
                      }}
                    >
                      <td>{row.valve_id}</td>
                      <td>{row.customer ?? '-'}</td>
                      <td>{row.cell ?? '-'}</td>
                      <td>{row.status}</td>
                      <td>{row.date_tested ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-panel">
            <h3>Breakdown by status</h3>
            <div className="status-breakdown-grid">
              {statusBreakdown.rows.map((item) => {
                const ratio = item.count / statusBreakdown.maxCount
                const toneClass =
                  ratio >= 0.66
                    ? 'status-breakdown-chip-high'
                    : ratio >= 0.33
                      ? 'status-breakdown-chip-medium'
                      : 'status-breakdown-chip-low'
                return (
                  <Link
                    key={item.status}
                    className={`status-breakdown-chip ${toneClass}`}
                    to={`/job-board?view=list&scope=all&status=${encodeURIComponent(item.status)}`}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                    <span className="status-breakdown-meter" aria-hidden>
                      <span style={{ width: `${Math.max(6, ratio * 100)}%` }} />
                    </span>
                  </Link>
                )
              })}
            </div>
            <p className="status-breakdown-note">Sorted by highest volume.</p>
          </section>

          <section className="dashboard-panel">
            <h3>Completed</h3>
            <div className="completed-metrics">
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=all&status=Completed">
                <div className="kpi-number green">{completedMetrics.monthCount}</div>
                <div className="kpi-label">Completed this month</div>
              </Link>
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=all&status=Completed">
                <div className="kpi-number blue">{completedMetrics.yearCount}</div>
                <div className="kpi-label">Completed this year</div>
              </Link>
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=all&status=Completed">
                <div className="kpi-number amber">{completedMetrics.lastYearCount}</div>
                <div className="kpi-label">Completed last year</div>
              </Link>
            </div>
          </section>
        </div>

        <aside className="dashboard-panel priority-panel">
          <h3>Today's priority list</h3>
          <div className="priority-list">
            {priorityRows.length ? (
              priorityRows.map((row, index) => (
                <article
                  key={row.id}
                  className={`priority-row ${dragPriorityId === row.valve_id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragPriorityId(row.valve_id)}
                  onDragEnd={() => setDragPriorityId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={async (event) => {
                    event.preventDefault()
                    const draggedId = dragPriorityId
                    setDragPriorityId(null)
                    if (!draggedId || savingPriority) return
                    await movePriorityBefore(draggedId, row.valve_id)
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('.priority-move-buttons')) return
                    navigate(`/job-board?open=${row.id}`)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    if ((e.target as HTMLElement).closest('.priority-move-buttons')) return
                    e.preventDefault()
                    navigate(`/job-board?open=${row.id}`)
                  }}
                  tabIndex={0}
                  aria-label={`Open work card for ${row.valve_id}`}
                >
                  <div className="priority-rank">{index + 1}</div>
                  <div className="priority-main">
                    <div className="priority-id">{row.valve_id}</div>
                    <div className="priority-meta">
                      {row.customer ?? 'Unknown customer'} · {row.cell ?? 'No cell'}
                    </div>
                  </div>
                  <span className="priority-status">{row.status}</span>
                  <div className="priority-move-buttons">
                    <button
                      type="button"
                      className="priority-arrow"
                      onClick={(e) => {
                        e.stopPropagation()
                        void movePriority(row.valve_id, -1)
                      }}
                      disabled={index === 0 || savingPriority}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="priority-arrow"
                      onClick={(e) => {
                        e.stopPropagation()
                        void movePriority(row.valve_id, 1)
                      }}
                      disabled={index === priorityRows.length - 1 || savingPriority}
                    >
                      ▼
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="priority-empty">No priority valves yet. Add valves to `priority_queue` to show them here.</div>
            )}
          </div>
          <Link className="dashboard-link-button" to="/job-board">
            Manage priorities on Job Board
          </Link>
        </aside>
      </div>
      <div className="dashboard-actions">
        <Link className="dashboard-link-button" to="/job-board">
          Open Job Board
        </Link>
      </div>
    </section>
  )
}
