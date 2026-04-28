import {
  DONE_STATUSES,
  INCOMING_STATUSES,
  IN_SHOP_STATUSES,
  TESTING_STATUSES,
  WAITING_STATUSES,
} from '../constants/statuses'

export function StatusBadge({ status }: { status: string }) {
  let tone = 'default'
  if (INCOMING_STATUSES.has(status)) tone = 'incoming'
  else if (IN_SHOP_STATUSES.has(status)) tone = 'in-shop'
  else if (TESTING_STATUSES.has(status)) tone = 'testing'
  else if (WAITING_STATUSES.has(status)) tone = 'waiting'
  else if (DONE_STATUSES.has(status)) tone = 'done'

  return <span className={`status-badge ${tone}`}>{status}</span>
}
