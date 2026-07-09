import { supabase } from '../../lib/supabase'
import { canonicalizeValveType, valveTypeSelectOptions } from '../../lib/testLogValveType'

type ValveTypeSelectProps = {
  value: string
  loadedFromJob: boolean
  valveRowId: number | null
  onChange: (valveType: string) => void
  onSaved?: () => void
}

export function ValveTypeSelect({ value, loadedFromJob, valveRowId, onChange, onSaved }: ValveTypeSelectProps) {
  const displayValue = canonicalizeValveType(value)
  const options = valveTypeSelectOptions(value)
  const hasType = Boolean(displayValue)

  const saveType = async (nextRaw: string) => {
    const canonical = canonicalizeValveType(nextRaw)
    onChange(canonical)
    if (!valveRowId || !canonical) return

    const { error } = await supabase.from('valves').update({ valve_type: canonical }).eq('id', valveRowId)
    if (!error) onSaved?.()
  }

  return (
    <div className="test-valve-type-field">
      <label>
        Type
        <select value={displayValue} onChange={(e) => void saveType(e.target.value)}>
          <option value="">— Select type —</option>
          {options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {loadedFromJob && hasType ? (
        <p className="test-valve-type-status test-valve-type-status--loaded">✓ Loaded from job record</p>
      ) : null}
    </div>
  )
}
