import { useMemo } from 'react'
import {
  RELIEF_VALVE_MEDIA,
  RELIEF_VALVE_TEST_TYPES,
  averageReliefValveTests,
  formatReliefValveAverage,
  parseReliefPressureValue,
  type ReliefValveTestFields,
} from '../../lib/reliefValveTest'

type ReliefValveFieldsProps = {
  value: ReliefValveTestFields
  sizeOptions: string[]
  onChange: (next: ReliefValveTestFields) => void
}

export function ReliefValveFields({ value, sizeOptions, onChange }: ReliefValveFieldsProps) {
  const patch = (partial: Partial<ReliefValveTestFields>) => onChange({ ...value, ...partial })
  const showMediaOther = value.media.trim().toLowerCase() === 'other'
  const average = useMemo(() => averageReliefValveTests(value), [value])
  const averageLabel = formatReliefValveAverage(average)
  const setPressureNumber = parseReliefPressureValue(value.setPressure)
  const averageDelta =
    average !== null && setPressureNumber !== null ? average - setPressureNumber : null

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
          <p>Enter three pop tests. Average updates automatically.</p>
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

        <div className="test-log-relief-average" aria-live="polite">
          <span className="test-log-relief-average-label">Average</span>
          <strong className="test-log-relief-average-value">
            {averageLabel ? `${averageLabel} PSI` : '—'}
          </strong>
          {averageDelta !== null ? (
            <span
              className={`test-log-relief-average-delta${
                Math.abs(averageDelta) < 0.0001
                  ? ' test-log-relief-average-delta-match'
                  : averageDelta > 0
                    ? ' test-log-relief-average-delta-over'
                    : ' test-log-relief-average-delta-under'
              }`}
            >
              {Math.abs(averageDelta) < 0.0001
                ? 'Matches set pressure'
                : `${averageDelta > 0 ? '+' : ''}${formatReliefValveAverage(averageDelta)} vs set`}
            </span>
          ) : (
            <span className="test-log-relief-average-delta">Enter all three tests</span>
          )}
        </div>
      </div>

      <fieldset className="test-pressure-result-fieldset test-log-relief-result">
        <legend>
          Result <span className="test-log-required-mark">*</span>
        </legend>
        <label className="test-pressure-result-option">
          <input
            type="radio"
            name="relief-valve-result"
            checked={value.result === 'pass'}
            onChange={() => patch({ result: 'pass', reason: '' })}
          />
          Pass
        </label>
        <label className="test-pressure-result-option">
          <input
            type="radio"
            name="relief-valve-result"
            checked={value.result === 'fail'}
            onChange={() => patch({ result: 'fail' })}
          />
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
