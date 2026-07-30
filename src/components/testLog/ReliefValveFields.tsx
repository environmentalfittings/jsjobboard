import { useMemo, type ReactNode } from 'react'
import {
  RELIEF_VALVE_MEDIA,
  RELIEF_VALVE_PASS_TOLERANCE_PERCENT,
  RELIEF_VALVE_PRETEST_KINDS,
  applyReliefValveEvaluations,
  evaluateReliefValveRun,
  formatReliefValveAverage,
  type ReliefValveRunFields,
  type ReliefValveTestFields,
} from '../../lib/reliefValveTest'
import type { TestGauge } from '../../types/testGauge'
import type { Employee } from '../../types/employees'
import { TestGaugeSelect } from './TestGaugeSelect'
import { TestLogTesterSelect } from './TestLogTesterSelect'

type ReliefValveFieldsProps = {
  value: ReliefValveTestFields
  sizeOptions: string[]
  gaugeOptions: TestGauge[]
  testerOptions: Array<Pick<Employee, 'id' | 'full_name' | 'initials'>>
  testersLoading?: boolean
  onChange: (next: ReliefValveTestFields) => void
}

type RunSectionProps = {
  title: string
  hint: string
  runKey: 'pretest' | 'final'
  run: ReliefValveRunFields
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>
  gaugeOptions: TestGauge[]
  testerOptions: Array<Pick<Employee, 'id' | 'full_name' | 'initials'>>
  testersLoading?: boolean
  gaugeSelectId: string
  resultName: string
  onPatchRun: (partial: Partial<ReliefValveRunFields>) => void
  children?: ReactNode
}

function ReliefValveRunSection({
  title,
  hint,
  runKey,
  run,
  header,
  gaugeOptions,
  testerOptions,
  testersLoading = false,
  gaugeSelectId,
  resultName,
  onPatchRun,
  children,
}: RunSectionProps) {
  const evaluation = useMemo(() => evaluateReliefValveRun(run, header), [run, header])
  const popAverageLabel = formatReliefValveAverage(evaluation.pop.average)
  const setLabel = formatReliefValveAverage(evaluation.pop.setPressure)
  const maxPopLabel = formatReliefValveAverage(evaluation.pop.maxPassPressure)
  const reseatAverageLabel = formatReliefValveAverage(evaluation.reseat.reseatAverage)
  const reseatMinLabel = formatReliefValveAverage(evaluation.reseat.minPass)
  const reseatMaxLabel = formatReliefValveAverage(evaluation.reseat.maxPass)
  const popAvgForReseatLabel = formatReliefValveAverage(evaluation.reseat.popAverage)
  const reseatTol = evaluation.reseat.tolerancePercent
  const popCountLabel =
    evaluation.pop.enteredCount > 0
      ? evaluation.pop.complete
        ? '3 of 3'
        : `${evaluation.pop.enteredCount} of 3`
      : null
  const reseatCountLabel =
    evaluation.reseat.reseatEnteredCount > 0
      ? evaluation.reseat.reseatComplete
        ? '3 of 3'
        : `${evaluation.reseat.reseatEnteredCount} of 3`
      : null

  return (
    <section className={`test-log-relief-run test-log-relief-run--${runKey}`}>
      <div className="test-log-relief-run-heading">
        <h4>{title}</h4>
        <p>{hint}</p>
      </div>

      {children}

      <div className="test-log-relief-run-tester">
        <TestLogTesterSelect
          label={`${title} tester(s)`}
          value={run.tester}
          options={testerOptions}
          loading={testersLoading}
          emptyHint={`Required — select tester(s) for the ${title.toLowerCase()}`}
          onChange={(tester) => onPatchRun({ tester })}
        />
      </div>

      <div className="test-log-relief-gauge">
        <TestGaugeSelect
          id={gaugeSelectId}
          options={gaugeOptions}
          value={{ gaugeId: run.gaugeId, gauge: run.gauge }}
          onChange={(gauge) => onPatchRun(gauge)}
        />
      </div>

      <div className="test-log-relief-set-pressure-tests">
        <div className="test-log-relief-set-pressure-heading">
          <h5>Pop / set pressure tests</h5>
          <p>
            Pass when the three-pop average is from set pressure up to +{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}%
            (never below set).
          </p>
          <div className="test-log-relief-criteria" aria-live="polite">
            <span className="test-log-relief-criteria-label">Pass criteria</span>
            {setLabel && maxPopLabel ? (
              <strong className="test-log-relief-criteria-value">
                {setLabel} – {maxPopLabel} PSI
              </strong>
            ) : (
              <strong className="test-log-relief-criteria-value test-log-relief-criteria-value--pending">
                Enter set pressure above
              </strong>
            )}
            {setLabel && maxPopLabel ? (
              <span className="test-log-relief-criteria-detail">
                Based on set pressure {setLabel} PSI (+{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}% max)
              </span>
            ) : null}
          </div>
        </div>

        <label>
          Pop 1 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={run.test1}
            onChange={(e) => onPatchRun({ test1: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Pop 2 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={run.test2}
            onChange={(e) => onPatchRun({ test2: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Pop 3 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={run.test3}
            onChange={(e) => onPatchRun({ test3: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <div
          className={`test-log-relief-average${
            evaluation.pop.result === 'pass'
              ? ' test-log-relief-average-pass'
              : evaluation.pop.result === 'fail'
                ? ' test-log-relief-average-fail'
                : ''
          }`}
          aria-live="polite"
        >
          <span className="test-log-relief-average-label">
            {evaluation.pop.complete ? 'Pop average' : 'Pop average (running)'}
            {popCountLabel ? ` · ${popCountLabel}` : ''}
          </span>
          <strong className="test-log-relief-average-value">
            {popAverageLabel ? `${popAverageLabel} PSI` : '—'}
          </strong>
          {setLabel && maxPopLabel ? (
            <span className="test-log-relief-average-band">
              Must be {setLabel}–{maxPopLabel} PSI
            </span>
          ) : null}
          <span
            className={`test-log-relief-average-delta${
              evaluation.pop.result === 'pass'
                ? ' test-log-relief-average-delta-match'
                : evaluation.pop.result === 'fail'
                  ? ' test-log-relief-average-delta-under'
                  : ''
            }`}
          >
            {evaluation.pop.summary}
          </span>
        </div>
      </div>

      <div className="test-log-relief-set-pressure-tests test-log-relief-reseat-tests">
        <div className="test-log-relief-set-pressure-heading">
          <h5>Reseat pressure tests</h5>
          <p>
            Compared to pop average — Steam within 6%, Air/Gas within 10%. Liquid has no pass/fail (target within
            10%).
          </p>
          <div className="test-log-relief-criteria" aria-live="polite">
            <span className="test-log-relief-criteria-label">
              {evaluation.reseat.enforced === false && reseatTol != null ? 'Target criteria' : 'Pass criteria'}
            </span>
            {reseatMinLabel && reseatMaxLabel && popAvgForReseatLabel ? (
              <strong className="test-log-relief-criteria-value">
                {reseatMinLabel} – {reseatMaxLabel} PSI
              </strong>
            ) : (
              <strong className="test-log-relief-criteria-value test-log-relief-criteria-value--pending">
                {reseatTol != null
                  ? `Waiting on first pop (±${reseatTol}%)`
                  : 'Select media, then enter pop tests'}
              </strong>
            )}
            {reseatMinLabel && reseatMaxLabel && popAvgForReseatLabel && reseatTol != null ? (
              <span className="test-log-relief-criteria-detail">
                ±{reseatTol}% of pop average {popAvgForReseatLabel} PSI
                {!evaluation.reseat.popComplete
                  ? ` (updates with each pop · ${evaluation.reseat.popEnteredCount} of 3)`
                  : ''}
                {evaluation.reseat.enforced === false ? ' (advisory only)' : ''}
              </span>
            ) : popAvgForReseatLabel ? (
              <span className="test-log-relief-criteria-detail">
                Pop average {popAvgForReseatLabel} PSI — enter reseat readings
              </span>
            ) : (
              <span className="test-log-relief-criteria-detail">
                Band moves with each pop reading
              </span>
            )}
          </div>
        </div>

        <label>
          Reseat 1 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={run.reseat1}
            onChange={(e) => onPatchRun({ reseat1: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Reseat 2 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={run.reseat2}
            onChange={(e) => onPatchRun({ reseat2: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Reseat 3 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={run.reseat3}
            onChange={(e) => onPatchRun({ reseat3: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <div
          className={`test-log-relief-average${
            evaluation.reseat.result === 'pass'
              ? ' test-log-relief-average-pass'
              : evaluation.reseat.result === 'fail'
                ? ' test-log-relief-average-fail'
                : evaluation.reseat.result === 'na'
                  ? ' test-log-relief-average-advisory'
                  : ''
          }`}
          aria-live="polite"
        >
          <span className="test-log-relief-average-label">
            {evaluation.reseat.reseatComplete ? 'Reseat average' : 'Reseat average (running)'}
            {reseatCountLabel ? ` · ${reseatCountLabel}` : ''}
          </span>
          <strong className="test-log-relief-average-value">
            {reseatAverageLabel ? `${reseatAverageLabel} PSI` : '—'}
          </strong>
          {reseatMinLabel && reseatMaxLabel ? (
            <span className="test-log-relief-average-band">
              Must be {reseatMinLabel}–{reseatMaxLabel} PSI
            </span>
          ) : null}
          <span
            className={`test-log-relief-average-delta${
              evaluation.reseat.result === 'pass'
                ? ' test-log-relief-average-delta-match'
                : evaluation.reseat.result === 'fail'
                  ? ' test-log-relief-average-delta-under'
                  : ''
            }`}
          >
            {evaluation.reseat.summary}
          </span>
        </div>
      </div>

      <fieldset className="test-pressure-result-fieldset test-log-relief-result">
        <legend>
          {title} result <span className="test-log-required-mark">*</span>
        </legend>
        <p className="test-log-relief-result-hint">{evaluation.summary}</p>
        <label className="test-pressure-result-option">
          <input type="radio" name={resultName} checked={run.result === 'pass'} readOnly disabled />
          Pass
        </label>
        <label className="test-pressure-result-option">
          <input type="radio" name={resultName} checked={run.result === 'fail'} readOnly disabled />
          Fail
        </label>
      </fieldset>

      {run.result === 'fail' ? (
        <label className="test-log-relief-fail-reason">
          Fail reason <span className="test-log-required-mark">*</span>
          <input
            type="text"
            value={run.reason}
            onChange={(e) => onPatchRun({ reason: e.target.value })}
            placeholder="Describe why the test failed"
          />
        </label>
      ) : null}
    </section>
  )
}

export function ReliefValveFields({
  value,
  sizeOptions,
  gaugeOptions,
  testerOptions,
  testersLoading = false,
  onChange,
}: ReliefValveFieldsProps) {
  const showMediaOther = value.media.trim().toLowerCase() === 'other'
  const header = useMemo(
    () => ({ setPressure: value.setPressure, media: value.media }),
    [value.setPressure, value.media],
  )

  const patch = (partial: Partial<ReliefValveTestFields>) => {
    const next = applyReliefValveEvaluations({ ...value, ...partial })
    onChange(next)
  }

  const patchRun = (runKey: 'pretest' | 'final', partial: Partial<ReliefValveRunFields>) => {
    patch({
      [runKey]: {
        ...value[runKey],
        ...partial,
      },
    })
  }

  const sizeSelect = (current: string) => {
    const options = [...sizeOptions]
    if (current && !options.some((opt) => opt.toLowerCase() === current.toLowerCase())) {
      options.unshift(current)
    }
    return options
  }

  return (
    <div className="test-log-relief-fields">
      <p className="test-log-relief-record-note">
        One record per valve — optional pretest plus a required final test. You can save the pretest first and
        complete the final later on the same entry.
      </p>

      <label>
        Inlet size <span className="test-log-required-mark">*</span>
        <select value={value.inletSize} onChange={(e) => patch({ inletSize: e.target.value })}>
          <option value="">— Select inlet size —</option>
          {sizeSelect(value.inletSize).map((size) => (
            <option key={`inlet-${size}`} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label>
        Outlet size <span className="test-log-required-mark">*</span>
        <select value={value.outletSize} onChange={(e) => patch({ outletSize: e.target.value })}>
          <option value="">— Select outlet size —</option>
          {sizeSelect(value.outletSize).map((size) => (
            <option key={`outlet-${size}`} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label>
        Set pressure <span className="test-log-required-mark">*</span>
        <input
          type="text"
          inputMode="decimal"
          value={value.setPressure}
          onChange={(e) => patch({ setPressure: e.target.value })}
          placeholder="e.g. 150"
        />
      </label>

      <label>
        Media <span className="test-log-required-mark">*</span>
        <select value={value.media} onChange={(e) => patch({ media: e.target.value, mediaOther: '' })}>
          <option value="">— Select media —</option>
          {RELIEF_VALVE_MEDIA.map((media) => (
            <option key={media} value={media}>
              {media}
            </option>
          ))}
        </select>
      </label>

      {showMediaOther ? (
        <label>
          Other media <span className="test-log-required-mark">*</span>
          <input
            type="text"
            value={value.mediaOther}
            onChange={(e) => patch({ mediaOther: e.target.value })}
            placeholder="Describe media"
          />
        </label>
      ) : null}

      <label className="test-log-relief-include-pretest">
        <input
          type="checkbox"
          checked={value.includePretest}
          onChange={(e) =>
            patch({
              includePretest: e.target.checked,
              pretestKind: e.target.checked ? value.pretestKind || 'Pretest' : value.pretestKind,
            })
          }
        />
        Include pretest (as-found)
      </label>

      {value.includePretest ? (
        <ReliefValveRunSection
          title="Pretest"
          hint="As-found / pretest readings before or during repair."
          runKey="pretest"
          run={value.pretest}
          header={header}
          gaugeOptions={gaugeOptions}
          testerOptions={testerOptions}
          testersLoading={testersLoading}
          gaugeSelectId="relief-valve-pretest-gauge"
          resultName="relief-valve-pretest-result"
          onPatchRun={(partial) => patchRun('pretest', partial)}
        >
          <fieldset className="test-log-relief-test-type">
            <legend>
              Pretest type <span className="test-log-required-mark">*</span>
            </legend>
            <div className="test-log-relief-test-type-options">
              {RELIEF_VALVE_PRETEST_KINDS.map((kind) => (
                <label key={kind} className="test-log-inline-radio">
                  <input
                    type="radio"
                    name="relief-valve-pretest-kind"
                    checked={value.pretestKind === kind}
                    onChange={() => patch({ pretestKind: kind })}
                  />
                  {kind}
                </label>
              ))}
            </div>
          </fieldset>
        </ReliefValveRunSection>
      ) : null}

      <ReliefValveRunSection
        title="Final test"
        hint="Required as-left / final pop and reseat for this valve."
        runKey="final"
        run={value.final}
        header={header}
        gaugeOptions={gaugeOptions}
        testerOptions={testerOptions}
        testersLoading={testersLoading}
        gaugeSelectId="relief-valve-final-gauge"
        resultName="relief-valve-final-result"
        onPatchRun={(partial) => patchRun('final', partial)}
      />
    </div>
  )
}
