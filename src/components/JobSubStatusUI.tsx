import { JOB_SUB_STATUSES, type JobSubStatus, jobSubStatusIndex, normalizeJobSubStatus } from '../constants/jobSubStatuses'

function subStatusBadgeClass(status: JobSubStatus): string {
  const toneByStatus: Record<string, string> = {
    Received: 'received',
    Disassembly: 'disassembly',
    Inspection: 'inspection',
    Machining: 'machining',
    Reassembly: 'reassembly',
    Testing: 'testing',
    'Ready to Ship': 'ready',
  }
  return `sub-status-badge sub-status-badge--${toneByStatus[status] ?? 'received'}`
}

export function SubStatusBadge({ status }: { status: JobSubStatus }) {
  return <span className={subStatusBadgeClass(status)}>{status}</span>
}

export function JobSubStatusSelect({
  value,
  onChange,
  disabled,
  id,
  compact,
  options,
}: {
  value: JobSubStatus
  onChange: (next: JobSubStatus) => void
  disabled?: boolean
  id?: string
  compact?: boolean
  options?: readonly string[]
}) {
  const stageOptions = options && options.length > 0 ? options : JOB_SUB_STATUSES
  return (
    <select
      id={id}
      className={compact ? 'job-sub-status-select job-sub-status-select--compact' : 'job-sub-status-select'}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(normalizeJobSubStatus(e.target.value))}
    >
      {stageOptions.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}

export function SubStatusStepper({ current }: { current: JobSubStatus }) {
  const curIdx = jobSubStatusIndex(current)
  return (
    <div className="sub-status-stepper" aria-label="Sub-status progress">
      <ol className="sub-status-stepper-track">
        {JOB_SUB_STATUSES.map((label, i) => {
          const done = i < curIdx
          const active = i === curIdx
          return (
            <li
              key={label}
              className={`sub-status-step${done ? ' sub-status-step--done' : ''}${active ? ' sub-status-step--current' : ''}`}
            >
              <span className="sub-status-step-dot" aria-hidden />
              <span className="sub-status-step-label">{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
