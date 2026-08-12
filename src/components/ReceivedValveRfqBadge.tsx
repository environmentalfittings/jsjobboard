export function formatRfqSentAt(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

type Props = {
  sentToRfqAt: string | null | undefined
  /** When false, show "—" instead of "Not sent" for compact tables. */
  showPendingLabel?: boolean
}

export function ReceivedValveRfqBadge({ sentToRfqAt, showPendingLabel = true }: Props) {
  const sentLabel = formatRfqSentAt(sentToRfqAt)

  if (sentToRfqAt) {
    return (
      <span
        className="received-valves-rfq-badge received-valves-rfq-badge--sent"
        title={sentLabel ? `Sent to RFQ ${sentLabel}` : 'Sent to RFQ'}
      >
        Sent to RFQ
        {sentLabel ? <span className="received-valves-rfq-badge-date">{sentLabel}</span> : null}
      </span>
    )
  }

  if (!showPendingLabel) {
    return <span className="received-valves-rfq-empty">—</span>
  }

  return <span className="received-valves-rfq-badge received-valves-rfq-badge--pending">Not sent</span>
}
