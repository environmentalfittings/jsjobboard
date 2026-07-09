import { Fragment, useMemo } from 'react'
import type {
  SeatTypeKind,
  TestParametersBundle,
  TestPhaseRow,
  ValveDataForTest,
} from '../../utils/testStandards'
import {
  applyPhaseMediumOverride,
  checkedStandardLabel,
  getNPSSizeBracket,
} from '../../utils/testStandards'
import type { TestPhaseResult } from '../../lib/testStandardParams'

type RequiredTestParametersPanelProps = {
  valveId: string
  size: string
  pressureClass: string
  bodyMaterial: string
  bundle: TestParametersBundle | null
  seatType: SeatTypeKind
  onSeatTypeChange: (seatType: SeatTypeKind) => void
  phaseState: Record<string, TestPhaseResult>
  enabledOptionalPhaseIds: string[]
  onPhaseChange: (phaseId: string, patch: Partial<TestPhaseResult>) => void
  onToggleOptionalPhase: (phaseId: string, enabled: boolean) => void
  valveContext: ValveDataForTest | null
}

function mergePhaseRows(
  phases: TestPhaseRow[],
  phaseState: Record<string, TestPhaseResult>,
  valveContext: ValveDataForTest | null,
  options?: { enforceLocking?: boolean },
): DisplayPhaseRow[] {
  if (!valveContext) return phases

  const bracket = getNPSSizeBracket(valveContext.nps)
  const enforceLocking = options?.enforceLocking ?? true
  let previousPassed = true

  return phases.map((phase) => {
    const state = phaseState[phase.id]
    const medium = state?.medium ?? phase.medium
    let row = phase

    if (phase.mediumEditable && state?.medium) {
      row = applyPhaseMediumOverride(phase, medium, {
        nps: valveContext.nps,
        seatType: valveContext.seatType,
        bracket,
      })
    } else if (phase.id === 'sp160-phase1' && phase.mediumEditable) {
      row = applyPhaseMediumOverride(phase, medium, {
        nps: valveContext.nps,
        seatType: valveContext.seatType,
        bracket,
      })
    }

    const skipsLocking = Boolean(phase.excludesFromLocking)
    const locked = enforceLocking && !skipsLocking ? !previousPassed : false

    if (!skipsLocking && enforceLocking) {
      previousPassed = state?.passFail === 'pass'
    }

    const needsActual = row.testPressure.includes('enter actual')

    return {
      ...row,
      medium,
      passFail: state?.passFail ?? '',
      notes: state?.notes ?? '',
      locked,
      needsActualPressure: needsActual,
      actualPressure: state?.actualPressure ?? '',
      displayPressure: needsActual ? state?.actualPressure ?? '' : row.testPressure,
    }
  })
}

type DisplayPhaseRow = TestPhaseRow & {
  needsActualPressure?: boolean
  actualPressure?: string
  displayPressure?: string
}

function PhaseTable({
  rows,
  onPhaseChange,
  showStandardColumn,
}: {
  rows: DisplayPhaseRow[]
  onPhaseChange: (phaseId: string, patch: Partial<TestPhaseResult>) => void
  showStandardColumn: boolean
}) {
  if (!rows.length) return null

  return (
    <div className="test-required-params-table-wrap">
      <table className="test-required-params-table test-required-params-phase-table">
        <thead>
          <tr>
            {showStandardColumn ? <th>Standard</th> : null}
            <th>Phase</th>
            <th>Test</th>
            <th>Medium</th>
            <th>Test pressure</th>
            <th>Hold time</th>
            <th>Allowable leakage</th>
            <th>Pass</th>
            <th>Fail</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className={row.locked ? 'test-phase-row-locked' : ''}>
                {showStandardColumn ? <td>{checkedStandardLabel(row.standard)}</td> : null}
                <th scope="row">{row.phase}</th>
                <td>
                  {row.test}
                  {row.acceptanceCriteria ? (
                    <div className="test-phase-acceptance">Acceptance: {row.acceptanceCriteria}</div>
                  ) : null}
                </td>
                <td>
                  {row.mediumEditable && row.mediumOptions?.length ? (
                    <select
                      value={row.medium}
                      disabled={row.locked}
                      onChange={(e) => onPhaseChange(row.id, { medium: e.target.value })}
                    >
                      {row.mediumOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    row.medium
                  )}
                </td>
                <td className="test-required-params-emphasis">
                  {row.needsActualPressure ? (
                    <input
                      type="text"
                      className="test-phase-pressure-input"
                      placeholder={row.testPressure}
                      disabled={row.locked}
                      value={row.actualPressure ?? ''}
                      onChange={(e) => onPhaseChange(row.id, { actualPressure: e.target.value })}
                    />
                  ) : (
                    row.displayPressure ?? row.testPressure
                  )}
                </td>
                <td className="test-required-params-emphasis">{row.holdTime}</td>
                <td>
                  {row.leakage}
                  {row.leakageDetail?.note ? (
                    <div className="test-phase-leak-note">{row.leakageDetail.note}</div>
                  ) : null}
                </td>
                <td>
                  <input
                    type="radio"
                    name={`phase-pf-${row.id}`}
                    checked={row.passFail === 'pass'}
                    disabled={row.locked}
                    onChange={() => onPhaseChange(row.id, { passFail: 'pass' })}
                    aria-label={`${row.phase} pass`}
                  />
                </td>
                <td>
                  <input
                    type="radio"
                    name={`phase-pf-${row.id}`}
                    checked={row.passFail === 'fail'}
                    disabled={row.locked}
                    onChange={() => onPhaseChange(row.id, { passFail: 'fail' })}
                    aria-label={`${row.phase} fail`}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="test-phase-notes-input"
                    placeholder="Notes"
                    disabled={row.locked}
                    value={row.notes ?? ''}
                    onChange={(e) => onPhaseChange(row.id, { notes: e.target.value })}
                  />
                </td>
              </tr>
              {row.noticeAfter ? (
                <tr className="test-phase-notice-row">
                  <td colSpan={showStandardColumn ? 10 : 9}>{row.noticeAfter}</td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RequiredTestParametersPanel({
  valveId,
  size,
  pressureClass,
  bodyMaterial,
  bundle,
  seatType,
  onSeatTypeChange,
  phaseState,
  enabledOptionalPhaseIds,
  onPhaseChange,
  onToggleOptionalPhase,
  valveContext,
}: RequiredTestParametersPanelProps) {
  const precheckSteps = useMemo(
    () => mergePhaseRows(bundle?.precheckSteps ?? [], phaseState, valveContext, { enforceLocking: false }),
    [bundle?.precheckSteps, phaseState, valveContext],
  )

  const phases = useMemo(
    () => mergePhaseRows(bundle?.phases ?? [], phaseState, valveContext),
    [bundle?.phases, phaseState, valveContext],
  )

  const optionalPhases = useMemo(() => {
    const enabled = (bundle?.optionalPhases ?? []).filter((p) => enabledOptionalPhaseIds.includes(p.id))
    return mergePhaseRows(enabled, phaseState, valveContext)
  }, [bundle?.optionalPhases, enabledOptionalPhaseIds, phaseState, valveContext])

  const showStandardColumn = useMemo(() => {
    const keys = new Set(phases.map((p) => p.standard))
    return keys.size > 1
  }, [phases])

  if (!bundle) {
    return (
      <div className="test-required-params test-required-params--empty">
        <h5 className="test-required-params-title">Required test parameters</h5>
        <p className="test-required-params-note">
          Select test requirements and complete valve size, pressure class, and body material to calculate required
          test parameters.
        </p>
      </div>
    )
  }

  const summary = bundle.summary
  const hasRequirements =
    bundle.precheckSteps.length > 0 || bundle.phases.length > 0 || bundle.infoPanels.length > 0

  return (
    <div className="test-required-params">
      <h5 className="test-required-params-title">Required test parameters</h5>

      {summary ? (
        <div className="test-required-params-summary-card">
          <div className="test-required-params-summary-line">
            <strong>Valve:</strong> {valveId} | {size || '—'}" {pressureClass || '—'} {bodyMaterial || '—'}
          </div>
          <div className="test-required-params-summary-grid">
            <div>
              <span className="test-required-params-k">CWP</span>
              <span className="test-required-params-emphasis">{summary.cwp || '—'} PSI</span>
            </div>
            <div>
              <span className="test-required-params-k">Shell test</span>
              <span className="test-required-params-emphasis">{summary.shellTestPressure || '—'} PSI</span>
            </div>
            <div>
              <span className="test-required-params-k">HP seat/backseat</span>
              <span className="test-required-params-emphasis">{summary.hpSeatTestPressure || '—'} PSI</span>
            </div>
            <div>
              <span className="test-required-params-k">LP seat</span>
              <span className="test-required-params-emphasis">{summary.lpSeatTestPressure}</span>
            </div>
            {summary.sp160HeliumPressure != null ? (
              <div>
                <span className="test-required-params-k">SP-160 helium</span>
                <span className="test-required-params-emphasis">{summary.sp160HeliumPressure} PSI</span>
              </div>
            ) : null}
          </div>
          <div className="test-required-params-footer">
            <span>
              Size bracket: <strong>{summary.sizeBracketLabel}</strong> → <strong>{summary.sizeBracket}</strong> hold
              time group
            </span>
            <span>
              Seat type:{' '}
              <fieldset className="test-seat-type-inline">
                {(
                  [
                    { value: 'soft-resilient' as SeatTypeKind, label: 'Soft / Resilient' },
                    { value: 'metal' as SeatTypeKind, label: 'Metal' },
                  ] as const
                ).map((opt) => (
                  <label key={opt.value}>
                    <input
                      type="radio"
                      name="seat-type-panel"
                      checked={seatType === opt.value}
                      onChange={() => onSeatTypeChange(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </fieldset>
            </span>
            <span>
              Valve type: <strong>{summary.valveType}</strong>
            </span>
          </div>
        </div>
      ) : (
        <p className="test-required-params-note">Complete valve data to calculate CWP and test pressures.</p>
      )}

      {bundle.notices.map((notice) => (
        <p key={notice} className="test-required-params-notice">
          {notice}
        </p>
      ))}

      {bundle.infoPanels.map((panel) => (
        <div key={panel.standard} className="test-required-params-info-panel">
          <strong>{panel.title}</strong>
          <p>{panel.message}</p>
        </div>
      ))}

      {summary?.warnings.length ? (
        <ul className="test-required-params-warnings">
          {summary.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {hasRequirements ? (
        <>
          {precheckSteps.length ? (
            <div className="test-required-params-precheck">
              <h6 className="test-required-params-precheck-title">Pre-check (not part of phase locking)</h6>
              <PhaseTable rows={precheckSteps} onPhaseChange={onPhaseChange} showStandardColumn={false} />
            </div>
          ) : null}
          <PhaseTable rows={phases} onPhaseChange={onPhaseChange} showStandardColumn={showStandardColumn} />
        </>
      ) : bundle.complete ? (
        <p className="test-required-params-note">No test requirement checkboxes selected.</p>
      ) : null}

      {bundle.optionalPhases.length ? (
        <div className="test-required-params-optional">
          <h6>Optional API 6D tests</h6>
          {bundle.optionalPhases.map((phase) => (
            <label key={phase.id} className="test-required-params-optional-item">
              <input
                type="checkbox"
                checked={enabledOptionalPhaseIds.includes(phase.id)}
                onChange={(e) => onToggleOptionalPhase(phase.id, e.target.checked)}
              />
              <span>
                {phase.phase} — {phase.test}
              </span>
            </label>
          ))}
          {optionalPhases.length ? (
            <PhaseTable rows={optionalPhases} onPhaseChange={onPhaseChange} showStandardColumn={false} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
