import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { DailyNote } from './DashboardNotesPanel'

function formatNoteDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function railPerson(note: DailyNote): string {
  return (note.rail_added_by || note.created_by || '').trim()
}

function printRailReport(rows: DailyNote[]) {
  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return
  const body = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(railPerson(row) || '—')}</td>
        <td>${escapeHtml(row.body)}</td>
        <td>${escapeHtml(row.assigned_to || 'Unassigned')}</td>
        <td>${escapeHtml(formatNoteDate(row.estimated_completion_date))}</td>
      </tr>`,
    )
    .join('')
  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rail</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    p { color: #64748b; margin: 0 0 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #f1f5f9; }
  </style>
</head>
<body>
  <h1>Rail</h1>
  <p>5S items marked Add to Rail from the shop to-do list.</p>
  <table>
    <thead>
      <tr>
        <th>Person</th>
        <th>Task</th>
        <th>Person assigned</th>
        <th>Estimated completion</th>
      </tr>
    </thead>
    <tbody>${body || '<tr><td colspan="4">No rail items.</td></tr>'}</tbody>
  </table>
</body>
</html>`)
  win.document.close()
  win.focus()
  win.print()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function RailReportPanel() {
  const [rows, setRows] = useState<DailyNote[]>([])
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [includeCompleted, setIncludeCompleted] = useState(false)

  const loadRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_notes')
      .select('*')
      .eq('add_to_rail', true)
      .order('estimated_completion_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: false })

    if (error) {
      if (/add_to_rail|daily_notes/i.test(error.message)) {
        setSetupRequired(true)
      }
      setRows([])
    } else {
      setSetupRequired(false)
      setRows((data as DailyNote[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const visibleRows = useMemo(() => {
    const filtered = includeCompleted ? rows : rows.filter((row) => !row.is_done)
    return [...filtered].sort((a, b) => {
      const aDate = a.estimated_completion_date || '9999-12-31'
      const bDate = b.estimated_completion_date || '9999-12-31'
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      return (railPerson(a) || '').localeCompare(railPerson(b) || '')
    })
  }, [rows, includeCompleted])

  const exportCsv = () => {
    const header = ['Person', 'Task', 'Person assigned', 'Estimated completion', 'Status']
    const lines = [
      header.join(','),
      ...visibleRows.map((row) =>
        [
          csvEscape(railPerson(row) || ''),
          csvEscape(row.body),
          csvEscape(row.assigned_to || 'Unassigned'),
          csvEscape(row.estimated_completion_date || ''),
          csvEscape(row.is_done ? 'Done' : 'Open'),
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rail-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="dashboard-panel" id="rail">
      <div className="dashboard-panel-title-row">
        <h3>Rail</h3>
        <Link className="button-secondary" to="/dashboard">
          Open to-do list
        </Link>
      </div>
      <p className="placeholder-copy">
        Shop to-do items checked <strong>Add to Rail</strong>. Shows who added it, the task, who it is assigned to, and
        the estimated completion date.
      </p>
      {setupRequired ? (
        <p className="placeholder-copy">
          Run <code>supabase/migration-daily-notes-rail.sql</code> in the Supabase SQL Editor, then reload this report.
        </p>
      ) : (
        <>
          <div className="report-filters">
            <label>
              Show
              <select
                value={includeCompleted ? 'all' : 'open'}
                onChange={(e) => setIncludeCompleted(e.target.value === 'all')}
              >
                <option value="open">Open on rail ({rows.filter((row) => !row.is_done).length})</option>
                <option value="all">All on rail ({rows.length})</option>
              </select>
            </label>
            <button type="button" className="button-primary" onClick={() => void loadRows()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="button-secondary" onClick={exportCsv} disabled={!visibleRows.length}>
              Export CSV
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => printRailReport(visibleRows)}
              disabled={!visibleRows.length}
            >
              Print
            </button>
          </div>
          <p className="status-breakdown-note">Results: {visibleRows.length} rail item(s)</p>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Task</th>
                  <th>Person assigned</th>
                  <th>Estimated completion</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>Loading…</td>
                  </tr>
                ) : visibleRows.length ? (
                  visibleRows.map((row) => (
                    <tr key={row.id}>
                      <td>{railPerson(row) || '—'}</td>
                      <td className="table-cell-clamp">{row.body}</td>
                      <td>{row.assigned_to || 'Unassigned'}</td>
                      <td>{formatNoteDate(row.estimated_completion_date)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No items on the rail yet. Check Add to Rail on a shop to-do.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
