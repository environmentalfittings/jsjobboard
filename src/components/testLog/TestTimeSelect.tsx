import { useEffect, useState } from 'react'
import { TEST_TIME_OPTIONS, TEST_TIME_OTHER, resolveTestTimeSelection } from '../../lib/testLogTime'

type TestTimeSelectProps = {
  id: string
  value: string
  onChange: (next: string) => void
}

export function TestTimeSelect({ id, value, onChange }: TestTimeSelectProps) {
  const resolved = resolveTestTimeSelection(value)
  const [customMode, setCustomMode] = useState(resolved.selectValue === TEST_TIME_OTHER)

  useEffect(() => {
    const next = resolveTestTimeSelection(value)
    if (next.selectValue === TEST_TIME_OTHER) setCustomMode(true)
    else if (next.selectValue) setCustomMode(false)
  }, [value])

  const selectValue = customMode ? TEST_TIME_OTHER : resolved.selectValue
  const customValue = customMode ? value : resolved.customValue

  return (
    <div className="test-time-select">
      <label htmlFor={`${id}-time`}>
        Test Time
        <select
          id={`${id}-time`}
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value
            if (next === TEST_TIME_OTHER) {
              setCustomMode(true)
              if (resolved.selectValue && resolved.selectValue !== TEST_TIME_OTHER) {
                onChange('')
              }
              return
            }
            setCustomMode(false)
            onChange(next)
          }}
        >
          <option value="">Select…</option>
          {TEST_TIME_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={TEST_TIME_OTHER}>Custom…</option>
        </select>
      </label>
      {customMode ? (
        <label htmlFor={`${id}-time-other`}>
          Custom test time
          <input
            id={`${id}-time-other`}
            type="text"
            value={customValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 10 Min, 30 Min"
          />
        </label>
      ) : null}
    </div>
  )
}
