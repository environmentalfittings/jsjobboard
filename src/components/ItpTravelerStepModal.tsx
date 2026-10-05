import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './ToastNotification'
import {
  deleteItpLibraryAttachment,
  uploadItpFlagPhoto,
} from '../lib/itpLibraryAttachments'
import {
  dropdownOptionSource,
  followUpApplies,
  followUpFieldId,
  followUpLabelOf,
  getFieldPhotos,
  getMeasValue,
  itemRequiresMeasurements,
  itemRequiresPicture,
  markDoneBlockedReason,
  patchMeasValue,
  pictureFieldMax,
  resolveDropdownChoices,
  resolveJobCardField,
  resolvedMeasFields,
} from '../lib/itpItemRequirements'
import {
  isNameplateTravelerStep,
  mergeNameplateMeasFields,
  nameplateIncompleteReason,
  nameplateValuesFromJobCard,
  type JobCardNameplateSource,
} from '../lib/itpTravelerNameplate'
import {
  emptyItemExec,
  emptyItemSel,
  type ItpLibraryAttachment,
  type ItpLibraryItemExec,
  type ItpLibraryItemSel,
} from '../types/itpLibraryPlan'
import type { ItpMeasFieldDef } from '../types/itpMeasFields'
import type { ItpTravelerReportItem } from '../lib/itpTravelerReport'
import { loadManufacturerDropdownNames } from '../lib/specDocuments'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import type { LookupCategory } from '../constants/lookupCategories'
import { ItpOptionalNotes } from './ItpOptionalNotes'

const RESULT_OPTIONS = ['', 'Pass', 'Fail', 'Yes', 'No', 'N/A'] as const

type ItpTravelerStepModalProps = {
  item: ItpTravelerReportItem
  sel: ItpLibraryItemSel
  exec: ItpLibraryItemExec
  valveRowId: number
  /** Job card fields used for “Transfer from job card” on nameplate steps. */
  jobCard: JobCardNameplateSource
  canSignOffHold: boolean
  signerName: string
  signerUserId: string | null
  saving: boolean
  onClose: () => void
  onSave: (next: { sel: ItpLibraryItemSel; exec: ItpLibraryItemExec }) => Promise<void>
}

export function ItpTravelerStepModal({
  item,
  sel: initialSel,
  exec: initialExec,
  valveRowId,
  jobCard,
  canSignOffHold,
  signerName,
  signerUserId,
  saving,
  onClose,
  onSave,
}: ItpTravelerStepModalProps) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const fieldFileRef = useRef<HTMLInputElement | null>(null)
  const [photoFieldId, setPhotoFieldId] = useState<string | null>(null)
  const isNameplate = isNameplateTravelerStep({
    id: item.id,
    name: item.name,
    ref: item.ref,
    requireNameplate: initialSel.requireNameplate || item.requireNameplate,
  })
  const [sel, setSel] = useState<ItpLibraryItemSel>(() => {
    const base = { ...emptyItemSel(), ...initialSel }
    return isNameplate
      ? { ...base, requireNameplate: true, measFields: mergeNameplateMeasFields(base.measFields) }
      : base
  })
  const [exec, setExec] = useState<ItpLibraryItemExec>(() => ({ ...emptyItemExec(), ...initialExec }))
  const [uploading, setUploading] = useState(false)
  const [manufacturerNames, setManufacturerNames] = useState<string[]>([])
  const [lookupOptions, setLookupOptions] = useState<Partial<Record<LookupCategory, string[]>>>({})

  useEffect(() => {
    const nameplate = isNameplateTravelerStep({
      id: item.id,
      name: item.name,
      ref: item.ref,
      requireNameplate: initialSel.requireNameplate || item.requireNameplate,
    })
    const base = { ...emptyItemSel(), ...initialSel }
    setSel(
      nameplate
        ? { ...base, requireNameplate: true, measFields: mergeNameplateMeasFields(base.measFields) }
        : base,
    )
    setExec({ ...emptyItemExec(), ...initialExec })
  }, [initialSel, initialExec, item])

  const measFields = useMemo(() => {
    const resolved = resolvedMeasFields(sel)
    return isNameplate ? mergeNameplateMeasFields(resolved) : resolved
  }, [sel, isNameplate])

  const measSections = useMemo(() => groupTechFields(measFields), [measFields])

  const jobCardSig = [
    jobCard.customer,
    jobCard.size,
    jobCard.pressure_class,
    jobCard.body_material,
    jobCard.material_spec,
    jobCard.due_date,
    jobCard.valve_type,
    jobCard.valve_id,
    jobCard.manufacturer,
  ].join('|')

  useEffect(() => {
    setExec((prev) => prefillExecFromJobCard(prev, measFields, jobCard))
  }, [jobCardSig, measFields, jobCard])
  const needsManufacturerList = useMemo(
    () => measFields.some((field) => dropdownOptionSource(field) === 'manufacturers'),
    [measFields],
  )
  const needsLookupLists = useMemo(
    () =>
      measFields.some(
        (field) =>
          dropdownOptionSource(field) === 'lookup' || Boolean(field.followUpLookupCategory),
      ),
    [measFields],
  )

  useEffect(() => {
    if (!needsManufacturerList) {
      setManufacturerNames([])
      return
    }
    let cancelled = false
    void loadManufacturerDropdownNames().then(({ names, error }) => {
      if (cancelled) return
      setManufacturerNames(names)
      if (error && names.length === 0) showToast(error)
    })
    return () => {
      cancelled = true
    }
  }, [needsManufacturerList, showToast])

  useEffect(() => {
    if (!needsLookupLists) return
    let cancelled = false
    void loadLookupOptionsMap().then((map) => {
      if (!cancelled) setLookupOptions(map)
    })
    return () => {
      cancelled = true
    }
  }, [needsLookupLists])

  const requirePicture = itemRequiresPicture(sel)
  const requireMeasurement = itemRequiresMeasurements(sel) || isNameplate

  const transferFromJobCard = () => {
    const values = nameplateValuesFromJobCard(jobCard)
    setExec((prev) => {
      let next = { ...prev, measValues: { ...prev.measValues } }
      for (const [fieldId, value] of Object.entries(values)) {
        if (!value.trim()) continue
        next = { ...next, ...patchMeasValue(next, fieldId, value) }
      }
      return next
    })
    showToast('Nameplate fields filled from job card — review and save')
  }

  const applyCompleteToggle = () => {
    if (exec.done || exec.holdPending) {
      setExec((prev) => ({
        ...prev,
        done: false,
        holdPending: false,
        holdSignedOffAt: null,
        holdSignedOffByUserId: null,
        holdSignedOffByName: null,
      }))
      return
    }

    const blocked =
      markDoneBlockedReason(
        isNameplate ? { ...sel, measFields } : sel,
        exec,
      ) ?? (isNameplate ? nameplateIncompleteReason(exec) : null)
    if (blocked) {
      showToast(blocked)
      return
    }

    if (sel.holdPoint) {
      if (canSignOffHold) {
        setExec((prev) => ({
          ...prev,
          done: true,
          holdPending: false,
          holdSignedOffAt: new Date().toISOString(),
          holdSignedOffByUserId: signerUserId,
          holdSignedOffByName: signerName || 'QC',
        }))
        return
      }
      setExec((prev) => ({ ...prev, done: false, holdPending: true }))
      return
    }

    setExec((prev) => ({ ...prev, done: true, holdPending: false }))
  }

  const addFieldPhotos = async (fieldId: string, fileList: FileList | null) => {
    if (!fileList?.length || uploading) return
    const field = measFields.find((row) => row.id === fieldId)
    const max = pictureFieldMax(field)
    const already = getFieldPhotos(exec, fieldId).length
    const remaining = Math.max(0, max - already)
    if (remaining <= 0) {
      showToast(`This field allows up to ${max} picture${max === 1 ? '' : 's'}`)
      setPhotoFieldId(null)
      if (fieldFileRef.current) fieldFileRef.current.value = ''
      if (fieldCameraRef.current) fieldCameraRef.current.value = ''
      return
    }
    const files = Array.from(fileList).slice(0, remaining)
    if (previewMode) {
      const uploaded = files.map(attachmentFromLocalFile)
      setExec((prev) => ({
        ...prev,
        fieldPhotos: {
          ...(prev.fieldPhotos ?? {}),
          [fieldId]: [...getFieldPhotos(prev, fieldId), ...uploaded],
        },
      }))
      showToast(uploaded.length === 1 ? 'Picture added' : `${uploaded.length} pictures added`)
      setPhotoFieldId(null)
      if (fieldFileRef.current) fieldFileRef.current.value = ''
      if (fieldCameraRef.current) fieldCameraRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const uploaded: ItpLibraryAttachment[] = []
      for (const file of files) {
        const { attachment, error } = await uploadItpFlagPhoto(valveRowId, `${item.id}-${fieldId}`, file)
        if (error || !attachment) {
          showToast(error || 'Upload failed')
          continue
        }
        uploaded.push(attachment)
      }
      if (uploaded.length === 0) return
      setExec((prev) => ({
        ...prev,
        fieldPhotos: {
          ...(prev.fieldPhotos ?? {}),
          [fieldId]: [...getFieldPhotos(prev, fieldId), ...uploaded],
        },
      }))
      showToast(uploaded.length === 1 ? 'Photo added' : `${uploaded.length} photos added`)
    } finally {
      setUploading(false)
      setPhotoFieldId(null)
      if (fieldFileRef.current) fieldFileRef.current.value = ''
    }
  }

  const removeFieldPhoto = async (fieldId: string, attachment: ItpLibraryAttachment) => {
    if (uploading) return
    if (!window.confirm(`Remove “${attachment.fileName}”?`)) return
    setUploading(true)
    try {
      const { error } = await deleteItpLibraryAttachment(attachment)
      if (error) {
        showToast(error)
        return
      }
      setExec((prev) => ({
        ...prev,
        fieldPhotos: {
          ...(prev.fieldPhotos ?? {}),
          [fieldId]: getFieldPhotos(prev, fieldId).filter((p) => p.id !== attachment.id),
        },
      }))
    } finally {
      setUploading(false)
    }
  }

  const renderTechField = (field: ItpMeasFieldDef) => {
    const required = field.required !== false
    const label = (
      <span>
        {field.label}
        {required ? ' *' : ''}
      </span>
    )
    if (field.type === 'picture') {
      const photos = getFieldPhotos(exec, field.id)
      const max = pictureFieldMax(field)
      const met = photos.length > 0
      const atMax = photos.length >= max
      return (
        <div key={field.id} className="itp-traveler-step-field itp-traveler-step-field--picture">
          <div className="itp-traveler-step-field-label">{label}</div>
          <div className="itp-traveler-step-field-photos-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={saving || uploading}
              onClick={() => {
                setPhotoFieldId(field.id)
                window.setTimeout(() => fieldFileRef.current?.click(), 0)
              }}
            >
              {uploading && photoFieldId === field.id ? 'Uploading…' : 'Add picture'}
            </button>
          </div>
          {photos.length === 0 ? (
            <p className="placeholder-copy">{required ? 'Picture required' : 'No picture yet'}</p>
          ) : (
            <>
              <p className="placeholder-copy">
                {required
                  ? `Take at least 1 photo (up to ${max}). Use the camera or upload from this device.`
                  : `Optional — techs can take up to ${max} photo${max === 1 ? '' : 's'}.`}
              </p>
              {photos.length === 0 ? (
                <p className="itp-traveler-req-photo-empty">
                  {required ? 'No photo yet — this picture is required.' : `No pictures yet (0/${max}).`}
                </p>
              ) : (
                <div className="itp-traveler-step-photos-grid">
                  {photos.map((photo) => (
                    <div key={photo.id} className="itp-traveler-step-photo">
                      <a href={photo.url} target="_blank" rel="noreferrer" title={photo.fileName}>
                        <img src={photo.url} alt={photo.fileName} />
                      </a>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={saving || uploading}
                        onClick={() => void removeFieldPhoto(field.id, photo)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="itp-traveler-req-photo-actions">
                <span className="itp-traveler-photo-count">
                  {photos.length}/{max}
                </span>
                <button
                  type="button"
                  className="button-primary"
                  disabled={saving || uploading || atMax}
                  onClick={() => {
                    setPhotoFieldId(field.id)
                    window.setTimeout(() => fieldCameraRef.current?.click(), 0)
                  }}
                >
                  {uploading && photoFieldId === field.id ? 'Uploading…' : 'Take photo'}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={saving || uploading || atMax}
                  onClick={() => {
                    setPhotoFieldId(field.id)
                    window.setTimeout(() => fieldFileRef.current?.click(), 0)
                  }}
                >
                  Upload
                </button>
              </div>
            </>
          )}
        </div>
      )
    }

    if (field.type === 'textarea') {
      return (
        <label key={field.id} className="itp-traveler-step-field itp-traveler-step-field--wide">
          {label}
          <textarea
            rows={3}
            value={getMeasValue(exec, field.id)}
            disabled={saving}
            placeholder={required ? 'Required' : 'Optional'}
            onChange={(e) =>
              setExec((prev) => ({
                ...prev,
                ...patchMeasValue(prev, field.id, e.target.value),
              }))
            }
          />
        </label>
      )
    }

    if (field.type === 'dropdown') {
      const fromList = resolveDropdownChoices(field, {
        manufacturers: manufacturerNames,
        lookups: lookupOptions,
      })
      const options = fromList.some((opt) => isNaAnswer(opt)) ? [...fromList] : [...fromList, NA_MEAS_VALUE]
      if (value && !options.some((opt) => opt === value)) options.unshift(value)
      const loadingList =
        dropdownOptionSource(field) === 'manufacturers' && manufacturerNames.length === 0
      const showFollowUp = followUpApplies(field, value) && !naOn
      const followUpId = followUpFieldId(field.id)
      const followUpValue = getMeasValue(exec, followUpId)
      const followUpNa = isNaAnswer(followUpValue)
      const followUpChoices = field.followUpLookupCategory
        ? resolveDropdownChoices(
            {
              ...field,
              type: 'dropdown',
              optionSource: 'lookup',
              lookupCategory: field.followUpLookupCategory,
              options: [],
            },
            { manufacturers: manufacturerNames, lookups: lookupOptions },
          )
        : []
      return (
        <label key={field.id} className="itp-traveler-step-field">
          {label}
          <select
            value={getMeasValue(exec, field.id)}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.value
              setExec((prev) => {
                let patch = patchMeasValue(prev, field.id, next)
                if (!followUpApplies(field, next)) {
                  patch = { ...patch, ...patchMeasValue({ ...prev, ...patch }, followUpId, '') }
                }
                return { ...prev, ...patch }
              })
            }}
          >
            <option value="">{loadingList ? '— Loading manufacturers —' : '— Select —'}</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {showFollowUp ? (
            <label className="itp-traveler-followup">
              <span>
                {followUpLabelOf(field)}
                <span className="itp-traveler-step-field-req" aria-hidden>
                  {' '}
                  *
                </span>
              </span>
              {field.followUpLookupCategory ? (
                <select
                  value={followUpNa ? NA_MEAS_VALUE : followUpValue}
                  disabled={saving}
                  aria-label={followUpLabelOf(field)}
                  onChange={(e) => setFieldValue(followUpId, e.target.value)}
                >
                  <option value="">— Select {followUpLabelOf(field).toLowerCase()} —</option>
                  {followUpChoices.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  {followUpChoices.some((opt) => isNaAnswer(opt)) ? null : (
                    <option value={NA_MEAS_VALUE}>{NA_MEAS_VALUE}</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={followUpNa ? NA_MEAS_VALUE : followUpValue}
                  disabled={saving}
                  placeholder={`${followUpLabelOf(field)} required`}
                  aria-label={followUpLabelOf(field)}
                  onChange={(e) => setFieldValue(followUpId, e.target.value)}
                />
              )}
            </label>
          ) : null}
        </div>
      )
    }

    if (field.type === 'yes_no') {
      return (
        <label key={field.id} className="itp-traveler-step-field">
          {label}
          <select
            value={getMeasValue(exec, field.id)}
            disabled={saving}
            onChange={(e) =>
              setExec((prev) => ({
                ...prev,
                ...patchMeasValue(prev, field.id, e.target.value),
              }))
            }
          >
            <option value="">— Select —</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
      )
    }

    return (
      <label key={field.id} className="itp-traveler-step-field">
        {label}
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={getMeasValue(exec, field.id)}
          disabled={saving}
          placeholder={required ? 'Required' : 'Optional'}
          onChange={(e) =>
            setExec((prev) => ({
              ...prev,
              ...patchMeasValue(prev, field.id, e.target.value),
            }))
          }
        />
      </label>
    )
  }

  const addPhotos = async (fileList: FileList | null) => {
    if (!fileList?.length || uploading) return
    setUploading(true)
    try {
      const uploaded: ItpLibraryAttachment[] = []
      for (const file of Array.from(fileList)) {
        const { attachment, error } = await uploadItpFlagPhoto(valveRowId, item.id, file)
        if (error || !attachment) {
          showToast(error || 'Upload failed')
          continue
        }
        uploaded.push(attachment)
      }
      if (uploaded.length === 0) return
      setExec((prev) => ({
        ...prev,
        photos: [...(prev.photos ?? []), ...uploaded],
      }))
      showToast(uploaded.length === 1 ? 'Photo added' : `${uploaded.length} photos added`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePhoto = async (attachment: ItpLibraryAttachment) => {
    if (uploading) return
    if (!window.confirm(`Remove “${attachment.fileName}”?`)) return
    setUploading(true)
    try {
      const { error } = await deleteItpLibraryAttachment(attachment)
      if (error) {
        showToast(error)
        return
      }
      setExec((prev) => ({
        ...prev,
        photos: (prev.photos ?? []).filter((p) => p.id !== attachment.id),
      }))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (isNameplate) {
      const blocked = nameplateIncompleteReason(exec)
      if (blocked && (exec.done || exec.holdPending)) {
        showToast(blocked)
        return
      }
    }
    const notes = exec.notes
    const nextSel: ItpLibraryItemSel = isNameplate
      ? { ...sel, notes, measFields }
      : { ...sel, notes }
    await onSave({
      sel: nextSel,
      exec: { ...exec, notes },
    })
  }

  const completeLabel = exec.holdPending && !exec.done
    ? canSignOffHold
      ? 'Sign off hold'
      : 'Waiting for hold sign-off'
    : exec.done
      ? 'Mark incomplete'
      : sel.holdPoint
        ? canSignOffHold
          ? 'Complete (sign hold)'
          : 'Request hold sign-off'
        : 'Mark complete'

  return createPortal(
    <div
      className="modal-overlay itp-traveler-step-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="itp-traveler-step-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving && !uploading) onClose()
      }}
    >
      <div className="modal-card itp-traveler-step-modal">
        <header className="itp-traveler-step-hdr">
          <div>
            <p className="itp-traveler-step-kicker">
              {item.secTitle}
              {item.shopAreaLabel ? ` · ${item.shopAreaLabel}` : ''}
              {item.holdPoint ? ' · Hold point' : ''}
            </p>
            <h2 id="itp-traveler-step-title">{item.name}</h2>
            <p className="itp-traveler-step-ref">[{item.ref}]</p>
          </div>
          <button type="button" className="button-secondary" disabled={saving || uploading} onClick={onClose}>
            Close
          </button>
        </header>

        <div className="itp-traveler-step-body">
          <div className="itp-traveler-step-grid">
            <label>
              <span>Result</span>
              <select
                value={exec.result || ''}
                disabled={saving}
                onChange={(e) => setExec((prev) => ({ ...prev, result: e.target.value }))}
              >
                {RESULT_OPTIONS.map((opt) => (
                  <option key={opt || 'blank'} value={opt}>
                    {opt || '— Select —'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tech initials</span>
              <input
                type="text"
                value={exec.techInitials}
                disabled={saving}
                maxLength={24}
                placeholder="e.g. CB"
                onChange={(e) => setExec((prev) => ({ ...prev, techInitials: e.target.value.toUpperCase() }))}
              />
            </label>
          </div>

          <label className="itp-traveler-step-notes">
            <span>Notes / observations</span>
            <textarea
              rows={3}
              value={exec.notes}
              disabled={saving}
              placeholder="Enter details for this step…"
              onChange={(e) => setExec((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>

          {isNameplate ? (
            <div className="itp-traveler-step-meas itp-traveler-step-nameplate">
              <div className="itp-traveler-step-nameplate-hdr">
                <div>
                  <h3>Nameplate / basic information</h3>
                  <p className="placeholder-copy">
                    Required fields must be filled. Transfer from the job card or type values here.
                  </p>
                </div>
                <button
                  type="button"
                  className="button-primary"
                  disabled={saving}
                  onClick={transferFromJobCard}
                >
                  Transfer from job card
                </button>
              </div>
              <div className="itp-traveler-step-meas-grid">{measFields.map(renderTechField)}</div>
            </div>
          ) : requireMeasurement && measFields.length > 0 ? (
            <div className="itp-traveler-step-meas">
              <h3>Technician inputs</h3>
              <div className="itp-traveler-step-meas-grid">{measFields.map(renderTechField)}</div>
            </div>
          ) : null}

          <input
            ref={fieldFileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              const fieldId = photoFieldId
              if (!fieldId) return
              void addFieldPhotos(fieldId, e.target.files)
            }}
          />

          {requirePicture || (exec.photos?.length ?? 0) > 0 ? (
            <div className="itp-traveler-step-photos">
              <div className="itp-traveler-step-photos-hdr">
                <h3>
                  {sel.pictureLabel.trim() || 'Photos'}{' '}
                  <span>
                    ({(exec.photos ?? []).length}
                    {requirePicture ? `/${Math.max(1, sel.minPhotos || 1)}` : ''})
                  </span>
                </h3>
                <div className="itp-traveler-step-photos-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={saving || uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? 'Uploading…' : 'Add photos'}
                  </button>
                </div>
              </div>
              {(exec.photos ?? []).length === 0 ? (
                <p className="placeholder-copy">No photos yet.</p>
              ) : (
                <div className="itp-traveler-step-photos-grid">
                  {(exec.photos ?? []).map((photo) => (
                    <div key={photo.id} className="itp-traveler-step-photo">
                      <a href={photo.url} target="_blank" rel="noreferrer" title={photo.fileName}>
                        <img src={photo.url} alt={photo.fileName} />
                      </a>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={saving || uploading}
                        onClick={() => void removePhoto(photo)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="itp-traveler-step-photos">
              <div className="itp-traveler-step-photos-hdr">
                <h3>Photos (optional)</h3>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={saving || uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? 'Uploading…' : 'Add photos'}
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => void addPhotos(e.target.files)}
          />

          {exec.holdSignedOffByName && exec.done ? (
            <p className="itp-traveler-step-hold-note">
              Hold signed off by {exec.holdSignedOffByName}
              {exec.holdSignedOffAt ? ` · ${new Date(exec.holdSignedOffAt).toLocaleString()}` : ''}
            </p>
          ) : null}
        </div>

        <footer className="itp-traveler-step-footer">
          <button
            type="button"
            className="button-secondary"
            disabled={saving || uploading}
            onClick={applyCompleteToggle}
          >
            {completeLabel}
          </button>
          <div className="itp-traveler-step-footer-right">
            <button type="button" className="button-secondary" disabled={saving || uploading} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={saving || uploading}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save step'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
