import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { isFeedbackEnabled } from '../lib/feedbackEnabled'
import {
  deleteFeedbackResolutionPhotos,
  isFeedbackResolutionImageFile,
  MAX_FEEDBACK_SUBMISSION_PHOTOS,
  uploadFeedbackResolutionPhoto,
  type FeedbackResolutionImage,
} from '../lib/feedbackResolutionPhotos'
import { isShopRole } from '../lib/roles'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../pages/LoginPage'

interface FeedbackButtonProps {
  username: string
  role: UserRole | null
}

type PhotoDraft = {
  id: string
  file: File
  previewUrl: string
}

export function FeedbackButton({ username, role }: FeedbackButtonProps) {
  const location = useLocation()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([])
  const [saving, setSaving] = useState(false)

  const previewUrls = useMemo(() => photoDrafts.map((draft) => draft.previewUrl), [photoDrafts])

  useEffect(() => {
    return () => {
      for (const url of previewUrls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [previewUrls])

  if (!isFeedbackEnabled()) return null

  const resetForm = () => {
    setMessage('')
    setPhotoDrafts((prev) => {
      for (const draft of prev) {
        URL.revokeObjectURL(draft.previewUrl)
      }
      return []
    })
  }

  const closeModal = () => {
    if (saving) return
    setOpen(false)
    resetForm()
  }

  const addPhotoDrafts = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const remaining = MAX_FEEDBACK_SUBMISSION_PHOTOS - photoDrafts.length
    if (remaining <= 0) {
      showToast(`You can attach up to ${MAX_FEEDBACK_SUBMISSION_PHOTOS} images`)
      return
    }

    const nextDrafts = [...photoDrafts]
    for (const file of Array.from(fileList).slice(0, remaining)) {
      if (!isFeedbackResolutionImageFile(file)) {
        showToast(`${file.name} is not a supported image`)
        continue
      }
      nextDrafts.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }

    if (nextDrafts.length === photoDrafts.length) return
    setPhotoDrafts(nextDrafts)
  }

  const removePhotoDraft = (draftId: string) => {
    setPhotoDrafts((prev) => {
      const removed = prev.find((draft) => draft.id === draftId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((draft) => draft.id !== draftId)
    })
  }

  const submit = async () => {
    if (!isShopRole(role)) {
      showToast('Sign in to send feedback')
      return
    }
    const text = message.trim()
    if (!text && photoDrafts.length === 0) {
      showToast('Please describe the issue or attach a screenshot')
      return
    }
    setSaving(true)
    const pageUrl = `${window.location.origin}${location.pathname}${location.search}`
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      setSaving(false)
      showToast('Sign in with your shop account to send feedback (local Admin cannot submit)')
      return
    }
    const { data: inserted, error } = await supabase
      .from('app_feedback')
      .insert({
        message: text || 'See attached screenshot(s).',
        page_url: pageUrl,
        user_name: username.trim() || null,
        user_role: role ?? null,
        submitted_by_user_id: user.id,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      setSaving(false)
      if (/app_feedback|relation.*does not exist/i.test(error?.message ?? '')) {
        showToast('Feedback table missing — run supabase/migration-app-feedback.sql in Supabase SQL Editor')
      } else {
        showToast(`Could not send feedback: ${error?.message ?? 'Unknown error'}`)
      }
      return
    }

    const uploaded: FeedbackResolutionImage[] = []
    let photoError: string | null = null
    for (const draft of photoDrafts) {
      const { image, error: uploadError } = await uploadFeedbackResolutionPhoto(inserted.id, draft.file)
      if (uploadError || !image) {
        await deleteFeedbackResolutionPhotos(uploaded)
        photoError = uploadError ?? 'Could not upload image'
        break
      }
      uploaded.push(image)
    }

    if (!photoError && uploaded.length > 0) {
      const { error: updateError } = await supabase
        .from('app_feedback')
        .update({ submission_images: uploaded })
        .eq('id', inserted.id)

      if (updateError) {
        await deleteFeedbackResolutionPhotos(uploaded)
        if (/submission_images|column.*does not exist/i.test(updateError.message)) {
          photoError = 'Run supabase/migration-app-feedback-submission-images.sql in Supabase SQL Editor'
        } else {
          photoError = `Could not save images: ${updateError.message}`
        }
      }
    }

    setSaving(false)
    setOpen(false)
    resetForm()
    if (photoError) {
      showToast(`Feedback saved, but screenshots failed: ${photoError}`)
      return
    }
    showToast('Thanks — feedback sent')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving])

  const canAddPhotos = photoDrafts.length < MAX_FEEDBACK_SUBMISSION_PHOTOS

  return (
    <>
      <button
        type="button"
        className="nav-feedback-button"
        onClick={() => setOpen(true)}
        title="Send feedback about this app (development)"
      >
        Feedback
      </button>

      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
          <div className="modal-card modal-card-wide feedback-modal-card">
            <div className="feedback-modal-head">
              <h3 id="feedback-modal-title">Send feedback</h3>
              <button
                type="button"
                className="modal-close-x"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="placeholder-copy feedback-modal-intro">
              Describe a bug, confusing screen, or missing feature. Attach screenshots if that helps.
            </p>
            <label className="modal-label" htmlFor="feedback-message">
              Your feedback
            </label>
            <textarea
              id="feedback-message"
              className="modal-textarea"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened? What did you expect? Which job or screen?"
              disabled={saving}
              autoFocus
            />
            <div className="feedback-inbox-photo-field feedback-modal-photo-field">
              <div className="feedback-inbox-photo-label-row">
                <span className="feedback-inbox-photo-label">Screenshots (optional)</span>
                <span className="feedback-inbox-photo-count">
                  {photoDrafts.length}/{MAX_FEEDBACK_SUBMISSION_PHOTOS}
                </span>
              </div>
              {photoDrafts.length > 0 ? (
                <div className="feedback-inbox-photo-grid">
                  {photoDrafts.map((draft) => (
                    <div key={draft.id} className="feedback-inbox-photo-draft">
                      <img src={draft.previewUrl} alt={draft.file.name} />
                      <button
                        type="button"
                        className="feedback-inbox-photo-remove"
                        onClick={() => removePhotoDraft(draft.id)}
                        disabled={saving}
                        aria-label={`Remove ${draft.file.name}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <label className={`button-secondary feedback-inbox-photo-add${canAddPhotos ? '' : ' disabled'}`}>
                <span className="feedback-inbox-photo-add-label">
                  {canAddPhotos ? 'Add photos' : 'Photo limit reached'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="feedback-inbox-photo-input"
                  disabled={!canAddPhotos || saving}
                  onChange={(e) => {
                    addPhotoDrafts(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            <p className="modal-save-hint-subtle">
              Includes this page: {location.pathname}
              {username ? ` · ${username}` : ''}
            </p>
            <footer className="feedback-modal-footer">
              <button type="button" className="button-secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? 'Sending…' : 'Send feedback'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  )
}
