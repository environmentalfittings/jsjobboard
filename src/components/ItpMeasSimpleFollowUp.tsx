import type { ItpMeasFieldDef } from '../lib/itpItemRequirements'

type Props = {
  field: ItpMeasFieldDef
  onChange: (patch: Partial<ItpMeasFieldDef>) => void
}

/** Plain-language follow-up: usually “if they pick Other, ask them to type it”. */
export function ItpMeasSimpleFollowUp({ field, onChange }: Props) {
  if (field.type !== 'dropdown') return null

  const when = String(field.followUpWhen ?? '').trim()
  const label = String(field.followUpLabel ?? '').trim()
  const enabled = Boolean(when)
  const trigger = when || 'Other'
  const prompt = label || 'Describe other'

  return (
    <div className="itp-meas-simple-followup" onClick={(e) => e.stopPropagation()}>
      <label className="itp-meas-simple-followup-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              onChange({
                followUpWhen: trigger === 'Other' || !when ? 'Other' : trigger,
                followUpLabel: prompt === 'Describe other' || !label ? 'Describe other' : prompt,
                followUpLookupCategory: undefined,
              })
              return
            }
            onChange({
              followUpWhen: '',
              followUpLabel: '',
              followUpLookupCategory: undefined,
            })
          }}
        />
        <span>
          If they pick <strong>{trigger}</strong>, ask them to type what it is
        </span>
      </label>
      {enabled ? (
        <div className="itp-meas-simple-followup-fields">
          <label>
            <span>Which answer</span>
            <input
              type="text"
              value={trigger}
              aria-label="Answer that asks for details"
              onChange={(e) => onChange({ followUpWhen: e.target.value })}
            />
          </label>
          <label>
            <span>What to ask</span>
            <input
              type="text"
              value={prompt}
              aria-label="Follow-up question label"
              onChange={(e) => onChange({ followUpLabel: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
