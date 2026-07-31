import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { fetchAllValves } from '../lib/fetchAllValves'
import { displayJobStatus, isActiveShopWork } from '../lib/jobDisplayStatus'
import {
  formatDurationSince,
  lateJobsInShop,
  latestStatusEnteredAtByWo,
  localTodayBounds,
  localTodayDateString,
  parseStatusMovesFromChangeLog,
  type LateJobRow,
  type MoverLeaderboardRow,
  type StatusMoveRow,
} from '../lib/managerDashboardMetrics'
import { calcDashboardKpis } from '../lib/dashboardMetrics'
import { supabase } from '../lib/supabase'
import type { Valve } from '../types'

function formatWhen(iso: string) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString()
}

export function ManagerDashboardPage() {
  const { showToast } = useToast()
  const [valves, setValves] = useState<Valve[]>([])
  const [movesToday, setMovesToday] = useState<StatusMoveRow[]>([])
  const [leaderboard, setLeaderboard] = useState<MoverLeaderboardRow[]>([])
  const [statusEnteredAt, setStatusEnteredAt] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const todayLabel = useMemo(() => localTodayDateString(), [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchAllValves()
    if (error) {
      showToast(`Could not load valves: ${error.message}`)
      setValves([])
      setMovesToday([])
      setLeaderboard([])
      setStatusEnteredAt(new Map())
      setLoading(false)
      return
    }
    const all = data ?? []
    setValves(all)
    const byWo = new Map(all.map((v) => [v.valve_id, v]))
    const { startIso, endIso } = localTodayBounds()

    const todayRes = await supabase
      .from('valve_change_log')
      .select('valve_row_id,changed_at,changed_by_email,old_row,new_row')
      .eq('action', 'update')
      .gte('changed_at', startIso)
      .lt('changed_at', endIso)
      .order('changed_at', { ascending: false })

    if (todayRes.error) {
      showToast(
        todayRes.error.message.includes('permission') || todayRes.error.message.includes('policy')
          ? 'Run migration-valve-change-log-authenticated-read.sql in Supabase for move tracking'
          : `Could not load today's moves: ${todayRes.error.message}`,
      )
      setMovesToday([])
      setLeaderboard([])
    } else {
      const parsed = parseStatusMovesFromChangeLog(
        (todayRes.data ?? []) as Parameters<typeof parseStatusMovesFromChangeLog>[0],
        byWo,
      )
      setMovesToday(parsed.moves)
      setLeaderboard(parsed.leaderboard)
    }

    // Recent history for dwell — only status-changing rows need full json; keep payload small.
    const dwellStart = new Date()
    dwellStart.setDate(dwellStart.getDate() - 14)
    const dwellRes = await supabase
      .from('valve_change_log')
      .select('valve_row_id,changed_at,old_row,new_row')
      .eq('action', 'update')
      .gte('changed_at', dwellStart.toISOString())
      .order('changed_at', { ascending: false })
      .limit(1500)

    if (!dwellRes.error && dwellRes.data) {
      setStatusEnteredAt(
        latestStatusEnteredAtByWo(
          dwellRes.data as Parameters<typeof latestStatusEnteredAtByWo>[0],
        ),
      )
    } else {
      setStatusEnteredAt(new Map())
    }

    setLoading(false)
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const kpis = useMemo(() => calcDashboardKpis(valves), [valves])
  const inShopCount = useMemo(() => valves.filter((v) => isActiveShopWork(v)).length, [valves])
  const lateJobs: LateJobRow[] = useMemo(() => lateJobsInShop(valves), [valves])

  const dwellSample = useMemo(() => {
    return valves
      .filter((v) => isActiveShopWork(v))
      .map((v) => ({
        valve: v,
        enteredAt: statusEnteredAt.get(v.valve_id) ?? null,
      }))
      .sort((a, b) => {
        const aMs = a.enteredAt ? new Date(a.enteredAt).getTime() : Number.POSITIVE_INFINITY
        const bMs = b.enteredAt ? new Date(b.enteredAt).getTime() : Number.POSITIVE_INFINITY
        return aMs - bMs
      })
      .slice(0, 25)
  }, [valves, statusEnteredAt])

  return (
    <section className="dashboard-page manager-dashboard-page">
      <div className="dashboard-header">
        <div>
          <h2 className="dashboard-title">Manager dashboard</h2>
          <p className="placeholder-copy resources-hint">
            Shop snapshot for today ({todayLabel}). Status moves come from the valve change log.
          </p>
        </div>
        <button type="button" className="button-primary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="dashboard-kpis manager-dashboard-kpis">
        <div className="kpi-card">
          <span className="kpi-label">Jobs in shop</span>
          <div className="kpi-number blue">{loading ? '—' : inShopCount}</div>
          <span className="kpi-sublabel">Open work orders</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Moved today</span>
          <div className="kpi-number blue">{loading ? '—' : movesToday.length}</div>
          <span className="kpi-sublabel">Status changes</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Late jobs</span>
          <div className="kpi-number amber">{loading ? '—' : lateJobs.length}</div>
          <span className="kpi-sublabel">Past due, still open</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">In-process</span>
          <div className="kpi-number slate">{loading ? '—' : kpis.inProcess}</div>
          <span className="kpi-sublabel">Order type</span>
        </div>
      </div>

      <div className="manager-dashboard-grid">
        <section className="dashboard-panel">
          <h3>Who moved the most cards today</h3>
          {loading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : leaderboard.length === 0 ? (
            <p className="placeholder-copy">No status moves logged today.</p>
          ) : (
            <div className="dashboard-table-wrap manager-dashboard-scroll">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>User</th>
                    <th>Moves</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row, index) => (
                    <tr key={row.name}>
                      <td>{index + 1}</td>
                      <td>{row.name}</td>
                      <td>{row.moveCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <h3>Late jobs</h3>
          {loading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : lateJobs.length === 0 ? (
            <p className="placeholder-copy">
              No late open jobs. Not Arrived / Waiting on Arrival (not received) are excluded from on-time delivery.
            </p>
          ) : (
            <div className="dashboard-table-wrap manager-dashboard-scroll">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>WO #</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Cell</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {lateJobs.map((row) => (
                    <tr key={row.valveRowId}>
                      <td>
                        <Link to={`/job-board?open=${row.valveRowId}`}>{row.valve_id}</Link>
                      </td>
                      <td>{row.customer ?? '—'}</td>
                      <td>{row.status}</td>
                      <td>{row.cell ?? '—'}</td>
                      <td className="due-date-overdue">{row.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-panel">
        <h3>Status moves today</h3>
        <p className="placeholder-copy resources-hint">Each row is a status change with date/time and who moved it.</p>
        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : movesToday.length === 0 ? (
          <p className="placeholder-copy">No status moves today.</p>
        ) : (
          <div className="dashboard-table-wrap manager-dashboard-scroll manager-dashboard-scroll--tall">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>WO #</th>
                  <th>Customer</th>
                  <th>From → To</th>
                  <th>Moved by</th>
                </tr>
              </thead>
              <tbody>
                {movesToday.map((row, index) => (
                  <tr key={`${row.valve_id}-${row.changedAt}-${index}`}>
                    <td>{formatWhen(row.changedAt)}</td>
                    <td>{row.valve_id}</td>
                    <td>{row.customer ?? '—'}</td>
                    <td>
                      {row.fromStatus} → {row.toStatus}
                    </td>
                    <td>{row.changedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <h3>Time in current status</h3>
        <p className="placeholder-copy resources-hint">
          Based on the last status change in the change log (last 30 days). Jobs with no recent status
          change show —. A dedicated received timestamp can be added later for dwell from arrival.
        </p>
        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : (
          <div className="dashboard-table-wrap manager-dashboard-scroll manager-dashboard-scroll--tall">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>WO #</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Cell</th>
                  <th>Entered status</th>
                  <th>Sitting</th>
                </tr>
              </thead>
              <tbody>
                {dwellSample.map(({ valve, enteredAt }) => (
                  <tr key={valve.id}>
                    <td>
                      <Link to={`/job-board?open=${valve.id}`}>{valve.valve_id}</Link>
                    </td>
                    <td>{valve.customer ?? '—'}</td>
                    <td>{displayJobStatus(valve)}</td>
                    <td>{valve.cell ?? '—'}</td>
                    <td>{enteredAt ? formatWhen(enteredAt) : '—'}</td>
                    <td>{formatDurationSince(enteredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
