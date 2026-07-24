import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { FINISH_CELLS } from '../constants/jobLookups'
import {
  PRIORITY_DEPARTMENTS,
  parsePriorityDepartmentIds,
  statusesForDepartments,
  type PriorityDepartmentId,
} from '../constants/priorityDepartments'
import { openDailyPriorityReportPrint } from '../lib/dailyPriorityReportPrint'
import {
  filterClosedYesterday,
  loadYesterdayStatusMoves,
  localYesterdayDateString,
  type YesterdayClosedJob,
  type YesterdayStatusMove,
} from '../lib/dailyPriorityYesterday'
import { displayJobStatus } from '../lib/jobDisplayStatus'
import { fetchAllValves } from '../lib/fetchAllValves'
import {
  loadJobTechnicianIdsByValveRowId,
  replaceJobTechnicians,
} from '../lib/jobTechnicianAssignments'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { canWriteShop } from '../lib/roles'
import { parseAssignedTechnicianIds } from '../lib/valveTechnicianIds'
import {
  buildHandoutScopeKey,
  finishCellsForDepartments,
  handoutScopeLabel,
  loadHandoutAssignments,
  mergeHandoutAssignments,
  orderValvesByPriorityScope,
  saveHandoutAssignments,
  valvesForHandoutFilters,
  type HandoutAssignment,
} from '../lib/statusPriorityQueue'
import { supabase } from '../lib/supabase'
import type { Technician, Valve } from '../types'
import { TechnicianTypeahead } from './TechnicianTypeahead'

function formatDue(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function toggleId<T extends string | number>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

type DailyPriorityWorksheetProps = {
  /** Initial departments from URL, comma-separated. */
  initialDepartments?: string | null
  /** Initial finish cells from URL, comma-separated. */
  initialCells?: string | null
  showBackLink?: boolean
}

export function DailyPriorityWorksheet({
  initialDepartments,
  initialCells,
  showBackLink = false,
}: DailyPriorityWorksheetProps) {
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const { showToast } = useToast()

  const [departmentIds, setDepartmentIds] = useState<PriorityDepartmentId[]>(() =>
    parsePriorityDepartmentIds(initialDepartments),
  )
  const [selectedCells, setSelectedCells] = useState<string[]>(() =>
    (initialCells ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  )

  const [valves, setValves] = useState<Valve[]>([])
  const [assignments, setAssignments] = useState<HandoutAssignment[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [finishCellLookups, setFinishCellLookups] = useState<string[]>([...FINISH_CELLS])
  const [technicianFilterIds, setTechnicianFilterIds] = useState<number[]>([])
  const [filterUnassigned, setFilterUnassigned] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [yesterdayClosed, setYesterdayClosed] = useState<YesterdayClosedJob[]>([])
  const [yesterdayMoves, setYesterdayMoves] = useState<YesterdayStatusMove[]>([])
  const yesterdayLabel = useMemo(() => localYesterdayDateString(), [])

  const scope = useMemo(
    () => buildHandoutScopeKey(departmentIds, selectedCells),
    [departmentIds, selectedCells],
  )
  const title = handoutScopeLabel(scope.key)
  const defaultStatuses = useMemo(() => statusesForDepartments(departmentIds), [departmentIds])
  const cellOptions = useMemo(() => {
    const fromJobs = finishCellsForDepartments(valves, departmentIds)
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const cell of [...finishCellLookups, ...fromJobs]) {
      const key = cell.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      ordered.push(key)
    }
    return ordered
  }, [valves, departmentIds, finishCellLookups])
  const allDepartmentsSelected =
    PRIORITY_DEPARTMENTS.length > 0 &&
    PRIORITY_DEPARTMENTS.every((dept) => departmentIds.includes(dept.id))
  const allCellsSelected =
    cellOptions.length > 0 && cellOptions.every((cell) => selectedCells.includes(cell))
  const techFilterActive = technicianFilterIds.length > 0 || filterUnassigned
  const techById = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians])
  const activeTechs = useMemo(
    () => technicians.filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name)),
    [technicians],
  )

  const matchesTechnicianFilter = useCallback(
    (assignedIds: number[]) => {
      if (!techFilterActive) return true
      if (filterUnassigned && assignedIds.length === 0) return true
      return assignedIds.some((id) => technicianFilterIds.includes(id))
    },
    [techFilterActive, filterUnassigned, technicianFilterIds],
  )

  /** Full catalog fetch — only on mount / Refresh, not on every filter click. */
  const refreshCatalog = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, techRes, lookupMap] = await Promise.all([
      fetchAllValves(),
      supabase
        .from('technicians')
        .select('id,name,employee_id,work_cell_specialties,group_team,active,created_at,updated_at')
        .order('name'),
      loadLookupOptionsMap(),
    ])
    if (error) {
      showToast(`Could not load valves: ${error.message}`)
      setValves([])
      setAssignments([])
      setYesterdayClosed([])
      setYesterdayMoves([])
      setLoading(false)
      return
    }
    if (!techRes.error && techRes.data) setTechnicians(techRes.data as Technician[])
    if (lookupMap.finish_cell?.length) setFinishCellLookups(lookupMap.finish_cell)
    setValves(data ?? [])
    setLoading(false)
  }, [showToast])

  /** Apply department/cell scope using valves already in memory. */
  const applyScope = useCallback(
    async (allValves: Valve[]) => {
      const inScope = valvesForHandoutFilters(allValves, departmentIds, selectedCells)
      setYesterdayClosed(filterClosedYesterday(allValves, departmentIds))
      const byWo = new Map(allValves.map((v) => [v.valve_id, v]))
      const { moves, error: movesError } = await loadYesterdayStatusMoves(departmentIds, byWo)
      if (movesError) {
        showToast(
          movesError.includes('permission') || movesError.includes('policy')
            ? 'Run migration-valve-change-log-authenticated-read.sql in Supabase for yesterday moves'
            : `Could not load yesterday moves: ${movesError}`,
        )
        setYesterdayMoves([])
      } else {
        setYesterdayMoves(moves)
      }

      const jobTechByRowId = await loadJobTechnicianIdsByValveRowId(inScope.map((v) => v.id))
      const mergeWithJobTechs = (rows: HandoutAssignment[]) =>
        rows.map((row) => {
          const valve = inScope.find((v) => v.valve_id === row.valve_id)
          if (!valve) return row
          const fromJob =
            jobTechByRowId[valve.id] ?? parseAssignedTechnicianIds(valve.assigned_technician_ids)
          return {
            ...row,
            assigned_technician_ids: fromJob.length ? fromJob : row.assigned_technician_ids,
          }
        })

      try {
        const saved = await loadHandoutAssignments(scope)
        setAssignments(mergeWithJobTechs(mergeHandoutAssignments(saved, inScope)))
      } catch {
        setAssignments(mergeWithJobTechs(mergeHandoutAssignments([], inScope)))
      }
    },
    [departmentIds, selectedCells, scope, showToast],
  )

  useEffect(() => {
    void refreshCatalog()
  }, [refreshCatalog])

  useEffect(() => {
    if (loading && valves.length === 0) return
    void applyScope(valves)
  }, [valves, applyScope, loading])

  const rows = useMemo(() => {
    const inScope = valvesForHandoutFilters(valves, departmentIds, selectedCells)
    const ordered = orderValvesByPriorityScope(
      inScope,
      assignments.map((row) => row.valve_id),
    )
    const byId = new Map(assignments.map((row) => [row.valve_id, row]))
    return ordered
      .map((valve) => ({
        valve,
        assignment: byId.get(valve.valve_id) ?? {
          valve_id: valve.valve_id,
          assigned_technician_ids: [],
          handout_notes: '',
        },
      }))
      .filter(({ assignment }) => matchesTechnicianFilter(assignment.assigned_technician_ids))
  }, [valves, departmentIds, selectedCells, assignments, matchesTechnicianFilter])

  const persist = async (next: HandoutAssignment[]) => {
    setAssignments(next)
    if (!canWrite) return
    setSaving(true)
    const { error } = await saveHandoutAssignments(scope, next)
    setSaving(false)
    if (error) {
      showToast(
        error.includes('assigned_technician_ids') ||
          error.includes('assigned_technician_id') ||
          error.includes('handout_notes')
          ? 'Run migration-status-priority-multi-technicians.sql in Supabase'
          : error.includes('scope_kind')
            ? 'Run migration-status-priority-departments.sql in Supabase'
            : `Could not save: ${error}`,
      )
      void applyScope(valves)
    }
  }

  const move = async (valveId: string, direction: -1 | 1) => {
    const visibleIds = rows.map(({ valve }) => valve.valve_id)
    const index = visibleIds.indexOf(valveId)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= visibleIds.length) return
    const nextVisible = [...visibleIds]
    const [item] = nextVisible.splice(index, 1)
    nextVisible.splice(target, 0, item)

    const byId = new Map(assignments.map((row) => [row.valve_id, row]))
    const fullIds = assignments.map((row) => row.valve_id)
    const visibleSet = new Set(nextVisible)
    const queue = [...nextVisible]
    const mergedIds = fullIds
      .map((id) => (visibleSet.has(id) ? queue.shift()! : id))
      .concat(queue.filter((id) => !fullIds.includes(id)))
    await persist(mergedIds.map((id) => byId.get(id)!))
  }

  const patchRow = async (
    valveId: string,
    patch: Partial<Pick<HandoutAssignment, 'assigned_technician_ids' | 'handout_notes'>>,
  ) => {
    const next = assignments.map((row) => (row.valve_id === valveId ? { ...row, ...patch } : row))
    if (patch.assigned_technician_ids) {
      const valve = valves.find((v) => v.valve_id === valveId)
      if (valve) {
        const { error } = await replaceJobTechnicians(valve.id, patch.assigned_technician_ids)
        if (error) {
          showToast(
            error.includes('job_assignment_history')
              ? 'Run migration-fix-job-assignment-history-rls.sql in Supabase, then try again'
              : `Could not update job card technicians: ${error}`,
          )
          return
        }
      }
    }
    await persist(next)
  }

  const printReport = () => {
    try {
      openDailyPriorityReportPrint(
        [
          {
            shopStatus: title,
            valves: rows.map((row) => row.valve),
            kind: 'status',
            assignments: Object.fromEntries(
              rows.map(({ valve, assignment }) => [
                valve.valve_id,
                {
                  technicianName: assignment.assigned_technician_ids
                    .map((id) => techById.get(id)?.name)
                    .filter(Boolean)
                    .join(', '),
                  notes: assignment.handout_notes,
                },
              ]),
            ),
          },
        ],
        {
          title: `Daily Priority Report — ${title}`,
          autoPrint: true,
          yesterday: {
            label: yesterdayLabel,
            closed: yesterdayClosed,
            moves: yesterdayMoves,
          },
        },
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open print preview')
    }
  }

  return (
    <section className="dashboard-page status-priorities-page">
      <div className="dashboard-header">
        <div>
          {showBackLink ? (
            <p className="status-priorities-back">
              <Link to="/dashboard">← Dashboard</Link>
            </p>
          ) : null}
          <h2 className="dashboard-title">Daily priorities</h2>
          <p className="placeholder-copy resources-hint">
            Pick one or more departments and finish cells. Clear departments to include all.
            Technician assignments update the job card across the app; notes stay on this handout.
          </p>
        </div>
        <div className="status-priorities-actions">
          <button type="button" className="button-primary" onClick={printReport} disabled={loading}>
            Print daily report
          </button>
          <button type="button" onClick={() => void refreshCatalog()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="dashboard-panel">
        <div className="daily-priority-filter-grid">
          <fieldset className="daily-priority-multiselect">
            <legend>Departments</legend>
            <p className="daily-priority-filter-hint">
              {departmentIds.length
                ? `Selected statuses: ${defaultStatuses.join(', ') || '—'}`
                : 'None selected = all departments'}
            </p>
            <label className="daily-priority-check daily-priority-check-all">
              <input
                type="checkbox"
                checked={allDepartmentsSelected}
                onChange={() => {
                  if (allDepartmentsSelected) {
                    setDepartmentIds([])
                  } else {
                    setDepartmentIds(PRIORITY_DEPARTMENTS.map((dept) => dept.id))
                  }
                }}
              />
              <span>Select all departments</span>
            </label>
            <div className="daily-priority-check-list">
              {PRIORITY_DEPARTMENTS.map((dept) => (
                <label key={dept.id} className="daily-priority-check">
                  <input
                    type="checkbox"
                    checked={departmentIds.includes(dept.id)}
                    onChange={() => {
                      setDepartmentIds(toggleId(departmentIds, dept.id))
                    }}
                  />
                  <span>{dept.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="daily-priority-multiselect">
            <legend>Finish cells</legend>
            <p className="daily-priority-filter-hint">
              None selected = all cells in the chosen departments
            </p>
            {cellOptions.length > 0 ? (
              <label className="daily-priority-check daily-priority-check-all">
                <input
                  type="checkbox"
                  checked={allCellsSelected}
                  onChange={() => {
                    setSelectedCells(allCellsSelected ? [] : [...cellOptions])
                  }}
                />
                <span>Select all finish cells</span>
              </label>
            ) : null}
            <div className="daily-priority-check-list">
              {cellOptions.length === 0 ? (
                <span className="placeholder-copy">No cells for this selection</span>
              ) : (
                cellOptions.map((cell) => (
                  <label key={cell} className="daily-priority-check">
                    <input
                      type="checkbox"
                      checked={selectedCells.includes(cell)}
                      onChange={() => setSelectedCells(toggleId(selectedCells, cell))}
                    />
                    <span>{cell}</span>
                  </label>
                ))
              )}
            </div>
            {selectedCells.length ? (
              <button
                type="button"
                className="button-secondary daily-priority-clear-cells"
                onClick={() => setSelectedCells([])}
              >
                Clear cell filter (all cells)
              </button>
            ) : null}
          </fieldset>

          <fieldset className="daily-priority-multiselect daily-priority-tech-filter">
            <legend>Assigned technician</legend>
            <p className="daily-priority-filter-hint">
              Leave empty for all jobs. Type to add one or more technicians.
            </p>
            <TechnicianTypeahead
              technicians={activeTechs}
              value={technicianFilterIds}
              placeholder="Filter by technician…"
              onChange={setTechnicianFilterIds}
            />
            <label className="daily-priority-check daily-priority-unassigned-filter">
              <input
                type="checkbox"
                checked={filterUnassigned}
                onChange={() => setFilterUnassigned((prev) => !prev)}
              />
              <span>Include unassigned</span>
            </label>
            {techFilterActive ? (
              <button
                type="button"
                className="button-secondary daily-priority-clear-cells"
                onClick={() => {
                  setTechnicianFilterIds([])
                  setFilterUnassigned(false)
                }}
              >
                Clear technician filter
              </button>
            ) : null}
          </fieldset>
        </div>
      </section>

      <section className="dashboard-panel">
        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : (
          <>
            <div className="status-priorities-meta">
              <strong>{rows.length}</strong> job{rows.length === 1 ? '' : 's'}
              {techFilterActive ? (
                <span className="status-priorities-readonly">filtered by technician</span>
              ) : null}
              <span className="status-priorities-readonly">{title}</span>
              {saving ? <span className="status-priorities-saving">Saving…</span> : null}
              {!canWrite ? (
                <span className="status-priorities-readonly">View only — ask an admin to edit</span>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <p className="placeholder-copy">No open valves for this filter.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table status-priorities-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>WO #</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Cell</th>
                      <th>Size</th>
                      <th>Pressure</th>
                      <th>Due</th>
                      <th>Description</th>
                      <th>Technician</th>
                      <th>Notes</th>
                      {canWrite ? <th>Order</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ valve, assignment }, index) => (
                      <tr key={valve.id}>
                        <td className="status-priorities-rank">{index + 1}</td>
                        <td>
                          <Link to={`/job-board?open=${valve.id}`}>{valve.valve_id}</Link>
                        </td>
                        <td>{valve.customer ?? '—'}</td>
                        <td>{displayJobStatus(valve)}</td>
                        <td>{valve.cell ?? '—'}</td>
                        <td>{valve.size ?? '—'}</td>
                        <td>{valve.pressure_class ?? '—'}</td>
                        <td>{formatDue(valve.due_date)}</td>
                        <td className="status-priorities-desc">{valve.description ?? '—'}</td>
                        <td>
                          {canWrite ? (
                            <TechnicianTypeahead
                              technicians={activeTechs}
                              value={assignment.assigned_technician_ids}
                              disabled={saving}
                              onChange={(technicianIds) => {
                                void patchRow(valve.valve_id, {
                                  assigned_technician_ids: technicianIds,
                                })
                              }}
                            />
                          ) : (
                            assignment.assigned_technician_ids
                              .map((id) => techById.get(id)?.name)
                              .filter(Boolean)
                              .join(', ') || '—'
                          )}
                        </td>
                        <td>
                          {canWrite ? (
                            <input
                              className="daily-priority-notes-input"
                              type="text"
                              value={assignment.handout_notes}
                              disabled={saving}
                              placeholder="Morning notes…"
                              onChange={(e) => {
                                const handout_notes = e.target.value
                                setAssignments((prev) =>
                                  prev.map((row) =>
                                    row.valve_id === valve.valve_id ? { ...row, handout_notes } : row,
                                  ),
                                )
                              }}
                              onBlur={(e) => {
                                void patchRow(valve.valve_id, { handout_notes: e.target.value })
                              }}
                            />
                          ) : (
                            assignment.handout_notes || '—'
                          )}
                        </td>
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

      {!loading ? (
        <section className="dashboard-panel daily-priority-yesterday">
          <h3>Yesterday — completed ({yesterdayLabel})</h3>
          <p className="placeholder-copy resources-hint">
            Jobs closed yesterday in the selected departments.
          </p>
          {yesterdayClosed.length === 0 ? (
            <p className="placeholder-copy">None</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>WO #</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {yesterdayClosed.map((row) => (
                    <tr key={`closed-${row.valve_id}`}>
                      <td>{row.valve_id}</td>
                      <td>{row.customer ?? '—'}</td>
                      <td>{row.status ?? '—'}</td>
                      <td>{row.date_closed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="daily-priority-yesterday-sub">
            Yesterday — status moves ({yesterdayLabel})
          </h3>
          <p className="placeholder-copy resources-hint">
            Status changes yesterday where from or to status is in the selected departments.
          </p>
          {yesterdayMoves.length === 0 ? (
            <p className="placeholder-copy">None</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>WO #</th>
                    <th>Customer</th>
                    <th>From → To</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {yesterdayMoves.map((row, index) => (
                    <tr key={`move-${row.valve_id}-${row.changedAt}-${index}`}>
                      <td>{row.valve_id}</td>
                      <td>{row.customer ?? '—'}</td>
                      <td>
                        {row.fromStatus} → {row.toStatus}
                      </td>
                      <td>
                        {(() => {
                          const parsed = new Date(row.changedAt)
                          return Number.isNaN(parsed.getTime())
                            ? row.changedAt
                            : parsed.toLocaleString()
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </section>
  )
}
