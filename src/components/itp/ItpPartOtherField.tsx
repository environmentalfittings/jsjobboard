type ItpPartOtherFieldProps = {
  checked: boolean
  notes: string
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  onNotesChange: (value: string) => void
}

export function ItpPartOtherField({
  checked,
  notes,
  disabled,
  onCheckedChange,
  onNotesChange,
}: ItpPartOtherFieldProps) {
  return (
    <div className="itp-part-other-field">
      <label className="itp-part-other-checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={disabled}
        />
        <span>Other</span>
      </label>
      {checked ? (
        <input
          type="text"
          className="itp-part-other-notes-input"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={disabled}
          placeholder="Describe if something is not normal…"
        />
      ) : null}
    </div>
  )
}
