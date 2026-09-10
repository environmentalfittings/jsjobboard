import { Link } from 'react-router-dom'
import type {
  ItpTravelerReportItem,
  ItpTravelerReportSection,
  ItpTravelerReportStats,
} from '../lib/itpTravelerReport'
import {
  collectTravelerPhotos,
  formatItpTravelerCaptureSummary,
} from '../lib/itpTravelerReport'

export type ItpTravelerHeaderMeta = {
  valveId: string
  customer: string | null
  valveType: string | null
  size: string | null
  pressureClass: string | null
  jobType?: string | null
  cell?: string | null
  material?: string | null
  description?: string | null
  dueDate?: string | null
  status?: string | null
  poNumber?: string | null
  manufacturer?: string | null
  templateName?: string | null
}

type ItpTravelerReportPanelProps = {
  meta: ItpTravelerHeaderMeta
  backToItpHref: string
  shopFormHref: string | null
  sections: ItpTravelerReportSection[]
  stats: ItpTravelerReportStats
  onOpenStep: (itemId: string) => void
  saving?: boolean
}

function StatusPill({ status }: { status: ItpTravelerReportItem['status'] }) {
  const label =
    status === 'complete'
      ? 'Complete'
      : status === 'flagged'
        ? 'Flagged'
        : status === 'hold'
          ? 'Hold'
          : 'Pending'
  return <span className={`itp-traveler-status-pill itp-traveler-status-pill--${status}`}>{label}</span>
}

function metaValue(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}

function WorkStepRow({
  item,
  onOpen,
}: {
  item: ItpTravelerReportItem
  onOpen: () => void
}) {
  return (
    <li className={`itp-traveler-work-row itp-traveler-work-row--${item.status}`}>
      <div className="itp-traveler-work-row-main">
        <div className="itp-traveler-work-row-titles">
          <strong>{item.name}</strong>
          <span className="itp-traveler-work-row-meta">
            [{item.ref}]
            {item.shopAreaLabel ? ` · ${item.shopAreaLabel}` : ''}
            {item.holdPoint ? ' · Hold point' : ''}
          </span>
        </div>
        <div className="itp-traveler-work-row-badges">
          <StatusPill status={item.status} />
          {item.requirePicture ? <span className="itp-library-attr-badge photo">Photo</span> : null}
          {item.requireMeasurement ? <span className="itp-library-attr-badge meas">Meas</span> : null}
          {item.result ? <span className="itp-traveler-result-chip">{item.result}</span> : null}
        </div>
        {item.notes || item.techInitials ? (
          <p className="itp-traveler-work-row-notes">
            {item.techInitials ? <strong>{item.techInitials}</strong> : null}
            {item.techInitials && item.notes ? ' · ' : null}
            {item.notes || null}
          </p>
        ) : null}
      </div>
      <button type="button" className="button-secondary itp-traveler-open-step-btn" onClick={onOpen}>
        Open
      </button>
    </li>
  )
}

function PrintStepBlock({ item }: { item: ItpTravelerReportItem }) {
  return (
    <article className="itp-traveler-print-step">
      <header className="itp-traveler-print-step-hdr">
        <h4>{item.name}</h4>
        <span className="itp-traveler-print-step-ref">[{item.ref}]</span>
      </header>
      <div className="itp-traveler-print-fields">
        {item.result ? (
          <div className="itp-traveler-print-field">
            <span className="itp-traveler-print-label">Result</span>
            <span className="itp-traveler-print-value">{item.result}</span>
          </div>
        ) : null}
        {item.techInitials ? (
          <div className="itp-traveler-print-field">
            <span className="itp-traveler-print-label">Tech initials</span>
            <span className="itp-traveler-print-value">{item.techInitials}</span>
          </div>
        ) : null}
        {item.shopAreaLabel ? (
          <div className="itp-traveler-print-field">
            <span className="itp-traveler-print-label">Station</span>
            <span className="itp-traveler-print-value">{item.shopAreaLabel}</span>
          </div>
        ) : null}
        <div className="itp-traveler-print-field">
          <span className="itp-traveler-print-label">Status</span>
          <span className="itp-traveler-print-value">
            {item.status === 'complete'
              ? 'Complete'
              : item.status === 'hold'
                ? 'Hold pending'
                : item.status === 'flagged'
                  ? 'Flagged'
                  : 'Pending'}
          </span>
        </div>
        {item.fields.map((field) => (
          <div key={field.id} className="itp-traveler-print-field">
            <span className="itp-traveler-print-label">{field.label}</span>
            {field.type === 'picture' ? (
              <span className="itp-traveler-print-value">
                {field.photos && field.photos.length > 0
                  ? `${field.photos.length} photo${field.photos.length === 1 ? '' : 's'}`
                  : '—'}
              </span>
            ) : (
              <span className={`itp-traveler-print-value${field.value ? '' : ' is-empty'}`}>
                {field.value || '—'}
              </span>
            )}
          </div>
        ))}
        {item.fields.some((field) => field.type === 'picture' && (field.photos?.length ?? 0) > 0) ? (
          <div className="itp-traveler-print-step-photos">
            {item.fields.flatMap((field) =>
              (field.photos ?? []).map((photo) => (
                <figure key={photo.id} className="itp-traveler-print-photo">
                  <img src={photo.url} alt={photo.fileName} />
                  <figcaption>{field.label}</figcaption>
                </figure>
              )),
            )}
          </div>
        ) : null}
      </div>
      {item.notes ? (
        <p className="itp-traveler-print-notes">
          <span className="itp-traveler-print-label">Notes</span>
          {item.notes}
        </p>
      ) : null}
      {item.photos.length > 0 ? (
        <div className="itp-traveler-print-step-photos">
          {item.photos.map((photo) => (
            <figure key={photo.id} className="itp-traveler-print-photo">
              <img src={photo.url} alt={photo.fileName} />
              <figcaption>{item.pictureLabel || photo.fileName}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export function ItpTravelerReportPanel({
  meta,
  backToItpHref,
  shopFormHref,
  sections,
  stats,
  onOpenStep,
  saving = false,
}: ItpTravelerReportPanelProps) {
  const allPhotos = collectTravelerPhotos(sections)
  const subhead = [meta.valveType, meta.valveId, meta.customer].filter(Boolean).join(' - ')

  return (
    <section className="dashboard-page itp-traveler-report-page">
      <div className="itp-traveler-report-bar screen-only">
        <div className="itp-traveler-report-bar-main">
          <h2 className="dashboard-title">Traveler — {meta.valveId}</h2>
          <p className="itp-traveler-report-meta">
            {metaValue(meta.customer)} · {metaValue(meta.valveType)} · {metaValue(meta.size)}
            {meta.pressureClass ? ` / ${meta.pressureClass}` : ''}
            {meta.templateName ? ` · Template: ${meta.templateName}` : ''}
          </p>
          <p className="itp-traveler-report-summary">{formatItpTravelerCaptureSummary(stats)}</p>
          <p className="placeholder-copy">
            Open each ITP step to enter results, measurements, and photos. Print for a shop packet.
          </p>
        </div>
        <div className="itp-traveler-report-actions">
          {saving ? <span className="itp-traveler-saving">Saving…</span> : null}
          <button type="button" className="button-primary" onClick={() => window.print()}>
            Print traveler
          </button>
          <Link to={backToItpHref} className="button-secondary">
            ← Back to ITP
          </Link>
          {shopFormHref ? (
            <Link to={shopFormHref} className="button-secondary">
              Shop form
            </Link>
          ) : null}
        </div>
      </div>

      <div className="itp-traveler-doc">
        <header className="itp-traveler-doc-hdr">
          <p className="itp-traveler-doc-brand">J&amp;S Machine and Valve QA/QC Traveler</p>
          <h1 className="itp-traveler-doc-title">{subhead || meta.valveId}</h1>
        </header>

        <section className="itp-traveler-doc-basic">
          <h2 className="itp-traveler-doc-section-title">Basic information</h2>
          <div className="itp-traveler-doc-meta-grid">
            <div>
              <span>Valve Id</span>
              <strong>{metaValue(meta.valveId)}</strong>
            </div>
            <div>
              <span>Type</span>
              <strong>{metaValue(meta.valveType)}</strong>
            </div>
            <div>
              <span>Customer</span>
              <strong>{metaValue(meta.customer)}</strong>
            </div>
            <div>
              <span>PO Number</span>
              <strong>{metaValue(meta.poNumber)}</strong>
            </div>
            <div>
              <span>Size</span>
              <strong>{metaValue(meta.size)}</strong>
            </div>
            <div>
              <span>Pressure</span>
              <strong>{metaValue(meta.pressureClass)}</strong>
            </div>
            <div>
              <span>Material</span>
              <strong>{metaValue(meta.material)}</strong>
            </div>
            <div>
              <span>Cell</span>
              <strong>{metaValue(meta.cell)}</strong>
            </div>
            <div>
              <span>Due Date</span>
              <strong>{metaValue(meta.dueDate)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{metaValue(meta.status)}</strong>
            </div>
            <div>
              <span>Manufacturer</span>
              <strong>{metaValue(meta.manufacturer)}</strong>
            </div>
            <div>
              <span>Job type</span>
              <strong>{metaValue(meta.jobType)}</strong>
            </div>
            {meta.description ? (
              <div className="itp-traveler-doc-meta-wide">
                <span>Notes / description</span>
                <strong>{meta.description}</strong>
              </div>
            ) : null}
          </div>
        </section>

        {stats.total === 0 ? (
          <section className="dashboard-panel screen-only">
            <p className="placeholder-copy">
              No ITP checklist items yet. Open the ITP and apply a saved template, then return here.
            </p>
          </section>
        ) : (
          sections.map((section) => (
            <section key={section.secId} className="itp-traveler-section">
              <h3 className="itp-traveler-section-title">{section.secTitle}</h3>

              <ul className="itp-traveler-work-list screen-only">
                {section.items.map((item) => (
                  <WorkStepRow key={item.id} item={item} onOpen={() => onOpenStep(item.id)} />
                ))}
              </ul>

              <div className="itp-traveler-print-section-body print-only">
                {section.items.map((item) => (
                  <PrintStepBlock key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))
        )}

        {allPhotos.length > 0 ? (
          <section className="itp-traveler-section itp-traveler-photos-appendix print-only">
            <h3 className="itp-traveler-section-title">Photo appendix</h3>
            <div className="itp-traveler-print-appendix-grid">
              {allPhotos.map(({ itemName, pictureLabel, photo }) => (
                <figure key={photo.id} className="itp-traveler-print-photo">
                  <img src={photo.url} alt={photo.fileName} />
                  <figcaption>
                    {itemName}
                    {pictureLabel ? ` · ${pictureLabel}` : ''}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  )
}
