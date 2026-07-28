import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import { saveItpLibraryPlan } from '../lib/itpLibraryStorage'
import { notifyFlaggerItpResolution } from '../lib/messages'
import {
  collectFlaggedItemsFromItps,
  isQualityTeamMember,
  loadActiveQualityTeamItps,
  loadCurrentUserQualityTeamLevel,
  qualityTeamMembersFromEmployees,
  qualityTeamFlagOwnersFromEmployees,
  type QualityTeamFlaggedItem,
  type QualityTeamItpRow,
} from '../lib/qualityTeam'
import { hasAdminAccess } from '../lib/roles'
import {
  QUALITY_TEAM_LEVEL_OPTIONS,
  qualityTeamLevelLabel,
  type Employee,
  type QualityTeamLevel,
} from '../types/employees'
import { getExec, type ItpLibraryPlanPayload, type ItpQcReviewStatus } from '../types/itpLibraryPlan'

type StatusFilter = 'all' | ItpQcReviewStatus
type FlagFilter = 'open' | 'resolved' | 'all'

function formatWhen(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function flagOwnerDraftEmployeeId(item: QualityTeamFlaggedItem, members: Employee[]): string {
  if (item.flagOwnerEmployeeId) {
    const byId = members.find((m) => m.id === item.flagOwnerEmployeeId)
    if (byId) return byId.id
  }
  if (item.flagOwnerUserId) {
    const byAuth = members.find((m) => m.auth_user_id === item.flagOwnerUserId)
    if (byAuth) return byAuth.id
  }
  if (item.flagOwnerName) {
    const byName = members.find((m) => m.full_name === item.flagOwnerName)
    if (byName) return byName.id
  }
  return ''
}

export function QualityTeamPage() {
  const { showToast } = useToast()
  const { user, username, role } = useAuth()
  const { employees, error: employeesError, loading: employeesLoading, reload: reloadEmployees } =
    useEmployees()
  const [rows, setRows] = useState<QualityTeamItpRow[]>([])
  const [qualityTeamLevel, setQualityTeamLevel] = useState<QualityTeamLevel>('none')
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [cellFilter, setCellFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<QualityTeamLevel | 'all'>('all')
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('open')
  const [draftOwners, setDraftOwners] = useState<Record<string, string>>({})
  const [draftResolutions, setDraftResolutions] = useState<Record<string, string>>({})

  // Same roster source as Admin → Employees (Coy / Colten levels show up there).
  const members = useMemo(() => qualityTeamMembersFromEmployees(employees), [employees])
  const flagOwners = useMemo(() => qualityTeamFlagOwnersFromEmployees(employees), [employees])

  const reload = useCallback(async () => {
    setLoading(true)
    const [itpResult] = await Promise.all([loadActiveQualityTeamItps(), reloadEmployees()])
    if (itpResult.error) showToast(itpResult.error)
    setRows(itpResult.rows)
    setLoading(false)
  }, [reloadEmployees, showToast])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const itpResult = await loadActiveQualityTeamItps()
      if (cancelled) return
      if (itpResult.error) showToast(itpResult.error)
      setRows(itpResult.rows)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // Mount-only; Refresh uses reload().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!employeesError) return
    showToast(employeesError)
  }, [employeesError, showToast])

  useEffect(() => {
    const flagged = collectFlaggedItemsFromItps(rows)
    setDraftOwners((prev) => {
      const next: Record<string, string> = {}
      let changed = false
      for (const item of flagged) {
        const value = flagOwnerDraftEmployeeId(item, flagOwners)
        next[item.key] = value
        if (prev[item.key] !== value) changed = true
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev
      return next
    })
  }, [rows, flagOwners])

  useEffect(() => {
    const flagged = collectFlaggedItemsFromItps(rows)
    setDraftResolutions((prev) => {
      const next: Record<string, string> = {}
      let changed = false
      for (const item of flagged) {
        next[item.key] = item.flagResolution
        if (prev[item.key] !== item.flagResolution) changed = true
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev
      return next
    })
  }, [rows])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!user?.id) {
        setQualityTeamLevel('none')
        return
      }
      const level = await loadCurrentUserQualityTeamLevel({
        userId: user.id,
        username,
      })
      if (cancelled) return
      setQualityTeamLevel(level)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, username])

  const canManageFlags = isQualityTeamMember(qualityTeamLevel) || hasAdminAccess(role)

  const cellOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      const cell = row.cell?.trim()
      if (cell) set.add(cell)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const pendingRows = useMemo(
    () => rows.filter((row) => row.status === 'pending_review'),
    [rows],
  )

  const flaggedItems = useMemo(() => collectFlaggedItemsFromItps(rows), [rows])

  const filteredFlags = useMemo(() => {
    return flaggedItems.filter((item) => {
      if (flagFilter === 'open' && item.isResolved) return false
      if (flagFilter === 'resolved' && !item.isResolved) return false
      return true
    })
  }, [flaggedItems, flagFilter])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (cellFilter && (row.cell ?? '') !== cellFilter) return false
      if (!q) return true
      const haystack = [
        row.valveId,
        row.customer,
        row.cell,
        row.jobType,
        row.statusLabel,
        row.acceptedByName,
        row.generatedByName,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, search, statusFilter, cellFilter])

  const filteredMembers = useMemo(() => {
    if (levelFilter === 'all') return members
    return members.filter((m) => m.quality_team_level === levelFilter)
  }, [members, levelFilter])

  const saveFlagTicket = async (
    item: QualityTeamFlaggedItem,
    options: { ownerEmployeeId: string; resolution: string; issueResolution: boolean },
  ) => {
    if (!canManageFlags) {
      showToast('Only Quality Team members can update flag tickets')
      return
    }
    if (!user?.id) {
      showToast('Sign in required')
      return
    }

    const owner =
      options.ownerEmployeeId.trim() === ''
        ? null
        : flagOwners.find((m) => m.id === options.ownerEmployeeId) ?? null
    if (options.ownerEmployeeId && !owner) {
      showToast('Owner must be Quality Team Admin, Manager, or Supervisor')
      return
    }

    const resolution = options.resolution.trim()
    if (options.issueResolution && !resolution) {
      showToast('Enter a resolution before issuing it')
      return
    }

    const current = getExec(item.plan, item.itemId)
    const now = new Date().toISOString()
    const nextExec = options.issueResolution
      ? {
          ...current,
          flagOwnerEmployeeId: owner?.id ?? null,
          flagOwnerUserId: owner?.auth_user_id ?? null,
          flagOwnerName: owner?.full_name ?? null,
          flagResolution: resolution,
          flagResolvedAt: now,
          flagResolvedByUserId: user.id,
          flagResolvedByName: username || 'Quality Team',
        }
      : {
          ...current,
          flagOwnerEmployeeId: owner?.id ?? null,
          flagOwnerUserId: owner?.auth_user_id ?? null,
          flagOwnerName: owner?.full_name ?? null,
        }

    const nextPlan: ItpLibraryPlanPayload = {
      ...item.plan,
      exec: {
        ...item.plan.exec,
        [item.itemId]: nextExec,
      },
    }

    setSavingKey(item.key)
    try {
      const saved = await saveItpLibraryPlan(item.valve, nextPlan)
      setRows((prev) =>
        prev.map((row) =>
          row.valveRowId === item.valveRowId
            ? {
                ...row,
                plan: saved.plan,
                updatedAt: saved.plan.updatedAt,
              }
            : row,
        ),
      )

      if (options.issueResolution && resolution && item.flaggedByUserId) {
        const notifyError = await notifyFlaggerItpResolution({
          valveRowId: item.valveRowId,
          valveId: item.valveId,
          itemName: item.itemName,
          flagReason: item.flagReason,
          resolution,
          ownerName: owner?.full_name || username || 'Quality Team',
          recipientUserId: item.flaggedByUserId,
          senderUserId: user.id,
          senderName: username || 'Quality Team',
        })
        if (notifyError) {
          showToast(`Resolution saved, but notify failed: ${notifyError}`)
        } else if (item.flaggedByUserId === user.id) {
          showToast('Resolution saved — notification added to your Messages')
        } else {
          showToast('Resolution saved on ITP and flagger notified')
        }
        window.dispatchEvent(new Event('jsjb-inbox-refresh'))
      } else if (options.issueResolution && resolution && !item.flaggedByUserId) {
        showToast('Resolution saved on ITP (no flagger login on file to notify)')
      } else if (options.issueResolution) {
        showToast('Resolution saved on ITP')
      } else {
        showToast('Flag owner updated')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update flag ticket')
    } finally {
      setSavingKey(null)
    }
  }

  const reopenFlagTicket = async (item: QualityTeamFlaggedItem) => {
    if (!canManageFlags) {
      showToast('Only Quality Team members can reopen flag tickets')
      return
    }
    if (!user?.id) {
      showToast('Sign in required')
      return
    }
    if (
      !window.confirm(
        'Reopen this flagged issue? The resolution will be cleared and it will appear under Open again.',
      )
    ) {
      return
    }

    const current = getExec(item.plan, item.itemId)
    const nextPlan: ItpLibraryPlanPayload = {
      ...item.plan,
      exec: {
        ...item.plan.exec,
        [item.itemId]: {
          ...current,
          flagResolution: '',
          flagResolvedAt: null,
          flagResolvedByUserId: null,
          flagResolvedByName: null,
        },
      },
    }

    setSavingKey(item.key)
    try {
      const saved = await saveItpLibraryPlan(item.valve, nextPlan)
      setRows((prev) =>
        prev.map((row) =>
          row.valveRowId === item.valveRowId
            ? {
                ...row,
                plan: saved.plan,
                updatedAt: saved.plan.updatedAt,
              }
            : row,
        ),
      )
      setDraftResolutions((prev) => ({ ...prev, [item.key]: '' }))
      showToast('Issue reopened')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not reopen flag ticket')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <section className="dashboard-page quality-team-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Quality Team</h2>
        <button type="button" className="button-secondary" disabled={loading} onClick={() => void reload()}>
          Refresh
        </button>
      </div>
      <p className="placeholder-copy">
        Review ITPs, work flagged checklist tickets, browse active ITPs, and see who is on the Quality Team.
      </p>

      <section className="dashboard-panel">
        <div className="dashboard-title-row">
          <h3>Flagged items (QA/QC)</h3>
          <label className="quality-team-level-filter">
            Show
            <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value as FlagFilter)}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>
        {!canManageFlags ? (
          <p className="placeholder-copy resources-hint">
            Assign yourself a Quality Team level on Employees to own tickets and issue resolutions
            (shop Admins can also manage these).
          </p>
        ) : null}
        {loading || employeesLoading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : filteredFlags.length === 0 ? (
          <p className="placeholder-copy">
            {flagFilter === 'open' ? 'No open flagged items.' : 'No flagged items match this filter.'}
          </p>
        ) : (
          <div className="quality-team-flag-list">
            {flagOwners.length === 0 && canManageFlags ? (
              <p className="placeholder-copy resources-hint">
                No eligible owners yet. On{' '}
                <Link to="/admin/employees">Employees</Link>, set Quality Team to Admin, Manager, or
                Supervisor (Technicians cannot own flag tickets).
              </p>
            ) : null}
            {filteredFlags.map((item) => {
              const busy = savingKey === item.key
              return (
                <article
                  key={item.key}
                  className={`quality-team-flag-card${item.isResolved ? ' is-resolved' : ''}`}
                >
                  <div className="quality-team-flag-card-top">
                    <div>
                      <h4>{item.itemName}</h4>
                      <p className="quality-team-flag-meta">
                        {item.valveId}
                        {item.customer ? ` · ${item.customer}` : ''}
                        {item.cell ? ` · ${item.cell}` : ''}
                        {' · '}
                        Flagged by {item.flaggedByName || '—'} · {formatWhen(item.flaggedAt)}
                      </p>
                    </div>
                    <Link className="link-button" to={`/itp/${item.valveRowId}`}>
                      Open ITP
                    </Link>
                  </div>

                  <div className="quality-team-flag-problem">
                    <strong>Problem</strong>
                    <p>{item.flagReason}</p>
                    {item.flagPhotos.length > 0 ? (
                      <div className="itp-library-flag-photo-row">
                        {item.flagPhotos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="itp-library-flag-photo-thumb"
                          >
                            <img src={photo.url} alt={photo.fileName} />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="quality-team-flag-fields">
                    {item.isResolved ? (
                      <>
                        <div>
                          <strong className="quality-team-flag-readonly-label">Quality Team owner</strong>
                          <p className="quality-team-flag-readonly-value">
                            {item.flagOwnerName || 'Unassigned'}
                          </p>
                        </div>
                        <div>
                          <strong className="quality-team-flag-readonly-label">Resolution</strong>
                          <p className="quality-team-flag-readonly-value">
                            {item.flagResolution || '—'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <label>
                          Quality Team owner
                          <select
                            value={draftOwners[item.key] ?? ''}
                            disabled={!canManageFlags || busy}
                            onChange={(e) =>
                              setDraftOwners((prev) => ({ ...prev, [item.key]: e.target.value }))
                            }
                          >
                            <option value="">Unassigned</option>
                            {flagOwners.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.full_name} ({qualityTeamLevelLabel(m.quality_team_level)})
                              </option>
                            ))}
                          </select>
                          {!employeesLoading && flagOwners.length === 0 ? (
                            <span className="resources-hint">
                              Owners must be Admin, Manager, or Supervisor — set on{' '}
                              <Link to="/admin/employees">Employees</Link>.
                            </span>
                          ) : null}
                        </label>
                        <label>
                          Resolution
                          <textarea
                            rows={3}
                            value={draftResolutions[item.key] ?? ''}
                            disabled={!canManageFlags || busy}
                            placeholder="QC resolution / disposition…"
                            onChange={(e) =>
                              setDraftResolutions((prev) => ({ ...prev, [item.key]: e.target.value }))
                            }
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {item.isResolved ? (
                    <p className="quality-team-flag-resolved-note">
                      Resolved {formatWhen(item.flagResolvedAt)}
                      {item.flagResolvedByName ? ` by ${item.flagResolvedByName}` : ''}
                      {item.flagOwnerName ? ` · Owner ${item.flagOwnerName}` : ''}
                    </p>
                  ) : null}

                  {canManageFlags && !item.isResolved ? (
                    <div className="quality-team-flag-actions">
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() =>
                          void saveFlagTicket(item, {
                            ownerEmployeeId: draftOwners[item.key] ?? '',
                            resolution: draftResolutions[item.key] ?? '',
                            issueResolution: false,
                          })
                        }
                      >
                        {busy ? 'Saving…' : 'Save owner'}
                      </button>
                      <button
                        type="button"
                        className="button-primary"
                        disabled={busy}
                        onClick={() =>
                          void saveFlagTicket(item, {
                            ownerEmployeeId: draftOwners[item.key] ?? '',
                            resolution: draftResolutions[item.key] ?? '',
                            issueResolution: true,
                          })
                        }
                      >
                        {busy ? 'Saving…' : 'Save resolution & notify flagger'}
                      </button>
                    </div>
                  ) : null}

                  {canManageFlags && item.isResolved ? (
                    <div className="quality-team-flag-actions">
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => void reopenFlagTicket(item)}
                      >
                        {busy ? 'Saving…' : 'Reopen issue'}
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <h3>Needs review</h3>
        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : pendingRows.length === 0 ? (
          <p className="placeholder-copy">No ITPs are waiting for Quality Team review.</p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Valve</th>
                  <th>Customer</th>
                  <th>Cell</th>
                  <th>Items</th>
                  <th>Revisions</th>
                  <th>Generated</th>
                  <th>Generated by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((row) => (
                  <tr key={`pending-${row.valveRowId}`}>
                    <td>{row.valveId}</td>
                    <td>{row.customer ?? '—'}</td>
                    <td>{row.cell ?? '—'}</td>
                    <td>{row.itemCount}</td>
                    <td>{row.revisionCount > 0 ? row.revisionCount : '—'}</td>
                    <td>{formatWhen(row.generatedAt)}</td>
                    <td>{row.generatedByName || '—'}</td>
                    <td>
                      <Link className="link-button" to={`/itp/${row.valveRowId}`}>
                        Open ITP
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <h3>Active ITPs</h3>
        <div className="quality-team-filters">
          <label>
            Search
            <input
              type="search"
              value={search}
              placeholder="Valve, customer, cell…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            QC status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="pending_review">Pending review</option>
              <option value="accepted">Accepted</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <label>
            Cell
            <select value={cellFilter} onChange={(e) => setCellFilter(e.target.value)}>
              <option value="">All cells</option>
              {cellOptions.map((cell) => (
                <option key={cell} value={cell}>
                  {cell}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="placeholder-copy">No active ITPs match these filters.</p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Valve</th>
                  <th>Customer</th>
                  <th>Cell</th>
                  <th>Job type</th>
                  <th>QC status</th>
                  <th>Items</th>
                  <th>Revisions</th>
                  <th>Generated</th>
                  <th>Generated by</th>
                  <th>Accepted</th>
                  <th>Accepted by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.valveRowId}>
                    <td>{row.valveId}</td>
                    <td>{row.customer ?? '—'}</td>
                    <td>{row.cell ?? '—'}</td>
                    <td>{row.jobType ?? '—'}</td>
                    <td>{row.statusLabel}</td>
                    <td>{row.itemCount}</td>
                    <td>{row.revisionCount > 0 ? row.revisionCount : '—'}</td>
                    <td>{formatWhen(row.generatedAt)}</td>
                    <td>{row.generatedByName || '—'}</td>
                    <td>{formatWhen(row.acceptedAt)}</td>
                    <td>
                      {row.acceptedByName
                        ? `${row.acceptedByName}${row.acceptedByLevelLabel ? ` (${row.acceptedByLevelLabel})` : ''}`
                        : '—'}
                    </td>
                    <td>
                      <Link className="link-button" to={`/itp/${row.valveRowId}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="dashboard-title-row">
          <h3>Quality Team roster</h3>
          <label className="quality-team-level-filter">
            Level
            <select
              value={levelFilter}
              onChange={(e) =>
                setLevelFilter(e.target.value === 'all' ? 'all' : (e.target.value as QualityTeamLevel))
              }
            >
              <option value="all">All levels</option>
              {QUALITY_TEAM_LEVEL_OPTIONS.filter((opt) => opt.value !== 'none').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading || employeesLoading ? (
          <p className="placeholder-copy">Loading…</p>
        ) : filteredMembers.length === 0 ? (
          <p className="placeholder-copy">
            No Quality Team members yet. Assign levels on the Employees page.
          </p>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Initials</th>
                  <th>Level</th>
                  <th>Login</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td>{member.full_name}</td>
                    <td>
                      <code>{member.username}</code>
                    </td>
                    <td>{member.initials}</td>
                    <td>{qualityTeamLevelLabel(member.quality_team_level)}</td>
                    <td>{member.auth_user_id ? 'Yes' : 'No account'}</td>
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
