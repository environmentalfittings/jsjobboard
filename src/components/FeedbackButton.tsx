import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { isFeedbackEnabled } from '../lib/feedbackEnabled'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../pages/LoginPage'

interface FeedbackButtonProps {
  username: string
  role: UserRole | null
}

export function FeedbackButton({ username, role }: FeedbackButtonProps) {
  const location = useLocation()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isFeedbackEnabled()) return null

  const submit = async () => {
    const text = message.trim()
    if (!text) {
      showToast('Please describe the issue or suggestion')
      return
    }
    setSaving(true)
    const pageUrl = `${window.location.origin}${location.pathname}${location.search}`
    const { error } = await supabase.from('app_feedback').insert({
      message: text,
      page_url: pageUrl,
      user_name: username.trim() || null,
      user_role: role ?? null,
    })
    setSaving(false)
    if (error) {
      if (/app_feedback|relation.*does not exist/i.test(error.message)) {
        showToast('Feedback table missing — run supabase/migration-app-feedback.sql in Supabase SQL Editor')
      } else {
        showToast(`Could not send feedback: ${error.message}`)
      }
      return
    }
    setMessage('')
    setOpen(false)
    showToast('Thanks — feedback sent')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving])

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
                onClick={() => setOpen(false)}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="placeholder-copy feedback-modal-intro">
              Describe a bug, confusing screen, or missing feature. We review these during development.
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
            <p className="modal-save-hint-subtle">
              Includes this page: {location.pathname}
              {username ? ` · ${username}` : ''}
            </p>
            <footer className="feedback-modal-footer">
              <button type="button" className="button-secondary" onClick={() => setOpen(false)} disabled={saving}>
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
