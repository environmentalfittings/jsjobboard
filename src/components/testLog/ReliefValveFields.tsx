import { useMemo } from 'react'
import {
  RELIEF_VALVE_LEAK_RATES,
  RELIEF_VALVE_MEDIA,
  RELIEF_VALVE_PASS_TOLERANCE_PERCENT,
  RELIEF_VALVE_TEST_STAGES,
  RELIEF_VALVE_TEST_TYPES,
  applyReliefValveEvaluations,
  evaluateReliefValveOverall,
  formatReliefValveAverage,
  type ReliefValveTestFields,
  type ReliefValveTestStage,
} from '../../lib/reliefValveTest'
import { isNaAnswer, NA_MEAS_VALUE } from '../../lib/itpItemRequirements'
import type { TestGauge } from '../../types/testGauge'
import { TestGaugeSelect } from './TestGaugeSelect'

type ReliefValveFieldsProps = {
  value: ReliefValveTestFields
  sizeOptions: string[]
  gaugeOptions: TestGauge[]
  onChange: (next: ReliefValveTestFields) => void
  onStageChange?: (stage: ReliefValveTestStage) => void
}

function NaTextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  const naOn = isNaAnswer(value)
  return (
    <label className={`test-log-relief-na-field${naOn ? ' is-na' : ''}`}>
      <span className="test-log-relief-na-field-hdr">
        <span>{label}</span>
        <button
          type="button"
          className={`test-log-relief-na-btn${naOn ? ' on' : ''}`}
          aria-pressed={naOn}
          title={naOn ? 'Clear N/A and enter a value' : 'Mark this field not applicable'}
          onClick={() => onChange(naOn ? '' : NA_MEAS_VALUE)}
        >
          N/A
        </button>
      </span>
      {naOn ? (
        <input value={NA_MEAS_VALUE} disabled readOnly aria-label={`${label} not applicable`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  )
}

export function ReliefValveFields({
  value,
  sizeOptions,
  gaugeOptions,
  onChange,
  onStageChange,
}: ReliefValveFieldsProps) {
  const showMediaOther = value.media.trim().toLowerCase() === 'other'
  const showPreTestFields = value.stage === 'Pre-test'
  const evaluation = useMemo(() => evaluateReliefValveOverall(value), [value])
  const popAverageLabel = formatReliefValveAverage(evaluation.pop.average)
  const setLabel = formatReliefValveAverage(evaluation.pop.setPressure)
  const maxPopLabel = formatReliefValveAverage(evaluation.pop.maxPassPressure)
  const reseatAverageLabel = formatReliefValveAverage(evaluation.reseat.reseatAverage)
  const reseatMinLabel = formatReliefValveAverage(evaluation.reseat.minPass)
  const reseatMaxLabel = formatReliefValveAverage(evaluation.reseat.maxPass)

  const patch = (partial: Partial<ReliefValveTestFields>) => {
    const next = applyReliefValveEvaluations({ ...value, ...partial })
    onChange(next)
  }

  const setStage = (stage: ReliefValveTestStage) => {
    patch({ stage })
    onStageChange?.(stage)
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

      <div className="test-log-relief-gauge">
        <TestGaugeSelect
          id="relief-valve-gauge"
          options={gaugeOptions}
          value={{ gaugeId: value.gaugeId, gauge: value.gauge }}
          onChange={(gauge) => patch(gauge)}
        />
      </div>

      <fieldset className="test-log-relief-test-type">
        <legend>
          Test type <span className="test-log-required-mark">*</span>
        </legend>
        <div className="test-log-relief-test-type-options">
          {RELIEF_VALVE_TEST_TYPES.map((testType) => (
            <label key={testType} className="test-log-inline-radio">
              <input
                type="radio"
                name="relief-valve-test-type"
                checked={value.testType === testType}
                onChange={() => patch({ testType })}
              />
              {testType}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="test-log-relief-test-type">
        <legend>
          Test stage <span className="test-log-required-mark">*</span>
        </legend>
        <p className="test-log-relief-stage-hint">
          Fills the ValveKeep traveler Pre-test or Set and test step when you save.
        </p>
        <div className="test-log-relief-test-type-options">
          {RELIEF_VALVE_TEST_STAGES.map((stage) => (
            <label key={stage} className="test-log-inline-radio">
              <input
                type="radio"
                name="relief-valve-test-stage"
                checked={value.stage === stage}
                onChange={() => setStage(stage)}
              />
              {stage}
            </label>
          ))}
        </div>
      </fieldset>

      {showPreTestFields ? (
        <div className="test-log-relief-set-pressure-tests test-log-relief-pretest-extra">
          <div className="test-log-relief-set-pressure-heading">
            <h5>Pre-test traveler fields</h5>
            <p>Optional — mark N/A when not applicable. Saved into the Pre-test step.</p>
          </div>
          <NaTextField
            label="Back Pressure Test"
            value={value.backPressureTest}
            onChange={(backPressureTest) => patch({ backPressureTest })}
          />
          <NaTextField
            label="Bellows Test"
            value={value.bellowsTest}
            onChange={(bellowsTest) => patch({ bellowsTest })}
          />
          <NaTextField
            label="Leak Test"
            value={value.leakTest}
            onChange={(leakTest) => patch({ leakTest })}
          />
          <NaTextField
            label="Leak Test @"
            value={value.leakTestAt}
            placeholder="PSI"
            onChange={(leakTestAt) => patch({ leakTestAt })}
          />
          <label className={`test-log-relief-na-field${isNaAnswer(value.leakRate) ? ' is-na' : ''}`}>
            <span className="test-log-relief-na-field-hdr">
              <span>Leak rate</span>
              <button
                type="button"
                className={`test-log-relief-na-btn${isNaAnswer(value.leakRate) ? ' on' : ''}`}
                aria-pressed={isNaAnswer(value.leakRate)}
                title={
                  isNaAnswer(value.leakRate)
                    ? 'Clear N/A and choose a rate'
                    : 'Mark this field not applicable'
                }
                onClick={() =>
                  patch({ leakRate: isNaAnswer(value.leakRate) ? '' : NA_MEAS_VALUE })
                }
              >
                N/A
              </button>
            </span>
            {isNaAnswer(value.leakRate) ? (
              <input value={NA_MEAS_VALUE} disabled readOnly aria-label="Leak rate not applicable" />
            ) : (
              <select value={value.leakRate} onChange={(e) => patch({ leakRate: e.target.value })}>
                <option value="">— Select leak rate —</option>
                {RELIEF_VALVE_LEAK_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      ) : null}

      <div className="test-log-relief-set-pressure-tests">
        <div className="test-log-relief-set-pressure-heading">
          <h5>Pop / set pressure tests</h5>
          <p>
            Pass when the three-pop average is from set pressure up to +{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}%
            (never below set).
          </p>
        </div>

        <label>
          Pop 1 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.test1}
            onChange={(e) => patch({ test1: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Pop 2 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.test2}
            onChange={(e) => patch({ test2: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Pop 3 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.test3}
            onChange={(e) => patch({ test3: e.target.value })}
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
          <span className="test-log-relief-average-label">Pop average</span>
          <strong className="test-log-relief-average-value">
            {popAverageLabel ? `${popAverageLabel} PSI` : '—'}
          </strong>
          {setLabel && maxPopLabel ? (
            <span className="test-log-relief-average-band">
              Pass band: {setLabel}–{maxPopLabel} PSI
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
        </div>

        <label>
          Reseat 1 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.reseat1}
            onChange={(e) => patch({ reseat1: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Reseat 2 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.reseat2}
            onChange={(e) => patch({ reseat2: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Reseat 3 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.reseat3}
            onChange={(e) => patch({ reseat3: e.target.value })}
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
          <span className="test-log-relief-average-label">Reseat average</span>
          <strong className="test-log-relief-average-value">
            {reseatAverageLabel ? `${reseatAverageLabel} PSI` : '—'}
          </strong>
          {reseatMinLabel && reseatMaxLabel ? (
            <span className="test-log-relief-average-band">
              {evaluation.reseat.enforced ? 'Pass band' : 'Target band'}: {reseatMinLabel}–{reseatMaxLabel}{' '}
              PSI
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
          Overall result <span className="test-log-required-mark">*</span>
        </legend>
        <p className="test-log-relief-result-hint">{evaluation.summary}</p>
        <label className="test-pressure-result-option">
          <input type="radio" name="relief-valve-result" checked={value.result === 'pass'} readOnly disabled />
          Pass
        </label>
        <label className="test-pressure-result-option">
          <input type="radio" name="relief-valve-result" checked={value.result === 'fail'} readOnly disabled />
          Fail
        </label>
      </fieldset>

      {value.result === 'fail' ? (
        <label className="test-log-relief-fail-reason">
          Fail reason <span className="test-log-required-mark">*</span>
          <input
            type="text"
            value={value.reason}
            onChange={(e) => patch({ reason: e.target.value })}
            placeholder="Describe why the test failed"
          />
        </label>
      ) : null}
    </div>
  )
}
