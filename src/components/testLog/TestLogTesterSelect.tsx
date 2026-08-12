import { useMemo } from 'react'
import { formatTesterInitials, parseTesterInitials } from '../../lib/testLogTester'
import type { Employee } from '../../types/employees'

type TesterOption = Pick<Employee, 'id' | 'full_name' | 'initials'>

type TestLogTesterSelectProps = {
  label?: string
  value: string
  options: TesterOption[]
  loading?: boolean
  required?: boolean
  disabled?: boolean
  emptyHint?: string
  onChange: (value: string) => void
}

export function TestLogTesterSelect({
  label = 'Tester(s)',
  value,
  options,
  loading = false,
  required = true,
  disabled = false,
  emptyHint = 'Required — select at least one tester',
  onChange,
}: TestLogTesterSelectProps) {
  const knownTesterInitials = useMemo(() => options.map((employee) => employee.initials), [options])
  const selectedTesters = useMemo(
    () => parseTesterInitials(value, knownTesterInitials),
    [value, knownTesterInitials],
  )
  const orphanTesterInitials = useMemo(
    () =>
      selectedTesters.filter(
        (initials) => !options.some((employee) => employee.initials.toUpperCase() === initials),
      ),
    [selectedTesters, options],
  )
  const availableTesterOptions = useMemo(
    () =>
      options.filter((employee) => !selectedTesters.includes(employee.initials.toUpperCase())),
    [options, selectedTesters],
  )

  const toggleTester = (initials: string, checked: boolean) => {
    const key = initials.trim().toUpperCase()
    if (!key) return
    const next = checked
      ? [...selectedTesters, key]
      : selectedTesters.filter((item) => item !== key)
    onChange(formatTesterInitials(next))
  }

  const addTester = (initials: string) => {
    const key = initials.trim().toUpperCase()
    if (!key || selectedTesters.includes(key)) return
    onChange(formatTesterInitials([...selectedTesters, key]))
  }

  return (
    <fieldset className="test-log-tester-select test-log-fieldset">
      <legend>
        {label}
        {required ? (
          <>
            {' '}
            <span className="test-log-required-mark">*</span>
          </>
        ) : null}
      </legend>
      {loading ? (
        <p className="test-log-tester-loading">Loading employees…</p>
      ) : (
        <>
          <div className="test-log-tester-chips" aria-live="polite">
            {selectedTesters.length === 0 ? (
              <span className="test-log-tester-empty">{emptyHint}</span>
            ) : (
              selectedTesters.map((initials) => {
                const employee = options.find((row) => row.initials.toUpperCase() === initials)
                const orphan = orphanTesterInitials.includes(initials)
                return (
                        <button
                          key={initials}
                          type="button"
                          className="test-log-tester-chip-btn"
                          onClick={() => toggleTester(initials, false)}
                          title="Remove tester"
                          disabled={disabled}
                        >
                    {employee ? `${employee.full_name} (${initials})` : orphan ? `${initials} (saved)` : initials}
                    <span aria-hidden>×</span>
                  </button>
                )
              })
            )}
          </div>
          <label className="test-log-tester-add">
            Add tester
            <select
              value=""
              disabled={disabled || availableTesterOptions.length === 0}
              onChange={(e) => {
                addTester(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">
                {options.length === 0
                  ? 'No testers designated yet'
                  : availableTesterOptions.length === 0
                    ? 'All designated testers selected'
                    : 'Select tester…'}
              </option>
              {availableTesterOptions.map((employee) => (
                <option key={employee.id} value={employee.initials.toUpperCase()}>
                  {employee.full_name} ({employee.initials.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
          {options.length === 0 ? (
            <p className="test-log-tester-hint">
              Mark people as testers under Admin → Employees, then they will appear here.
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  )
}
