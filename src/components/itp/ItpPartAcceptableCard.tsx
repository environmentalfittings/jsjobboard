import type { ItpPlanStepState } from '../../types/itpPlan'
import { ItpPartOtherField } from './ItpPartOtherField'

type ItpPartAcceptableCardProps = {
  stepNumber?: number
  title: string
  subtitle: string
  hint?: string
  detail: ItpPlanStepState
  saving: boolean
  signing: boolean
  techInitials: string
  onTechInitialsChange: (value: string) => void
  onInstructionsChange: (value: string) => void
  onAcceptanceNotesChange: (value: string) => void
  onOtherChange: (patch: Pick<ItpPlanStepState, 'otherChecked' | 'otherNotes'>) => void
  onTechSignOff: () => void
}

function formatSignOffTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function ItpPartAcceptableCard({
  stepNumber,
  title,
  subtitle,
  hint,
  detail,
  saving,
  signing,
  techInitials,
  onTechInitialsChange,
  onInstructionsChange,
  onAcceptanceNotesChange,
  onOtherChange,
  onTechSignOff,
}: ItpPartAcceptableCardProps) {
  const signedOff = Boolean(detail.signOff)
  const locked = signedOff || saving || signing

  return (
    <article
      className={`traveler-signoff-card itp-plan-step-card itp-part-acceptable-card${signedOff ? ' traveler-signoff-card--complete' : ''}`}
    >
      <header className="traveler-signoff-head">
        <div className="itp-plan-step-card-head">
          {stepNumber != null ? <span className="itp-plan-step-number">{stepNumber}</span> : null}
          <div>
            <h4>{title}</h4>
            <p className="itp-plan-step-card-subtitle">{subtitle}</p>
            {hint ? <p className="itp-plan-step-card-hint">{hint}</p> : null}
          </div>
        </div>
        <div className="itp-plan-step-badges">
          {!signedOff ? <span className="itp-plan-badge itp-plan-badge--signoff">Accept · tech sign-off</span> : null}
          {signedOff ? (
            <span className="traveler-signoff-done itp-plan-signoff-done-badge">
              Accepted · {detail.signOff?.techInitials}
            </span>
          ) : null}
        </div>
      </header>

      <div className="itp-plan-step-card-body itp-plan-step-card-body--with-signoff">
        <label className="traveler-textarea-label itp-plan-step-instructions">
          Work instructions
          <textarea
            className="new-job-textarea"
            rows={6}
            value={detail.workInstructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder={`Acceptance criteria for ${subtitle.toLowerCase()}…`}
            disabled={locked}
          />
        </label>

        <aside className={`itp-plan-step-signoff itp-part-inspect-signoff${signedOff ? ' itp-plan-step-signoff--complete' : ''}`}>
          <label className="traveler-textarea-label itp-part-inspect-notes">
            Acceptance notes
            <textarea
              className="new-job-textarea"
              rows={5}
              value={detail.inspectionNotes ?? ''}
              onChange={(e) => onAcceptanceNotesChange(e.target.value)}
              placeholder="Condition, reason no rework is needed…"
              disabled={locked}
            />
          </label>

          <div className="itp-part-inspect-signoff-action">
            <h5 className="itp-plan-signoff-title">Technician sign-off</h5>
            {signedOff ? (
              <div className="itp-plan-signoff-complete">
                <span className="itp-plan-signoff-check">✓</span>
                <div>
                  <strong>{detail.signOff?.techInitials}</strong>
                  <p className="itp-plan-signoff-time">{formatSignOffTime(detail.signOff?.signedAt ?? '')}</p>
                </div>
              </div>
            ) : (
              <>
                <label className="traveler-tech-initials itp-plan-signoff-initials">
                  Tech initials
                  <input
                    value={techInitials}
                    maxLength={6}
                    onChange={(e) => onTechInitialsChange(e.target.value.toUpperCase())}
                    disabled={saving || signing}
                  />
                </label>
                <button
                  type="button"
                  className="button-primary itp-plan-signoff-btn"
                  onClick={onTechSignOff}
                  disabled={saving || signing}
                >
                  {signing ? 'Signing…' : 'Accept part'}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      <ItpPartOtherField
        checked={Boolean(detail.otherChecked)}
        notes={detail.otherNotes ?? ''}
        disabled={locked}
        onCheckedChange={(otherChecked) => onOtherChange({ otherChecked })}
        onNotesChange={(otherNotes) => onOtherChange({ otherNotes })}
      />
    </article>
  )
}
