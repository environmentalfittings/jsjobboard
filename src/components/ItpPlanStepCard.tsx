import type { ItpPlanStepState } from '../types/itpPlan'
import { ItpPartOtherField } from './itp/ItpPartOtherField'

type ItpPlanStepCardProps = {
  stepNumber?: number
  title: string
  subtitle?: string
  hint?: string
  alwaysIncluded?: boolean
  requiresSignOff: boolean
  showOther?: boolean
  detail: ItpPlanStepState
  saving: boolean
  signing: boolean
  initials: string
  onInitialsChange: (value: string) => void
  onInstructionsChange: (value: string) => void
  onOtherChange?: (patch: Pick<ItpPlanStepState, 'otherChecked' | 'otherNotes'>) => void
  onSignOff: () => void
}

function formatSignOffTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function ItpPlanStepCard({
  stepNumber,
  title,
  subtitle,
  hint,
  alwaysIncluded,
  requiresSignOff,
  showOther,
  detail,
  saving,
  signing,
  initials,
  onInitialsChange,
  onInstructionsChange,
  onOtherChange,
  onSignOff,
}: ItpPlanStepCardProps) {
  const signedOff = Boolean(detail.signOff)
  const locked = signedOff || saving || signing

  return (
    <article
      className={`traveler-signoff-card itp-plan-step-card${signedOff ? ' traveler-signoff-card--complete' : ''}`}
    >
      <header className="traveler-signoff-head">
        <div className="itp-plan-step-card-head">
          {stepNumber != null ? <span className="itp-plan-step-number">{stepNumber}</span> : null}
          <div>
            <h4>{title}</h4>
            {subtitle ? <p className="itp-plan-step-card-subtitle">{subtitle}</p> : null}
            {hint ? <p className="itp-plan-step-card-hint">{hint}</p> : null}
          </div>
        </div>
        <div className="itp-plan-step-badges">
          {alwaysIncluded ? <span className="itp-plan-badge itp-plan-badge--required">Required</span> : null}
          {requiresSignOff && !signedOff ? (
            <span className="itp-plan-badge itp-plan-badge--signoff">Tech sign-off</span>
          ) : null}
          {signedOff ? (
            <span className="traveler-signoff-done itp-plan-signoff-done-badge">
              Signed · {detail.signOff?.techInitials}
            </span>
          ) : null}
        </div>
      </header>

      <div className={`itp-plan-step-card-body${requiresSignOff ? ' itp-plan-step-card-body--with-signoff' : ''}`}>
        <label className="traveler-textarea-label itp-plan-step-instructions">
          Work instructions
          <textarea
            className="new-job-textarea"
            rows={4}
            value={detail.workInstructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder={`Instructions for ${title.toLowerCase()}…`}
            disabled={locked}
          />
        </label>

        {requiresSignOff ? (
          <aside className={`itp-plan-step-signoff${signedOff ? ' itp-plan-step-signoff--complete' : ''}`}>
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
                    value={initials}
                    maxLength={6}
                    onChange={(e) => onInitialsChange(e.target.value.toUpperCase())}
                    disabled={saving || signing}
                  />
                </label>
                <button
                  type="button"
                  className="button-primary itp-plan-signoff-btn"
                  onClick={onSignOff}
                  disabled={saving || signing}
                >
                  {signing ? 'Signing…' : 'Sign off'}
                </button>
              </>
            )}
          </aside>
        ) : null}
      </div>

      {showOther && onOtherChange ? (
        <ItpPartOtherField
          checked={Boolean(detail.otherChecked)}
          notes={detail.otherNotes ?? ''}
          disabled={locked}
          onCheckedChange={(otherChecked) => onOtherChange({ otherChecked })}
          onNotesChange={(otherNotes) => onOtherChange({ otherNotes })}
        />
      ) : null}
    </article>
  )
}
