import {
  ITP_JOB_CARD_FIELD_OPTIONS,
  resolveJobCardField,
  type ItpJobCardFieldKey,
  type ItpMeasFieldDef,
} from '../lib/itpItemRequirements'

type Props = {
  field: ItpMeasFieldDef
  onChange: (patch: Partial<ItpMeasFieldDef>) => void
}

export function ItpMeasJobCardSourceSelect({ field, onChange }: Props) {
  const resolved = resolveJobCardField(field) ?? ''
  return (
    <select
      className={`itp-master-meas-jobcard${resolved ? ' is-mapped' : ''}`}
      aria-label="Fill from job card"
      title="Populate this field from the job card"
      value={resolved}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const value = e.target.value as ItpJobCardFieldKey | ''
        const jobCardField = value ? value : 'none'
        const matched = ITP_JOB_CARD_FIELD_OPTIONS.find((opt) => opt.value === value)
        onChange({
          jobCardField,
          ...(matched && !field.label.trim() ? { label: matched.label } : {}),
        })
      }}
    >
      <option value="">Not from job card</option>
      {ITP_JOB_CARD_FIELD_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          Job card: {opt.label}
        </option>
      ))}
    </select>
  )
}
