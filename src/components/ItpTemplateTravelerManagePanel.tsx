import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_ITP_MEAS_FIELDS,
  emptyMeasField,
  ITP_MEAS_FIELD_TYPE_OPTIONS,
  measFieldTypeLabel,
  type ItpMeasFieldDef,
  type ItpMeasFieldType,
} from '../lib/itpItemRequirements'
import { NAMEPLATE_TRAVELER_FIELDS } from '../lib/itpTravelerNameplate'
import { itpShopAreaLabel, type ItpShopArea, type ItpShopAreaDef } from '../constants/itpShopAreas'
import type { ItpLibraryItemSel } from '../types/itpLibraryPlan'
import type { ItpMasterCatalogItem } from '../lib/itpMasterCatalog'

export type TravelerManageSection = {
  section: { id: string; title: string }
  items: Array<{
    id: string
    name: string
    ref: string
    area: string
    catalogSecId: string
  }>
}

export type TravelerRequirementDraft = {
  name: string
  area: ItpShopArea
  secId: string
  ref: string
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  requireMeasurement: boolean
  requireNameplate: boolean
  measFields: ItpMeasFieldDef[]
  holdPoint: boolean
  blockNext: boolean
}

type ItpTemplateTravelerManagePanelProps = {
  valveType: string
  templateName: string
  sections: TravelerManageSection[]
  processSections: Array<{ id: string; title: string }>
  selectedItemId: string | null
  onSelectItem: (itemId: string) => void
  getSel: (itemId: string) => ItpLibraryItemSel
  catalogById: Map<string, ItpMasterCatalogItem>
  areas: ItpShopAreaDef[]
  onUpdateSel: (itemId: string, patch: Partial<ItpLibraryItemSel>) => void
  onAddRequirement: (draft: TravelerRequirementDraft) => string | null
  onBackToEdit: () => void
  onSaveTemplate: () => void
  saving: boolean
  dirty: boolean
}

function emptyTravelerDraft(secId: string, area: ItpShopArea): TravelerRequirementDraft {
  return {
    name: '',
    area,
    secId,
    ref: '',
    requirePicture: false,
    pictureLabel: '',
    minPhotos: 1,
    requireMeasurement: false,
    requireNameplate: false,
    measFields: DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row })),
    holdPoint: false,
    blockNext: false,
  }
}

function hasMeasInputs(sel: ItpLibraryItemSel): boolean {
  return (
    sel.measFields.length > 0 ||
    sel.requireNameplate ||
    sel.beforeMeas ||
    sel.afterMeas ||
    sel.measVerify
  )
}

function resolveTravelerFields(sel: ItpLibraryItemSel): ItpMeasFieldDef[] {
  if (sel.measFields.length > 0) return sel.measFields.map((row) => emptyMeasField(row))
  if (sel.requireNameplate) return NAMEPLATE_TRAVELER_FIELDS.map((row) => ({ ...row }))
  if (sel.beforeMeas || sel.afterMeas || sel.measVerify) {
    return DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
  }
  return []
}

function fieldSummary(sel: ItpLibraryItemSel): string {
  const fields = resolveTravelerFields(sel)
  const parts: string[] = []
  if (sel.requireNameplate) parts.push('nameplate')
  if (sel.requirePicture) parts.push('photo')
  if (fields.length > 0) parts.push(`${fields.length} field${fields.length === 1 ? '' : 's'}`)
  if (sel.holdPoint) parts.push('hold')
  return parts.length ? parts.join(' · ') : 'No traveler inputs yet'
}

function PreviewFieldControl({ field }: { field: ItpMeasFieldDef }) {
  const required = field.required !== false
  const label = `${field.label}${required ? ' *' : ''}`
  if (field.type === 'picture') {
    return (
      <div className="itp-traveler-live-field itp-traveler-live-field--picture">
        <span>{label}</span>
        <div className="itp-traveler-live-photo-slot">Picture</div>
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <label className="itp-traveler-live-field itp-traveler-live-field--wide">
        <span>{label}</span>
        <textarea rows={2} disabled placeholder="Tech enters notes…" />
      </label>
    )
  }
  if (field.type === 'dropdown') {
    return (
      <label className="itp-traveler-live-field">
        <span>{label}</span>
        <select disabled>
          <option>— Select —</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === 'yes_no') {
    return (
      <label className="itp-traveler-live-field">
        <span>{label}</span>
        <select disabled>
          <option>— Select —</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </label>
    )
  }
  return (
    <label className="itp-traveler-live-field">
      <span>{label}</span>
      <input type={field.type === 'number' ? 'number' : 'text'} disabled placeholder="…" />
    </label>
  )
}

export function ItpTemplateTravelerManagePanel({
  valveType,
  templateName,
  sections,
  processSections,
  selectedItemId,
  onSelectItem,
  getSel,
  catalogById,
  areas,
  onUpdateSel,
  onAddRequirement,
  onBackToEdit,
  onSaveTemplate,
  saving,
  dirty,
}: ItpTemplateTravelerManagePanelProps) {
  const previewRef = useRef<HTMLDivElement | null>(null)
  const defaultSecId = processSections[0]?.id ?? 'receipt'
  const defaultArea = (areas[0]?.value ?? 'teardown') as ItpShopArea
  const [draft, setDraft] = useState<TravelerRequirementDraft>(() =>
    emptyTravelerDraft(defaultSecId, defaultArea),
  )

  useEffect(() => {
    setDraft((prev) => {
      const secOk = processSections.some((row) => row.id === prev.secId)
      const areaOk = areas.some((row) => row.value === prev.area)
      if (secOk && areaOk) return prev
      return {
        ...prev,
        secId: secOk ? prev.secId : defaultSecId,
        area: areaOk ? prev.area : defaultArea,
      }
    })
  }, [processSections, areas, defaultSecId, defaultArea])

  const selected = selectedItemId
    ? sections.flatMap((row) => row.items).find((item) => item.id === selectedItemId) ?? null
    : null
  const sel = selectedItemId ? getSel(selectedItemId) : null
  const catalogItem = selectedItemId ? catalogById.get(selectedItemId) : null
  const measFields = sel ? resolveTravelerFields(sel) : []
  const measOn = sel ? hasMeasInputs(sel) : false

  const configuredStepCount = useMemo(() => {
    let count = 0
    for (const section of sections) {
      for (const item of section.items) {
        const itemSel = getSel(item.id)
        if (
          itemSel.requirePicture ||
          itemSel.requireNameplate ||
          itemSel.holdPoint ||
          resolveTravelerFields(itemSel).length > 0
        ) {
          count += 1
        }
      }
    }
    return count
  }, [sections, getSel])

  useEffect(() => {
    if (!selectedItemId || !previewRef.current) return
    const el = previewRef.current.querySelector<HTMLElement>(
      `#itp-traveler-live-step-${CSS.escape(selectedItemId)}`,
    )
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedItemId, measFields.length, sel?.requirePicture, sel?.requireNameplate])

  const patchFields = (nextFields: ItpMeasFieldDef[]) => {
    if (!selectedItemId || !sel) return
    const keepMeas = nextFields.length > 0 || sel.requireNameplate
    onUpdateSel(selectedItemId, {
      measFields: nextFields,
      beforeMeas: keepMeas,
      afterMeas: keepMeas,
      measVerify: keepMeas,
      addToTraveler: keepMeas || sel.requirePicture || sel.holdPoint,
    })
  }

  const submitAdd = () => {
    const id = onAddRequirement(draft)
    if (!id) return
    setDraft(emptyTravelerDraft(draft.secId, draft.area))
  }

  return (
    <div className="itp-library-split itp-template-builder-layout is-valve-selected itp-template-traveler-manage">
      <div className="itp-library-panel itp-library-panel-left">
        <div className="itp-library-panel-hdr">
          <h3>
            Template · {valveType}
            {templateName ? ` · ${templateName}` : ''}
          </h3>
          <div className="itp-library-ph-actions">
            <button type="button" className="button-secondary" onClick={onBackToEdit}>
              ← Edit checklist
            </button>
          </div>
        </div>
        <p className="placeholder-copy itp-traveler-manage-hint">
          Select a step to edit inputs, or add a new requirement on the right — the traveler packet builds live.
        </p>
        <div className="itp-library-panel-body">
          {sections.length === 0 ? (
            <div className="itp-library-empty">
              <p>No checklist items yet. Add a requirement on the right to start the traveler.</p>
            </div>
          ) : (
            sections.map(({ section, items }) => (
              <div key={section.id} className="itp-library-itp-sec">
                <div className="itp-library-itp-sec-hdr">
                  <h4>{section.title}</h4>
                  <span className="itp-library-isp">{items.length}</span>
                </div>
                {items.map((item) => {
                  const itemSel = getSel(item.id)
                  const isSelected = item.id === selectedItemId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`itp-traveler-manage-step${isSelected ? ' is-selected' : ''}`}
                      onClick={() => onSelectItem(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <span className="itp-traveler-manage-step-meta">
                        [{item.ref}] · {itpShopAreaLabel(item.area, areas)} · {fieldSummary(itemSel)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="itp-library-panel itp-library-panel-right">
        <div className="itp-library-panel-hdr">
          <h3>Traveler (live build)</h3>
          <div className="itp-library-ph-actions">
            <span className="itp-library-ph-count">
              {configuredStepCount} step{configuredStepCount === 1 ? '' : 's'} configured
            </span>
            <button
              type="button"
              className="button-primary"
              disabled={saving || !dirty}
              onClick={onSaveTemplate}
            >
              {saving ? 'Saving…' : dirty ? 'Save template' : 'Template saved'}
            </button>
          </div>
        </div>

        <div className="itp-traveler-manage-right-scroll">
          <div className="itp-traveler-manage-add">
            <div className="itp-master-global-add-title">Add requirement to traveler</div>
            <div className="itp-master-global-add-row">
              <label className="itp-master-global-field itp-master-global-field--wide">
                <span>Requirement</span>
                <input
                  type="text"
                  value={draft.name}
                  placeholder="Type the requirement…"
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitAdd()
                    }
                  }}
                />
              </label>
              <label className="itp-master-global-field">
                <span>ITP section</span>
                <select
                  value={draft.secId}
                  onChange={(e) => setDraft((prev) => ({ ...prev, secId: e.target.value }))}
                >
                  {processSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="itp-master-global-field">
                <span>Assigned station</span>
                <select
                  value={draft.area}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, area: e.target.value as ItpShopArea }))
                  }
                >
                  {areas.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="itp-master-global-field">
                <span>Short label</span>
                <input
                  type="text"
                  value={draft.ref}
                  placeholder="Optional"
                  onChange={(e) => setDraft((prev) => ({ ...prev, ref: e.target.value }))}
                />
              </label>
              <button type="button" className="button-primary itp-master-global-add-btn" onClick={submitAdd}>
                Add to traveler
              </button>
            </div>

            <div className="itp-master-req-toggles">
              <span className="itp-master-req-toggles-label">Requirement types</span>
              <div className="itp-master-req-toggle-row">
                <button
                  type="button"
                  className="itp-library-attr-toggle on"
                  disabled
                  title="Every item is a requirement"
                >
                  Requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle photo${draft.requirePicture ? ' on' : ''}`}
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, requirePicture: !prev.requirePicture }))
                  }
                >
                  Picture requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle meas${draft.requireMeasurement ? ' on' : ''}`}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      requireMeasurement: !prev.requireMeasurement,
                      measFields:
                        prev.measFields.length > 0
                          ? prev.measFields
                          : DEFAULT_ITP_MEAS_FIELDS.map((f) => ({ ...f })),
                    }))
                  }
                >
                  Measurement requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle${draft.requireNameplate ? ' on' : ''}`}
                  onClick={() =>
                    setDraft((prev) => {
                      const nextOn = !prev.requireNameplate
                      return {
                        ...prev,
                        requireNameplate: nextOn,
                        requireMeasurement: nextOn ? true : prev.requireMeasurement,
                        measFields: nextOn
                          ? NAMEPLATE_TRAVELER_FIELDS.map((f) => ({ ...f }))
                          : prev.measFields,
                      }
                    })
                  }
                >
                  Nameplate / job card
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle hp${draft.holdPoint ? ' on' : ''}`}
                  onClick={() => setDraft((prev) => ({ ...prev, holdPoint: !prev.holdPoint }))}
                >
                  QA/QC hold point
                </button>
              </div>
              <label className="itp-master-block-next">
                <input
                  type="checkbox"
                  checked={draft.blockNext}
                  onChange={(e) => setDraft((prev) => ({ ...prev, blockNext: e.target.checked }))}
                />
                <span>Block the next item until this item&apos;s requirements are met</span>
              </label>
              {draft.requirePicture ? (
                <div className="itp-master-req-detail-row">
                  <label className="itp-master-global-field itp-master-global-field--wide">
                    <span>Photo label</span>
                    <input
                      type="text"
                      value={draft.pictureLabel}
                      placeholder="e.g. As-received body photo"
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, pictureLabel: e.target.value }))
                      }
                    />
                  </label>
                  <label className="itp-master-global-field">
                    <span>Minimum photos</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={draft.minPhotos}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          minPhotos: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {draft.requireMeasurement ? (
                <div className="itp-master-meas-fields">
                  <div className="itp-master-meas-fields-hdr">Technician input fields</div>
                  <div className="itp-master-meas-fields-list">
                    {draft.measFields.map((field, idx) => (
                      <div
                        key={field.id || `draft-tf-${idx}`}
                        className="itp-master-meas-field-row itp-master-meas-field-row--typed"
                      >
                        <input
                          type="text"
                          value={field.label}
                          placeholder="Field label"
                          onChange={(e) => {
                            const label = e.target.value
                            setDraft((prev) => ({
                              ...prev,
                              measFields: prev.measFields.map((row, i) =>
                                i === idx ? { ...row, label } : row,
                              ),
                            }))
                          }}
                        />
                        <select
                          value={field.type}
                          aria-label="Field type"
                          onChange={(e) => {
                            const type = e.target.value as ItpMeasFieldType
                            setDraft((prev) => ({
                              ...prev,
                              measFields: prev.measFields.map((row, i) =>
                                i === idx ? { ...row, type } : row,
                              ),
                            }))
                          }}
                        >
                          {ITP_MEAS_FIELD_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {field.type === 'dropdown' ? (
                          <input
                            type="text"
                            value={(field.options ?? []).join(', ')}
                            placeholder="Dropdown options (comma-separated)"
                            onChange={(e) => {
                              const options = e.target.value
                                .split(',')
                                .map((opt) => opt.trim())
                                .filter(Boolean)
                              setDraft((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((row, i) =>
                                  i === idx ? { ...row, options } : row,
                                ),
                              }))
                            }}
                          />
                        ) : (
                          <span className="itp-master-meas-field-spacer" aria-hidden />
                        )}
                        <label className="itp-master-meas-required">
                          <input
                            type="checkbox"
                            checked={field.required !== false}
                            onChange={(e) => {
                              const required = e.target.checked
                              setDraft((prev) => ({
                                ...prev,
                                measFields: prev.measFields.map((row, i) =>
                                  i === idx ? { ...row, required } : row,
                                ),
                              }))
                            }}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          className="itp-library-sr-del"
                          title="Remove field"
                          disabled={draft.measFields.length <= 1}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              measFields: prev.measFields.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="itp-library-add-sr-btn"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        measFields: [...prev.measFields, emptyMeasField({ label: '' })],
                      }))
                    }
                  >
                    + Add field
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {selected && sel ? (
            <div className="itp-traveler-manage-editor itp-traveler-manage-editor--compact">
              <div className="itp-traveler-manage-editor-title">
                <h4>Edit: {selected.name}</h4>
                <p className="placeholder-copy">
                  [{selected.ref}]
                  {catalogItem?.builtIn ? '' : ' · custom'}
                  {' · '}
                  Station: {itpShopAreaLabel(selected.area, areas)}
                </p>
              </div>

              <div className="itp-library-attr-bar">
                <button type="button" className="itp-library-attr-toggle on" disabled>
                  Requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle photo${sel.requirePicture ? ' on' : ''}`}
                  onClick={() => {
                    const nextOn = !sel.requirePicture
                    onUpdateSel(selected.id, {
                      requirePicture: nextOn,
                      pictureLabel: nextOn ? sel.pictureLabel || selected.name : sel.pictureLabel,
                      minPhotos: nextOn ? Math.max(1, sel.minPhotos || 1) : sel.minPhotos,
                      addToTraveler: nextOn || measOn || sel.holdPoint,
                    })
                  }}
                >
                  Picture requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle meas${measOn ? ' on' : ''}`}
                  onClick={() => {
                    const nextOn = !measOn
                    onUpdateSel(selected.id, {
                      beforeMeas: nextOn || sel.requireNameplate,
                      afterMeas: nextOn || sel.requireNameplate,
                      measVerify: nextOn || sel.requireNameplate,
                      measFields: nextOn
                        ? measFields.length > 0
                          ? measFields
                          : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                        : sel.requireNameplate
                          ? NAMEPLATE_TRAVELER_FIELDS.map((row) => ({ ...row }))
                          : [],
                      addToTraveler: nextOn || sel.requirePicture || sel.holdPoint || sel.requireNameplate,
                    })
                  }}
                >
                  Measurement requirement
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle${sel.requireNameplate ? ' on' : ''}`}
                  onClick={() => {
                    const nextOn = !sel.requireNameplate
                    onUpdateSel(selected.id, {
                      requireNameplate: nextOn,
                      beforeMeas: nextOn || measOn,
                      afterMeas: nextOn || measOn,
                      measVerify: nextOn || measOn,
                      measFields: nextOn
                        ? NAMEPLATE_TRAVELER_FIELDS.map((row) => ({ ...row }))
                        : measOn
                          ? measFields.length > 0
                            ? measFields
                            : DEFAULT_ITP_MEAS_FIELDS.map((row) => ({ ...row }))
                          : [],
                      addToTraveler: nextOn || sel.requirePicture || sel.holdPoint || measOn,
                    })
                  }}
                >
                  Nameplate / job card
                </button>
                <button
                  type="button"
                  className={`itp-library-attr-toggle hp${sel.holdPoint ? ' on' : ''}`}
                  onClick={() =>
                    onUpdateSel(selected.id, {
                      holdPoint: !sel.holdPoint,
                      addToTraveler: !sel.holdPoint || sel.requirePicture || measOn,
                    })
                  }
                >
                  QA/QC hold point
                </button>
              </div>
              <label className="itp-master-block-next">
                <input
                  type="checkbox"
                  checked={sel.blockNext}
                  onChange={(e) => onUpdateSel(selected.id, { blockNext: e.target.checked })}
                />
                <span>Block the next item until this item&apos;s requirements are met</span>
              </label>

              {sel.requirePicture ? (
                <div className="itp-master-req-detail-row">
                  <label className="itp-master-global-field itp-master-global-field--wide">
                    <span>Photo label</span>
                    <input
                      type="text"
                      value={sel.pictureLabel}
                      placeholder="e.g. As-received body photo"
                      onChange={(e) => onUpdateSel(selected.id, { pictureLabel: e.target.value })}
                    />
                  </label>
                  <label className="itp-master-global-field">
                    <span>Minimum photos</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={Math.max(1, sel.minPhotos || 1)}
                      onChange={(e) =>
                        onUpdateSel(selected.id, {
                          minPhotos: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}

              {measOn ? (
                <div className="itp-master-meas-fields">
                  <div className="itp-master-meas-fields-hdr">Traveler input fields</div>
                  <div className="itp-master-meas-fields-list">
                    {measFields.map((field, idx) => (
                      <div
                        key={field.id || `${selected.id}-tf-${idx}`}
                        className="itp-master-meas-field-row itp-master-meas-field-row--typed"
                      >
                        <input
                          type="text"
                          value={field.label}
                          placeholder="Field label"
                          onChange={(e) => {
                            const label = e.target.value
                            patchFields(
                              measFields.map((row, i) => (i === idx ? { ...row, label } : row)),
                            )
                          }}
                        />
                        <select
                          value={field.type}
                          aria-label="Field type"
                          onChange={(e) => {
                            const type = e.target.value as ItpMeasFieldType
                            patchFields(
                              measFields.map((row, i) => (i === idx ? { ...row, type } : row)),
                            )
                          }}
                        >
                          {ITP_MEAS_FIELD_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {field.type === 'dropdown' ? (
                          <input
                            type="text"
                            value={(field.options ?? []).join(', ')}
                            placeholder="Dropdown options (comma-separated)"
                            onChange={(e) => {
                              const options = e.target.value
                                .split(',')
                                .map((opt) => opt.trim())
                                .filter(Boolean)
                              patchFields(
                                measFields.map((row, i) => (i === idx ? { ...row, options } : row)),
                              )
                            }}
                          />
                        ) : (
                          <span className="itp-master-meas-field-spacer" aria-hidden />
                        )}
                        <label className="itp-master-meas-required">
                          <input
                            type="checkbox"
                            checked={field.required !== false}
                            onChange={(e) => {
                              const required = e.target.checked
                              patchFields(
                                measFields.map((row, i) => (i === idx ? { ...row, required } : row)),
                              )
                            }}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          className="itp-library-sr-del"
                          title="Remove field"
                          disabled={measFields.length <= 1 && !sel.requireNameplate}
                          onClick={() => patchFields(measFields.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="itp-library-add-sr-btn"
                    onClick={() => patchFields([...measFields, emptyMeasField({ label: '' })])}
                  >
                    + Add field
                  </button>
                </div>
              ) : (
                <p className="placeholder-copy">
                  Turn on <strong>Measurement requirement</strong> or{' '}
                  <strong>Nameplate / job card</strong> — or add a new requirement above.
                </p>
              )}
            </div>
          ) : (
            <div className="itp-traveler-manage-editor itp-traveler-manage-editor--compact">
              <p className="placeholder-copy">
                Add a requirement above, or select a template step on the left to configure it.
              </p>
            </div>
          )}

          <div className="itp-traveler-live-doc" ref={previewRef}>
            <header className="itp-traveler-live-doc-hdr">
              <p className="itp-traveler-live-doc-brand">J&amp;S Machine and Valve QA/QC Traveler</p>
              <h2>
                {valveType} — {templateName || 'Template'}
              </h2>
              <p className="placeholder-copy">
                Live preview of the traveler packet. Empty controls show what technicians will fill in.
              </p>
            </header>

            {sections.length === 0 ? (
              <p className="placeholder-copy">No checklist items in this template yet.</p>
            ) : (
              sections.map(({ section, items }) => (
                <section key={section.id} className="itp-traveler-live-section">
                  <h3>{section.title}</h3>
                  {items.map((item) => {
                    const itemSel = getSel(item.id)
                    const fields = resolveTravelerFields(itemSel)
                    const isSelected = item.id === selectedItemId
                    const hasInputs =
                      itemSel.requirePicture ||
                      itemSel.requireNameplate ||
                      itemSel.holdPoint ||
                      fields.length > 0
                    return (
                      <article
                        key={item.id}
                        id={`itp-traveler-live-step-${item.id}`}
                        className={`itp-traveler-live-step${isSelected ? ' is-selected' : ''}${
                          hasInputs ? ' has-inputs' : ''
                        }`}
                        onClick={() => onSelectItem(item.id)}
                      >
                        <header className="itp-traveler-live-step-hdr">
                          <div>
                            <h4>{item.name}</h4>
                            <span className="itp-traveler-live-step-meta">
                              [{item.ref}] · {itpShopAreaLabel(item.area, areas)}
                              {itemSel.holdPoint ? ' · Hold point' : ''}
                            </span>
                          </div>
                          {!hasInputs ? (
                            <span className="itp-traveler-live-step-empty">Checklist only</span>
                          ) : null}
                        </header>

                        {itemSel.requirePicture ? (
                          <div className="itp-traveler-live-field itp-traveler-live-field--picture">
                            <span>
                              {itemSel.pictureLabel.trim() || 'Photos'}
                              {` (min ${Math.max(1, itemSel.minPhotos || 1)})`}
                            </span>
                            <div className="itp-traveler-live-photo-slot">Picture upload</div>
                          </div>
                        ) : null}

                        {fields.length > 0 ? (
                          <div className="itp-traveler-live-fields">
                            {fields.map((field) => (
                              <PreviewFieldControl key={field.id} field={field} />
                            ))}
                          </div>
                        ) : null}

                        {hasInputs ? (
                          <div className="itp-traveler-live-step-footer">
                            <label className="itp-traveler-live-field">
                              <span>Result</span>
                              <select disabled>
                                <option>— Select —</option>
                              </select>
                            </label>
                            <label className="itp-traveler-live-field">
                              <span>Tech initials</span>
                              <input type="text" disabled placeholder="…" />
                            </label>
                          </div>
                        ) : null}

                        {fields.length > 0 ? (
                          <p className="itp-traveler-live-type-hint">
                            {fields
                              .map((field) => `${field.label} (${measFieldTypeLabel(field.type)})`)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </article>
                    )
                  })}
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
