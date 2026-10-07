import { useEffect, useState } from 'react'
import { processSectionTitle } from '../constants/itpProcessSections'
import {
  dropdownOptionSource,
  fieldLookupCategory,
  resolveDropdownChoices,
  type ItpMeasFieldDef,
} from '../types/itpMeasFields'
import type { ItpUnlockCandidate } from '../lib/itpMeasUnlocks'
import { loadLookupOptionsMap } from '../lib/lookupValues'

type Props = {
  field: ItpMeasFieldDef
  sourceItemId: string
  candidates: ItpUnlockCandidate[]
  onChange: (patch: Partial<ItpMeasFieldDef>) => void
}

function idsForOption(field: ItpMeasFieldDef, option: string): string[] {
  const map = field.unlockItemIdsByOption ?? {}
  const hit = Object.entries(map).find(
    ([label]) => label.trim().toLowerCase() === option.trim().toLowerCase(),
  )
  return hit ? [...hit[1]] : []
}

export function ItpMeasUnlockItemsFields({ field, sourceItemId, candidates, onChange }: Props) {
  const source = dropdownOptionSource(field)
  const lookupCategory = fieldLookupCategory(field)
  const [lookupOptions, setLookupOptions] = useState<string[]>([])

  useEffect(() => {
    if (source !== 'lookup' || !lookupCategory) {
      setLookupOptions([])
      return
    }
    let cancelled = false
    void loadLookupOptionsMap().then((map) => {
      if (cancelled) return
      setLookupOptions((map[lookupCategory] ?? []).map((opt) => String(opt).trim()).filter(Boolean))
    })
    return () => {
      cancelled = true
    }
  }, [source, lookupCategory])

  if (field.type !== 'dropdown' || source === 'manufacturers') {
    return null
  }
  const options =
    source === 'lookup'
      ? resolveDropdownChoices(field, { lookups: lookupCategory ? { [lookupCategory]: lookupOptions } : {} })
      : (field.options ?? []).map((opt) => opt.trim()).filter(Boolean)
  if (options.length === 0 || candidates.length === 0) return null

  const grouped = new Map<string, ItpUnlockCandidate[]>()
  for (const row of candidates) {
    if (row.id === sourceItemId) continue
    const title = row.secTitle || processSectionTitle(row.secId)
    const list = grouped.get(title) ?? []
    list.push(row)
    grouped.set(title, list)
  }
  if (grouped.size === 0) return null

  const setOptionIds = (option: string, ids: string[]) => {
    const next: Record<string, string[]> = { ...(field.unlockItemIdsByOption ?? {}) }
    const unique = [...new Set(ids.filter((id) => id && id !== sourceItemId))]
    if (unique.length === 0) delete next[option]
    else next[option] = unique
    onChange({ unlockItemIdsByOption: Object.keys(next).length ? next : undefined })
  }

  return (
    <div className="itp-meas-unlock" onClick={(event) => event.stopPropagation()}>
      <div className="itp-meas-unlock-title">When this choice is selected, add these checklist items</div>
      <p className="itp-meas-unlock-hint">
        Leave Acceptable / N/A unchecked. Other repairs can turn on Machine 1, Welding, Machine 2, and any other
        required lines.
      </p>
      {options.map((option) => {
        const selected = new Set(idsForOption(field, option))
        return (
          <details key={option} className="itp-meas-unlock-option" open={selected.size > 0}>
            <summary>
              <span>{option}</span>
              <span className="itp-meas-unlock-count">
                {selected.size === 0 ? 'No extra steps' : `${selected.size} step${selected.size === 1 ? '' : 's'}`}
              </span>
            </summary>
            <div className="itp-meas-unlock-groups">
              {[...grouped.entries()].map(([title, rows]) => (
                <div key={title} className="itp-meas-unlock-group">
                  <div className="itp-meas-unlock-group-title">{title}</div>
                  {rows.map((row) => {
                    const checked = selected.has(row.id)
                    return (
                      <label key={row.id} className="itp-meas-unlock-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selected)
                            if (checked) next.delete(row.id)
                            else next.add(row.id)
                            setOptionIds(option, [...next])
                          }}
                        />
                        <span className="itp-meas-unlock-item-name">{row.name}</span>
                        {row.shopAreaLabel ? (
                          <span className="itp-template-station-badge">Station: {row.shopAreaLabel}</span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
