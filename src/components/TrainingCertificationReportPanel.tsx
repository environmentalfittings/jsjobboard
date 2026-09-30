import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { filterTrainingsForCompany } from '../lib/companyDataScope'
import {
  daysUntilTrainingExpiration,
  formatTrainingDate,
  isTrainingExpired,
  listAllAttendeeTrainings,
  listEmployeeTrainings,
  trainingExpirationStatusLabel,
  trainingRecertIntervalLabel,
  trainingStatusLabel,
  type EmployeeTraining,
  type EmployeeTrainingAttendee,
} from '../lib/employeeTraining'
import { printTableReport } from '../lib/reportChartsPrint'
import { useEmployees } from '../hooks/useEmployees'

type WindowFilter = 'overdue' | '30' | '60' | '90' | '180' | 'all' | 'current'

type ReportRow = {
  attendeeId: number
  employeeName: string
  training: EmployeeTraining
  expires: string | null
  daysUntil: number | null
}

export function TrainingCertificationReportPanel() {
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const { employees } = useEmployees()
  const companyScope = useMemo(
    () => ({ workflowKey: workflow.key, activeOrganization }),
    [workflow.key, activeOrganization],
  )

  const [attendeeRows, setAttendeeRows] = useState<
    Array<EmployeeTrainingAttendee & { training?: EmployeeTraining | null }>
  >([])
  const [trainings, setTrainings] = useState<EmployeeTraining[]>([])
  const [loading, setLoading] = useState(true)
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('90')
  const [search, setSearch] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [attendees, trainingList] = await Promise.all([
        listAllAttendeeTrainings(),
        listEmployeeTrainings(),
      ])
      const scopedTrainings = filterTrainingsForCompany(trainingList, companyScope)
      const allowedIds = new Set(scopedTrainings.map((t) => t.id))
      setTrainings(scopedTrainings)
      setAttendeeRows(
        attendees.filter((row) => {
          const training = row.training
          if (!training) return false
          return allowedIds.has(training.id)
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load training report'
      showToast(
        /employee_training|does not exist|schema cache/i.test(message)
          ? 'Run employee training migrations in Supabase, then refresh'
          : message,
      )
      setAttendeeRows([])
      setTrainings([])
    } finally {
      setLoading(false)
    }
  }, [companyScope, showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const employee of employees) {
      map.set(employee.id, employee.full_name)
    }
    return map
  }, [employees])

  const reportRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const windowDays =
      windowFilter === 'overdue' || windowFilter === 'all' || windowFilter === 'current'
        ? null
        : Number(windowFilter)

    const rows: ReportRow[] = []
    for (const row of attendeeRows) {
      const training = row.training
      if (!training || training.status === 'cancelled') continue
      const expires = training.recert_due_date ?? null
      const daysUntil = daysUntilTrainingExpiration(expires)

      if (windowFilter === 'overdue') {
        if (daysUntil == null || daysUntil >= 0) continue
      } else if (windowFilter === 'current') {
        // Active certifications: completed with no due date, or due date still valid.
        if (training.status !== 'completed' && training.status !== 'in_progress') continue
        if (daysUntil != null && daysUntil < 0) continue
      } else if (windowFilter !== 'all') {
        if (!expires || daysUntil == null) continue
        if (daysUntil < 0 || (windowDays != null && daysUntil > windowDays)) continue
      }

      const employeeName =
        row.employee_name?.trim() ||
        (row.employee_id ? employeeNameById.get(row.employee_id) : null) ||
        '—'

      if (
        q &&
        !employeeName.toLowerCase().includes(q) &&
        !training.title.toLowerCase().includes(q) &&
        !training.record_no.toLowerCase().includes(q) &&
        !(training.departments || '').toLowerCase().includes(q)
      ) {
        continue
      }

      rows.push({
        attendeeId: row.id,
        employeeName,
        training,
        expires,
        daysUntil,
      })
    }

    rows.sort((a, b) => {
      if (a.daysUntil == null && b.daysUntil == null) {
        return a.employeeName.localeCompare(b.employeeName)
      }
      if (a.daysUntil == null) return 1
      if (b.daysUntil == null) return -1
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
      return a.employeeName.localeCompare(b.employeeName)
    })
    return rows
  }, [attendeeRows, employeeNameById, search, windowFilter])

  const summary = useMemo(() => {
    let overdue = 0
    let due30 = 0
    let due90 = 0
    let current = 0
    for (const row of attendeeRows) {
      const training = row.training
      if (!training || training.status === 'cancelled') continue
      const daysUntil = daysUntilTrainingExpiration(training.recert_due_date)
      if (daysUntil != null && daysUntil < 0) overdue += 1
      if (daysUntil != null && daysUntil >= 0 && daysUntil <= 30) due30 += 1
      if (daysUntil != null && daysUntil >= 0 && daysUntil <= 90) due90 += 1
      if (
        (training.status === 'completed' || training.status === 'in_progress') &&
        (daysUntil == null || daysUntil >= 0)
      ) {
        current += 1
      }
    }
    return { overdue, due30, due90, current, sessions: trainings.length }
  }, [attendeeRows, trainings.length])

  const exportCsv = () => {
    const header = [
      'Employee',
      'TR#',
      'Training',
      'Departments',
      'Status',
      'Completed',
      'Recert interval',
      'Expires',
      'Status detail',
    ]
    const lines = reportRows.map((row) =>
      [
        row.employeeName,
        row.training.record_no,
        row.training.title,
        row.training.departments ?? '',
        trainingStatusLabel(row.training.status),
        row.training.completed_date ?? '',
        trainingRecertIntervalLabel(row.training.recert_interval),
        row.expires ?? '',
        trainingExpirationStatusLabel(row.daysUntil),
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training-certification-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    const companyName = activeOrganization?.name?.trim() || (workflow.key === 'vsi' ? 'VSI' : 'JS Valve')
    const { error } = printTableReport({
      title: 'Training & certification report',
      subtitle: `${companyName} · filter: ${windowFilter === 'current' ? 'Current certifications' : windowFilter === 'all' ? 'All with attendees' : windowFilter === 'overdue' ? 'Overdue' : `Due within ${windowFilter} days`}`,
      columns: [
        'Employee',
        'TR#',
        'Training',
        'Status',
        'Completed',
        'Interval',
        'Expires',
        'Detail',
      ],
      rows: reportRows.map((row) => [
        row.employeeName,
        row.training.record_no,
        row.training.title,
        trainingStatusLabel(row.training.status),
        formatTrainingDate(row.training.completed_date),
        trainingRecertIntervalLabel(row.training.recert_interval),
        formatTrainingDate(row.expires),
        trainingExpirationStatusLabel(row.daysUntil),
      ]),
      summaryLines: [
        `Sessions on file: ${summary.sessions}`,
        `Current certifications: ${summary.current}`,
        `Overdue: ${summary.overdue} · Due in 30 days: ${summary.due30} · Due in 90 days: ${summary.due90}`,
        `Rows printed: ${reportRows.length}`,
      ],
    })
    if (error) showToast(error)
  }

  return (
    <section className="dashboard-panel" id="training-certification">
      <div className="dashboard-panel-title-row">
        <h3>Training &amp; certification</h3>
        <Link className="button-secondary" to="/resources">
          Open Resources
        </Link>
      </div>
      <p className="placeholder-copy">
        Attendee certifications and recert due dates for the active company. Print or export for audits and
        upcoming renewals.
      </p>

      <div className="report-summary-bar">
        <div>
          <span>Sessions</span>
          <strong>{summary.sessions}</strong>
        </div>
        <div>
          <span>Current</span>
          <strong>{summary.current}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong className={summary.overdue > 0 ? 'otd-compare-tone otd-compare-tone--down' : undefined}>
            {summary.overdue}
          </strong>
        </div>
        <div>
          <span>Due ≤ 30 days</span>
          <strong>{summary.due30}</strong>
        </div>
        <div>
          <span>Due ≤ 90 days</span>
          <strong>{summary.due90}</strong>
        </div>
      </div>

      <div className="report-filters">
        <label>
          Show
          <select value={windowFilter} onChange={(e) => setWindowFilter(e.target.value as WindowFilter)}>
            <option value="current">Current certifications</option>
            <option value="overdue">Overdue</option>
            <option value="30">Due within 30 days</option>
            <option value="60">Due within 60 days</option>
            <option value="90">Due within 90 days</option>
            <option value="180">Due within 180 days</option>
            <option value="all">All with attendees</option>
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Employee, TR#, training…"
          />
        </label>
        <button type="button" className="button-secondary" onClick={() => void reload()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button type="button" className="button-secondary" onClick={exportCsv} disabled={!reportRows.length}>
          Export CSV
        </button>
        <button type="button" className="button-primary" onClick={printReport} disabled={!reportRows.length}>
          Print report
        </button>
      </div>

      <p className="status-breakdown-note">
        {loading ? 'Loading…' : `${reportRows.length} row${reportRows.length === 1 ? '' : 's'}`}
      </p>

      <div className="dashboard-table-wrap">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>TR#</th>
              <th>Training</th>
              <th>Status</th>
              <th>Completed</th>
              <th>Interval</th>
              <th>Expires</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>Loading…</td>
              </tr>
            ) : reportRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="job-muted">
                  No training / certification rows match this filter.
                </td>
              </tr>
            ) : (
              reportRows.map((row) => (
                <tr key={row.attendeeId} className={isTrainingExpired(row.expires) ? 'training-expired-row' : undefined}>
                  <td>{row.employeeName}</td>
                  <td>{row.training.record_no}</td>
                  <td>{row.training.title}</td>
                  <td>{trainingStatusLabel(row.training.status)}</td>
                  <td>{formatTrainingDate(row.training.completed_date)}</td>
                  <td>{trainingRecertIntervalLabel(row.training.recert_interval)}</td>
                  <td className={isTrainingExpired(row.expires) ? 'training-expired' : undefined}>
                    {formatTrainingDate(row.expires)}
                  </td>
                  <td>{trainingExpirationStatusLabel(row.daysUntil)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
