import { TEST_PROCEDURE_OTHER } from '../../lib/testLogProcedure'
import type { TestProcedureFields } from '../../lib/testLogProcedure'

type TestRequirementsSelectProps = {
  options: string[]
  value: TestProcedureFields
  onChange: (next: TestProcedureFields) => void
}

export function TestRequirementsSelect({ options, value, onChange }: TestRequirementsSelectProps) {
  const allOptions = [...options, TEST_PROCEDURE_OTHER]

  const toggleOption = (option: string, checked: boolean) => {
    const next = checked
      ? [...value.testProcedures, option]
      : value.testProcedures.filter((item) => item !== option)
    onChange({
      testProcedures: next,
      testProcedureOther: next.includes(TEST_PROCEDURE_OTHER) ? value.testProcedureOther : '',
    })
  }

  return (
    <fieldset className="test-requirements-select test-log-fieldset">
      <legend>Test requirements</legend>
      <div className="test-requirements-checkboxes" role="group" aria-label="Test requirements">
        {allOptions.map((option) => (
          <label key={option} className="test-requirements-checkbox">
            <input
              type="checkbox"
              checked={value.testProcedures.includes(option)}
              onChange={(e) => toggleOption(option, e.target.checked)}
            />
            <span>{option === TEST_PROCEDURE_OTHER ? 'Other…' : option}</span>
          </label>
        ))}
      </div>

      {value.testProcedures.includes(TEST_PROCEDURE_OTHER) ? (
        <label htmlFor="test-requirements-other" className="test-requirements-other">
          Other test requirements
          <input
            id="test-requirements-other"
            type="text"
            value={value.testProcedureOther}
            onChange={(e) => onChange({ ...value, testProcedureOther: e.target.value })}
            placeholder="Describe other test requirements"
          />
        </label>
      ) : null}
    </fieldset>
  )
}
