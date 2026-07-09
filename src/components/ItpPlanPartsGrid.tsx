import { useRef, useState, type ReactNode } from 'react'
import { applyDefaultPartOperationInstructions } from '../constants/itpPartInspectionDefaults'
import type { ValvePartProfile } from '../constants/itpValveParts'
import { deleteItpPartPhoto, uploadItpPartPhoto } from '../lib/itpPartPhotos'
import { partHasWorkflow } from '../lib/itpPartWorkflow'
import type { ItpPartDisposition } from '../lib/itpPartWorkflow'
import { syncPartSelectedOperations } from '../lib/itpPartWorkflow'
import type { ItpPlanPartPhoto, ItpPlanValvePart, ItpProcessPlanPayload } from '../types/itpPlan'

type ItpPlanPartsGridProps = {
  valveRowId: number
  partsProfileId: ValvePartProfile['id']
  parts: ItpPlanValvePart[]
  saving: boolean
  onChange: (parts: ItpPlanValvePart[]) => void
  onPersist: (plan: ItpProcessPlanPayload, message: string) => Promise<void>
  plan: ItpProcessPlanPayload
  onRemoveCustomPart: (partId: string) => void
  showToast: (message: string) => void
  renderPartSteps?: (part: ItpPlanValvePart) => ReactNode
}

export function ItpPlanPartsGrid({
  valveRowId,
  partsProfileId,
  parts,
  saving,
  onChange,
  onPersist,
  plan,
  onRemoveCustomPart,
  showToast,
  renderPartSteps,
}: ItpPlanPartsGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadPartId, setUploadPartId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [expandedPhotoPartId, setExpandedPhotoPartId] = useState<string | null>(null)

  const emptyOperationDetail = () => ({
    workInstructions: '',
    inspectionNotes: '',
    otherChecked: false,
    otherNotes: '',
    signOff: null,
    qcSignOff: null,
  })

  const setDisposition = (partId: string, disposition: Exclude<ItpPartDisposition, ''>) => {
    onChange(
      parts.map((part) => {
        if (part.id !== partId) return part

        if (part.partDisposition === disposition) {
          return {
            ...part,
            partDisposition: '',
            inspectOutcome: '',
            optionalReworkOps: [],
            selectedOperations: [],
          }
        }

        if (disposition === 'na') {
          const existing = part.operationDetails.na
          const workInstructions = applyDefaultPartOperationInstructions(
            partsProfileId,
            part.id,
            'na',
            existing?.workInstructions ?? '',
          )
          const next: ItpPlanValvePart = {
            ...part,
            partDisposition: 'na',
            inspectOutcome: '',
            optionalReworkOps: [],
            operationDetails: {
              na: { ...(existing ?? emptyOperationDetail()), workInstructions },
            },
          }
          return { ...next, selectedOperations: syncPartSelectedOperations(next) }
        }

        const existing = part.operationDetails.inspect
        const workInstructions = applyDefaultPartOperationInstructions(
          partsProfileId,
          part.id,
          'inspect',
          existing?.workInstructions ?? '',
        )
        const next: ItpPlanValvePart = {
          ...part,
          partDisposition: 'present',
          inspectOutcome: '',
          optionalReworkOps: [],
          operationDetails: {
            ...part.operationDetails,
            inspect: { ...(existing ?? emptyOperationDetail()), workInstructions },
          },
        }
        return { ...next, selectedOperations: syncPartSelectedOperations(next) }
      }),
    )
  }

  const openPhotoPicker = (partId: string) => {
    setUploadPartId(partId)
    setExpandedPhotoPartId(partId)
    fileInputRef.current?.click()
  }

  const handlePhotoSelected = async (fileList: FileList | null) => {
    const partId = uploadPartId
    if (!partId || !fileList?.length) return
    const file = fileList[0]
    setUploading(true)
    try {
      const { photo, error } = await uploadItpPartPhoto(valveRowId, partId, file)
      if (error || !photo) {
        showToast(error ?? 'Could not upload photo')
        return
      }
      const nextParts = parts.map((part) =>
        part.id === partId ? { ...part, photos: [...part.photos, photo] } : part,
      )
      onChange(nextParts)
      await onPersist({ ...plan, valveParts: nextParts }, 'Photo added')
    } finally {
      setUploading(false)
      setUploadPartId(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = async (partId: string, photo: ItpPlanPartPhoto) => {
    if (!window.confirm(`Remove photo “${photo.fileName}”?`)) return
    setUploading(true)
    try {
      const { error } = await deleteItpPartPhoto(photo)
      if (error) {
        showToast(error)
        return
      }
      const nextParts = parts.map((part) =>
        part.id === partId ? { ...part, photos: part.photos.filter((p) => p.id !== photo.id) } : part,
      )
      onChange(nextParts)
      await onPersist({ ...plan, valveParts: nextParts }, 'Photo removed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only-file-input"
        onChange={(e) => void handlePhotoSelected(e.target.files)}
      />

      <div className="itp-plan-parts-grid">
        <div className="itp-plan-parts-grid-head" aria-hidden="true">
          <span className="itp-plan-parts-col-part">Part</span>
          <span className="itp-plan-parts-col-ops">Disposition</span>
          <span className="itp-plan-parts-col-photo">Photo</span>
        </div>

        {parts.map((part) => {
          const showPhotos = expandedPhotoPartId === part.id || part.photos.length > 0
          const showSteps = partHasWorkflow(part) && renderPartSteps
          return (
            <div key={part.id} className={`itp-plan-parts-card${showSteps ? ' itp-plan-parts-card--expanded' : ''}`}>
              <div className="itp-plan-parts-card-main">
                <div className="itp-plan-parts-col-part">
                  <span className="itp-plan-parts-name">{part.label}</span>
                  {part.isCustom ? <span className="itp-plan-badge itp-plan-badge--custom">Custom</span> : null}
                </div>

                <div className="itp-plan-parts-col-ops itp-plan-disposition-row" role="group" aria-label={`Disposition for ${part.label}`}>
                  <button
                    type="button"
                    className={`itp-plan-disposition-btn${part.partDisposition === 'present' ? ' itp-plan-disposition-btn--on' : ''}`}
                    aria-pressed={part.partDisposition === 'present'}
                    onClick={() => setDisposition(part.id, 'present')}
                    disabled={saving || uploading}
                  >
                    Inspect
                  </button>
                  <button
                    type="button"
                    className={`itp-plan-disposition-btn itp-plan-disposition-btn--na${part.partDisposition === 'na' ? ' itp-plan-disposition-btn--on' : ''}`}
                    aria-pressed={part.partDisposition === 'na'}
                    onClick={() => setDisposition(part.id, 'na')}
                    disabled={saving || uploading}
                  >
                    N/A
                  </button>
                </div>

                <div className="itp-plan-parts-col-photo">
                  <button
                    type="button"
                    className="itp-plan-photo-btn"
                    title="Add photo"
                    onClick={() => openPhotoPicker(part.id)}
                    disabled={saving || uploading}
                  >
                    <span className="itp-plan-photo-btn-icon" aria-hidden="true">
                      📷
                    </span>
                    <span className="itp-plan-photo-btn-label">Add</span>
                    {part.photos.length > 0 ? (
                      <span className="itp-plan-photo-count">{part.photos.length}</span>
                    ) : null}
                  </button>
                  {part.isCustom ? (
                    <button
                      type="button"
                      className="itp-plan-part-remove-btn"
                      onClick={() => onRemoveCustomPart(part.id)}
                      disabled={saving || uploading}
                      title="Remove part"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              {showPhotos ? (
                <div className="itp-plan-part-photos">
                  {part.photos.length > 0 ? (
                    <ul className="itp-plan-part-photo-list">
                      {part.photos.map((photo) => (
                        <li key={photo.id}>
                          <a href={photo.url} target="_blank" rel="noreferrer" className="itp-plan-part-photo-thumb">
                            <img src={photo.url} alt={photo.fileName} />
                          </a>
                          <button
                            type="button"
                            className="itp-plan-part-photo-remove"
                            onClick={() => void removePhoto(part.id, photo)}
                            disabled={saving || uploading}
                            title="Remove photo"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="itp-plan-part-photos-empty">No photos yet — use Add to attach one.</p>
                  )}
                </div>
              ) : null}

              {showSteps ? renderPartSteps(part) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}
