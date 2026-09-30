import { useId, useState, type ReactNode } from 'react'

type CollapsibleReportPanelProps = {
  id?: string
  title: ReactNode
  /** Extra controls pinned in the header (always visible). Prefer putting actions in children. */
  headerActions?: ReactNode
  /** Collapsed by default unless true. */
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

export function CollapsibleReportPanel({
  id,
  title,
  headerActions,
  defaultOpen = false,
  className,
  children,
}: CollapsibleReportPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <section
      id={id}
      className={['dashboard-panel', 'report-collapsible', open ? 'is-open' : 'is-collapsed', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="report-collapse-header">
        <button
          type="button"
          className="report-collapse-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((prev) => !prev)}
          title={open ? 'Collapse report' : 'Expand report'}
        >
          <span aria-hidden="true">{open ? '−' : '+'}</span>
          <span className="sr-only">{open ? 'Collapse' : 'Expand'}</span>
        </button>
        <button
          type="button"
          className="report-collapse-title"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <h3>{title}</h3>
        </button>
        {headerActions ? <div className="report-collapse-actions">{headerActions}</div> : null}
      </div>
      {open ? (
        <div className="report-collapse-body" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
