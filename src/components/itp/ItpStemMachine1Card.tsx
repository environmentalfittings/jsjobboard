import type { ItpPlanStepSignOff, ItpPlanStepState, ItpStemMeasurements } from '../../types/itpPlan'
import { ItpPartOtherField } from './ItpPartOtherField'

type ItpStemMachine1CardProps = {
  stepNumber?: number
  detail: ItpPlanStepState
  saving: boolean
  signingTech: boolean
  signingQc: boolean
  techInitials: string
  qcInitials: string
  onTechInitialsChange: (value: string) => void
  onQcInitialsChange: (value: string) => void
  onDetailChange: (patch: Partial<ItpPlanStepState>) => void
  onMeasurementsChange: (patch: Partial<ItpStemMeasurements>) => void
  onTechSignOff: () => void
  onQcSignOff: () => void
}

function formatSignOffTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function SignOffBox({
  title,
  signed,
  signOff,
  initials,
  onInitialsChange,
  onSignOff,
  signing,
  saving,
  disabled,
  disabledHint,
  buttonLabel,
}: {
  title: string
  signed: boolean
  signOff: ItpPlanStepSignOff | null | undefined
  initials: string
  onInitialsChange: (value: string) => void
  onSignOff: () => void
  signing: boolean
  saving: boolean
  disabled?: boolean
  disabledHint?: string
  buttonLabel: string
}) {
  return (
    <aside className={`itp-plan-step-signoff itp-stem-signoff-box${signed ? ' itp-plan-step-signoff--complete' : ''}`}>
      <h5 className="itp-plan-signoff-title">{title}</h5>
      {signed ? (
        <div className="itp-plan-signoff-complete">
          <span className="itp-plan-signoff-check">✓</span>
          <div>
            <strong>{signOff?.techInitials}</strong>
            <p className="itp-plan-signoff-time">{formatSignOffTime(signOff?.signedAt ?? '')}</p>
          </div>
        </div>
      ) : disabled ? (
        <p className="itp-stem-signoff-wait">{disabledHint}</p>
      ) : (
        <>
          <label className="traveler-tech-initials itp-plan-signoff-initials">
            Initials
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
            {signing ? 'Signing…' : buttonLabel}
          </button>
        </>
      )}
    </aside>
  )
}

function StemDiagram() {
  return (
    <svg
      className="itp-stem-diagram"
      viewBox="0 0 520 72"
      role="img"
      aria-label="Stem measurement locations A through F"
    >
      <defs>
        <linearGradient id="stemBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      <rect x="8" y="28" width="504" height="16" rx="2" fill="url(#stemBody)" stroke="#64748b" strokeWidth="1" />
      <path d="M 40 36 L 52 24 L 64 36 Z" fill="#cbd5e1" stroke="#64748b" />
      <rect x="430" y="22" width="70" height="28" rx="2" fill="#cbd5e1" stroke="#64748b" />
      <path
        d="M 430 36 h8 v-6 h6 v6 h6 v-6 h6 v6 h6 v-6 h6 v6 h6 v-6 h6 v6 h8"
        fill="none"
        stroke="#475569"
        strokeWidth="1"
      />
      {[
        { label: 'A', x: 56 },
        { label: 'B', x: 180 },
        { label: 'C', x: 300 },
        { label: 'D', x: 465 },
      ].map((point) => (
        <g key={point.label}>
          <line x1={point.x} y1="18" x2={point.x} y2="56" stroke="#2563eb" strokeDasharray="3 3" />
          <circle cx={point.x} cy="12" r="10" fill="#2563eb" />
          <text x={point.x} y="16" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function ItpStemMachine1Card({
  stepNumber,
  detail,
  saving,
  signingTech,
  signingQc,
  techInitials,
  qcInitials,
  onTechInitialsChange,
  onQcInitialsChange,
  onDetailChange,
  onMeasurementsChange,
  onTechSignOff,
  onQcSignOff,
}: ItpStemMachine1CardProps) {
  const measurements = detail.stemMeasurements!
  const techSigned = Boolean(detail.signOff)
  const qcSigned = Boolean(detail.qcSignOff)
  const measurementsLocked = techSigned || saving || signingTech || signingQc

  return (
    <article
      className={`traveler-signoff-card itp-plan-step-card itp-stem-machine1-card${qcSigned ? ' traveler-signoff-card--complete' : ''}`}
    >
      <header className="traveler-signoff-head">
        <div className="itp-plan-step-card-head">
          {stepNumber != null ? <span className="itp-plan-step-number">{stepNumber}</span> : null}
          <div>
            <h4>Machine 1</h4>
            <p className="itp-plan-step-card-subtitle">Stem</p>
            <p className="itp-plan-step-card-hint">Record as-found dimensions before weld and finish machine.</p>
          </div>
        </div>
        <div className="itp-plan-step-badges">
          {!techSigned ? <span className="itp-plan-badge itp-plan-badge--signoff">Tech sign-off</span> : null}
          {techSigned && !qcSigned ? (
            <span className="itp-plan-badge itp-plan-badge--signoff">QA/QC verify</span>
          ) : null}
          {techSigned ? (
            <span className="traveler-signoff-done itp-plan-signoff-done-badge">Tech · {detail.signOff?.techInitials}</span>
          ) : null}
          {qcSigned ? (
            <span className="traveler-signoff-done itp-plan-signoff-done-badge">QA/QC · {detail.qcSignOff?.techInitials}</span>
          ) : null}
        </div>
      </header>

      <div className="itp-stem-machine1-body">
        <section className="itp-stem-measurements-panel">
          <h5 className="itp-stem-section-title">Stem measurements</h5>
          <StemDiagram />
          <div className="itp-stem-diameter-grid">
            {(['diameterA', 'diameterB', 'diameterC', 'diameterD', 'diameterE', 'diameterF'] as const).map(
              (key, index) => (
              <label key={key} className="itp-stem-field">
                Diameter {String.fromCharCode(65 + index)}
                <input
                  type="text"
                  inputMode="decimal"
                  value={measurements[key]}
                  onChange={(e) => onMeasurementsChange({ [key]: e.target.value })}
                  disabled={measurementsLocked}
                  placeholder="in"
                />
              </label>
            ),
            )}
          </div>
          <div className="itp-stem-thread-grid">
            <label className="itp-stem-field">
              Stem pitch
              <input
                type="text"
                value={measurements.stemPitch}
                onChange={(e) => onMeasurementsChange({ stemPitch: e.target.value })}
                disabled={measurementsLocked}
              />
            </label>
            <fieldset className="itp-stem-radio-fieldset" disabled={measurementsLocked}>
              <legend>Stem lead</legend>
              <label className="itp-stem-radio">
                <input
                  type="radio"
                  name={`stem-lead-${stepNumber}`}
                  checked={measurements.stemLead === 'double'}
                  onChange={() => onMeasurementsChange({ stemLead: 'double' })}
                />
                Double
              </label>
              <label className="itp-stem-radio">
                <input
                  type="radio"
                  name={`stem-lead-${stepNumber}`}
                  checked={measurements.stemLead === 'single'}
                  onChange={() => onMeasurementsChange({ stemLead: 'single' })}
                />
                Single
              </label>
            </fieldset>
            <fieldset className="itp-stem-radio-fieldset" disabled={measurementsLocked}>
              <legend>Threads</legend>
              <label className="itp-stem-radio">
                <input
                  type="radio"
                  name={`stem-threads-${stepNumber}`}
                  checked={measurements.threads === 'left_hand'}
                  onChange={() => onMeasurementsChange({ threads: 'left_hand' })}
                />
                Left hand
              </label>
              <label className="itp-stem-radio">
                <input
                  type="radio"
                  name={`stem-threads-${stepNumber}`}
                  checked={measurements.threads === 'right_hand'}
                  onChange={() => onMeasurementsChange({ threads: 'right_hand' })}
                />
                Right hand
              </label>
            </fieldset>
          </div>
        </section>

        <div className="itp-stem-signoff-row">
          <SignOffBox
            title="Technician"
            signed={techSigned}
            signOff={detail.signOff}
            initials={techInitials}
            onInitialsChange={onTechInitialsChange}
            onSignOff={onTechSignOff}
            signing={signingTech}
            saving={saving}
            buttonLabel="Sign off"
          />
          <SignOffBox
            title="QA/QC verify"
            signed={qcSigned}
            signOff={detail.qcSignOff}
            initials={qcInitials}
            onInitialsChange={onQcInitialsChange}
            onSignOff={onQcSignOff}
            signing={signingQc}
            saving={saving}
            disabled={!techSigned}
            disabledHint="Technician must sign off before QA/QC can verify."
            buttonLabel="Verify"
          />
        </div>
      </div>

      <label className="traveler-textarea-label itp-plan-step-instructions">
        Work instructions
        <textarea
          className="new-job-textarea"
          rows={3}
          value={detail.workInstructions}
          onChange={(e) => onDetailChange({ workInstructions: e.target.value })}
          disabled={measurementsLocked}
        />
      </label>

      <ItpPartOtherField
        checked={Boolean(detail.otherChecked)}
        notes={detail.otherNotes ?? ''}
        disabled={measurementsLocked}
        onCheckedChange={(otherChecked) => onDetailChange({ otherChecked })}
        onNotesChange={(otherNotes) => onDetailChange({ otherNotes })}
      />
    </article>
  )
}
