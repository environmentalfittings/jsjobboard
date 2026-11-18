import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CollapsibleReportPanel } from './CollapsibleReportPanel'
import {
  daysOnTodoList,
  formatDaysOnTodoList,
  todoAgeTone,
  type DailyNote,
} from './DashboardNotesPanel'
import { printTableReport } from '../lib/reportChartsPrint'
import { supabase } from '../lib/supabase'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterNotesForCompany } from '../lib/companyDataScope'

const AGING_DAYS = 30

function formatNoteDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function noteAgeDays(note: DailyNote): number {
  if (note.is_done && note.completed_at && note.created_at) {
    const created = new Date(note.created_at)
    const completed = new Date(note.completed_at)
    if (!Number.isNaN(created.getTime()) && !Number.isNaN(completed.getTime())) {
      const start = new Date(created.getFullYear(), created.getMonth(), created.getDate())
      const end = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate())
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
    }
  }
  return daysOnTodoList(note.created_at, note.note_date)
}

function compareNotes(a: DailyNote, b: DailyNote): number {
  const ageDiff = noteAgeDays(b) - noteAgeDays(a)
  if (ageDiff !== 0) return ageDiff
  return (b.created_at || '').localeCompare(a.created_at || '')
}

type TodoSectionKey = 'current' | 'aging' | 'completed'

function printShopTodoReport(sections: Array<{ title: string; rows: DailyNote[] }>) {
  const rows = sections.flatMap((section) =>
    section.rows.map((row) => [
      section.title,
      row.body,
      row.assigned_to || 'Unassigned',
      row.created_by || '—',
      formatTimestamp(row.created_at) || formatNoteDate(row.note_date),
      formatDaysOnTodoList(noteAgeDays(row)),
      row.is_done ? formatTimestamp(row.completed_at) : 'Open',
    ]),
  )
  printTableReport({
    title: 'Shop To-Do List',
    subtitle: 'Current open tasks, items on the list 30+ days, and completed tasks.',
    columns: ['Section', 'Task', 'Assigned to', 'Added by', 'Added', 'Days on list', 'Status'],
    rows,
    orientation: 'landscape',
    frameId: 'shop-todo-report-print-frame',
  })
}

function TodoSectionTable({
  title,
  rows,
  loading,
  emptyMessage,
  showCompleted,
}: {
  title: string
  rows: DailyNote[]
  loading: boolean
  emptyMessage: string
  showCompleted?: boolean
}) {
  return (
    <div className="shop-todo-report-section">
      <div className="shop-todo-report-section-head">
        <h4>{title}</h4>
        <span className="shop-todo-report-count">{rows.length}</span>
      </div>
      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Assigned to</th>
              <th>Added by</th>
              <th>Added</th>
              <th>Days on list</th>
              {showCompleted ? <th>Completed</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={showCompleted ? 6 : 5}>Loading…</td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => {
                const days = noteAgeDays(row)
                return (
                  <tr key={row.id}>
                    <td className="table-cell-clamp">{row.body}</td>
                    <td>{row.assigned_to || 'Unassigned'}</td>
                    <td>{row.created_by || '—'}</td>
                    <td>{formatTimestamp(row.created_at) || formatNoteDate(row.note_date)}</td>
                    <td>
                      <span
                        className={`daily-note-age-badge daily-note-age-badge--${todoAgeTone(days)}`}
                      >
                        {formatDaysOnTodoList(days)}
                      </span>
                    </td>
                    {showCompleted ? <td>{formatTimestamp(row.completed_at)}</td> : null}
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={showCompleted ? 6 : 5}>{emptyMessage}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ShopTodoListReportPanel() {
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const [rows, setRows] = useState<DailyNote[]>([])
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [sectionFilter, setSectionFilter] = useState<'all' | TodoSectionKey>('all')

  const loadRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_notes')
      .select('*')
      .order('is_done', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      if (/daily_notes/i.test(error.message)) {
        setSetupRequired(true)
      }
      setRows([])
    } else {
      setSetupRequired(false)
      setRows(
        filterNotesForCompany((data as DailyNote[]) ?? [], {
          workflowKey: workflow.key,
          activeOrganization,
        }),
      )
    }
    setLoading(false)
  }, [workflow.key, activeOrganization])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const currentRows = useMemo(
    () =>
      rows
        .filter((row) => !row.is_done && noteAgeDays(row) <= AGING_DAYS)
        .sort(compareNotes),
    [rows],
  )

  const agingRows = useMemo(
    () =>
      rows
        .filter((row) => !row.is_done && noteAgeDays(row) > AGING_DAYS)
        .sort(compareNotes),
    [rows],
  )

  const completedRows = useMemo(
    () =>
      rows
        .filter((row) => row.is_done)
        .sort((a, b) => (b.completed_at || b.created_at || '').localeCompare(a.completed_at || a.created_at || '')),
    [rows],
  )

  const sections = useMemo(
    () => [
      {
        key: 'current' as const,
        title: 'Current',
        rows: currentRows,
        emptyMessage: 'No current open tasks (0–30 days).',
      },
      {
        key: 'aging' as const,
        title: 'On list 30+ days',
        rows: agingRows,
        emptyMessage: 'No open tasks older than 30 days.',
      },
      {
        key: 'completed' as const,
        title: 'Completed',
        rows: completedRows,
        emptyMessage: 'No completed tasks yet.',
        showCompleted: true,
      },
    ],
    [currentRows, agingRows, completedRows],
  )

  const visibleSections = useMemo(
    () => (sectionFilter === 'all' ? sections : sections.filter((section) => section.key === sectionFilter)),
    [sectionFilter, sections],
  )

  const exportCsv = () => {
    const header = ['Section', 'Task', 'Assigned to', 'Added by', 'Added', 'Days on list', 'Status', 'Completed']
    const lines = [
      header.join(','),
      ...visibleSections.flatMap((section) =>
        section.rows.map((row) =>
          [
            csvEscape(section.title),
            csvEscape(row.body),
            csvEscape(row.assigned_to || 'Unassigned'),
            csvEscape(row.created_by || ''),
            csvEscape(row.created_at || row.note_date || ''),
            csvEscape(formatDaysOnTodoList(noteAgeDays(row))),
            csvEscape(row.is_done ? 'Done' : 'Open'),
            csvEscape(row.completed_at || ''),
          ].join(','),
        ),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `shop-todo-list-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const visibleCount = visibleSections.reduce((sum, section) => sum + section.rows.length, 0)

  return (
    <CollapsibleReportPanel id="shop-todo-list" title="Shop To-Do List">
      <p className="placeholder-copy">
        Full shop to-do list: <strong>current</strong> open tasks (0–30 days), items still open after{' '}
        <strong>30+ days</strong>, and <strong>completed</strong> tasks.
      </p>
      {setupRequired ? (
        <p className="placeholder-copy">
          Run <code>supabase/migration-daily-notes.sql</code> in the Supabase SQL Editor, then reload this report.
        </p>
      ) : (
        <>
          <div className="report-filters">
            <label>
              Show
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value as 'all' | TodoSectionKey)}
              >
                <option value="all">
                  All sections ({currentRows.length + agingRows.length + completedRows.length})
                </option>
                <option value="current">Current ({currentRows.length})</option>
                <option value="aging">On list 30+ days ({agingRows.length})</option>
                <option value="completed">Completed ({completedRows.length})</option>
              </select>
            </label>
            <button type="button" className="button-primary" onClick={() => void loadRows()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="button-secondary" onClick={exportCsv} disabled={!visibleCount}>
              Export CSV
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() =>
                printShopTodoReport(visibleSections.map((section) => ({ title: section.title, rows: section.rows })))
              }
              disabled={!visibleCount}
            >
              Print
            </button>
            <Link className="button-secondary" to="/dashboard">
              Open to-do list
            </Link>
          </div>
          <p className="status-breakdown-note">
            Results: {visibleCount} task(s)
            {sectionFilter === 'all'
              ? ` · Current ${currentRows.length} · 30+ days ${agingRows.length} · Completed ${completedRows.length}`
              : ''}
          </p>
          <div className="shop-todo-report-sections">
            {visibleSections.map((section) => (
              <TodoSectionTable
                key={section.key}
                title={section.title}
                rows={section.rows}
                loading={loading}
                emptyMessage={section.emptyMessage}
                showCompleted={section.showCompleted}
              />
            ))}
          </div>
        </>
      )}
    </CollapsibleReportPanel>
  )
}
