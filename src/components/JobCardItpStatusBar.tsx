import { Link } from 'react-router-dom'
import {
  formatItpCardStatus,
  itpCardBarTone,
  type ItpCardSummary,
} from '../lib/itpCardSummaries'

type JobCardItpStatusBarProps = {
  summary?: ItpCardSummary | null
  onOpen?: () => void
  href?: string
}

export function JobCardItpStatusBar({ summary, onOpen, href }: JobCardItpStatusBarProps) {
  const tone = itpCardBarTone(summary)
  const { pct, label, meta, title } = formatItpCardStatus(summary)
  const className = `job-card-itp-bar job-card-itp-bar--${tone}`

  const inner = (
    <>
      <div className="job-card-itp-bar-row">
        <span className="job-card-itp-bar-label">{label}</span>
        {meta ? <span className="job-card-itp-bar-meta">{meta}</span> : null}
      </div>
      <div className="job-card-itp-bar-track" aria-hidden>
        <div className="job-card-itp-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </>
  )

  if (onOpen) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={title}
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {inner}
      </button>
    )
  }

  if (href) {
    return (
      <Link
        to={href}
        className={className}
        title={title}
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div className={className} title={title}>
      {inner}
    </div>
  )
}
