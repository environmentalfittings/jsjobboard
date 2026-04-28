import type { Valve } from '../types'

interface TechJobCardProps {
  job: Valve
  readOnly?: boolean
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

export function TechJobCard({ job, readOnly = false, onStatusChange }: TechJobCardProps) {
  return (
    <article className="dashboard-panel">
      <h4>{job.valve_id}</h4>
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
            value={job.sub_status ?? 'Received'}
            onChange={(e) => {
              void onStatusChange?.(job, e.target.value)
            }}
          >
            <option>Received</option>
            <option>Disassembly</option>
            <option>Inspection</option>
            <option>Machining</option>
            <option>Reassembly</option>
            <option>Testing</option>
            <option>Ready to Ship</option>
          </select>
        </label>
      ) : null}
      <p>
        <strong>Current status:</strong> {job.status}
      </p>
    </article>
  )
}
