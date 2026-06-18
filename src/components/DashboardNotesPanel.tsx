import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import { supabase } from '../lib/supabase'

export type DailyNote = {
  id: number
  note_date: string
  body: string
  is_done: boolean
  completed_at: string | null
  assigned_to: string | null
  sort_order: number
  source: string
  created_at: string
  updated_at: string
}

type TechnicianOption = {
  id: number
  name: string
}

function formatNoteDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestamp(value: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function DashboardNotesPanel() {
  const { showToast } = useToast()
  const [notes, setNotes] = useState<DailyNote[]>([])
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([])
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [draft, setDraft] = useState('')
  const [assignDraft, setAssignDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const loadNotes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_notes')
      .select('*')
      .order('is_done', { ascending: true })
      .order('note_date', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('id', { ascending: false })

    if (error) {
      if (error.message.includes('daily_notes')) {
        setSetupRequired(true)
      } else {
        showToast(`Could not load notes: ${error.message}`)
      }
      setNotes([])
    } else {
      setNotes((data as DailyNote[]) ?? [])
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('technicians')
        .select('id,name')
        .eq('active', true)
        .order('name')
      if (cancelled || error || !data) return
      setTechnicians(data as TechnicianOption[])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const openNotes = useMemo(() => notes.filter((n) => !n.is_done), [notes])
  const completedNotes = useMemo(() => notes.filter((n) => n.is_done), [notes])

  const addNote = async () => {
    const body = draft.trim()
    if (!body) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('daily_notes')
      .insert({
        note_date: today,
        body,
        is_done: false,
        assigned_to: assignDraft.trim() || null,
        source: 'app',
      })
      .select('*')
      .single()
    setSaving(false)
    if (error || !data) {
      showToast(`Could not add note: ${error?.message ?? 'Unknown error'}`)
      return
    }
    setDraft('')
    setAssignDraft('')
    setNotes((prev) => [data as DailyNote, ...prev])
    showToast('Task added')
  }

  const toggleDone = async (note: DailyNote) => {
    const nextDone = !note.is_done
    const completed_at = nextDone ? new Date().toISOString() : null
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, is_done: nextDone, completed_at } : n)),
    )
    const { error } = await supabase
      .from('daily_notes')
      .update({ is_done: nextDone, completed_at, updated_at: new Date().toISOString() })
      .eq('id', note.id)
    if (error) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === note.id ? { ...n, is_done: note.is_done, completed_at: note.completed_at } : n,
        ),
      )
      showToast(`Could not update task: ${error.message}`)
    }
  }

  const updateAssignee = async (note: DailyNote, assigned_to: string) => {
    const value = assigned_to.trim() || null
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, assigned_to: value } : n)))
    const { error } = await supabase
      .from('daily_notes')
      .update({ assigned_to: value, updated_at: new Date().toISOString() })
      .eq('id', note.id)
    if (error) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      showToast(`Could not update assignee: ${error.message}`)
    }
  }

  const saveEdit = async (note: DailyNote) => {
    const body = editDraft.trim()
    setEditingId(null)
    if (!body || body === note.body) return
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, body } : n)))
    const { error } = await supabase
      .from('daily_notes')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('id', note.id)
    if (error) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      showToast(`Could not save task: ${error.message}`)
    }
  }

  const startEdit = (note: DailyNote) => {
    setEditingId(note.id)
    setEditDraft(note.body)
  }

  const [poppedOut, setPoppedOut] = useState(false)

  useEffect(() => {
    if (!poppedOut) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPoppedOut(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [poppedOut])

  const renderNote = (note: DailyNote, done: boolean, expanded: boolean) => (
    <li key={note.id} className={`daily-note-row ${done ? 'done' : ''}`}>
      <input
        type="checkbox"
        className="daily-note-check"
        checked={note.is_done}
        onChange={() => void toggleDone(note)}
        aria-label={done ? 'Mark task open' : 'Mark task complete'}
      />
      <div className="daily-note-body-wrap">
        <div className="daily-note-meta">
          <span>Added {formatTimestamp(note.created_at) || formatNoteDate(note.note_date)}</span>
          {note.assigned_to ? <span className="daily-note-assignee">@{note.assigned_to}</span> : null}
          {done && note.completed_at ? (
            <span className="daily-note-completed">Done {formatTimestamp(note.completed_at)}</span>
          ) : null}
        </div>
        {editingId === note.id && !done ? (
          <textarea
            className="daily-note-edit"
            value={editDraft}
            rows={expanded ? 4 : 3}
            autoFocus
            onChange={(e) => setEditDraft(e.target.value)}
            onBlur={() => void saveEdit(note)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void saveEdit(note)
              }
              if (e.key === 'Escape') {
                setEditingId(null)
                setEditDraft(note.body)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="daily-note-text"
            onClick={() => {
              if (!done) startEdit(note)
            }}
            disabled={done}
          >
            {note.body}
          </button>
        )}
        {!done ? (
          <label className="daily-note-assign-field">
            <span>Assign to</span>
            <select
              value={note.assigned_to ?? ''}
              onChange={(e) => void updateAssignee(note, e.target.value)}
            >
              <option value="">Unassigned</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.name}>
                  {tech.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </li>
  )

  const openLargerViewButton = (
    <button
      type="button"
      className="button-secondary daily-notes-open-larger-btn"
      onClick={() => setPoppedOut(true)}
    >
      Open larger view
    </button>
  )

  const renderPanelBody = (expanded: boolean) => (
    <>
      <p className="daily-notes-hint">
        Active tasks from Excel (bold items on Daily Notes). Check off when complete — timestamps are saved
        automatically.
      </p>

      {!expanded ? openLargerViewButton : null}

      <form
        className="daily-note-add"
        onSubmit={(e) => {
          e.preventDefault()
          void addNote()
        }}
      >
        <textarea
          className="daily-note-add-input"
          placeholder="Add a new task…"
          value={draft}
          rows={expanded ? 3 : 2}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving || setupRequired}
        />
        <div className="daily-note-add-row">
          <label className="daily-note-assign-field inline">
            <span>Assign to</span>
            <select
              value={assignDraft}
              onChange={(e) => setAssignDraft(e.target.value)}
              disabled={saving || setupRequired}
            >
              <option value="">Unassigned</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.name}>
                  {tech.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="button-primary daily-note-add-btn"
            disabled={saving || setupRequired || !draft.trim()}
          >
            {saving ? 'Saving…' : 'Add task'}
          </button>
        </div>
      </form>

      {setupRequired ? (
        <div className="daily-notes-empty">
          Run <code>supabase/migration-daily-notes.sql</code> and{' '}
          <code>supabase/migration-daily-notes-assignee.sql</code> in the Supabase SQL Editor, then sync with{' '}
          <code>--notes</code>.
        </div>
      ) : null}

      {!setupRequired && loading ? <div className="daily-notes-loading">Loading tasks…</div> : null}

      {!setupRequired && !loading && openNotes.length === 0 ? (
        <div className="daily-notes-empty">No open tasks. Add one above or import from Excel.</div>
      ) : null}

      {!setupRequired ? (
        <ul className={`daily-notes-list${expanded ? ' daily-notes-list--expanded' : ''}`}>
          {openNotes.map((note) => renderNote(note, false, expanded))}
        </ul>
      ) : null}

      {!setupRequired && completedNotes.length > 0 ? (
        <div className="daily-notes-completed-wrap">
          <button
            type="button"
            className="daily-notes-completed-toggle"
            onClick={() => setShowCompleted((v) => !v)}
          >
            {showCompleted ? 'Hide' : 'Show'} completed ({completedNotes.length})
          </button>
          {showCompleted ? (
            <ul className={`daily-notes-list completed${expanded ? ' daily-notes-list--expanded' : ''}`}>
              {completedNotes.map((note) => renderNote(note, true, expanded))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  )

  const panelHeader = (expanded: boolean) => (
    <div className="daily-notes-panel-head">
      <h3 id={expanded ? 'daily-notes-popout-title' : undefined}>Shop to-do list</h3>
      {expanded ? (
        <button
          type="button"
          className="button-secondary daily-notes-popout-btn"
          onClick={() => setPoppedOut(false)}
          aria-label="Close expanded to-do list"
        >
          Close
        </button>
      ) : null}
    </div>
  )

  return (
    <>
      {!poppedOut ? (
        <section className="dashboard-panel daily-notes-panel">
          {panelHeader(false)}
          {renderPanelBody(false)}
        </section>
      ) : null}

      {poppedOut ? (
        <div
          className="modal-overlay daily-notes-popout-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPoppedOut(false)
          }}
        >
          <section
            className="dashboard-panel daily-notes-panel daily-notes-panel--popout"
            role="dialog"
            aria-labelledby="daily-notes-popout-title"
            aria-modal="true"
          >
            {panelHeader(true)}
            {renderPanelBody(true)}
          </section>
        </div>
      ) : null}
    </>
  )
}
