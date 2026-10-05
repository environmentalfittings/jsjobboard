import { LOOKUP_CATEGORY_DEFS, isLookupCategory } from '../constants/lookupCategories'
import {
  clampPictureFieldMax,
  dropdownOptionSource,
  dropdownSourceSelectValue,
  followUpLabelOf,
  lookupListLabel,
  patchFromDropdownSourceSelect,
  pictureFieldMax,
  type ItpMeasFieldDef,
} from '../lib/itpItemRequirements'

type Props = {
  field: ItpMeasFieldDef
  onChange: (patch: Partial<ItpMeasFieldDef>) => void
}

export function ItpMeasDropdownSourceFields({ field, onChange }: Props) {
  if (field.type === 'picture') {
    const maxPhotos = pictureFieldMax(field)
    return (
      <label className="itp-master-meas-picture-count" onClick={(e) => e.stopPropagation()}>
        <span>Max pictures</span>
        <input
          type="number"
          min={1}
          max={20}
          value={maxPhotos}
          aria-label="How many pictures"
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ maxPhotos: clampPictureFieldMax(e.target.value) })}
        />
      </label>
    )
  }
  if (field.type !== 'dropdown') {
    return <span className="itp-master-meas-field-spacer" />
  }
  const source = dropdownOptionSource(field)
  const selectValue = dropdownSourceSelectValue(field)
  return (
    <>
      <select
        aria-label="Dropdown source"
        value={selectValue}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(patchFromDropdownSourceSelect(e.target.value))}
      >
        <option value="custom">Custom options</option>
        <option value="manufacturers">Manufacturers list</option>
        <optgroup label="Job field lists (Admin)">
          {LOOKUP_CATEGORY_DEFS.filter((row) => row.key !== 'manufacturer').map((row) => (
            <option key={row.key} value={`lookup:${row.key}`}>
              {row.label}
            </option>
          ))}
        </optgroup>
      </select>
      {source === 'custom' ? (
        <input
          type="text"
          value={(field.options ?? []).join(', ')}
          placeholder="RF, RTJ, SW, THR, SW/THR, BWE"
          aria-label="Custom dropdown options"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) =>
            onChange({
              options: e.target.value
                .split(',')
                .map((opt) => opt.trim())
                .filter(Boolean),
            })
          }
        />
      ) : (
        <span className="itp-master-meas-field-source">
          {source === 'manufacturers'
            ? 'Uses the Manufacturers table'
            : `Uses Admin · ${lookupListLabel(field.lookupCategory)}`}
        </span>
      )}
      <div className="itp-master-meas-followup" onClick={(e) => e.stopPropagation()}>
        <label>
          <span>If answer is</span>
          <input
            type="text"
            value={field.followUpWhen ?? ''}
            placeholder="e.g. BWE"
            aria-label="Follow-up when this answer is selected"
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ followUpWhen: e.target.value })}
          />
        </label>
        <label>
          <span>ask for</span>
          <input
            type="text"
            value={field.followUpLabel ?? ''}
            placeholder={followUpLabelOf({ followUpLabel: '', followUpWhen: field.followUpWhen ?? 'Details' })}
            aria-label="Follow-up field label"
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ followUpLabel: e.target.value })}
          />
        </label>
        <label>
          <span>as</span>
          <select
            aria-label="Follow-up input type"
            value={field.followUpLookupCategory ? `lookup:${field.followUpLookupCategory}` : 'text'}
            onChange={(e) => {
              const value = e.target.value
              if (value.startsWith('lookup:')) {
                const lookupCategory = value.slice('lookup:'.length)
                if (isLookupCategory(lookupCategory)) onChange({ followUpLookupCategory: lookupCategory })
                return
              }
              onChange({ followUpLookupCategory: undefined })
            }}
          >
            <option value="text">Text box</option>
            {LOOKUP_CATEGORY_DEFS.filter((row) => row.key !== 'manufacturer').map((row) => (
              <option key={row.key} value={`lookup:${row.key}`}>
                {row.label} list
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  )
}
