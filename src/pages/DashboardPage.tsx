import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardNotesPanel } from '../components/DashboardNotesPanel'
import { ReceivedValvesDashboardPanel } from '../components/ReceivedValvesDashboardPanel'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import {
  calcActiveJobsByCell,
  calcActiveStatusBreakdown,
  calcCompletedMetrics,
  calcCompletedMonthlyBars,
  calcDashboardKpis,
} from '../lib/dashboardMetrics'
import { fetchAllValves } from '../lib/fetchAllValves'
import { displayJobStatus } from '../lib/jobDisplayStatus'
import {
  filterAllowedTestGauges,
  isGaugeCalibrationOverdue,
  loadActiveTestGauges,
} from '../lib/testGaugeRegistry'
import type { TestGauge } from '../types/testGauge'
import { isEligiblePriorityValve, syncPriorityQueueWithValves } from '../lib/priorityQueue'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import { departmentIdForShopStatus } from '../lib/statusPriorityQueue'
import { openShopDepartmentsParam } from '../constants/priorityDepartments'
import { supabase } from '../lib/supabase'
import type { Valve } from '../types'
import logo from '../assets/js-logo.png'

type RecentTestedRow = {
  valve_id: string
  customer: string | null
  cell: string | null
  status: string
  date_tested: string
  valveRowId: number | null
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const [valves, setValves] = useState<Valve[]>([])
  const [recentTested, setRecentTested] = useState<RecentTestedRow[]>([])
  const [priorityQueueIds, setPriorityQueueIds] = useState<string[]>([])
  const [criticalGauges, setCriticalGauges] = useState<TestGauge[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [dragPriorityId, setDragPriorityId] = useState<string | null>(null)
  const [savingPriority, setSavingPriority] = useState(false)
  const { showToast } = useToast()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: valvesData, error: valvesError } = await fetchAllValves()

    if (valvesError) {
      showToast(`Could not load valves: ${valvesError.message}`)
    } else if (valvesData) {
      setValves(valvesData)

      const { data: testLogRows, error: testLogError } = await supabase
        .from('test_logs')
        .select('tested_on,valve_id,pass_fail')
        .order('tested_on', { ascending: false })
        .limit(40)

      if (testLogError) {
        showToast(`Could not load recent test log: ${testLogError.message}`)
        setRecentTested([])
      } else {
        const byValveId = new Map(valvesData.map((v) => [v.valve_id, v]))
        const rows: RecentTestedRow[] = []
        for (const entry of testLogRows ?? []) {
          if (!String(entry.pass_fail ?? '').toUpperCase().includes('PASS')) continue
          const valve = byValveId.get(entry.valve_id)
          rows.push({
            valve_id: entry.valve_id,
            customer: valve?.customer ?? null,
            cell: valve?.cell ?? null,
            status: displayJobStatus(valve),
            date_tested: entry.tested_on,
            valveRowId: valve?.id ?? null,
          })
          if (rows.length >= 5) break
        }
        setRecentTested(rows)
      }

      const eligiblePriority = await syncPriorityQueueWithValves(valvesData)
      setPriorityQueueIds(eligiblePriority)
    }

    try {
      // Match Quality Team → MTE Calibrations “Out of calibration” (allowed types only, past due).
      const gauges = filterAllowedTestGauges(await loadActiveTestGauges())
      setCriticalGauges(gauges.filter((gauge) => isGaugeCalibrationOverdue(gauge)))
    } catch {
      setCriticalGauges([])
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

  const metrics = useMemo(() => calcDashboardKpis(valves), [valves])

  const cellRows = useMemo(() => calcActiveJobsByCell(valves), [valves])

  const topCell = cellRows[0]?.count ?? 1

  const completedMetrics = useMemo(() => calcCompletedMetrics(valves), [valves])

  const completedMonthly = useMemo(() => calcCompletedMonthlyBars(valves), [valves])

  const statusBreakdown = useMemo(() => calcActiveStatusBreakdown(valves), [valves])

  const priorityRows = useMemo(() => {
    const byValveId = new Map(valves.map((v) => [v.valve_id, v]))
    return priorityQueueIds
      .map((valveId) => byValveId.get(valveId))
      .filter((row): row is Valve => isEligiblePriorityValve(row))
      .slice(0, 8)
  }, [priorityQueueIds, valves])

  const persistPriorityOrder = async (nextOrder: string[]) => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
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

      {!loading && criticalGauges.length > 0 ? (
        <div className="dashboard-gauge-cal-alert" role="alert">
          <div className="dashboard-gauge-cal-alert-title">Test gauge calibration alert</div>
          <p>
            {criticalGauges.length === 1 ? (
              <>
                Gauge <strong>{criticalGauges[0].gauge_number}</strong> is out of calibration (due{' '}
                {criticalGauges[0].next_calibration_date}). Do not use until recalibrated. Update dates in Quality Team
                → MTE Calibrations.
              </>
            ) : (
              <>
                <strong>{criticalGauges.length} gauges</strong> are out of calibration:{' '}
                {criticalGauges.map((g) => g.gauge_number).join(', ')}. Update calibration dates in Quality Team → MTE
                Calibrations.
              </>
            )}
          </p>
          <Link className="dashboard-gauge-cal-alert-link" to="/quality-team/mte-calibrations">
            Open MTE Calibrations
          </Link>
        </div>
      ) : null}

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
            <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=waiting-on-arrival">
              <div className="kpi-number green">{metrics.waitingOnArrival}</div>
              <div className="kpi-label">Waiting on arrival</div>
            </Link>
            <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=on-order">
              <div className="kpi-number red">{metrics.onOrder}</div>
              <div className="kpi-label">On order</div>
            </Link>
          </div>

          <section className="dashboard-panel">
            <h3>Active jobs by work cell</h3>
            <div className="cell-bars">
              {cellRows.map((row) => (
                <Link
                  key={row.cell}
                  className="cell-row"
                  to={`/status-priorities?departments=${encodeURIComponent(openShopDepartmentsParam())}&cell=${encodeURIComponent(row.cell)}`}
                  title={`Daily priorities for finish cell ${row.cell} (all open departments)`}
                >
                  <div className="cell-name">{row.cell}</div>
                  <div className="cell-bar-track">
                    <div className="cell-bar-fill" style={{ width: `${Math.max(5, (row.count / topCell) * 100)}%` }} />
                  </div>
                  <div className="cell-count">{row.count}</div>
                </Link>
              ))}
            </div>
            <div className="status-breakdown-note">Click a finish cell to set and print its daily priorities.</div>
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
                      key={`${row.valve_id}-${row.date_tested}`}
                      className="dashboard-table-row-open"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (row.valveRowId) navigate(`/job-board?open=${row.valveRowId}`)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (row.valveRowId) navigate(`/job-board?open=${row.valveRowId}`)
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

          <ReceivedValvesDashboardPanel />

          <section className="dashboard-panel">
            <h3>Breakdown by status (active jobs)</h3>
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
                    to={(() => {
                      const dept = departmentIdForShopStatus(item.status)
                      return dept
                        ? `/status-priorities?department=${dept}`
                        : `/status-priorities?kind=status&key=${encodeURIComponent(item.status)}`
                    })()}
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
            <p className="status-breakdown-note">
              Open work orders only — click a status to set and print its daily priorities.
            </p>
          </section>

          <section className="dashboard-panel">
            <h3>Completed</h3>
            <div className="completed-metrics">
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=closed">
                <div className="kpi-number green">{completedMetrics.monthCount}</div>
                <div className="kpi-label">Completed this month</div>
              </Link>
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=closed">
                <div className="kpi-number blue">{completedMetrics.yearCount}</div>
                <div className="kpi-label">Completed this year</div>
              </Link>
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=closed">
                <div className="kpi-number slate">{completedMetrics.lastYearSamePeriodCount}</div>
                <div className="kpi-label">Same period last year</div>
                <div className="kpi-sublabel">{completedMetrics.samePeriodLabel}</div>
              </Link>
              <Link className="kpi-card kpi-link" to="/job-board?view=list&scope=closed">
                <div className="kpi-number amber">{completedMetrics.lastYearCount}</div>
                <div className="kpi-label">Completed last year</div>
              </Link>
            </div>
            <div
              className="completed-monthly-chart"
              role="region"
              aria-label="Completed jobs by month for the last twelve months compared to the same month last year"
            >
              <div className="completed-monthly-legend" aria-hidden="true">
                <span className="completed-monthly-legend-item">
                  <span className="completed-monthly-legend-swatch completed-monthly-legend-swatch--current" />
                  This year
                </span>
                <span className="completed-monthly-legend-item">
                  <span className="completed-monthly-legend-swatch completed-monthly-legend-swatch--prior" />
                  Same month last year
                </span>
              </div>
              <div className="completed-monthly-chart-scroll">
                <div className="completed-monthly-bars">
                  {completedMonthly.bars.map((bar) => {
                    const currentHeight =
                      bar.count > 0 ? Math.max(8, (bar.count / completedMonthly.maxCount) * 100) : 0
                    const priorHeight =
                      bar.priorYearCount > 0
                        ? Math.max(8, (bar.priorYearCount / completedMonthly.maxCount) * 100)
                        : 0
                    return (
                      <div
                        key={bar.key}
                        className={`completed-monthly-bar-col${bar.isCurrentMonth ? ' current' : ''}`}
                      >
                        <div className="completed-monthly-bar-tracks">
                          <div className="completed-monthly-bar-track" title={`${bar.label}: ${bar.count}`}>
                            <div
                              className="completed-monthly-bar-fill completed-monthly-bar-fill--current"
                              style={{ height: `${currentHeight}%` }}
                            >
                              {currentHeight >= 22 ? <span>{bar.count}</span> : null}
                            </div>
                          </div>
                          <div
                            className="completed-monthly-bar-track"
                            title={`${bar.priorYearLabel}: ${bar.priorYearCount}`}
                          >
                            <div
                              className="completed-monthly-bar-fill completed-monthly-bar-fill--prior"
                              style={{ height: `${priorHeight}%` }}
                            >
                              {priorHeight >= 22 ? <span>{bar.priorYearCount}</span> : null}
                            </div>
                          </div>
                        </div>
                        <div className="completed-monthly-bar-label">{bar.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="completed-monthly-table-wrap">
                <table className="completed-monthly-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">This year</th>
                      <th scope="col">Last year</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedMonthly.bars.map((bar) => (
                      <tr key={`${bar.key}-row`} className={bar.isCurrentMonth ? 'current' : undefined}>
                        <th scope="row">{bar.label}</th>
                        <td>{bar.count}</td>
                        <td>{bar.priorYearCount}</td>
                        <td
                          className={
                            bar.delta > 0
                              ? 'completed-monthly-delta completed-monthly-delta--up'
                              : bar.delta < 0
                                ? 'completed-monthly-delta completed-monthly-delta--down'
                                : 'completed-monthly-delta'
                          }
                        >
                          {bar.delta > 0 ? `+${bar.delta}` : bar.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="status-breakdown-note">
              By finish date (earlier of test or close) — completed jobs with shop status Completed only. Last 12
              months vs same month last year.
              {completedMetrics.missingCloseDateCount > 0
                ? ` ${completedMetrics.missingCloseDateCount.toLocaleString()} completed jobs have no test/close date and are not included.`
                : ''}
            </p>
          </section>
        </div>

        <aside className="dashboard-sidebar">
          <section className="dashboard-panel priority-panel">
          <h3>Today's priority list</h3>
          <div className="priority-list">
            {priorityRows.length ? (
              priorityRows.map((row, index) => (
                <article
                  key={row.id}
                  className={`priority-row ${dragPriorityId === row.valve_id ? 'dragging' : ''}`}
                  draggable={canWrite}
                  onDragStart={() => {
                    if (!canWrite) return
                    setDragPriorityId(row.valve_id)
                  }}
                  onDragEnd={() => setDragPriorityId(null)}
                  onDragOver={(event) => {
                    if (!canWrite) return
                    event.preventDefault()
                  }}
                  onDrop={async (event) => {
                    if (!canWrite) return
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
                  <span className="priority-status">{displayJobStatus(row)}</span>
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
          </section>
          <DashboardNotesPanel readOnly={!canWrite} />
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
