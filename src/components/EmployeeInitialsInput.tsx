import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useEmployees } from '../hooks/useEmployees'
import type { Employee } from '../types/employees'

type EmployeeInitialsInputProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

function formatEmployeeHint(employee: Employee) {
  return `${employee.full_name} (${employee.initials})`
}

export function EmployeeInitialsInput({
  label = 'Tech Initials',
  value,
  onChange,
  disabled = false,
  className = 'traveler-tech-initials',
}: EmployeeInitialsInputProps) {
  const { lookupByInitials } = useEmployees()
  const [suggestion, setSuggestion] = useState<Employee | null>(null)
  const [lookupOpen, setLookupOpen] = useState(false)
  const blurTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
    }
  }, [])

  const resolveMatch = async (initials: string) => {
    const trimmed = initials.trim().toUpperCase()
    if (trimmed.length < 2) {
      setSuggestion(null)
      return
    }
    const match = await lookupByInitials(trimmed)
    setSuggestion(match)
  }

  const handleChange = (next: string) => {
    const upper = next.toUpperCase()
    onChange(upper)
    void resolveMatch(upper)
    setLookupOpen(upper.trim().length >= 2)
  }

  const handleBlur = () => {
    blurTimer.current = window.setTimeout(() => setLookupOpen(false), 150)
  }

  const handleFocus = () => {
    if (blurTimer.current) window.clearTimeout(blurTimer.current)
    if (value.trim().length >= 2) setLookupOpen(true)
  }

  const confirmSuggestion = (employee: Employee) => {
    onChange(employee.initials.toUpperCase())
    setSuggestion(employee)
    setLookupOpen(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' && lookupOpen && suggestion) {
      confirmSuggestion(suggestion)
    }
  }

  return (
    <label className={className}>
      {label}
      <div className="employee-initials-field">
        <input
          value={value}
          maxLength={6}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />
        {lookupOpen && suggestion ? (
          <button
            type="button"
            className="employee-initials-suggestion"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => confirmSuggestion(suggestion)}
          >
            {formatEmployeeHint(suggestion)}
          </button>
        ) : null}
      </div>
    </label>
  )
}
