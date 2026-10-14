import { useState } from 'react'
import {
  dropdownOptionSource,
  emptyMeasField,
  ITP_MEAS_FIELD_TYPE_OPTIONS,
  measFieldTypePatch,
  resolveJobCardField,
  withPersistedJobCardField,
  clampLinePhotoMax,
  clampLinePhotoMin,
  type ItpMeasFieldDef,
  type ItpMeasFieldType,
} from '../lib/itpItemRequirements'
import type { ItpLibraryItemSel } from '../types/itpLibraryPlan'
import type { ItpMasterCatalogItem } from '../lib/itpMasterCatalog'
import { ItpMeasDropdownSourceFields } from './ItpMeasDropdownSourceFields'
import { ItpMeasJobCardSourceSelect } from './ItpMeasJobCardSourceSelect'
import { ItpMeasRequiredToggle } from './ItpMeasRequiredToggle'
import { ItpPhotoMinMaxFields } from './ItpPhotoMinMaxFields'
import { ItpMeasUnlockItemsFields } from './ItpMeasUnlockItemsFields'
import {
  ensureRepairNeededDropdown,
  type ItpUnlockCandidate,
  type ItpUnlockStepDraft,
} from '../lib/itpMeasUnlocks'

type TravelerBuilderDraft = {
  requirePicture: boolean
  pictureLabel: string
  minPhotos: number
  maxPhotos: number
  fields: ItpMeasFieldDef[]
}

function draftFromLine(
  sel: ItpLibraryItemSel,
  catalogItem: ItpMasterCatalogItem | undefined,
  itemName: string,
): TravelerBuilderDraft {
  const requirePicture = Boolean(sel.requirePicture || catalogItem?.requirePicture)
  const fieldsSource =
    sel.measFields.length > 0
      ? sel.measFields
      : catalogItem?.measFields && catalogItem.measFields.length > 0
        ? catalogItem.measFields
        : []
  const minPhotos = clampLinePhotoMin(sel.minPhotos ?? catalogItem?.minPhotos ?? 1)
  return {
    requirePicture,
    pictureLabel: sel.pictureLabel || catalogItem?.pictureLabel || '',
    minPhotos,
    maxPhotos: clampLinePhotoMax(sel.maxPhotos ?? catalogItem?.maxPhotos, minPhotos),
    fields: ensureRepairNeededDropdown(
      fieldsSource.map((field) => emptyMeasField(field)),
      itemName || catalogItem?.name || '',
    ),
  }
}

function fieldNeedsAdvanced(field: ItpMeasFieldDef): boolean {
  if (resolveJobCardField(field)) return true
  if (String(field.followUpWhen ?? '').trim() || String(field.followUpLabel ?? '').trim()) return true
  if (field.followUpLookupCategory) return true
  const unlocks = field.unlockItemIdsByOption ?? {}
  return Object.values(unlocks).some((ids) => (ids?.length ?? 0) > 0)
}

type Props = {
  itemName: string
  sourceItemId?: string
  sel: ItpLibraryItemSel
  catalogItem: ItpMasterCatalogItem | undefined
  unlockCandidates?: ItpUnlockCandidate[]
  processSections?: Array<{ id: string; title: string }>
  shopAreas?: Array<{ value: string; label: string }>
  onCreateUnlockStep?: (draft: ItpUnlockStepDraft) => ItpUnlockCandidate | null
  onUpdateUnlockStep?: (itemId: string, draft: ItpUnlockStepDraft) => ItpUnlockCandidate | null
  onCancel: () => void
  onSave: (patch: Partial<ItpLibraryItemSel>) => void
}

export function ItpLineTravelerBuilderModal({
  itemName,
  sourceItemId = '',
  sel,
  catalogItem,
  unlockCandidates = [],
  processSections,
  shopAreas,
  onCreateUnlockStep,
  onUpdateUnlockStep,
  onCancel,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<TravelerBuilderDraft>(() => draftFromLine(sel, catalogItem, itemName))
  /** Explicit open/closed; missing key means “open if this field already has advanced settings”. */
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({})

  const isAdvancedOpen = (field: ItpMeasFieldDef) => {
    if (Object.prototype.hasOwnProperty.call(expandedAdvanced, field.id)) {
      return Boolean(expandedAdvanced[field.id])
    }
    return fieldNeedsAdvanced(field)
  }

  const save = () => {
    const fields = draft.fields
      .map((field) => {
        const next = emptyMeasField(field)
        if (next.type === 'dropdown') {
          next.optionSource = dropdownOptionSource(next)
          if (next.optionSource === 'manufacturers' || next.optionSource === 'lookup') next.options = []
        }
        return withPersistedJobCardField(next)
      })
      .filter((field) => field.label)
    const requirePicture = draft.requirePicture
    onSave({
      requirePicture,
      pictureLabel: requirePicture ? draft.pictureLabel.trim() : '',
      minPhotos: requirePicture ? clampLinePhotoMin(draft.minPhotos) : 1,
      maxPhotos: requirePicture ? clampLinePhotoMax(draft.maxPhotos, draft.minPhotos) : 4,
      measFields: fields,
      beforeMeas: fields.length > 0,
      afterMeas: fields.length > 0,
      measVerify: fields.length > 0,
      addToTraveler: requirePicture || fields.length > 0,
    })
  }

  const patchField = (idx: number, patch: Partial<ItpMeasFieldDef>) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => (i === idx ? { ...field, ...patch } : field)),
    }))
  }

  const addField = (type: ItpMeasFieldType) => {
    const base = emptyMeasField({ label: '', type })
    const created = emptyMeasField({ ...base, ...measFieldTypePatch(base, type) })
    setDraft((prev) => ({ ...prev, fields: [...prev.fields, created] }))
  }

  const toggleAdvanced = (fieldId: string) => {
    setExpandedAdvanced((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }))
  }

  return (
    <div className="modal-overlay itp-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal-card itp-line-traveler-modal"
        role="dialog"
        aria-labelledby="itp-line-traveler-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h3 id="itp-line-traveler-title">Traveler requirements</h3>
            <p className="modal-subtitle">{itemName}</p>
          </div>
          <button type="button" className="modal-close-x" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <p className="placeholder-copy itp-line-traveler-lead">
          Choose photos and questions for this step. Keep it simple — open <strong>More options</strong> only if you
          need job-card prefill, follow-up questions, or extra checklist steps.
        </p>

        <section className="itp-line-traveler-block">
          <h4 className="itp-line-traveler-block-title">1. Photos</h4>
          <div className="itp-master-req-toggle-row">
            <button
              type="button"
              className={`itp-library-attr-toggle photo${draft.requirePicture ? ' on' : ''}`}
              onClick={() => setDraft((prev) => ({ ...prev, requirePicture: !prev.requirePicture }))}
            >
              {draft.requirePicture ? 'Photos required' : 'No photos required'}
            </button>
          </div>
          {draft.requirePicture ? (
            <div className="itp-master-req-detail-row" style={{ marginTop: 10 }}>
              <label className="itp-master-global-field itp-master-global-field--wide">
                <span>Photo label</span>
                <input
                  type="text"
                  value={draft.pictureLabel}
                  placeholder="e.g. As-received body photo"
                  onChange={(e) => setDraft((prev) => ({ ...prev, pictureLabel: e.target.value }))}
                />
              </label>
              <ItpPhotoMinMaxFields
                minPhotos={draft.minPhotos}
                maxPhotos={draft.maxPhotos}
                onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
              />
            </div>
          ) : null}
        </section>

        <section className="itp-line-traveler-block">
          <div className="itp-line-traveler-block-hdr">
            <h4 className="itp-line-traveler-block-title">2. Questions for the tech</h4>
            <div className="itp-line-traveler-quick-adds">
              <button type="button" className="button-secondary" onClick={() => addField('text')}>
                + Text
              </button>
              <button type="button" className="button-secondary" onClick={() => addField('dropdown')}>
                + Dropdown
              </button>
              <button type="button" className="button-secondary" onClick={() => addField('yes_no')}>
                + Yes / No
              </button>
              <button type="button" className="button-secondary" onClick={() => addField('picture')}>
                + Picture
              </button>
            </div>
          </div>

          {draft.fields.length === 0 ? (
            <p className="placeholder-copy">No questions yet. Add a text box or dropdown above.</p>
          ) : (
            <div className="itp-line-traveler-field-list">
              {draft.fields.map((field, idx) => {
                const advancedOpen = isAdvancedOpen(field)
                const isDropdown = (field.type || 'text') === 'dropdown'
                return (
                  <div key={field.id || `tf-${idx}`} className="itp-line-traveler-field-card">
                    <div className="itp-line-traveler-field-main">
                      <label className="itp-line-traveler-field-label">
                        <span>Question</span>
                        <input
                          type="text"
                          value={field.label}
                          placeholder="e.g. Repair needed"
                          onChange={(e) => patchField(idx, { label: e.target.value })}
                        />
                      </label>
                      <label className="itp-line-traveler-field-type">
                        <span>Answer type</span>
                        <select
                          value={field.type || 'text'}
                          aria-label="Field type"
                          onChange={(e) => {
                            const type = e.target.value as ItpMeasFieldType
                            patchField(idx, measFieldTypePatch(field, type))
                          }}
                        >
                          {ITP_MEAS_FIELD_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {isDropdown || field.type === 'picture' ? (
                        <div className="itp-line-traveler-field-source">
                          <span>{isDropdown ? 'Choices from' : 'Pictures'}</span>
                          <div className="itp-line-traveler-field-source-controls">
                            <ItpMeasDropdownSourceFields
                              field={field}
                              showFollowUp={false}
                              onChange={(patch) => patchField(idx, patch)}
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="itp-line-traveler-field-side">
                        <ItpMeasRequiredToggle
                          required={field.required !== false}
                          onChange={(required) => patchField(idx, { required })}
                        />
                        <button
                          type="button"
                          className="itp-library-sr-del"
                          title="Remove field"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              fields: prev.fields.filter((_, i) => i !== idx),
                            }))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="itp-line-traveler-advanced-toggle"
                      aria-expanded={advancedOpen}
                      onClick={() => toggleAdvanced(field.id)}
                    >
                      {advancedOpen ? '▾ Hide options' : '▸ More options'}
                      <span>Job card · follow-up · extra steps</span>
                    </button>

                    {advancedOpen ? (
                      <div className="itp-line-traveler-advanced">
                        <label className="itp-line-traveler-advanced-row">
                          <span>Prefill from job card</span>
                          <ItpMeasJobCardSourceSelect
                            field={field}
                            onChange={(patch) => patchField(idx, patch)}
                          />
                        </label>
                        {isDropdown ? (
                          <div className="itp-line-traveler-advanced-row">
                            <span>If they pick a special answer, ask another question</span>
                            <div className="itp-line-traveler-followup">
                              <ItpMeasDropdownSourceFields
                                field={field}
                                showSource={false}
                                showFollowUp
                                onChange={(patch) => patchField(idx, patch)}
                              />
                            </div>
                          </div>
                        ) : null}
                        {isDropdown ? (
                          <div className="itp-line-traveler-advanced-row">
                            <span>Extra checklist steps for a choice</span>
                            <ItpMeasUnlockItemsFields
                              field={field}
                              sourceItemId={sourceItemId}
                              candidates={unlockCandidates}
                              processSections={processSections}
                              shopAreas={shopAreas}
                              onCreateUnlockStep={onCreateUnlockStep}
                              onUpdateUnlockStep={onUpdateUnlockStep}
                              onChange={(patch) => patchField(idx, patch)}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <div className="itp-propagate-modal-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
