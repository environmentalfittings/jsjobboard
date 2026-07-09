import type { ItpPartInspectOutcome } from '../../lib/itpPartWorkflow'
import type { ItpPlanStepState } from '../../types/itpPlan'
import { ItpPartOtherField } from './ItpPartOtherField'

type ItpPartInspectCardProps = {
  stepNumber?: number
  title: string
  subtitle: string
  hint?: string
  inspectOutcome: ItpPartInspectOutcome
  detail: ItpPlanStepState
  saving: boolean
  signing: boolean
  techInitials: string
  onTechInitialsChange: (value: string) => void
  onInstructionsChange: (value: string) => void
  onInspectionNotesChange: (value: string) => void
  onInspectOutcomeChange: (outcome: Exclude<ItpPartInspectOutcome, ''>) => void
  onOtherChange: (patch: Pick<ItpPlanStepState, 'otherChecked' | 'otherNotes'>) => void
  onTechSignOff: () => void
}

function formatSignOffTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

export function ItpPartInspectCard({
  stepNumber,
  title,
  subtitle,
  hint,
  inspectOutcome,
  detail,
  saving,
  signing,
  techInitials,
  onTechInitialsChange,
  onInstructionsChange,
  onInspectionNotesChange,
  onInspectOutcomeChange,
  onOtherChange,
  onTechSignOff,
}: ItpPartInspectCardProps) {
  const signedOff = Boolean(detail.signOff)
  const locked = signedOff || saving || signing
  const canSignOff = Boolean(inspectOutcome) && !signedOff

  return (
    <article
      className={`traveler-signoff-card itp-plan-step-card itp-part-inspect-card${signedOff ? ' traveler-signoff-card--complete' : ''}`}
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
          {!signedOff ? <span className="itp-plan-badge itp-plan-badge--signoff">Tech sign-off</span> : null}
          {signedOff ? (
            <span className="traveler-signoff-done itp-plan-signoff-done-badge">
              Signed · {detail.signOff?.techInitials}
            </span>
          ) : null}
        </div>
      </header>

      <div className="itp-plan-step-card-body itp-plan-step-card-body--with-signoff">
        <label className="traveler-textarea-label itp-plan-step-instructions">
          Work instructions
          <textarea
            className="new-job-textarea"
            rows={8}
            value={detail.workInstructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder={`Inspection criteria for ${subtitle.toLowerCase()}…`}
            disabled={locked}
          />
        </label>

        <aside className={`itp-plan-step-signoff itp-part-inspect-signoff${signedOff ? ' itp-plan-step-signoff--complete' : ''}`}>
          <label className="traveler-textarea-label itp-part-inspect-notes">
            Inspection notes
            <textarea
              className="new-job-textarea"
              rows={5}
              value={detail.inspectionNotes ?? ''}
              onChange={(e) => onInspectionNotesChange(e.target.value)}
              placeholder="Findings, measurements, defects…"
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
                  disabled={saving || signing || !canSignOff}
                >
                  {signing ? 'Signing…' : 'Sign off'}
                </button>
                {!inspectOutcome ? (
                  <p className="itp-part-inspect-outcome-hint">Select acceptable or rework before sign-off.</p>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </div>

      <fieldset className="itp-part-inspect-outcome" disabled={locked}>
        <legend>Inspection result</legend>
        <p className="itp-part-inspect-outcome-lead">After inspection, is this part acceptable or does it need rework?</p>
        <div className="itp-part-inspect-outcome-options">
          <label className="itp-part-inspect-outcome-option">
            <input
              type="radio"
              name={`inspect-outcome-${stepNumber ?? subtitle}`}
              checked={inspectOutcome === 'acceptable'}
              onChange={() => onInspectOutcomeChange('acceptable')}
            />
            <span>
              <strong>Acceptable</strong>
              <small>No machine, weld, or rework required</small>
            </span>
          </label>
          <label className="itp-part-inspect-outcome-option">
            <input
              type="radio"
              name={`inspect-outcome-${stepNumber ?? subtitle}`}
              checked={inspectOutcome === 'rework'}
              onChange={() => onInspectOutcomeChange('rework')}
            />
            <span>
              <strong>Rework required</strong>
              <small>Machine 1 → weld → machine 2</small>
            </span>
          </label>
        </div>
      </fieldset>

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
