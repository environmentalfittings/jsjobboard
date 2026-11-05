import { useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  ItpTravelerReportItem,
  ItpTravelerReportSection,
  ItpTravelerReportStats,
} from '../lib/itpTravelerReport'
import {
  collectTravelerPhotos,
  formatItpTravelerCaptureSummary,
  travelerBlockingPriorSection,
  travelerSectionIncompleteMessages,
} from '../lib/itpTravelerReport'
import { buildItpTravelerUrl, buildShopLoginUrl } from '../lib/itpQrCode'
import { ItpLoginQr } from './ItpLoginQr'
import { ItpOptionalNotes } from './ItpOptionalNotes'
import { iomProcedureKindLabel, resourceDocumentPublicUrl } from '../lib/resourceDocuments'
import { isOrderReplacementPartsItem } from '../lib/itpOrderParts'
import {
  formatNeededPartsSummary,
  jobNeededPartStatusLabel,
  type JobNeededPart,
} from '../lib/jobNeededParts'
import { linePhotoRequirementLabel } from '../lib/itpItemRequirements'

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
  onToggleDone: (itemId: string) => void
  onPatchNotes: (itemId: string, notes: string) => void
  saving?: boolean
  previewMode?: boolean
  valveRowId?: number | null
  neededParts?: JobNeededPart[]
  onNeedPart?: (itemId: string) => void
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

function travelerReqHint(item: ItpTravelerReportItem): string {
  const parts: string[] = []
  if (item.requirePicture) {
    parts.push(linePhotoRequirementLabel(item.minPhotos, item.maxPhotos))
  }
  if (item.requireMeasurement) parts.push(item.requireNameplate ? 'nameplate fields' : 'traveler fields')
  if (parts.length === 0) return 'traveler requirement'
  return parts.join(' and ')
}

function WorkStepRow({
  item,
  blockedByPriorItem,
  blockedByPriorSection,
  saving,
  parts,
  onOpen,
  onToggleDone,
  onPatchNotes,
  onNeedPart,
  onBlockedAttempt,
}: {
  item: ItpTravelerReportItem
  blockedByPriorItem: boolean
  blockedByPriorSection: boolean
  saving: boolean
  parts: JobNeededPart[]
  onOpen: () => void
  onToggleDone: () => void
  onPatchNotes: (notes: string) => void
  onNeedPart?: () => void
  onBlockedAttempt: () => void
}) {
  const needsTraveler = item.hasTravelerRequirement
  const sectionLocked = blockedByPriorSection
  const itemLocked = blockedByPriorItem
  const checkboxLocked =
    sectionLocked || itemLocked || (needsTraveler && !item.requirementsMet && !item.done)
  const checked = item.done || item.status === 'hold'
  const hint = sectionLocked
    ? 'Finish the previous section first'
    : itemLocked
      ? 'Complete the previous item first'
      : needsTraveler && !item.requirementsMet && !item.done
        ? `Fill ${travelerReqHint(item)} before this checkbox is available`
        : item.status === 'hold'
          ? 'Pending supervisor sign-off'
          : item.done
            ? 'Mark incomplete'
            : 'Mark complete'

  const guard = (action: () => void) => {
    if (sectionLocked) {
      onBlockedAttempt()
      return
    }
    action()
  }

  return (
    <li
      className={`itp-traveler-work-row itp-traveler-work-row--${item.status}${
        checkboxLocked || sectionLocked ? ' is-locked' : ''
      }${sectionLocked ? ' is-section-locked' : ''}${checked ? ' is-checked' : ''}`}
    >
      <div className="itp-traveler-work-row-body">
        <button
          type="button"
          className="itp-library-exec-cb"
          disabled={saving || (!sectionLocked && checkboxLocked)}
          title={hint}
          aria-label={hint}
          onClick={() => guard(onToggleDone)}
        >
          <span
            className={`itp-library-cb${checked ? ' sel' : ''}${
              item.status === 'hold' && !item.done ? ' pending' : ''
            }`}
          />
        </button>
        <div className="itp-traveler-work-row-main">
          <div className="itp-traveler-work-row-titles">
            <strong>{item.name}</strong>
            <span className="itp-traveler-work-row-meta">
              [{item.ref}]
              {item.shopAreaLabel ? (
                <span className="itp-template-station-badge">Station: {item.shopAreaLabel}</span>
              ) : null}
              {item.holdPoint ? ' · Hold point' : ''}
            </span>
          </div>
          {sectionLocked ? (
            <div className="itp-traveler-work-row-badges">
              <span className="itp-traveler-req-locked">Locked — finish section above first</span>
            </div>
          ) : needsTraveler ? (
            <div className="itp-traveler-work-row-badges">
              {item.requirePicture ? <span className="itp-library-attr-badge photo">Photo</span> : null}
              {item.requireMeasurement ? (
                <span className="itp-library-attr-badge meas">
                  {item.requireNameplate ? 'Nameplate' : 'Fields'}
                </span>
              ) : null}
              {isOrderReplacementPartsItem(item.id) ? (
                <span className="itp-library-attr-badge traveler">Needs parts</span>
              ) : item.requirementsMet ? (
                <span className="itp-traveler-req-met">Ready to check</span>
              ) : (
                <span className="itp-traveler-req-locked">Locked until filled</span>
              )}
              {item.result ? <span className="itp-traveler-result-chip">{item.result}</span> : null}
            </div>
          ) : item.status === 'hold' || item.status === 'flagged' ? (
            <div className="itp-traveler-work-row-badges">
              <StatusPill status={item.status} />
            </div>
          ) : null}
          {item.done && item.techInitials ? (
            <p className="itp-traveler-work-row-tech">Checked by {item.techInitials}</p>
          ) : null}
          {(item.resourceDocs?.length ?? 0) > 0 ? (
            <ul className="itp-traveler-work-row-docs">
              {item.resourceDocs.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={resourceDocumentPublicUrl(doc.storagePath)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {doc.title}
                  </a>
                  <span className="itp-traveler-work-row-doc-kind">{iomProcedureKindLabel(doc.category)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className="itp-traveler-work-row-notes-wrap"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ItpOptionalNotes
              notes={item.notes}
              disabled={saving || sectionLocked}
              onChange={onPatchNotes}
            />
          </div>
          {isOrderReplacementPartsItem(item.id) ? (
            <p className="itp-traveler-work-row-tech">{formatNeededPartsSummary(parts)}</p>
          ) : parts.length > 0 ? (
            <p className="itp-traveler-work-row-tech">
              {parts.length} part{parts.length === 1 ? '' : 's'} requested from this step
            </p>
          ) : null}
        </div>
      </div>
      <div className="itp-traveler-work-row-acts">
        {needsTraveler ? (
          <button
            type="button"
            className="button-secondary itp-traveler-open-step-btn"
            disabled={saving || (!sectionLocked && itemLocked)}
            onClick={() => guard(onOpen)}
          >
            {isOrderReplacementPartsItem(item.id)
              ? 'Parts'
              : item.requirementsMet
                ? 'Edit'
                : 'Fill requirement'}
          </button>
        ) : null}
        {onNeedPart ? (
          <button
            type="button"
            className="button-secondary itp-traveler-open-step-btn"
            disabled={saving}
            onClick={() => guard(onNeedPart)}
          >
            Need part
          </button>
        ) : null}
      </div>
    </li>
  )
}

function PrintStepBlock({ item, parts }: { item: ItpTravelerReportItem; parts: JobNeededPart[] }) {
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
      {(item.resourceDocs?.length ?? 0) > 0 ? (
        <p className="itp-traveler-print-notes">
          <span className="itp-traveler-print-label">IOM / Procedure</span>
          {item.resourceDocs.map((doc) => (
            <a
              key={doc.id}
              href={resourceDocumentPublicUrl(doc.storagePath)}
              target="_blank"
              rel="noreferrer"
            >
              {doc.title}
            </a>
          ))}
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
      {parts.length > 0 ? (
        <div className="itp-traveler-print-notes">
          <span className="itp-traveler-print-label">Required parts</span>
          {parts.map((part) => (
            <div key={part.id}>
              {part.quantity}× {part.partName}
              {part.partNumber ? ` #${part.partNumber}` : ''}
              {part.poNumber ? ` · PO ${part.poNumber}` : ''}
              {part.expectedDate ? ` · due ${part.expectedDate}` : ''}
              {` · ${jobNeededPartStatusLabel(part.status)}`}
            </div>
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
  onToggleDone,
  onPatchNotes,
  saving = false,
  previewMode = false,
  valveRowId = null,
  neededParts = [],
  onNeedPart,
}: ItpTravelerReportPanelProps) {
  const [sectionBlockPopup, setSectionBlockPopup] = useState<{
    sectionTitle: string
    missing: string[]
  } | null>(null)
  const allPhotos = collectTravelerPhotos(sections)
  const subhead = [meta.valveType, meta.valveId, meta.customer].filter(Boolean).join(' - ')
  const qrUrl =
    valveRowId != null && Number.isFinite(valveRowId) ? buildItpTravelerUrl(valveRowId) : buildShopLoginUrl()

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
            {previewMode
              ? `Preview traveler ${meta.valveId}. Finish each section top-to-bottom before the next unlocks. Lines with photos/fields stay locked until filled.`
              : 'Finish each section top-to-bottom before the next unlocks. Lines with traveler requirements stay locked until photos and fields are filled. Add parts from any open step — purchasing tracks them on Needs parts.'}
          </p>
          <p className="itp-traveler-report-summary">
            Parts: {formatNeededPartsSummary(neededParts)}
            {!previewMode ? (
              <>
                {' · '}
                <Link to="/needed-parts">Open needs parts</Link>
              </>
            ) : (
              ' · preview only'
            )}
          </p>
        </div>
        <div className="itp-traveler-report-actions">
          {saving ? <span className="itp-traveler-saving">Saving…</span> : null}
          <button type="button" className="button-primary" onClick={() => window.print()}>
            Print traveler
          </button>
          {previewMode ? (
            <button type="button" className="button-secondary" onClick={() => window.close()}>
              Close window
            </button>
          ) : (
            <Link to={backToItpHref} className="button-secondary">
              ← Back to ITP
            </Link>
          )}
          {shopFormHref ? (
            <Link to={shopFormHref} className="button-secondary">
              Shop form
            </Link>
          ) : null}
        </div>
      </div>

      <div className="itp-traveler-doc">
        <header className="itp-traveler-doc-hdr">
          <div className="itp-traveler-doc-hdr-main">
            <p className="itp-traveler-doc-brand">J&amp;S Machine and Valve QA/QC Traveler</p>
            <h1 className="itp-traveler-doc-title">{subhead || meta.valveId}</h1>
          </div>
          <ItpLoginQr url={qrUrl} valveLabel={meta.valveId} sample={previewMode || valveRowId == null} />
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
          sections.map((section, sectionIndex) => {
            const blockingSection = travelerBlockingPriorSection(sections, sectionIndex)
            const sectionLocked = Boolean(blockingSection)
            return (
            <section
              key={section.secId}
              className={`itp-traveler-section${sectionLocked ? ' is-section-locked' : ''}`}
            >
              <h3 className="itp-traveler-section-title">
                {section.secTitle}
                {sectionLocked && blockingSection ? (
                  <button
                    type="button"
                    className="itp-traveler-section-locked-tag"
                    onClick={() =>
                      setSectionBlockPopup({
                        sectionTitle: blockingSection.secTitle,
                        missing: travelerSectionIncompleteMessages(blockingSection),
                      })
                    }
                  >
                    Locked
                  </button>
                ) : null}
              </h3>

              <ul className="itp-traveler-work-list screen-only">
                {section.items.map((item, index) => {
                  const prev = index > 0 ? section.items[index - 1] : null
                  const blockedByPriorItem = Boolean(prev?.blockNext && prev.status !== 'complete')
                  return (
                    <WorkStepRow
                      key={item.id}
                      item={item}
                      blockedByPriorItem={blockedByPriorItem}
                      blockedByPriorSection={sectionLocked}
                      saving={saving}
                      parts={
                        isOrderReplacementPartsItem(item.id)
                          ? neededParts
                          : neededParts.filter((part) => part.itpItemId === item.id)
                      }
                      onOpen={() => onOpenStep(item.id)}
                      onToggleDone={() => onToggleDone(item.id)}
                      onPatchNotes={(notes) => onPatchNotes(item.id, notes)}
                      onNeedPart={onNeedPart ? () => onNeedPart(item.id) : undefined}
                      onBlockedAttempt={() => {
                        if (!blockingSection) return
                        setSectionBlockPopup({
                          sectionTitle: blockingSection.secTitle,
                          missing: travelerSectionIncompleteMessages(blockingSection),
                        })
                      }}
                    />
                  )
                })}
              </ul>

              <div className="itp-traveler-print-section-body print-only">
                {section.items.map((item) => (
                  <PrintStepBlock
                    key={item.id}
                    item={item}
                    parts={
                      isOrderReplacementPartsItem(item.id)
                        ? neededParts
                        : neededParts.filter((part) => part.itpItemId === item.id)
                    }
                  />
                ))}
              </div>
            </section>
            )
          })
        )}

      {sectionBlockPopup ? (
        <div
          className="modal-overlay screen-only"
          role="presentation"
          onClick={() => setSectionBlockPopup(null)}
        >
          <div
            className="modal-card itp-traveler-section-lock-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="itp-traveler-section-lock-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="itp-traveler-section-lock-title">Finish the section above first</h3>
            <p className="placeholder-copy">
              Complete these items in <strong>{sectionBlockPopup.sectionTitle}</strong> before starting the
              next section:
            </p>
            <ul className="itp-traveler-section-lock-list">
              {sectionBlockPopup.missing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="modal-details-actions">
              <button type="button" className="button-primary" onClick={() => setSectionBlockPopup(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

        {neededParts.length > 0 ? (
          <section className="itp-traveler-section itp-traveler-parts-appendix print-only">
            <h3 className="itp-traveler-section-title">Required parts</h3>
            {neededParts.map((part) => (
              <p key={part.id} className="itp-traveler-print-notes">
                {part.quantity}× {part.partName}
                {part.partNumber ? ` #${part.partNumber}` : ''}
                {part.supplier ? ` · ${part.supplier}` : ''}
                {part.poNumber ? ` · PO ${part.poNumber}` : ''}
                {part.expectedDate ? ` · due ${part.expectedDate}` : ''}
                {` · ${jobNeededPartStatusLabel(part.status)}`}
                {part.itpItemName ? ` · from ${part.itpItemName}` : ''}
              </p>
            ))}
          </section>
        ) : null}

        {neededParts.length > 0 ? (
          <section className="itp-traveler-section itp-traveler-parts-appendix print-only">
            <h3 className="itp-traveler-section-title">Required parts</h3>
            <div className="itp-traveler-print-fields">
              {neededParts.map((part) => (
                <div key={part.id} className="itp-traveler-print-field">
                  <span className="itp-traveler-print-label">
                    {part.quantity}× {part.partName}
                  </span>
                  <span className="itp-traveler-print-value">
                    {[
                      part.partNumber ? `#${part.partNumber}` : '',
                      part.supplier,
                      part.poNumber ? `PO ${part.poNumber}` : '',
                      part.expectedDate ? `due ${part.expectedDate}` : '',
                      jobNeededPartStatusLabel(part.status),
                      part.itpItemName ? `from ${part.itpItemName}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

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
