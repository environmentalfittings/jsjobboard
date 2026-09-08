import type { Valve } from '../types'

function formatShortDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || null
  const [, month, day] = value.split('-')
  return `${month}/${day}`
}

/** Pre-tested / Final tested / In testing badges for job cards and list rows. */
export function JobTestBadges({
  valve,
  className = 'job-card-test-flags',
}: {
  valve: Pick<Valve, 'status' | 'date_tested' | 'date_pre_tested'>
  className?: string
}) {
  const isInTesting = valve.status === 'Testing'
  const preLabel = formatShortDate(valve.date_pre_tested)
  const finalLabel = formatShortDate(valve.date_tested)
  if (!isInTesting && !preLabel && !finalLabel) return null

  return (
    <div className={className}>
      {isInTesting ? (
        <span className="job-card-testing-badge" title="Currently in the test area">
          In testing
        </span>
      ) : null}
      {preLabel ? (
        <span
          className="job-card-tested-badge job-card-pretested-badge"
          title={`Pre-tested: ${valve.date_pre_tested}`}
        >
          Pre-tested {preLabel}
        </span>
      ) : null}
      {finalLabel ? (
        <span
          className="job-card-tested-badge job-card-finaltested-badge"
          title={`Final tested: ${valve.date_tested}`}
        >
          Final tested {finalLabel}
        </span>
      ) : null}
    </div>
  )
}

export function valveHasTestBadge(valve: Pick<Valve, 'status' | 'date_tested' | 'date_pre_tested'>): boolean {
  return (
    valve.status === 'Testing' ||
    Boolean(String(valve.date_pre_tested ?? '').trim()) ||
    Boolean(String(valve.date_tested ?? '').trim())
  )
}
