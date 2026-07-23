import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import {
  PRIORITY_DEPARTMENTS,
  parsePriorityDepartmentIds,
  statusesForDepartments,
  type PriorityDepartmentId,
} from '../constants/priorityDepartments'
import { openDailyPriorityReportPrint } from '../lib/dailyPriorityReportPrint'
import { displayJobStatus } from '../lib/jobDisplayStatus'
import { fetchAllValves } from '../lib/fetchAllValves'
import { canWriteShop } from '../lib/roles'
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

function toggleId<T extends string>(list: T[], id: T): T[] {
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const scope = useMemo(
    () => buildHandoutScopeKey(departmentIds, selectedCells),
    [departmentIds, selectedCells],
  )
  const title = handoutScopeLabel(scope.key)
  const defaultStatuses = useMemo(() => statusesForDepartments(departmentIds), [departmentIds])
  const cellOptions = useMemo(
    () => finishCellsForDepartments(valves, departmentIds),
    [valves, departmentIds],
  )
  const techById = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians])
  const activeTechs = useMemo(
    () => technicians.filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name)),
    [technicians],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, techRes] = await Promise.all([
      fetchAllValves(),
      supabase
        .from('technicians')
        .select('id,name,employee_id,work_cell_specialties,group_team,active,created_at,updated_at')
        .order('name'),
    ])
    if (error) {
      showToast(`Could not load valves: ${error.message}`)
      setValves([])
      setAssignments([])
      setLoading(false)
      return
    }
    if (!techRes.error && techRes.data) setTechnicians(techRes.data as Technician[])
    const all = data ?? []
    setValves(all)
    const inScope = valvesForHandoutFilters(all, departmentIds, selectedCells)
    try {
      const saved = await loadHandoutAssignments(scope)
      setAssignments(mergeHandoutAssignments(saved, inScope))
    } catch {
      setAssignments(mergeHandoutAssignments([], inScope))
    }
    setLoading(false)
  }, [departmentIds, selectedCells, scope, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    const inScope = valvesForHandoutFilters(valves, departmentIds, selectedCells)
    const ordered = orderValvesByPriorityScope(
      inScope,
      assignments.map((row) => row.valve_id),
    )
    const byId = new Map(assignments.map((row) => [row.valve_id, row]))
    return ordered.map((valve) => ({
      valve,
      assignment: byId.get(valve.valve_id) ?? {
        valve_id: valve.valve_id,
        assigned_technician_id: null,
        handout_notes: '',
      },
    }))
  }, [valves, departmentIds, selectedCells, assignments])

  const persist = async (next: HandoutAssignment[]) => {
    setAssignments(next)
    if (!canWrite) return
    setSaving(true)
    const { error } = await saveHandoutAssignments(scope, next)
    setSaving(false)
    if (error) {
      showToast(
        error.includes('assigned_technician_id') || error.includes('handout_notes')
          ? 'Run migration-status-priority-handout-fields.sql in Supabase'
          : error.includes('scope_kind')
            ? 'Run migration-status-priority-departments.sql in Supabase'
            : `Could not save: ${error}`,
      )
      void load()
    }
  }

  const move = async (valveId: string, direction: -1 | 1) => {
    const ids = assignments.map((row) => row.valve_id)
    const index = ids.indexOf(valveId)
    if (index < 0) return
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    const nextIds = [...ids]
    const [item] = nextIds.splice(index, 1)
    nextIds.splice(target, 0, item)
    const byId = new Map(assignments.map((row) => [row.valve_id, row]))
    await persist(nextIds.map((id) => byId.get(id)!))
  }

  const patchRow = async (
    valveId: string,
    patch: Partial<Pick<HandoutAssignment, 'assigned_technician_id' | 'handout_notes'>>,
  ) => {
    const next = assignments.map((row) => (row.valve_id === valveId ? { ...row, ...patch } : row))
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
                  technicianName: assignment.assigned_technician_id
                    ? (techById.get(assignment.assigned_technician_id)?.name ?? null)
                    : null,
                  notes: assignment.handout_notes,
                },
              ]),
            ),
          },
        ],
        {
          title: `Daily Priority Report — ${title}`,
          autoPrint: true,
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
            Department presets load by default — select one or more departments and finish cells.
            Assign a technician and notes for the morning handout (does not change the job card).
          </p>
        </div>
        <div className="status-priorities-actions">
          <button type="button" className="button-primary" onClick={printReport} disabled={loading}>
            Print daily report
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="dashboard-panel">
        <div className="daily-priority-filter-grid">
          <fieldset className="daily-priority-multiselect">
            <legend>Departments</legend>
            <p className="daily-priority-filter-hint">
              Defaults: {defaultStatuses.join(', ') || '—'}
            </p>
            <div className="daily-priority-check-list">
              {PRIORITY_DEPARTMENTS.map((dept) => (
                <label key={dept.id} className="daily-priority-check">
                  <input
                    type="checkbox"
                    checked={departmentIds.includes(dept.id)}
                    onChange={() => {
                      const next = toggleId(departmentIds, dept.id)
                      setDepartmentIds(next.length ? next : [dept.id])
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
        </div>
      </section>

      <section className="dashboard-panel">
        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : (
          <>
            <div className="status-priorities-meta">
              <strong>{rows.length}</strong> active job{rows.length === 1 ? '' : 's'}
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
                        <td>{formatDue(valve.due_date)}</td>
                        <td className="status-priorities-desc">{valve.description ?? '—'}</td>
                        <td>
                          {canWrite ? (
                            <TechnicianTypeahead
                              technicians={activeTechs}
                              value={assignment.assigned_technician_id}
                              disabled={saving}
                              onChange={(technicianId) => {
                                void patchRow(valve.valve_id, {
                                  assigned_technician_id: technicianId,
                                })
                              }}
                            />
                          ) : (
                            (assignment.assigned_technician_id
                              ? techById.get(assignment.assigned_technician_id)?.name
                              : null) ?? '—'
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
    </section>
  )
}
