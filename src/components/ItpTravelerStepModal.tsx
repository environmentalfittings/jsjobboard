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
  isNaAnswer,
  ITP_JOB_CARD_FIELD_OPTIONS,
  itemRequiresMeasurements,
  itemRequiresPicture,
  markDoneBlockedReason,
  NA_MEAS_VALUE,
  patchMeasValue,
  pictureFieldMax,
  resolveDropdownChoices,
  resolveJobCardField,
  resolvedMeasFields,
  stampLoggedInTech,
} from '../lib/itpItemRequirements'
import {
  isNameplateTravelerStep,
  mergeNameplateMeasFields,
  nameplateIncompleteReason,
  nameplateValuesFromJobCard,
  prefillExecFromJobCard,
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

type TechFieldSection = { id: string; title: string; fields: ItpMeasFieldDef[] }

function classifyTechField(field: ItpMeasFieldDef): { id: string; title: string } {
  const key = resolveJobCardField(field)
  const label = field.label.trim().toLowerCase()
  if (
    key === 'valve_type' ||
    key === 'size' ||
    key === 'pressure_class' ||
    key === 'body_material' ||
    /\b(outlet|inlet|end\s*connect|connection|trim|figure)\b/.test(label)
  ) {
    return { id: 'valve', title: 'Valve' }
  }
  if (
    key === 'customer' ||
    key === 'po_number' ||
    key === 'due_date' ||
    /customer\s*id|purchase\s*order|\bpo\b/.test(label)
  ) {
    return { id: 'customer', title: 'Customer & job' }
  }
  if (
    key === 'valve_id' ||
    key === 'manufacturer' ||
    /\b(turnaround|location|serial|\bsn\b|manufacturer)\b/.test(label)
  ) {
    return { id: 'ids', title: 'IDs & manufacturer' }
  }
  return { id: 'other', title: 'Other details' }
}

function groupTechFields(fields: ItpMeasFieldDef[]): TechFieldSection[] {
  if (fields.length <= 4) return [{ id: 'all', title: '', fields }]
  const map = new Map<string, TechFieldSection>()
  for (const field of fields) {
    const { id, title } = classifyTechField(field)
    const existing = map.get(id)
    if (existing) existing.fields.push(field)
    else map.set(id, { id, title, fields: [field] })
  }
  const preferred = ['valve', 'customer', 'ids', 'other']
  const extra = [...map.keys()].filter((id) => !preferred.includes(id))
  return [...preferred, ...extra]
    .map((id) => map.get(id))
    .filter((section): section is TechFieldSection => Boolean(section && section.fields.length))
}

function attachmentFromLocalFile(file: File): ItpLibraryAttachment {
  return {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name || 'photo.jpg',
    url: URL.createObjectURL(file),
    storagePath: '',
    contentType: file.type || 'image/jpeg',
    uploadedAt: new Date().toISOString(),
    caption: '',
  }
}

type ItpTravelerStepModalProps = {
  item: ItpTravelerReportItem
  sel: ItpLibraryItemSel
  exec: ItpLibraryItemExec
  valveRowId: number
  /** Job card fields used for “Transfer from job card” on nameplate steps. */
  jobCard: JobCardNameplateSource
  /** Template preview — do not upload photos or persist to a job. */
  previewMode?: boolean
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
  previewMode = false,
  canSignOffHold,
  signerName,
  signerUserId,
  saving,
  onClose,
  onSave,
}: ItpTravelerStepModalProps) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const fieldFileRef = useRef<HTMLInputElement | null>(null)
  const fieldCameraRef = useRef<HTMLInputElement | null>(null)
  const [photoFieldId, setPhotoFieldId] = useState<string | null>(null)
  const isNameplate = isNameplateTravelerStep({
    id: item.id,
    name: item.name,
    ref: item.ref,
    requireNameplate: initialSel.requireNameplate || item.requireNameplate,
  })
  const [sel, setSel] = useState<ItpLibraryItemSel>(() => {
    const base = { ...emptyItemSel(), ...initialSel }
    if (item.requirePicture) {
      base.requirePicture = true
      if (!base.pictureLabel.trim()) base.pictureLabel = item.pictureLabel || 'Required photo'
      base.minPhotos = Math.max(1, base.minPhotos || item.minPhotos || 1)
    }
    return isNameplate
      ? { ...base, requireNameplate: true, measFields: mergeNameplateMeasFields(base.measFields) }
      : base
  })
  const initialFields = isNameplate
    ? mergeNameplateMeasFields(resolvedMeasFields(sel))
    : resolvedMeasFields(sel)
  const [exec, setExec] = useState<ItpLibraryItemExec>(() =>
    prefillExecFromJobCard({ ...emptyItemExec(), ...initialExec }, initialFields, jobCard),
  )
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
    if (item.requirePicture) {
      base.requirePicture = true
      if (!base.pictureLabel.trim()) base.pictureLabel = item.pictureLabel || 'Required photo'
      base.minPhotos = Math.max(1, base.minPhotos || item.minPhotos || 1)
    }
    const nextSel = nameplate
      ? { ...base, requireNameplate: true, measFields: mergeNameplateMeasFields(base.measFields) }
      : base
    setSel(nextSel)
    const fields = nameplate
      ? mergeNameplateMeasFields(resolvedMeasFields(nextSel))
      : resolvedMeasFields(nextSel)
    setExec(prefillExecFromJobCard({ ...emptyItemExec(), ...initialExec }, fields, jobCard))
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
        setExec((prev) =>
          stampLoggedInTech(
            {
              ...prev,
              done: true,
              holdPending: false,
              holdSignedOffAt: new Date().toISOString(),
              holdSignedOffByUserId: signerUserId,
              holdSignedOffByName: signerName || 'QC',
            },
            signerName,
          ),
        )
        return
      }
      setExec((prev) => stampLoggedInTech({ ...prev, done: false, holdPending: true }, signerName))
      return
    }

    setExec((prev) => stampLoggedInTech({ ...prev, done: true, holdPending: false }, signerName))
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
      if (fieldCameraRef.current) fieldCameraRef.current.value = ''
    }
  }

  const removeFieldPhoto = async (fieldId: string, attachment: ItpLibraryAttachment) => {
    if (uploading) return
    if (!window.confirm(`Remove “${attachment.fileName}”?`)) return
    const dropLocal = () => {
      if (attachment.url.startsWith('blob:')) URL.revokeObjectURL(attachment.url)
      setExec((prev) => ({
        ...prev,
        fieldPhotos: {
          ...(prev.fieldPhotos ?? {}),
          [fieldId]: getFieldPhotos(prev, fieldId).filter((p) => p.id !== attachment.id),
        },
      }))
    }
    if (previewMode || !attachment.storagePath) {
      dropLocal()
      return
    }
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

  const setFieldValue = (fieldId: string, value: string) => {
    setExec((prev) => ({
      ...prev,
      ...patchMeasValue(prev, fieldId, value),
    }))
  }

  const toggleFieldNa = (fieldId: string) => {
    setExec((prev) => {
      const current = getMeasValue(prev, fieldId)
      return {
        ...prev,
        ...patchMeasValue(prev, fieldId, isNaAnswer(current) ? '' : NA_MEAS_VALUE),
      }
    })
  }

  const renderFieldHeader = (field: ItpMeasFieldDef, required: boolean, naOn: boolean) => {
    const jobKey = resolveJobCardField(field)
    const jobLabel = ITP_JOB_CARD_FIELD_OPTIONS.find((opt) => opt.value === jobKey)?.label
    return (
      <div className="itp-traveler-step-field-hdr">
        <div className="itp-traveler-step-field-title">
          <span className="itp-traveler-step-field-name">
            {field.label}
            {required ? (
              <span className="itp-traveler-step-field-req" aria-hidden>
                {' '}
                *
              </span>
            ) : null}
          </span>
          {jobLabel ? <span className="itp-traveler-jobcard-hint">From job card · {jobLabel}</span> : null}
        </div>
        <button
          type="button"
          className={`itp-traveler-na-btn${naOn ? ' on' : ''}`}
          disabled={saving}
          title={naOn ? 'Clear N/A and enter a value' : 'Mark this field not applicable'}
          onClick={() => toggleFieldNa(field.id)}
        >
          N/A
        </button>
      </div>
    )
  }

  const renderTechField = (field: ItpMeasFieldDef) => {
    const required = field.required !== false
    const value = getMeasValue(exec, field.id)
    const naOn = isNaAnswer(value)
    if (field.type === 'picture') {
      const photos = getFieldPhotos(exec, field.id)
      const max = pictureFieldMax(field)
      const met = photos.length > 0
      const atMax = photos.length >= max
      return (
        <div
          key={field.id}
          className={`itp-traveler-step-field itp-traveler-step-field--picture${
            required && !naOn ? ` itp-traveler-req-photo${met ? ' is-met' : ''}` : ''
          }${naOn ? ' is-na' : ''}`}
        >
          {renderFieldHeader(field, required, naOn)}
          {naOn ? (
            <p className="placeholder-copy">Marked N/A — no picture required on this job.</p>
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
        <div key={field.id} className={`itp-traveler-step-field itp-traveler-step-field--wide${naOn ? ' is-na' : ''}`}>
          {renderFieldHeader(field, required, naOn)}
          {naOn ? (
            <input value={NA_MEAS_VALUE} disabled readOnly aria-label={`${field.label} not applicable`} />
          ) : (
            <textarea
              rows={3}
              value={value}
              disabled={saving}
              placeholder={required ? 'Required' : 'Optional'}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
            />
          )}
        </div>
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
        <div key={field.id} className={`itp-traveler-step-field${naOn ? ' is-na' : ''}`}>
          {renderFieldHeader(field, required, naOn)}
          <select
            value={value}
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
        <div key={field.id} className={`itp-traveler-step-field${naOn ? ' is-na' : ''}`}>
          {renderFieldHeader(field, required, naOn)}
          <select
            value={value}
            disabled={saving}
            onChange={(e) => setFieldValue(field.id, e.target.value)}
          >
            <option value="">— Select —</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
            <option value={NA_MEAS_VALUE}>{NA_MEAS_VALUE}</option>
          </select>
        </div>
      )
    }

    return (
      <div key={field.id} className={`itp-traveler-step-field${naOn ? ' is-na' : ''}`}>
        {renderFieldHeader(field, required, naOn)}
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          disabled={saving || naOn}
          readOnly={naOn}
          placeholder={required ? 'Required' : 'Optional'}
          onChange={(e) => setFieldValue(field.id, e.target.value)}
        />
      </div>
    )
  }

  const addPhotos = async (fileList: FileList | null) => {
    if (!fileList?.length || uploading) return
    if (previewMode) {
      const uploaded = Array.from(fileList).map(attachmentFromLocalFile)
      setExec((prev) => ({
        ...prev,
        photos: [...(prev.photos ?? []), ...uploaded],
      }))
      showToast(uploaded.length === 1 ? 'Photo added' : `${uploaded.length} photos added`)
      if (fileRef.current) fileRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
      return
    }
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
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  const removePhoto = async (attachment: ItpLibraryAttachment) => {
    if (uploading) return
    if (!window.confirm(`Remove “${attachment.fileName}”?`)) return
    if (previewMode || !attachment.storagePath) {
      if (attachment.url.startsWith('blob:')) URL.revokeObjectURL(attachment.url)
      setExec((prev) => ({
        ...prev,
        photos: (prev.photos ?? []).filter((p) => p.id !== attachment.id),
      }))
      return
    }
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
    const stamped = exec.done || exec.holdPending ? stampLoggedInTech(exec, signerName) : exec
    const notes = stamped.notes
    const nextSel: ItpLibraryItemSel = isNameplate
      ? { ...sel, notes, measFields }
      : { ...sel, notes }
    await onSave({
      sel: nextSel,
      exec: { ...stamped, notes },
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
      <div className={`modal-card itp-traveler-step-modal${measFields.length > 4 ? ' is-wide' : ''}`}>
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
          {requirePicture ? (
            <div
              className={`itp-traveler-req-photo${
                (exec.photos?.length ?? 0) >= Math.max(1, sel.minPhotos || 1) ? ' is-met' : ''
              }`}
            >
              <div className="itp-traveler-req-photo-hdr">
                <h3>
                  {sel.pictureLabel.trim() || 'Required photo'} <span>*</span>
                </h3>
                <span>
                  {(exec.photos ?? []).length}/{Math.max(1, sel.minPhotos || 1)} required
                </span>
              </div>
              <p className="placeholder-copy">
                Take a photo with the camera or upload a file. This step needs{' '}
                {Math.max(1, sel.minPhotos || 1)} photo
                {Math.max(1, sel.minPhotos || 1) === 1 ? '' : 's'} before it can be marked complete.
              </p>
              {(exec.photos ?? []).length === 0 ? (
                <p className="itp-traveler-req-photo-empty">No photo yet.</p>
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
              <div className="itp-traveler-req-photo-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={saving || uploading}
                  onClick={() => cameraRef.current?.click()}
                >
                  {uploading ? 'Uploading…' : 'Take photo'}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={saving || uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload
                </button>
              </div>
            </div>
          ) : null}

          {isNameplate ? (
            <div className="itp-traveler-step-meas itp-traveler-step-nameplate">
              <div className="itp-traveler-step-nameplate-hdr">
                <div>
                  <h3>Nameplate / basic information</h3>
                  <p className="placeholder-copy">
                    Required fields must be filled or marked N/A. Values from the job card can be edited here.
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
              {measSections.map((section) => (
                <div key={section.id} className="itp-traveler-step-section">
                  {section.title ? <h4>{section.title}</h4> : null}
                  <div className="itp-traveler-step-meas-grid">{section.fields.map(renderTechField)}</div>
                </div>
              ))}
            </div>
          ) : requireMeasurement && measFields.length > 0 ? (
            <div className="itp-traveler-step-meas">
              <h3>Technician inputs</h3>
              <p className="placeholder-copy">
                Fields mapped to the job card fill in automatically. You can still edit them or mark N/A.
              </p>
              {measSections.map((section) => (
                <div key={section.id} className="itp-traveler-step-section">
                  {section.title ? <h4>{section.title}</h4> : null}
                  <div className="itp-traveler-step-meas-grid">{section.fields.map(renderTechField)}</div>
                </div>
              ))}
            </div>
          ) : null}

          <p className="itp-traveler-step-tech">
            {exec.done || exec.holdPending
              ? `Checked by ${exec.techInitials || signerName}`
              : `Tech: ${signerName || 'logged-in user'} (recorded when the line is checked)`}
          </p>

          <ItpOptionalNotes
            notes={exec.notes}
            disabled={saving}
            onChange={(notes) => setExec((prev) => ({ ...prev, notes }))}
          />

          <input
            ref={fieldCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const fieldId = photoFieldId
              if (!fieldId) return
              void addFieldPhotos(fieldId, e.target.files)
            }}
          />
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

          {!requirePicture && (exec.photos?.length ?? 0) > 0 ? (
            <div className="itp-traveler-step-photos">
              <div className="itp-traveler-step-photos-hdr">
                <h3>
                  Photos
                  <span> ({exec.photos?.length})</span>
                </h3>
              </div>
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
            </div>
          ) : null}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void addPhotos(e.target.files)}
          />
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
