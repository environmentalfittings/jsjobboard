import { useState } from 'react'

export function LookupAddSelect({
  id,
  label,
  required,
  value,
  options,
  emptyOption,
  addLabel,
  addPlaceholder,
  disabled,
  onChange,
  onAdd,
}: {
  id: string
  label: string
  required?: boolean
  value: string
  options: readonly string[]
  emptyOption: string
  addLabel: string
  addPlaceholder: string
  disabled?: boolean
  onChange: (value: string) => void
  onAdd: (value: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const shownOptions = value.trim() && !options.some((option) => option.toLowerCase() === value.trim().toLowerCase())
    ? [value.trim(), ...options]
    : [...options]

  const submit = async () => {
    const next = draft.trim()
    if (!next || saving || disabled) return
    setSaving(true)
    try {
      await onAdd(next)
      setDraft('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mtr-lookup-label-row">
        <label className="modal-label" htmlFor={id}>
          {label}
          {required ? (
            <>
              {' '}
              <span className="required-star">*</span>
            </>
          ) : null}
        </label>
        {!disabled ? (
          <button
            type="button"
            className="mtr-lookup-add-toggle"
            disabled={saving}
            onClick={() => {
              setAdding((open) => !open)
              setDraft('')
            }}
          >
            {adding ? 'Cancel' : addLabel}
          </button>
        ) : null}
      </div>
      <select
        id={id}
        className="modal-status-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || saving}
      >
        <option value="">{emptyOption}</option>
        {shownOptions.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      {adding && !disabled ? (
        <div className="mtr-lookup-add-row">
          <input
            type="text"
            className="modal-status-select"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            disabled={saving}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
            }}
          />
          <button
            type="button"
            className="button-primary"
            disabled={saving || !draft.trim()}
            onClick={() => void submit()}
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      ) : null}
    </>
  )
}
