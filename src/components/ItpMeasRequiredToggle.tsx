type Props = {
  required: boolean
  onChange: (required: boolean) => void
}

export function ItpMeasRequiredToggle({ required, onChange }: Props) {
  const on = required !== false
  return (
    <label
      className={`itp-master-meas-required${on ? ' is-on' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      {on ? 'Required' : 'Optional'}
    </label>
  )
}
