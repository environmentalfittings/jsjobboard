import { isReliefValveType } from '../lib/reliefValveTest'
import {
  RELIEF_VALVE_JOB_TEST_OPTIONS,
  formatJobTestSelections,
} from '../lib/jobTestCriteria'
import { TEST_PROCEDURE_OTHER } from '../lib/testLogProcedure'

type JobTestCriteriaFieldsProps = {
  idPrefix: string
  valveType: string | null | undefined
  procedureOptions: readonly string[]
  selected: string[]
  otherText: string
  onSelectedChange: (next: string[]) => void
  onOtherTextChange: (next: string) => void
  preTestRequired: boolean
  onPreTestRequiredChange: (next: boolean) => void
  preTestLocked?: boolean
  preTestLockReason?: string
  disabled?: boolean
  layout?: 'new-job' | 'modal'
}

export function JobTestCriteriaFields({
  idPrefix,
  valveType,
  procedureOptions,
  selected,
  otherText,
  onSelectedChange,
  onOtherTextChange,
  preTestRequired,
  onPreTestRequiredChange,
  preTestLocked = false,
  preTestLockReason,
  disabled = false,
  layout = 'modal',
}: JobTestCriteriaFieldsProps) {
  const relief = isReliefValveType(valveType)
  const reliefSelected = selected.includes('Other')
    ? 'Other'
    : selected.find((value) => RELIEF_VALVE_JOB_TEST_OPTIONS.includes(value as (typeof RELIEF_VALVE_JOB_TEST_OPTIONS)[number])) ?? ''
  const fieldsetClass = layout === 'new-job' ? 'new-job-test-types new-job-span-full' : 'modal-test-types'
  const groupClass = layout === 'new-job' ? 'new-job-test-type-checkboxes' : 'modal-test-type-checkboxes'
  const itemClass = layout === 'new-job' ? 'new-job-test-type-checkbox' : 'modal-test-type-checkbox'
  const otherClass = layout === 'new-job' ? 'new-job-test-type-other' : 'modal-label'
  const selectedClass = layout === 'new-job' ? 'new-job-test-type-selected' : 'placeholder-copy'
  const summary = formatJobTestSelections({ valveType, selected, otherText })

  return (
    <fieldset className={fieldsetClass}>
      <legend className={layout === 'modal' ? 'modal-label' : undefined}>Testing criteria</legend>
      {relief ? (
        <>
          <p className={selectedClass}>Relief valve media</p>
          <div className={groupClass} role="radiogroup" aria-label="Relief valve test media">
            {RELIEF_VALVE_JOB_TEST_OPTIONS.map((option) => (
              <label key={option} className={itemClass}>
                <input
                  type="radio"
                  name={`${idPrefix}-relief-media`}
                  checked={reliefSelected === option}
                  disabled={disabled}
                  onChange={() => {
                    onSelectedChange([option])
                    if (option !== 'Other') onOtherTextChange('')
                  }}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {selected.includes('Other') ? (
            <label className={otherClass} htmlFor={`${idPrefix}-relief-other`}>
              Other media
              <input
                id={`${idPrefix}-relief-other`}
                type="text"
                className={layout === 'modal' ? 'modal-status-select' : undefined}
                value={otherText}
                onChange={(e) => onOtherTextChange(e.target.value)}
                disabled={disabled}
                placeholder="Describe other test media"
                required
              />
            </label>
          ) : null}
        </>
      ) : (
        <>
          <div className={groupClass} role="group" aria-label="Test types">
            {[...procedureOptions, TEST_PROCEDURE_OTHER].map((option) => (
              <label key={option} className={itemClass}>
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  disabled={disabled}
                  onChange={(e) => {
                    const checked = e.target.checked
                    const next = checked
                      ? [...selected, option]
                      : selected.filter((value) => value !== option)
                    onSelectedChange(next)
                    if (!next.includes(TEST_PROCEDURE_OTHER)) onOtherTextChange('')
                  }}
                />
                <span>{option === TEST_PROCEDURE_OTHER ? 'Other…' : option}</span>
              </label>
            ))}
          </div>
          {selected.includes(TEST_PROCEDURE_OTHER) ? (
            <label className={otherClass} htmlFor={`${idPrefix}-test-other`}>
              Other test type
              <input
                id={`${idPrefix}-test-other`}
                type="text"
                className={layout === 'modal' ? 'modal-status-select' : undefined}
                value={otherText}
                onChange={(e) => onOtherTextChange(e.target.value)}
                disabled={disabled}
                placeholder="Describe other test requirements"
                required
              />
            </label>
          ) : null}
        </>
      )}

      <label className={`${itemClass} job-pretest-required-check`}>
        <input
          type="checkbox"
          checked={preTestRequired}
          disabled={disabled || preTestLocked}
          onChange={(e) => onPreTestRequiredChange(e.target.checked)}
        />
        <span>Pre-Test Required</span>
      </label>
      {preTestLocked && preTestLockReason ? (
        <p className={selectedClass}>{preTestLockReason}</p>
      ) : null}
      {summary ? <p className={selectedClass}>Selected: {summary}</p> : null}
    </fieldset>
  )
}
