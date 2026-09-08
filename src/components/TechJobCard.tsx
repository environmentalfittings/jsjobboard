import { JobTestBadges } from './JobTestBadges'
import { JobCardItpStatusBar } from './JobCardItpStatusBar'
import { STATUS_ORDER } from '../constants/statuses'
import type { ItpCardSummary } from '../lib/itpCardSummaries'
import type { Valve } from '../types'

interface TechJobCardProps {
  job: Valve
  readOnly?: boolean
  itpSummary?: ItpCardSummary | null
  onStatusChange?: (job: Valve, status: string) => void | Promise<void>
}

function isOverdue(raw: string | null): boolean {
  if (!raw) return false
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return raw < `${yyyy}-${mm}-${dd}`
}

export function TechJobCard({ job, readOnly = false, itpSummary, onStatusChange }: TechJobCardProps) {
  const inTesting = job.status === 'Testing'
  return (
    <article className={`dashboard-panel tech-job-card${inTesting ? ' tech-job-card-in-testing' : ''}`}>
      <JobCardItpStatusBar summary={itpSummary} href={`/itp/${job.id}`} />
      <h4>{job.valve_id}</h4>
      <JobTestBadges valve={job} className="tech-job-card-test-flags" />
      <p>
        <strong>Customer:</strong> {job.customer ?? '—'}
      </p>
      <p>
        <strong>Work cell:</strong> {job.cell ?? '—'}
      </p>
      <p>
        <strong>Description:</strong> {job.description ?? '—'}
      </p>
      <p>
        <strong>Due date:</strong>{' '}
        <span className={isOverdue(job.due_date) ? 'due-date-overdue' : 'due-date-ok'}>{job.due_date ?? '—'}</span>
      </p>
      {!readOnly ? (
        <label>
          Status
          <select
            value={job.status}
            onChange={(e) => {
              void onStatusChange?.(job, e.target.value)
            }}
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>
          <strong>Status:</strong> {job.status}
        </p>
      )}
    </article>
  )
}
