import { Link } from 'react-router-dom'
import {
  formatNeededPartNotes,
  formatNeededPartsSummary,
  jobNeededPartStatusLabel,
  type JobNeededPart,
} from '../lib/jobNeededParts'

type Props = {
  rows: JobNeededPart[]
  canEdit?: boolean
  showBoardLink?: boolean
  title?: string
  onAdd: () => void
  onRemove?: (id: string) => void
}

export function JobNeededPartsList({
  rows,
  canEdit = true,
  showBoardLink = true,
  title = 'Required parts',
  onAdd,
  onRemove,
}: Props) {
  return (
    <div className="needed-parts-list">
      <div className="needed-parts-list-hdr">
        <strong>{title}</strong>
        <span>{formatNeededPartsSummary(rows)}</span>
        {showBoardLink ? (
          <Link to="/needed-parts" className="needed-parts-list-board">
            Open needs parts
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="placeholder-copy">No parts listed yet. Add anything that purchasing should order.</p>
      ) : (
        <ul className="needed-parts-list-items">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.quantity}× {row.partName}
                </strong>
                <span>
                  {row.partNumber ? `#${row.partNumber}` : 'No part #'}
                  {row.supplier ? ` · ${row.supplier}` : ''}
                  {row.notes ? ` · ${formatNeededPartNotes(row.notes)}` : ''}
                  {row.poNumber ? ` · PO ${row.poNumber}` : ''}
                  {row.expectedDate ? ` · due ${row.expectedDate}` : ''}
                </span>
              </div>
              <span className={`needed-parts-status needed-parts-status--${row.status}`}>
                {jobNeededPartStatusLabel(row.status)}
              </span>
              {canEdit && row.status === 'needed' && onRemove ? (
                <button type="button" className="link-button-danger" onClick={() => onRemove(row.id)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <button type="button" className="button-secondary" onClick={onAdd}>
          + Add part
        </button>
      ) : null}
    </div>
  )
}
