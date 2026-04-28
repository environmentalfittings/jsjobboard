import type { Technician, Valve } from '../types'
import { StatusBadge } from './StatusBadge'

interface TeamJobsTableProps {
  jobs: Valve[]
  techById: Map<number, Technician>
  onReassign: (job: Valve) => void
}

export function TeamJobsTable({ jobs, techById, onReassign }: TeamJobsTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Job #</th>
            <th>Customer</th>
            <th>Work Cell</th>
            <th>Assigned To</th>
            <th>Status</th>
            <th>Due Date</th>
            <th>Assigned By</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{job.valve_id}</td>
              <td>{job.customer ?? '—'}</td>
              <td>{job.cell ?? '—'}</td>
              <td>{job.assigned_technician_id ? techById.get(job.assigned_technician_id)?.name ?? '—' : '—'}</td>
              <td>
                <StatusBadge status={job.status} />
              </td>
              <td>{job.due_date ?? '—'}</td>
              <td>{job.assigned_by ? techById.get(job.assigned_by)?.name ?? '—' : '—'}</td>
              <td>
                <button type="button" className="button-secondary admin-list-btn" onClick={() => onReassign(job)}>
                  Reassign
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
