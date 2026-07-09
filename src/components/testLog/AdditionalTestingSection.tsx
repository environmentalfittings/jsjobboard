import type {
  CavityReliefTest,
  HeliumTest,
  PressureTestResult,
  TestLogTestingDetails,
  YesNo,
} from '../../types/testLog'
import type { TestGauge } from '../../types/testGauge'
import type { TestMediaFields } from '../../lib/testLogMedia'
import { TestGaugeSelect } from './TestGaugeSelect'
import { TestMediaSelect } from './TestMediaSelect'

type AdditionalTestingSectionProps = {
  testing: TestLogTestingDetails
  testMediaOptions: string[]
  gaugeOptions: TestGauge[]
  onChange: (patch: Partial<TestLogTestingDetails>) => void
}

function YesNoQuestion({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: YesNo
  onChange: (v: YesNo) => void
}) {
  return (
    <fieldset className="test-log-yesno-question">
      <legend>{label}</legend>
      <label className="test-log-inline-radio">
        <input type="radio" name={name} checked={value === 'yes'} onChange={() => onChange('yes')} />
        Yes
      </label>
      <label className="test-log-inline-radio">
        <input type="radio" name={name} checked={value === 'no'} onChange={() => onChange('no')} />
        No
      </label>
    </fieldset>
  )
}

function PassFailField({
  name,
  result,
  reason,
  onResult,
  onReason,
}: {
  name: string
  result: PressureTestResult
  reason: string
  onResult: (r: PressureTestResult) => void
  onReason: (r: string) => void
}) {
  return (
    <div className="test-additional-passfail">
      <fieldset className="test-pressure-result-fieldset">
        <legend>Result</legend>
        <label className="test-pressure-result-option">
          <input type="radio" name={name} checked={result === 'pass'} onChange={() => onResult('pass')} />
          Pass
        </label>
        <label className="test-pressure-result-option">
          <input type="radio" name={name} checked={result === 'fail'} onChange={() => onResult('fail')} />
          Fail
        </label>
      </fieldset>
      {result === 'fail' ? (
        <label>
          Reason
          <input type="text" value={reason} onChange={(e) => onReason(e.target.value)} />
        </label>
      ) : null}
    </div>
  )
}

function TestToggle({
  accent,
  label,
  checked,
  onChange,
}: {
  accent: 'helium' | 'cavity'
  label: string
  checked: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <label className={`test-additional-toggle test-additional-toggle-${accent}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function AdditionalTestingSection({ testing, testMediaOptions, gaugeOptions, onChange }: AdditionalTestingSectionProps) {
  const patchHelium = (patch: Partial<HeliumTest>) => {
    onChange({ heliumTest: { ...testing.heliumTest, ...patch } })
  }

  const patchCavity = (patch: Partial<CavityReliefTest>) => {
    onChange({ cavityReliefTest: { ...testing.cavityReliefTest, ...patch } })
  }

  return (
    <details className="test-log-additional-testing" open>
      <summary>Additional Testing (optional)</summary>

      <div className="test-additional-stack">
        <section className="test-additional-card">
          <TestToggle
            accent="helium"
            label="Helium Test"
            checked={testing.heliumTest.enabled}
            onChange={(enabled) => patchHelium({ enabled })}
          />
          {testing.heliumTest.enabled ? (
            <div className="test-additional-card-body">
              <TestMediaSelect
                id="helium"
                options={testMediaOptions}
                value={testing.heliumTest}
                onChange={(media: TestMediaFields) => patchHelium(media)}
              />

              <div className="test-additional-questions">
                <YesNoQuestion
                  label="Was Helium Tester calibrated prior to testing?"
                  name="helium-calibrated"
                  value={testing.heliumTest.heliumCalibrated}
                  onChange={(heliumCalibrated) => patchHelium({ heliumCalibrated })}
                />
                <YesNoQuestion
                  label="Was valve cycled a minimum of 5 times prior to testing?"
                  name="helium-cycled"
                  value={testing.heliumTest.cycled5x}
                  onChange={(cycled5x) => patchHelium({ cycled5x })}
                />
                <YesNoQuestion
                  label="Was valve in the mid stroke position?"
                  name="helium-midstroke"
                  value={testing.heliumTest.midStroke}
                  onChange={(midStroke) => patchHelium({ midStroke })}
                />
                <YesNoQuestion
                  label="Are all drafts eliminated from the work piece?"
                  name="helium-drafts"
                  value={testing.heliumTest.draftsEliminated}
                  onChange={(draftsEliminated) => patchHelium({ draftsEliminated })}
                />
              </div>

              <div className="test-additional-field-grid">
                <TestGaugeSelect
                  id="helium-gauge"
                  label="Test Gauge Serial Number"
                  options={gaugeOptions}
                  value={{ gaugeId: testing.heliumTest.gaugeId, gauge: testing.heliumTest.gauge }}
                  onChange={(gauge) => patchHelium(gauge)}
                />
                <label>
                  Test Pressure
                  <input
                    type="text"
                    value={testing.heliumTest.pressure}
                    onChange={(e) => patchHelium({ pressure: e.target.value })}
                  />
                </label>
                <label>
                  Test Time
                  <input
                    type="text"
                    value={testing.heliumTest.time}
                    onChange={(e) => patchHelium({ time: e.target.value })}
                  />
                </label>
                <label>
                  Ambient background reading
                  <input
                    type="text"
                    value={testing.heliumTest.ambient}
                    onChange={(e) => patchHelium({ ambient: e.target.value })}
                  />
                </label>
                <label>
                  Sample Taken From Stem
                  <input
                    type="text"
                    value={testing.heliumTest.stem}
                    onChange={(e) => patchHelium({ stem: e.target.value })}
                  />
                </label>
                <label>
                  Sample Taken From Bonnet
                  <input
                    type="text"
                    value={testing.heliumTest.bonnet}
                    onChange={(e) => patchHelium({ bonnet: e.target.value })}
                  />
                </label>
                <label>
                  Sample Taken From Body
                  <input
                    type="text"
                    value={testing.heliumTest.body}
                    onChange={(e) => patchHelium({ body: e.target.value })}
                  />
                </label>
              </div>

              <PassFailField
                name="helium-result"
                result={testing.heliumTest.result}
                reason={testing.heliumTest.reason}
                onResult={(result) => patchHelium({ result, reason: result === 'pass' ? '' : testing.heliumTest.reason })}
                onReason={(reason) => patchHelium({ reason })}
              />

              <p className="test-helium-fail-criteria">
                Valve fails if leak is greater than 1 × 10<sup>-4</sup> cm³/s (1 × 10<sup>-5</sup> Pa·m³/s)
              </p>
            </div>
          ) : null}
        </section>

        <section className="test-additional-card">
          <TestToggle
            accent="cavity"
            label="Cavity Relief Test"
            checked={testing.cavityReliefTest.enabled}
            onChange={(enabled) => patchCavity({ enabled })}
          />
          {testing.cavityReliefTest.enabled ? (
            <div className="test-additional-card-body">
              <TestMediaSelect
                id="cavity"
                options={testMediaOptions}
                value={testing.cavityReliefTest}
                onChange={(media: TestMediaFields) => patchCavity(media)}
              />

              <div className="test-additional-field-grid test-additional-field-grid-3">
                <label>
                  MAWP of valve at 100 Deg F
                  <input
                    type="text"
                    value={testing.cavityReliefTest.mawp100F}
                    onChange={(e) => patchCavity({ mawp100F: e.target.value })}
                  />
                </label>
                <label>
                  Pressure valve relieved at on Seat A
                  <input
                    type="text"
                    value={testing.cavityReliefTest.seatA}
                    onChange={(e) => patchCavity({ seatA: e.target.value })}
                  />
                </label>
                <label>
                  Pressure valve relieved at on Seat B
                  <input
                    type="text"
                    value={testing.cavityReliefTest.seatB}
                    onChange={(e) => patchCavity({ seatB: e.target.value })}
                  />
                </label>
              </div>
              <PassFailField
                name="cavity-result"
                result={testing.cavityReliefTest.result}
                reason={testing.cavityReliefTest.reason}
                onResult={(result) =>
                  patchCavity({ result, reason: result === 'pass' ? '' : testing.cavityReliefTest.reason })
                }
                onReason={(reason) => patchCavity({ reason })}
              />
            </div>
          ) : null}
        </section>

        <label className="test-additional-notes">
          Other notes
          <textarea
            rows={2}
            value={testing.additionalNotes}
            onChange={(e) => onChange({ additionalNotes: e.target.value })}
            placeholder="Any other testing notes…"
          />
        </label>
      </div>
    </details>
  )
}
