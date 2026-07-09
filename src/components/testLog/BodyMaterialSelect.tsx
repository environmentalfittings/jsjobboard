import { BODY_MATERIALS } from '../../constants/jobLookups'
import { supabase } from '../../lib/supabase'

const SPECIAL_ALLOYS = new Set(['Monel', 'Hastelloy', 'Alloy 400', 'Alloy C276'])

type BodyMaterialSelectProps = {
  value: string
  loadedFromJob: boolean
  valveRowId: number | null
  options?: string[]
  onChange: (material: string) => void
  onSaved?: () => void
}

export function BodyMaterialSelect({
  value,
  loadedFromJob,
  valveRowId,
  options,
  onChange,
  onSaved,
}: BodyMaterialSelectProps) {
  const materialOptions = options?.length ? options : [...BODY_MATERIALS, 'Alloy 400', 'Alloy C276']
  const hasMaterial = Boolean(value.trim())
  const showSpecialWarning = SPECIAL_ALLOYS.has(value.trim())

  const saveMaterial = async (material: string) => {
    onChange(material)
    if (!valveRowId || !material.trim()) return

    const { error } = await supabase.from('valves').update({ body_material: material.trim() }).eq('id', valveRowId)
    if (!error) onSaved?.()
  }

  return (
    <div className="test-body-material-field">
      <label>
        Body material
        <select
          value={value}
          onChange={(e) => void saveMaterial(e.target.value)}
          className={hasMaterial ? 'test-body-material-loaded' : 'test-body-material-missing'}
        >
          <option value="">— Select material —</option>
          {materialOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      {loadedFromJob && hasMaterial ? (
        <p className="test-body-material-status test-body-material-status--loaded">✓ Loaded from job record</p>
      ) : null}

      {!hasMaterial ? (
        <p className="test-body-material-status test-body-material-status--warning">
          Body material required to calculate test pressures
        </p>
      ) : null}

      {showSpecialWarning ? (
        <p className="test-body-material-status test-body-material-status--warning">
          ⚠ Special alloy — verify CWP against ASME B16.34 Table 2 for this material group before accepting
          auto-populated pressures
        </p>
      ) : null}
    </div>
  )
}
