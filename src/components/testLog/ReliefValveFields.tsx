import { useMemo } from 'react'
import {
  RELIEF_VALVE_MEDIA,
  RELIEF_VALVE_PASS_TOLERANCE_PERCENT,
  RELIEF_VALVE_TEST_TYPES,
  evaluateReliefValvePassFail,
  formatReliefValveAverage,
  type ReliefValveTestFields,
} from '../../lib/reliefValveTest'

type ReliefValveFieldsProps = {
  value: ReliefValveTestFields
  sizeOptions: string[]
  onChange: (next: ReliefValveTestFields) => void
}

export function ReliefValveFields({ value, sizeOptions, onChange }: ReliefValveFieldsProps) {
  const showMediaOther = value.media.trim().toLowerCase() === 'other'
  const evaluation = useMemo(() => evaluateReliefValvePassFail(value), [value])
  const averageLabel = formatReliefValveAverage(evaluation.average)
  const setLabel = formatReliefValveAverage(evaluation.setPressure)
  const maxLabel = formatReliefValveAverage(evaluation.maxPassPressure)

  const patch = (partial: Partial<ReliefValveTestFields>) => {
    const next: ReliefValveTestFields = { ...value, ...partial }
    const nextEvaluation = evaluateReliefValvePassFail(next)
    if (nextEvaluation.result) {
      next.result = nextEvaluation.result
      if (nextEvaluation.result === 'pass') next.reason = ''
    } else if (!('result' in partial) && !('reason' in partial)) {
      next.result = ''
    }
    onChange(next)
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

      <div className="test-log-relief-set-pressure-tests">
        <div className="test-log-relief-set-pressure-heading">
          <h5>Set pressure tests</h5>
          <p>
            Pass when the three-pop average is from set pressure up to +{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}%
            (never below set).
          </p>
        </div>

        <label>
          Test 1 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.test1}
            onChange={(e) => patch({ test1: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Test 2 <span className="test-log-required-mark">*</span>
          <input
            type="text"
            inputMode="decimal"
            value={value.test2}
            onChange={(e) => patch({ test2: e.target.value })}
            placeholder="PSI"
          />
        </label>

        <label>
          Test 3 <span className="test-log-required-mark">*</span>
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
            evaluation.result === 'pass'
              ? ' test-log-relief-average-pass'
              : evaluation.result === 'fail'
                ? ' test-log-relief-average-fail'
                : ''
          }`}
          aria-live="polite"
        >
          <span className="test-log-relief-average-label">Average</span>
          <strong className="test-log-relief-average-value">
            {averageLabel ? `${averageLabel} PSI` : '—'}
          </strong>
          {setLabel && maxLabel ? (
            <span className="test-log-relief-average-band">
              Pass band: {setLabel}–{maxLabel} PSI
            </span>
          ) : null}
          <span
            className={`test-log-relief-average-delta${
              evaluation.result === 'pass'
                ? ' test-log-relief-average-delta-match'
                : evaluation.result === 'fail'
                  ? ' test-log-relief-average-delta-under'
                  : ''
            }`}
          >
            {evaluation.summary}
          </span>
        </div>
      </div>

      <fieldset className="test-pressure-result-fieldset test-log-relief-result">
        <legend>
          Result <span className="test-log-required-mark">*</span>
        </legend>
        <p className="test-log-relief-result-hint">
          Set automatically from the average vs set pressure (+{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}% max).
        </p>
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
