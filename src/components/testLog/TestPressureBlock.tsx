import type { PressureTestBlock } from '../../types/testLog'
import type { TestMediaFields } from '../../lib/testLogMedia'
import type { TestGauge } from '../../types/testGauge'
import { TestGaugeSelect } from './TestGaugeSelect'
import { TestMediaSelect } from './TestMediaSelect'
import { TestTimeSelect } from './TestTimeSelect'

type TestPressureBlockProps = {
  title: string
  accent: 'low' | 'high' | 'shell'
  value: PressureTestBlock
  testMediaOptions: string[]
  gaugeOptions: TestGauge[]
  showChartRecorder?: boolean
  chartRecorderOptions?: TestGauge[]
  onChange: (next: PressureTestBlock) => void
}

export function TestPressureBlock({
  title,
  accent,
  value,
  testMediaOptions,
  gaugeOptions,
  showChartRecorder = false,
  chartRecorderOptions = [],
  onChange,
}: TestPressureBlockProps) {
  const patchMedia = (media: TestMediaFields) => onChange({ ...value, ...media })

  return (
    <div className={`test-pressure-block test-pressure-block-${accent}`}>
      <div className={`test-pressure-block-label test-pressure-block-label-${accent}`}>{title}</div>
      <TestMediaSelect id={`${accent}-pressure`} options={testMediaOptions} value={value} onChange={patchMedia} />
      <TestGaugeSelect
        id={`${accent}-gauge`}
        options={gaugeOptions}
        value={{ gaugeId: value.gaugeId, gauge: value.gauge }}
        onChange={(gauge) => onChange({ ...value, ...gauge })}
      />
      {showChartRecorder ? (
        <TestGaugeSelect
          id={`${accent}-chart-recorder`}
          label="Chart Recorder #"
          placeholder="Select chart recorder…"
          options={chartRecorderOptions}
          value={{ gaugeId: value.chartRecorderId, gauge: value.chartRecorderNumber }}
          onChange={(picked) =>
            onChange({
              ...value,
              chartRecorderId: picked.gaugeId,
              chartRecorderNumber: picked.gauge,
            })
          }
        />
      ) : null}
      <label>
        Test Pressure
        <input
          type="text"
          value={value.pressure}
          onChange={(e) => onChange({ ...value, pressure: e.target.value })}
        />
      </label>
      <TestTimeSelect
        id={`${accent}-pressure`}
        value={value.time}
        onChange={(time) => onChange({ ...value, time })}
      />
      <fieldset className="test-pressure-result-fieldset">
        <legend>Result</legend>
        <label className="test-pressure-result-option">
          <input
            type="radio"
            name={`${accent}-result`}
            checked={value.result === 'pass'}
            onChange={() => onChange({ ...value, result: 'pass', reason: '' })}
          />
          Pass
        </label>
        <label className="test-pressure-result-option">
          <input
            type="radio"
            name={`${accent}-result`}
            checked={value.result === 'fail'}
            onChange={() => onChange({ ...value, result: 'fail' })}
          />
          Fail
        </label>
      </fieldset>
      {value.result === 'fail' ? (
        <label>
          Reason
          <input type="text" value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} />
        </label>
      ) : null}
    </div>
  )
}
