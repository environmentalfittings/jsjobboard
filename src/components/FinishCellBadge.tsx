import { finishCellTone } from '../constants/finishCellColors'

export function FinishCellBadge({ cell }: { cell: string | null | undefined }) {
  const value = String(cell ?? '').trim()
  if (!value) return <span className="job-muted">—</span>

  const tone = finishCellTone(value)
  if (!tone) {
    return <span className="finish-cell-badge finish-cell-badge--plain">{value}</span>
  }

  return (
    <span
      className="finish-cell-badge"
      style={{ background: tone.background, color: tone.color }}
      title={value}
    >
      {value}
    </span>
  )
}
