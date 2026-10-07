import { useState } from 'react'
import {
  dropdownOptionSource,
  emptyMeasField,
  ITP_MEAS_FIELD_TYPE_OPTIONS,
  measFieldTypePatch,
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
): TravelerBuilderDraft {
  const requirePicture = Boolean(sel.requirePicture || catalogItem?.requirePicture)
  const fieldsSource =
    sel.measFields.length > 0
      ? sel.measFields
      : catalogItem?.measFields && catalogItem.measFields.length > 0
        ? catalogItem.measFields
        : []
  const minPhotos = clampLinePhotoMin(sel.minPhotos || catalogItem?.minPhotos || 1)
  return {
    requirePicture,
    pictureLabel: sel.pictureLabel || catalogItem?.pictureLabel || '',
    minPhotos,
    maxPhotos: clampLinePhotoMax(sel.maxPhotos ?? catalogItem?.maxPhotos, minPhotos),
    fields: fieldsSource.map((field) => emptyMeasField(field)),
  }
}

type Props = {
  itemName: string
  sel: ItpLibraryItemSel
  catalogItem: ItpMasterCatalogItem | undefined
  onCancel: () => void
  onSave: (patch: Partial<ItpLibraryItemSel>) => void
}

export function ItpLineTravelerBuilderModal({
  itemName,
  sel,
  catalogItem,
  onCancel,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<TravelerBuilderDraft>(() => draftFromLine(sel, catalogItem))

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
        <p className="placeholder-copy" style={{ marginTop: 0 }}>
          These inputs show on the shop traveler for this line: required photos, labeled text boxes, dropdowns, and
          picture fields. Require one photo and still allow extras (up to 4 by default). Technicians can mark any
          field <strong>N/A</strong> if it does not apply on that job.
        </p>

        <div className="itp-master-req-toggles">
          <span className="itp-master-req-toggles-label">Photos</span>
          <div className="itp-master-req-toggle-row">
            <button
              type="button"
              className={`itp-library-attr-toggle photo${draft.requirePicture ? ' on' : ''}`}
              onClick={() =>
                setDraft((prev) => ({ ...prev, requirePicture: !prev.requirePicture }))
              }
            >
              Require pictures
            </button>
          </div>
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

        <div className="itp-master-meas-fields" style={{ marginTop: 14 }}>
          <div className="itp-master-meas-fields-hdr">Traveler input fields</div>
          <p className="placeholder-copy itp-master-meas-fields-hint">
            Add labeled controls the technician fills on the traveler (text box, notes, dropdown, picture, etc.).
            Choose <strong>Job card</strong> to prefill Size, Customer, Due Date, Pressure Class, Body Material, and
            similar fields. For dropdowns, pick a <strong>Job field list</strong> from Admin (or type comma-separated
            custom options). N/A is always available as an answer.
          </p>
          <div className="itp-master-meas-fields-list">
            {draft.fields.map((field, idx) => (
              <div key={field.id || `tf-${idx}`} className="itp-master-meas-field-row itp-master-meas-field-row--typed">
                <input
                  type="text"
                  value={field.label}
                  placeholder="Field label"
                  onChange={(e) => patchField(idx, { label: e.target.value })}
                />
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
            ))}
          </div>
          <button
            type="button"
            className="itp-library-add-sr-btn"
            onClick={() =>
              setDraft((prev) => ({
                ...prev,
                fields: [...prev.fields, emptyMeasField({ label: '', type: 'text' })],
              }))
            }
          >
            + Add field
          </button>
        </div>

        <div className="itp-propagate-modal-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button-primary" onClick={save}>
            Save traveler requirements
          </button>
        </div>
      </div>
    </div>
  )
}
