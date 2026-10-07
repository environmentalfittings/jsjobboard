import {
  itpShopAreaLabel,
  normalizeShopAreaValue,
  normalizeShopAreas,
  type ItpShopAreaDef,
} from '../constants/itpShopAreas'

type ItpStationSelectProps = {
  value: string
  areas: ItpShopAreaDef[]
  onChange: (value: string) => void
  disabled?: boolean
  variant?: 'field' | 'badge' | 'toolbar'
  title?: string
}

export function ItpStationSelect({
  value,
  areas,
  onChange,
  disabled = false,
  variant = 'field',
  title = 'Assigned station (Teardown, Machine 1, Testing, …)',
}: ItpStationSelectProps) {
  const normalized = normalizeShopAreaValue(value) || value
  const options = normalizeShopAreas(areas, normalized ? [normalized] : [])

  return (
    <label
      className={`itp-station-select itp-station-select--${variant}`}
      title={title}
      onClick={(event) => event.stopPropagation()}
    >
      {variant === 'badge' ? <span className="itp-station-select-prefix">Station</span> : null}
      {variant === 'field' ? <span>Assigned station</span> : null}
      <select
        value={options.some((opt) => opt.value === normalized) ? normalized : normalized || options[0]?.value || ''}
        disabled={disabled}
        aria-label="Assigned station"
        title={title}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          event.stopPropagation()
          onChange(event.target.value)
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {normalized && !options.some((opt) => opt.value === normalized) ? (
          <option value={normalized}>{itpShopAreaLabel(normalized, options)}</option>
        ) : null}
      </select>
    </label>
  )
}
