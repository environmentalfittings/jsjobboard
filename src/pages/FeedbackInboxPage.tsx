import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { isFeedbackEnabled } from '../lib/feedbackEnabled'
import { supabase } from '../lib/supabase'

type FeedbackRow = {
  id: number
  message: string
  page_url: string | null
  user_name: string | null
  user_role: string | null
  status: 'open' | 'resolved'
  created_at: string
  resolved_at: string | null
}

export function FeedbackInboxPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('app_feedback')
      .select('id,message,page_url,user_name,user_role,status,created_at,resolved_at')
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
    setRows((data as FeedbackRow[]) ?? [])
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((row) => row.status === filter)
  }, [filter, rows])

  const markResolved = async (row: FeedbackRow) => {
    const { error } = await supabase
      .from('app_feedback')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) {
      showToast(`Could not update: ${error.message}`)
      return
    }
    showToast('Marked resolved')
    void load()
  }

  const reopen = async (row: FeedbackRow) => {
    const { error } = await supabase
      .from('app_feedback')
      .update({ status: 'open', resolved_at: null })
      .eq('id', row.id)
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
          User feedback from the top-bar Feedback button. Work through open items, then mark resolved.
        </p>
      )}

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
        <p className="placeholder-copy">No feedback yet.</p>
      ) : (
        <div className="feedback-inbox-list">
          {filtered.map((row) => (
            <article key={row.id} className={`feedback-inbox-card feedback-inbox-card--${row.status}`}>
              <header className="feedback-inbox-card-head">
                <span className={`feedback-status-pill feedback-status-pill--${row.status}`}>{row.status}</span>
                <time className="feedback-inbox-time" dateTime={row.created_at}>
                  {new Date(row.created_at).toLocaleString()}
                </time>
              </header>
              <p className="feedback-inbox-message">{row.message}</p>
              <div className="feedback-inbox-meta">
                {row.user_name ? <span>{row.user_name}</span> : null}
                {row.user_role ? <span className="role-pill">{row.user_role}</span> : null}
                {row.page_url ? (
                  <a href={row.page_url} className="feedback-inbox-link" target="_blank" rel="noreferrer">
                    Open page
                  </a>
                ) : null}
              </div>
              <div className="feedback-inbox-actions">
                {row.status === 'open' ? (
                  <button type="button" className="button-secondary admin-list-btn" onClick={() => void markResolved(row)}>
                    Mark resolved
                  </button>
                ) : (
                  <button type="button" className="button-secondary admin-list-btn" onClick={() => void reopen(row)}>
                    Reopen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
