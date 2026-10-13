import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { defaultProcessSections, processSectionTitle } from '../constants/itpProcessSections'
import { defaultShopAreas } from '../constants/itpShopAreas'
import { defaultAreaForSection } from '../lib/itpMasterCatalog'
import {
  dropdownOptionSource,
  emptyMeasField,
  fieldLookupCategory,
  ITP_MEAS_FIELD_TYPE_OPTIONS,
  measFieldTypePatch,
  resolveDropdownChoices,
  type ItpMeasFieldDef,
  type ItpMeasFieldType,
} from '../types/itpMeasFields'
import {
  draftFromUnlockCandidate,
  unlockCandidateHasTraveler,
  type ItpUnlockCandidate,
  type ItpUnlockStepDraft,
} from '../lib/itpMeasUnlocks'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { ItpMeasDropdownSourceFields } from './ItpMeasDropdownSourceFields'
import { ItpMeasJobCardSourceSelect } from './ItpMeasJobCardSourceSelect'
import { ItpMeasRequiredToggle } from './ItpMeasRequiredToggle'
import { ItpPhotoMinMaxFields } from './ItpPhotoMinMaxFields'

type Props = {
  field: ItpMeasFieldDef
  sourceItemId: string
  candidates: ItpUnlockCandidate[]
  processSections?: Array<{ id: string; title: string }>
  shopAreas?: Array<{ value: string; label: string }>
  onChange: (patch: Partial<ItpMeasFieldDef>) => void
  onCreateUnlockStep?: (draft: ItpUnlockStepDraft) => ItpUnlockCandidate | null
  onUpdateUnlockStep?: (itemId: string, draft: ItpUnlockStepDraft) => ItpUnlockCandidate | null
}

function idsForOption(field: ItpMeasFieldDef, option: string): string[] {
  const map = field.unlockItemIdsByOption ?? {}
  const hit = Object.entries(map).find(
    ([label]) => label.trim().toLowerCase() === option.trim().toLowerCase(),
  )
  return hit ? [...hit[1]] : []
}

function UnlockStepForm({
  option,
  sections,
  areas,
  preferredSecId,
  initial,
  title,
  hint,
  saveLabel,
  onSave,
  onCancel,
}: {
  option: string
  sections: Array<{ id: string; title: string }>
  areas: Array<{ value: string; label: string }>
  preferredSecId?: string
  initial?: ItpUnlockStepDraft
  title: string
  hint: ReactNode
  saveLabel: string
  onSave: (draft: ItpUnlockStepDraft) => void
  onCancel?: () => void
}) {
  const defaultSec =
    (initial?.secId && sections.some((row) => row.id === initial.secId) ? initial.secId : '') ||
    (preferredSecId && sections.some((row) => row.id === preferredSecId) ? preferredSecId : '') ||
    (sections.some((row) => row.id === 'repair') ? 'repair' : (sections[0]?.id ?? 'repair'))
  const [name, setName] = useState(initial?.name ?? '')
  const [secId, setSecId] = useState(defaultSec)
  const [area, setArea] = useState(
    () => initial?.area || defaultAreaForSection(defaultSec),
  )
  const [requirePicture, setRequirePicture] = useState(Boolean(initial?.requirePicture))
  const [pictureLabel, setPictureLabel] = useState(initial?.pictureLabel ?? '')
  const [minPhotos, setMinPhotos] = useState(initial?.minPhotos ?? 1)
  const [maxPhotos, setMaxPhotos] = useState(initial?.maxPhotos || 4)
  const [fields, setFields] = useState<ItpMeasFieldDef[]>(
    () => (initial?.measFields ?? []).map((field) => emptyMeasField(field)),
  )

  const patchField = (idx: number, patch: Partial<ItpMeasFieldDef>) => {
    setFields((prev) => prev.map((field, i) => (i === idx ? { ...field, ...patch } : field)))
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave({
      name: trimmed,
      secId,
      area,
      requirePicture,
      pictureLabel,
      minPhotos,
      maxPhotos,
      measFields: fields,
    })
    if (!initial) {
      setName('')
      setPictureLabel('')
      setRequirePicture(false)
      setMinPhotos(1)
      setMaxPhotos(4)
      setFields([])
    }
  }

  return (
    <div className="itp-meas-unlock-add">
      <div className="itp-meas-unlock-add-title">{title}</div>
      <p className="itp-meas-unlock-add-hint">{hint}</p>
      <input
        type="text"
        value={name}
        placeholder="e.g. Machine 1 — skim body bore"
        aria-label={`New extra step for ${option}`}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="itp-meas-unlock-add-row">
        <label>
          <span>ITP section</span>
          <select
            aria-label={`ITP section for ${option} step`}
            value={secId}
            onChange={(event) => {
              const nextSec = event.target.value
              setSecId(nextSec)
              setArea(defaultAreaForSection(nextSec))
            }}
          >
            {sections.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Station</span>
          <select
            aria-label={`Station for ${option} step`}
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            {areas.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="itp-meas-unlock-add-traveler">
        <div className="itp-meas-unlock-add-traveler-title">Traveler requirements</div>
        <p className="itp-meas-unlock-add-hint">
          Photos and fields the technician fills when this extra step turns on. N/A stays a valid answer.
        </p>
        <div className="itp-master-req-toggle-row">
          <button
            type="button"
            className={`itp-library-attr-toggle photo${requirePicture ? ' on' : ''}`}
            onClick={() => setRequirePicture((prev) => !prev)}
          >
            Require pictures
          </button>
        </div>
        {requirePicture ? (
          <div className="itp-master-req-detail-row">
            <label className="itp-master-global-field itp-master-global-field--wide">
              <span>Photo label</span>
              <input
                type="text"
                value={pictureLabel}
                placeholder="e.g. After skim photo"
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => setPictureLabel(event.target.value)}
              />
            </label>
            <ItpPhotoMinMaxFields
              minPhotos={minPhotos}
              maxPhotos={maxPhotos}
              onChange={(next) => {
                setMinPhotos(next.minPhotos)
                setMaxPhotos(next.maxPhotos)
              }}
            />
          </div>
        ) : null}
        <div className="itp-master-meas-fields-hdr">Traveler input fields</div>
        <div className="itp-master-meas-fields-list">
          {fields.map((field, idx) => (
            <div key={field.id || `unlock-tf-${idx}`} className="itp-master-meas-field-row itp-master-meas-field-row--typed">
              <input
                type="text"
                value={field.label}
                placeholder="Field label"
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => patchField(idx, { label: event.target.value })}
              />
              <select
                value={field.type || 'text'}
                aria-label="Field type"
                onChange={(event) => {
                  const type = event.target.value as ItpMeasFieldType
                  patchField(idx, measFieldTypePatch(field, type))
                }}
              >
                {ITP_MEAS_FIELD_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ItpMeasDropdownSourceFields
                field={field}
                onChange={(patch) => patchField(idx, patch)}
              />
              <ItpMeasJobCardSourceSelect
                field={field}
                onChange={(patch) => patchField(idx, patch)}
              />
              <ItpMeasRequiredToggle
                required={field.required !== false}
                onChange={(required) => patchField(idx, { required })}
              />
              <button
                type="button"
                className="itp-library-sr-del"
                title="Remove field"
                onClick={() => setFields((prev) => prev.filter((_, i) => i !== idx))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="itp-library-add-sr-btn"
          onClick={() => setFields((prev) => [...prev, emptyMeasField({ label: '', type: 'text' })])}
        >
          + Add field
        </button>
      </div>
      <div className="itp-meas-unlock-add-actions">
        {onCancel ? (
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="button-primary itp-meas-unlock-add-save"
          disabled={!name.trim()}
          onClick={save}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

export function ItpMeasUnlockItemsFields({
  field,
  sourceItemId,
  candidates,
  processSections,
  shopAreas,
  onChange,
  onCreateUnlockStep,
  onUpdateUnlockStep,
}: Props) {
  const source = dropdownOptionSource(field)
  const lookupCategory = fieldLookupCategory(field)
  const [lookupOptions, setLookupOptions] = useState<string[]>([])
  const [created, setCreated] = useState<ItpUnlockCandidate[]>([])
  const [findText, setFindText] = useState('')
  const [sectionKey, setSectionKey] = useState('')
  const [editingStepId, setEditingStepId] = useState('')

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

  const sections = processSections?.length ? processSections : defaultProcessSections()
  const areas = shopAreas?.length ? shopAreas : defaultShopAreas()
  const allCandidates = useMemo(() => {
    const byId = new Map<string, ItpUnlockCandidate>()
    for (const row of [...candidates, ...created]) {
      if (!row.id || row.id === sourceItemId) continue
      byId.set(row.id, row)
    }
    return [...byId.values()]
  }, [candidates, created, sourceItemId])

  if (field.type !== 'dropdown' || source === 'manufacturers') {
    return null
  }
  const options =
    source === 'lookup'
      ? resolveDropdownChoices(field, { lookups: lookupCategory ? { [lookupCategory]: lookupOptions } : {} })
      : (field.options ?? []).map((opt) => opt.trim()).filter(Boolean)
  if (options.length === 0) return null
  if (allCandidates.length === 0 && !onCreateUnlockStep) return null

  const findNeedle = findText.trim().toLowerCase()
  const grouped = new Map<string, ItpUnlockCandidate[]>()
  for (const row of allCandidates) {
    const title = row.secTitle || processSectionTitle(row.secId)
    const list = grouped.get(title) ?? []
    list.push(row)
    grouped.set(title, list)
  }
  const sectionTitles = [...grouped.keys()]
  const activeSection = sectionTitles.includes(sectionKey) ? sectionKey : (sectionTitles[0] ?? '')
  const visibleGrouped = new Map<string, ItpUnlockCandidate[]>()
  for (const [title, rows] of grouped) {
    if (!findNeedle && title !== activeSection) continue
    const filtered = findNeedle
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(findNeedle) ||
            row.shopAreaLabel.toLowerCase().includes(findNeedle) ||
            title.toLowerCase().includes(findNeedle),
        )
      : rows
    if (filtered.length > 0) visibleGrouped.set(title, filtered)
  }

  const setOptionIds = (option: string, ids: string[]) => {
    const next: Record<string, string[]> = { ...(field.unlockItemIdsByOption ?? {}) }
    const unique = [...new Set(ids.filter((id) => id && id !== sourceItemId))]
    if (unique.length === 0) delete next[option]
    else next[option] = unique
    onChange({ unlockItemIdsByOption: Object.keys(next).length ? next : undefined })
  }

  const rememberStep = (row: ItpUnlockCandidate) => {
    setCreated((prev) => {
      const idx = prev.findIndex((item) => item.id === row.id)
      if (idx < 0) return [...prev, row]
      const next = [...prev]
      next[idx] = row
      return next
    })
  }

  const addCreatedStep = (option: string, draft: ItpUnlockStepDraft) => {
    if (!onCreateUnlockStep) return
    const createdRow = onCreateUnlockStep(draft)
    if (!createdRow?.id) return
    rememberStep(createdRow)
    const selected = new Set(idsForOption(field, option))
    selected.add(createdRow.id)
    setOptionIds(option, [...selected])
    const title = createdRow.secTitle || processSectionTitle(createdRow.secId)
    if (title) setSectionKey(title)
  }

  const saveEditedStep = (itemId: string, draft: ItpUnlockStepDraft) => {
    if (!onUpdateUnlockStep) return
    const updated = onUpdateUnlockStep(itemId, draft)
    if (updated?.id) rememberStep(updated)
    setEditingStepId('')
  }

  return (
    <div className="itp-meas-unlock" onClick={(event) => event.stopPropagation()}>
      <div className="itp-meas-unlock-title">When this choice is selected, add these checklist items</div>
      <p className="itp-meas-unlock-hint">
        Leave Accepted / N/A with no extra steps unless you want them. Check existing lines, or add a step that is not
        on this ITP. Extra steps stay off until the technician picks that choice. Other also asks them to type what it
        is.
      </p>
      {options.map((option) => {
        const selected = new Set(idsForOption(field, option))
        return (
          <details
            key={option}
            className="itp-meas-unlock-option"
            open={selected.size > 0 || option.trim().toLowerCase() === 'other'}
          >
            <summary>
              <span>{option}</span>
              <span className="itp-meas-unlock-count">
                {selected.size === 0 ? 'No extra steps' : `${selected.size} step${selected.size === 1 ? '' : 's'}`}
              </span>
            </summary>
            <div className="itp-meas-unlock-groups">
              {selected.size > 0 ? (
                <div className="itp-meas-unlock-picked">
                  <div className="itp-meas-unlock-group-title">Added for this choice</div>
                  {allCandidates
                    .filter((row) => selected.has(row.id))
                    .map((row) => {
                      const hasTraveler = unlockCandidateHasTraveler(row)
                      const canEdit = Boolean(onUpdateUnlockStep && row.canEditTraveler)
                      return (
                        <div key={row.id} className="itp-meas-unlock-picked-row">
                          <label className="itp-meas-unlock-item">
                            <input
                              type="checkbox"
                              checked
                              onChange={() => {
                                const next = new Set(selected)
                                next.delete(row.id)
                                setOptionIds(option, [...next])
                                if (editingStepId === row.id) setEditingStepId('')
                              }}
                            />
                            <span className="itp-meas-unlock-item-name">{row.name}</span>
                            {row.shopAreaLabel ? (
                              <span className="itp-template-station-badge">Station: {row.shopAreaLabel}</span>
                            ) : null}
                            {hasTraveler ? (
                              <span className="itp-meas-unlock-traveler-tag">Traveler</span>
                            ) : null}
                          </label>
                          {canEdit ? (
                            <button
                              type="button"
                              className="itp-meas-unlock-item-traveler-btn"
                              onClick={() =>
                                setEditingStepId((prev) => (prev === row.id ? '' : row.id))
                              }
                            >
                              {editingStepId === row.id
                                ? 'Close'
                                : hasTraveler
                                  ? 'Edit traveler'
                                  : 'Add traveler'}
                            </button>
                          ) : null}
                          {canEdit && editingStepId === row.id ? (
                            <UnlockStepForm
                              key={row.id}
                              option={option}
                              sections={sections}
                              areas={areas}
                              initial={draftFromUnlockCandidate(row)}
                              title={`Traveler for ${row.name}`}
                              hint={
                                <>
                                  Save traveler photos and fields on this extra step. It still stays off
                                  until the technician picks <strong>{option}</strong>.
                                </>
                              }
                              saveLabel="Save this step"
                              onSave={(draft) => saveEditedStep(row.id, draft)}
                              onCancel={() => setEditingStepId('')}
                            />
                          ) : null}
                        </div>
                      )
                    })}
                </div>
              ) : null}
              <label className="itp-meas-unlock-section">
                <span>Show steps in</span>
                <select
                  aria-label={`ITP section to show for ${option}`}
                  value={activeSection}
                  onChange={(event) => {
                    setFindText('')
                    setSectionKey(event.target.value)
                  }}
                >
                  {sectionTitles.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="search"
                className="itp-meas-unlock-find"
                value={findText}
                placeholder="Find an existing step…"
                aria-label={`Find an existing extra step for ${option}`}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => setFindText(event.target.value)}
              />
              {visibleGrouped.size === 0 ? (
                <p className="itp-meas-unlock-empty">
                  {findNeedle ? 'No matching steps on this ITP.' : 'No other checklist items yet.'} Add one below if you
                  need a step that is not listed.
                </p>
              ) : (
                [...visibleGrouped.entries()].map(([title, rows]) => {
                  const rowsToShow = findNeedle ? rows : rows.filter((row) => !selected.has(row.id))
                  if (rowsToShow.length === 0) return null
                  return (
                  <div key={title} className="itp-meas-unlock-group">
                    {findNeedle ? <div className="itp-meas-unlock-group-title">{title}</div> : null}
                    {rowsToShow.map((row) => {
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
                  )
                })
              )}
              {onCreateUnlockStep ? (
                <UnlockStepForm
                  key={activeSection}
                  option={option}
                  sections={sections}
                  areas={areas}
                  preferredSecId={(grouped.get(activeSection) ?? [])[0]?.secId}
                  title="Step not on this list?"
                  hint={
                    <>
                      Add the step, traveler photos/fields, then save. It stays off until the technician
                      picks <strong>{option}</strong>.
                    </>
                  }
                  saveLabel="Save this step"
                  onSave={(draft) => addCreatedStep(option, draft)}
                />
              ) : null}
            </div>
          </details>
        )
      })}
    </div>
  )
}
