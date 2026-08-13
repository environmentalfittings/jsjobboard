import { Link } from 'react-router-dom'
import type { ItpTravelerReportItem, ItpTravelerReportSection, ItpTravelerReportStats } from '../lib/itpTravelerReport'
import { formatItpTravelerCaptureSummary } from '../lib/itpTravelerReport'

type ItpTravelerReportPanelProps = {
  valveId: string
  customer: string | null
  valveType: string | null
  size: string | null
  pressureClass: string | null
  backToItpHref: string
  sections: ItpTravelerReportSection[]
  stats: ItpTravelerReportStats
}

function StatusPill({ status }: { status: ItpTravelerReportItem['status'] }) {
  return (
    <span className={`itp-traveler-status-pill itp-traveler-status-pill--${status}`}>
      {status === 'captured' ? 'Captured' : 'Pending'}
    </span>
  )
}

function ReportItemCard({ item }: { item: ItpTravelerReportItem }) {
  return (
    <article className={`itp-traveler-item-card itp-traveler-item-card--${item.status}`}>
      <header className="itp-traveler-item-hdr">
        <div className="itp-traveler-item-titles">
          <h3 className="itp-traveler-item-name">{item.name}</h3>
          <span className="itp-traveler-item-ref">[{item.ref}]</span>
        </div>
        <StatusPill status={item.status} />
      </header>

      <div className="itp-traveler-item-badges">
        {item.requirePicture ? <span className="itp-library-attr-badge photo">Photo</span> : null}
        {item.requireMeasurement ? <span className="itp-library-attr-badge meas">Measurements</span> : null}
      </div>

      {item.requireMeasurement ? (
        <div className="itp-traveler-meas-grid">
          {item.fields.map((field) => (
            <div key={field.id} className="itp-traveler-meas-row">
              <span className="itp-traveler-meas-label">{field.label}</span>
              <span className={`itp-traveler-meas-value${field.value ? '' : ' is-empty'}`}>
                {field.value || '—'}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {item.requirePicture ? (
        <div className="itp-traveler-photos">
          <div className="itp-traveler-photos-hdr">
            {item.pictureLabel}{' '}
            <span>
              ({item.photos.length}/{item.minPhotos})
            </span>
          </div>
          {item.photos.length === 0 ? (
            <p className="itp-traveler-photos-empty">No photos attached yet.</p>
          ) : (
            <div className="itp-traveler-photos-grid">
              {item.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="itp-traveler-photo-thumb"
                  title={photo.fileName}
                >
                  <img src={photo.url} alt={photo.fileName} />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}

export function ItpTravelerReportPanel({
  valveId,
  customer,
  valveType,
  size,
  pressureClass,
  backToItpHref,
  sections,
  stats,
}: ItpTravelerReportPanelProps) {
  return (
    <section className="dashboard-page itp-traveler-report-page">
      <div className="itp-traveler-report-bar">
        <div className="itp-traveler-report-bar-main">
          <h2 className="dashboard-title">View Traveler — {valveId}</h2>
          <p className="itp-traveler-report-meta">
            {(customer ?? '—') +
              ' · ' +
              (valveType || '—') +
              ' · ' +
              (size || '—') +
              (pressureClass ? ` / ${pressureClass}` : '')}
          </p>
          <p className="itp-traveler-report-summary">{formatItpTravelerCaptureSummary(stats)}</p>
          <p className="placeholder-copy">
            Read-only report of Picture and Measurement requirements from this job&apos;s ITP checklist.
          </p>
        </div>
        <div className="itp-traveler-report-actions">
          <Link to={backToItpHref} className="button-secondary">
            ← Back to ITP
          </Link>
        </div>
      </div>

      {stats.total === 0 ? (
        <section className="dashboard-panel">
          <p className="placeholder-copy">
            No Build Scope items have a Picture or Measurement requirement yet. Add those on master list items or
            toggle them on the ITP checklist, then return here.
          </p>
        </section>
      ) : (
        sections.map((section) => (
          <section key={section.secId} className="itp-traveler-section">
            <h3 className="itp-traveler-section-title">{section.secTitle}</h3>
            <div className="itp-traveler-section-items">
              {section.items.map((item) => (
                <ReportItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))
      )}
    </section>
  )
}
