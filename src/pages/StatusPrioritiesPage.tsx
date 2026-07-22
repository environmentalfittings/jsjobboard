import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { STATUS_ORDER } from '../constants/statuses'
import { calcActiveJobsByCell } from '../lib/dashboardMetrics'
import { openDailyPriorityReportPrint } from '../lib/dailyPriorityReportPrint'
import { displayJobStatus } from '../lib/jobDisplayStatus'
import { fetchAllValves } from '../lib/fetchAllValves'
import { canWriteShop } from '../lib/roles'
import {
  mergePriorityScopeOrder,
  orderValvesByPriorityScope,
  parsePriorityScopeKind,
  prunePriorityScopeQueue,
  savePriorityScopeOrder,
  scopeLabel,
  valvesForPriorityScope,
  type PriorityScope,
  type PriorityScopeKind,
} from '../lib/statusPriorityQueue'
import type { Valve } from '../types'

function formatDue(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function StatusPrioritiesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = parsePriorityScopeKind(searchParams.get('kind'))
  const keyParam = searchParams.get('key')?.trim() || searchParams.get('status')?.trim() || 'Teardown'
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const { showToast } = useToast()

  const [valves, setValves] = useState<Valve[]>([])
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const scope: PriorityScope = useMemo(() => {
    if (kind === 'status') {
      const match = STATUS_ORDER.find((s) => s.toLowerCase() === keyParam.toLowerCase())
      return { kind: 'status', key: match ?? keyParam }
    }
    return { kind: 'cell', key: keyParam }
  }, [kind, keyParam])

  const cellOptions = useMemo(() => calcActiveJobsByCell(valves, 40).map((row) => row.cell), [valves])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchAllValves()
    if (error) {
      showToast(`Could not load valves: ${error.message}`)
      setValves([])
      setOrderedIds([])
      setLoading(false)
      return
    }
    const all = data ?? []
    setValves(all)
    const inScope = valvesForPriorityScope(all, scope)
    try {
      const merged = await prunePriorityScopeQueue(scope, inScope)
      setOrderedIds(mergePriorityScopeOrder(merged, inScope))
    } catch {
      setOrderedIds(mergePriorityScopeOrder([], inScope))
    }
    setLoading(false)
  }, [scope, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    const inScope = valvesForPriorityScope(valves, scope)
    return orderValvesByPriorityScope(inScope, orderedIds)
  }, [valves, scope, orderedIds])

  const persistOrder = async (nextIds: string[]) => {
    setOrderedIds(nextIds)
    if (!canWrite) return
    setSaving(true)
    const { error } = await savePriorityScopeOrder(scope, nextIds)
    setSaving(false)
    if (error) {
      showToast(
        error.includes('status_priority_queue')
          ? 'Run migration-status-priority-queue.sql in Supabase'
          : `Could not save order: ${error}`,
      )
      void load()
    }
  }

  const move = async (valveId: string, direction: -1 | 1) => {
    const index = orderedIds.indexOf(valveId)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= orderedIds.length) return
    const next = [...orderedIds]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    await persistOrder(next)
  }

  const printReport = () => {
    try {
      openDailyPriorityReportPrint(
        [{ shopStatus: scopeLabel(scope), valves: rows, kind: scope.kind }],
        {
          title: `Daily Priority Report — ${scopeLabel(scope)}`,
          autoPrint: true,
        },
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open print preview')
    }
  }

  const setScopeParams = (nextKind: PriorityScopeKind, nextKey: string) => {
    setSearchParams({ kind: nextKind, key: nextKey }, { replace: true })
  }

  return (
    <section className="dashboard-page status-priorities-page">
      <div className="dashboard-header">
        <div>
          <p className="status-priorities-back">
            <Link to="/dashboard">← Dashboard</Link>
          </p>
          <h2 className="dashboard-title">{scopeLabel(scope)} — daily priorities</h2>
          <p className="placeholder-copy resources-hint">
            Prioritize by shop status or finish cell, then print a handout for that department’s leaders.
          </p>
        </div>
        <div className="status-priorities-actions">
          <label className="status-priorities-status-select">
            Department type
            <select
              value={scope.kind}
              onChange={(e) => {
                const nextKind = parsePriorityScopeKind(e.target.value)
                const nextKey =
                  nextKind === 'cell'
                    ? cellOptions[0] || scope.key
                    : STATUS_ORDER.includes(scope.key as (typeof STATUS_ORDER)[number])
                      ? scope.key
                      : 'Teardown'
                setScopeParams(nextKind, nextKey)
              }}
            >
              <option value="status">Shop status</option>
              <option value="cell">Finish cell</option>
            </select>
          </label>
          <label className="status-priorities-status-select">
            {scope.kind === 'cell' ? 'Finish cell' : 'Status'}
            <select value={scope.key} onChange={(e) => setScopeParams(scope.kind, e.target.value)}>
              {scope.kind === 'cell'
                ? (cellOptions.length ? cellOptions : [scope.key]).map((cell) => (
                    <option key={cell} value={cell}>
                      {cell}
                    </option>
                  ))
                : STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
            </select>
          </label>
          <button type="button" className="button-primary" onClick={printReport} disabled={loading}>
            Print daily report
          </button>
        </div>
      </div>

      <section className="dashboard-panel">
        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : (
          <>
            <div className="status-priorities-meta">
              <strong>{rows.length}</strong> active job{rows.length === 1 ? '' : 's'}
              {saving ? <span className="status-priorities-saving">Saving…</span> : null}
              {!canWrite ? (
                <span className="status-priorities-readonly">View only — ask an admin to reorder</span>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <p className="placeholder-copy">No open valves currently in {scopeLabel(scope)}.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table status-priorities-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>WO #</th>
                      <th>Customer</th>
                      <th>{scope.kind === 'cell' ? 'Status' : 'Cell'}</th>
                      <th>Due</th>
                      <th>Description</th>
                      {canWrite ? <th>Order</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((valve, index) => (
                      <tr key={valve.id}>
                        <td className="status-priorities-rank">{index + 1}</td>
                        <td>
                          <Link to={`/job-board?open=${valve.id}`}>{valve.valve_id}</Link>
                        </td>
                        <td>{valve.customer ?? '—'}</td>
                        <td>{scope.kind === 'cell' ? displayJobStatus(valve) : (valve.cell ?? '—')}</td>
                        <td>{formatDue(valve.due_date)}</td>
                        <td className="status-priorities-desc">{valve.description ?? '—'}</td>
                        {canWrite ? (
                          <td>
                            <div className="priority-move-buttons">
                              <button
                                type="button"
                                className="priority-arrow"
                                aria-label={`Move ${valve.valve_id} up`}
                                disabled={index === 0 || saving}
                                onClick={() => void move(valve.valve_id, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="priority-arrow"
                                aria-label={`Move ${valve.valve_id} down`}
                                disabled={index === rows.length - 1 || saving}
                                onClick={() => void move(valve.valve_id, 1)}
                              >
                                ↓
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  )
}
