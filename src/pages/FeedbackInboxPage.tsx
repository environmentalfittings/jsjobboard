import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { isFeedbackEnabled } from '../lib/feedbackEnabled'
import {
  deleteFeedbackResolutionPhotos,
  isFeedbackResolutionImageFile,
  MAX_FEEDBACK_RESOLUTION_PHOTOS,
  parseFeedbackResolutionImages,
  uploadFeedbackResolutionPhoto,
  type FeedbackResolutionImage,
} from '../lib/feedbackResolutionPhotos'
import { supabase } from '../lib/supabase'
import { createFeedbackResolvedNotification } from '../lib/messages'
import type { User } from '@supabase/supabase-js'

function usernameFromUser(user: User) {
  return (
    (user.user_metadata?.name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email ||
    null
  )
}

type FeedbackRow = {
  id: number
  message: string
  page_url: string | null
  user_name: string | null
  user_role: string | null
  status: 'open' | 'resolved'
  created_at: string
  resolved_at: string | null
  resolution_notes: string | null
  resolution_images: FeedbackResolutionImage[]
  submission_images: FeedbackResolutionImage[]
  submitted_by_user_id: string | null
  resolution_notified_at: string | null
  submitter_seen_at: string | null
}

type PhotoDraft = {
  id: string
  file: File
  previewUrl: string
}

function FeedbackNotifyFlag({ row }: { row: FeedbackRow }) {
  if (row.status === 'resolved') {
    if (row.resolution_notified_at) {
      return (
        <span
          className="feedback-notify-flag feedback-notify-flag--sent"
          title={`Notification sent ${new Date(row.resolution_notified_at).toLocaleString()}${
            row.submitter_seen_at ? ' · Seen by user' : ' · Not yet opened'
          }`}
        >
          Notified
        </span>
      )
    }
    if (row.submitted_by_user_id) {
      return (
        <span className="feedback-notify-flag feedback-notify-flag--missed" title="Resolved without sending a message">
          Not notified
        </span>
      )
    }
    return (
      <span className="feedback-notify-flag feedback-notify-flag--none" title="Submitter has no linked login account">
        No account
      </span>
    )
  }

  if (row.submitted_by_user_id) {
    return (
      <span className="feedback-notify-flag feedback-notify-flag--pending" title="User will get a Messages notification when resolved">
        Will notify
      </span>
    )
  }

  return (
    <span className="feedback-notify-flag feedback-notify-flag--none" title="Submitter has no linked login account">
      No account
    </span>
  )
}

function FeedbackPhotoGallery({
  images,
  label,
  className = 'feedback-inbox-resolution-photos',
}: {
  images: FeedbackResolutionImage[]
  label: string
  className?: string
}) {
  if (!images.length) return null
  return (
    <div className={className} aria-label={label}>
      {images.map((image) => (
        <a
          key={image.storage_path}
          className="feedback-inbox-resolution-photo"
          href={image.url}
          target="_blank"
          rel="noreferrer"
          title={image.file_name}
        >
          <img src={image.url} alt={image.file_name} loading="lazy" />
        </a>
      ))}
    </div>
  )
}

export function FeedbackInboxPage() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<number, string>>({})
  const [photoDrafts, setPhotoDrafts] = useState<Record<number, PhotoDraft[]>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const allPreviewUrls = useMemo(
    () => Object.values(photoDrafts).flatMap((drafts) => drafts.map((draft) => draft.previewUrl)),
    [photoDrafts],
  )

  useEffect(() => {
    return () => {
      for (const url of allPreviewUrls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [allPreviewUrls])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_feedback')
      .select(
        'id,message,page_url,user_name,user_role,status,created_at,resolved_at,resolution_notes,resolution_images,submission_images,submitted_by_user_id,resolution_notified_at,submitter_seen_at',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    setLoading(false)
    if (error) {
      if (/app_feedback|relation.*does not exist/i.test(error.message)) {
        showToast('Run supabase/migration-app-feedback.sql in Supabase SQL Editor first')
      } else {
        showToast(`Could not load feedback: ${error.message}`)
      }
      setRows([])
      return
    }
    setRows(
      ((data ?? []) as Array<
        Omit<FeedbackRow, 'resolution_images' | 'submission_images'> & {
          resolution_images?: unknown
          submission_images?: unknown
        }
      >).map((row) => ({
        ...row,
        resolution_images: parseFeedbackResolutionImages(row.resolution_images),
        submission_images: parseFeedbackResolutionImages(row.submission_images),
      })),
    )
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((row) => row.status === filter)
  }, [filter, rows])

  const clearPhotoDrafts = (feedbackId: number) => {
    setPhotoDrafts((prev) => {
      const drafts = prev[feedbackId]
      if (!drafts?.length) return prev
      for (const draft of drafts) {
        URL.revokeObjectURL(draft.previewUrl)
      }
      const next = { ...prev }
      delete next[feedbackId]
      return next
    })
  }

  const addPhotoDrafts = (feedbackId: number, fileList: FileList | null) => {
    if (!fileList?.length) return
    const current = photoDrafts[feedbackId] ?? []
    const remaining = MAX_FEEDBACK_RESOLUTION_PHOTOS - current.length
    if (remaining <= 0) {
      showToast(`You can add up to ${MAX_FEEDBACK_RESOLUTION_PHOTOS} photos`)
      return
    }

    const nextDrafts = [...current]
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

    if (nextDrafts.length === current.length) return
    setPhotoDrafts((prev) => ({ ...prev, [feedbackId]: nextDrafts }))
  }

  const removePhotoDraft = (feedbackId: number, draftId: string) => {
    setPhotoDrafts((prev) => {
      const drafts = prev[feedbackId]
      if (!drafts?.length) return prev
      const removed = drafts.find((draft) => draft.id === draftId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      const nextDrafts = drafts.filter((draft) => draft.id !== draftId)
      if (!nextDrafts.length) {
        const next = { ...prev }
        delete next[feedbackId]
        return next
      }
      return { ...prev, [feedbackId]: nextDrafts }
    })
  }

  const markResolved = async (row: FeedbackRow) => {
    const resolutionNotes = (resolutionDrafts[row.id] ?? '').trim()
    if (!resolutionNotes) {
      showToast('Add a short note on what was done to fix this before marking resolved')
      return
    }

    setSavingId(row.id)
    const drafts = photoDrafts[row.id] ?? []
    const uploaded: FeedbackResolutionImage[] = []

    for (const draft of drafts) {
      const { image, error } = await uploadFeedbackResolutionPhoto(row.id, draft.file)
      if (error || !image) {
        await deleteFeedbackResolutionPhotos(uploaded)
        setSavingId(null)
        showToast(error ?? 'Could not upload photo')
        return
      }
      uploaded.push(image)
    }

    const { error } = await supabase
      .from('app_feedback')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: resolutionNotes,
        resolution_images: uploaded,
        submitter_seen_at: null,
      })
      .eq('id', row.id)

    if (error) {
      await deleteFeedbackResolutionPhotos(uploaded)
      setSavingId(null)
      if (/resolution_notes|resolution_images|column.*does not exist/i.test(error.message)) {
        showToast('Run the latest app_feedback migrations in Supabase SQL Editor first')
      } else {
        showToast(`Could not update: ${error.message}`)
      }
      return
    }

    if (row.submitted_by_user_id) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const notifyError = await createFeedbackResolvedNotification({
          feedbackId: row.id,
          recipientUserId: row.submitted_by_user_id,
          senderUserId: user.id,
          senderName: usernameFromUser(user) ?? 'JS Valve Admin',
          feedbackMessage: row.message,
          resolutionNotes,
        })
        if (notifyError) {
          showToast(`Resolved, but notification failed: ${notifyError}`)
        } else {
          const { error: notifyFlagError } = await supabase
            .from('app_feedback')
            .update({ resolution_notified_at: new Date().toISOString() })
            .eq('id', row.id)
          if (notifyFlagError && !/resolution_notified_at|column.*does not exist/i.test(notifyFlagError.message)) {
            showToast(`Resolved and notified, but could not save notification flag: ${notifyFlagError.message}`)
          }
        }
      }
    }

    setSavingId(null)
    setResolutionDrafts((prev) => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    clearPhotoDrafts(row.id)
    showToast('Marked resolved')
    void load()
  }

  const reopen = async (row: FeedbackRow) => {
    setSavingId(row.id)
    const { error: deleteError } = await deleteFeedbackResolutionPhotos(row.resolution_images)
    if (deleteError) {
      setSavingId(null)
      showToast(deleteError)
      return
    }

    const { error } = await supabase
      .from('app_feedback')
      .update({
        status: 'open',
        resolved_at: null,
        resolution_notes: null,
        resolution_images: [],
        submitter_seen_at: null,
        resolution_notified_at: null,
      })
      .eq('id', row.id)
    setSavingId(null)
    if (error) {
      showToast(`Could not update: ${error.message}`)
      return
    }
    showToast('Reopened')
    void load()
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Feedback inbox</h2>
        <div className="technicians-page-actions">
          <button type="button" className="button-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <Link to="/dashboard" className="button-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>

      {!isFeedbackEnabled() ? (
        <p className="placeholder-copy">
          Feedback collection is off in production. Set <code>VITE_ENABLE_FEEDBACK_BUTTON=true</code> on Vercel to keep
          collecting during beta.
        </p>
      ) : (
        <p className="placeholder-copy">
          User feedback from the top-bar Feedback button. Document what was done to fix each item and add up to three
          photos, then mark resolved.
        </p>
      )}

      {!user ? (
        <p className="placeholder-copy" style={{ color: '#b45309' }}>
          You are using local Admin. Sign in as a real shop Admin (for example <strong>ghensley</strong>) to see feedback
          stored in Supabase.
        </p>
      ) : null}

      <div className="feedback-inbox-filters">
        {(['open', 'resolved', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`button-secondary feedback-filter-btn${filter === value ? ' feedback-filter-btn--active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {value === 'open' ? 'Open' : value === 'resolved' ? 'Resolved' : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="placeholder-copy">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="placeholder-copy">
          {!user
            ? 'No feedback visible without a shop Admin login.'
            : filter === 'open'
              ? 'No open feedback. Try All in case it was already marked resolved.'
              : 'No feedback yet.'}
        </p>
      ) : (
        <div className="feedback-inbox-list">
          {filtered.map((row) => {
            const drafts = photoDrafts[row.id] ?? []
            const canAddPhotos = drafts.length < MAX_FEEDBACK_RESOLUTION_PHOTOS

            return (
              <article key={row.id} className={`feedback-inbox-card feedback-inbox-card--${row.status}`}>
                <header className="feedback-inbox-card-head">
                  <span className={`feedback-status-pill feedback-status-pill--${row.status}`}>{row.status}</span>
                  <FeedbackNotifyFlag row={row} />
                  <time className="feedback-inbox-time" dateTime={row.created_at}>
                    {new Date(row.created_at).toLocaleString()}
                  </time>
                </header>
                <p className="feedback-inbox-message">{row.message}</p>
                {row.submission_images.length > 0 ? (
                  <div className="feedback-inbox-submission-photos">
                    <div className="feedback-inbox-submission-photos-label">User screenshots</div>
                    <FeedbackPhotoGallery images={row.submission_images} label="User screenshots" />
                  </div>
                ) : null}
                <div className="feedback-inbox-meta">
                  {row.user_name ? <span>{row.user_name}</span> : null}
                  {row.user_role ? <span className="role-pill">{row.user_role}</span> : null}
                  {row.page_url ? (
                    <a href={row.page_url} className="feedback-inbox-link" target="_blank" rel="noreferrer">
                      Open page
                    </a>
                  ) : null}
                </div>
                {row.status === 'resolved' && row.resolution_notes ? (
                  <div className="feedback-inbox-resolution">
                    <div className="feedback-inbox-resolution-label">Fix applied</div>
                    <p className="feedback-inbox-resolution-text">{row.resolution_notes}</p>
                    <FeedbackPhotoGallery images={row.resolution_images} label="Resolution photos" />
                  </div>
                ) : null}
                <div className="feedback-inbox-actions">
                  {row.status === 'open' ? (
                    <>
                      <label className="feedback-inbox-resolution-field" htmlFor={`feedback-resolution-${row.id}`}>
                        What we did to fix this
                        <textarea
                          id={`feedback-resolution-${row.id}`}
                          className="feedback-inbox-resolution-input"
                          rows={3}
                          placeholder="Briefly describe the fix so we can refer back to it later."
                          value={resolutionDrafts[row.id] ?? ''}
                          onChange={(e) =>
                            setResolutionDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                        />
                      </label>
                      <div className="feedback-inbox-photo-field">
                        <div className="feedback-inbox-photo-label-row">
                          <span className="feedback-inbox-photo-label">Photos (optional)</span>
                          <span className="feedback-inbox-photo-count">
                            {drafts.length}/{MAX_FEEDBACK_RESOLUTION_PHOTOS}
                          </span>
                        </div>
                        {drafts.length > 0 ? (
                          <div className="feedback-inbox-photo-grid">
                            {drafts.map((draft) => (
                              <div key={draft.id} className="feedback-inbox-photo-draft">
                                <img src={draft.previewUrl} alt={draft.file.name} />
                                <button
                                  type="button"
                                  className="feedback-inbox-photo-remove"
                                  onClick={() => removePhotoDraft(row.id, draft.id)}
                                  aria-label={`Remove ${draft.file.name}`}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <label
                          className={`button-secondary feedback-inbox-photo-add${canAddPhotos ? '' : ' disabled'}`}
                        >
                          {canAddPhotos ? 'Add photos' : 'Photo limit reached'}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="feedback-inbox-photo-input"
                            disabled={!canAddPhotos || savingId === row.id}
                            onChange={(e) => {
                              addPhotoDrafts(row.id, e.target.files)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="button-secondary admin-list-btn"
                        onClick={() => void markResolved(row)}
                        disabled={savingId === row.id}
                      >
                        {savingId === row.id ? 'Saving…' : 'Mark resolved'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button-secondary admin-list-btn"
                      onClick={() => void reopen(row)}
                      disabled={savingId === row.id}
                    >
                      {savingId === row.id ? 'Saving…' : 'Reopen'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
