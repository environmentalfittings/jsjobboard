import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastNotification'
import { supabase } from '../lib/supabase'

export type DailyNote = {
  id: number
  note_date: string
  body: string
  is_done: boolean
  completed_at: string | null
  assigned_to: string | null
  estimated_completion_date: string | null
  add_to_rail: boolean
  created_by: string | null
  rail_added_by: string | null
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

function isMissingRailColumnError(message: string | undefined): boolean {
  if (!message) return false
  return /estimated_completion_date|add_to_rail|created_by|rail_added_by/i.test(message)
}

function normalizeNote(row: DailyNote): DailyNote {
  return {
    ...row,
    estimated_completion_date: row.estimated_completion_date ?? null,
    add_to_rail: Boolean(row.add_to_rail),
    created_by: row.created_by ?? null,
    rail_added_by: row.rail_added_by ?? null,
  }
}

export function DashboardNotesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { showToast } = useToast()
  const { username } = useAuth()
  const [notes, setNotes] = useState<DailyNote[]>([])
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([])
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [railSetupRequired, setRailSetupRequired] = useState(false)
  const [draft, setDraft] = useState('')
  const [assignDraft, setAssignDraft] = useState('')
  const [estimatedDraft, setEstimatedDraft] = useState('')
  const [railDraft, setRailDraft] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const actorName = username.trim() || null

  const loadNotes = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, railProbe] = await Promise.all([
      supabase
        .from('daily_notes')
        .select('*')
        .order('is_done', { ascending: true })
        .order('note_date', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('id', { ascending: false }),
      supabase.from('daily_notes').select('add_to_rail,estimated_completion_date,created_by,rail_added_by').limit(1),
    ])

    if (isMissingRailColumnError(railProbe.error?.message)) {
      setRailSetupRequired(true)
    } else {
      setRailSetupRequired(false)
    }

    if (error) {
      if (error.message.includes('daily_notes')) {
        setSetupRequired(true)
      } else {
        showToast(`Could not load notes: ${error.message}`)
      }
      setNotes([])
    } else {
      setNotes(((data as DailyNote[]) ?? []).map(normalizeNote))
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
    if (readOnly) return

    const body = draft.trim()
    if (!body) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const assigned_to = assignDraft.trim() || null
    const basePayload: Record<string, unknown> = {
      note_date: today,
      body,
      is_done: false,
      assigned_to,
      source: 'app',
    }
    const payload = railSetupRequired
      ? basePayload
      : {
          ...basePayload,
          estimated_completion_date: assigned_to && estimatedDraft ? estimatedDraft : null,
          add_to_rail: railDraft,
          created_by: actorName,
          rail_added_by: railDraft ? actorName : null,
        }
    let { data, error } = await supabase.from('daily_notes').insert(payload).select('*').single()
    if (error && isMissingRailColumnError(error.message) && !railSetupRequired) {
      setRailSetupRequired(true)
      showToast('Run supabase/migration-daily-notes-rail.sql in the Supabase SQL Editor, then try again.')
      const retry = await supabase.from('daily_notes').insert(basePayload).select('*').single()
      data = retry.data
      error = retry.error
    }
    setSaving(false)
    if (error || !data) {
      if (isMissingRailColumnError(error?.message)) {
        setRailSetupRequired(true)
        showToast('Run supabase/migration-daily-notes-rail.sql in the Supabase SQL Editor, then try again.')
        return
      }
      showToast(`Could not add note: ${error?.message ?? 'Unknown error'}`)
      return
    }
    setDraft('')
    setAssignDraft('')
    setEstimatedDraft('')
    setRailDraft(false)
    setNotes((prev) => [normalizeNote(data as DailyNote), ...prev])
    showToast('Task added')
  }

  const toggleDone = async (note: DailyNote) => {
    if (readOnly) return

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

  const patchNote = async (note: DailyNote, patch: Partial<DailyNote>) => {
    if (readOnly) return

    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...patch } : n)))
    const { error } = await supabase
      .from('daily_notes')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', note.id)
    if (error) {
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)))
      if (isMissingRailColumnError(error.message)) {
        setRailSetupRequired(true)
        showToast('Run supabase/migration-daily-notes-rail.sql in the Supabase SQL Editor, then try again.')
        return
      }
      showToast(`Could not update task: ${error.message}`)
    }
  }

  const updateAssignee = async (note: DailyNote, assigned_to: string) => {
    const value = assigned_to.trim() || null
    const patch: Partial<DailyNote> = { assigned_to: value }
    if (!value) patch.estimated_completion_date = null
    await patchNote(note, patch)
  }

  const saveEdit = async (note: DailyNote) => {
    if (readOnly) return

    const body = editDraft.trim()
    setEditingId(null)
    if (!body || body === note.body) return
    await patchNote(note, { body })
  }

  const startEdit = (note: DailyNote) => {
    if (readOnly) return
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
        disabled={readOnly}
        aria-label={done ? 'Mark task open' : 'Mark task complete'}
      />
      <div className="daily-note-body-wrap">
        <div className="daily-note-meta">
          <span>Added {formatTimestamp(note.created_at) || formatNoteDate(note.note_date)}</span>
          {note.created_by ? <span>by {note.created_by}</span> : null}
          {note.assigned_to ? <span className="daily-note-assignee">@{note.assigned_to}</span> : null}
          {note.estimated_completion_date ? (
            <span>Est. {formatNoteDate(note.estimated_completion_date)}</span>
          ) : null}
          {note.add_to_rail ? <span className="daily-note-rail-badge">Rail</span> : null}
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
            disabled={done || readOnly}
          >
            {note.body}
          </button>
        )}
        {!done && !readOnly ? (
          <div className="daily-note-controls">
            <div className="daily-note-assign-row">
              <label className="daily-note-assign-field">
                <span>Assign to</span>
                <select
                  value={note.assigned_to ?? ''}
                  onChange={(e) => void updateAssignee(note, e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.name}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </label>
              {note.assigned_to ? (
                <label className="daily-note-assign-field daily-note-date-field">
                  <span>Estimated Completion Date</span>
                  <input
                    type="date"
                    value={note.estimated_completion_date ?? ''}
                    onChange={(e) =>
                      void patchNote(note, { estimated_completion_date: e.target.value || null })
                    }
                    disabled={readOnly}
                  />
                </label>
              ) : null}
            </div>
            <label className="daily-note-rail-check">
              <input
                type="checkbox"
                checked={Boolean(note.add_to_rail)}
                onChange={(e) => {
                  const add_to_rail = e.target.checked
                  void patchNote(note, {
                    add_to_rail,
                    rail_added_by: add_to_rail ? actorName ?? note.rail_added_by : note.rail_added_by,
                  })
                }}
                disabled={readOnly}
              />
              Add to Rail
            </label>
          </div>
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
        automatically. Assign someone to set an estimated completion date, and check Add to Rail for 5S items.
      </p>

      {!expanded ? openLargerViewButton : null}

      {!readOnly ? (
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
              onChange={(e) => {
                setAssignDraft(e.target.value)
                if (!e.target.value) setEstimatedDraft('')
              }}
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
          {assignDraft ? (
            <label className="daily-note-assign-field inline daily-note-date-field">
              <span>Estimated Completion Date</span>
              <input
                type="date"
                value={estimatedDraft}
                onChange={(e) => setEstimatedDraft(e.target.value)}
                disabled={saving || setupRequired}
              />
            </label>
          ) : null}
          <button
            type="submit"
            className="button-primary daily-note-add-btn"
            disabled={saving || setupRequired || !draft.trim()}
          >
            {saving ? 'Saving…' : 'Add task'}
          </button>
        </div>
        <label className="daily-note-rail-check">
          <input
            type="checkbox"
            checked={railDraft}
            onChange={(e) => setRailDraft(e.target.checked)}
            disabled={saving || setupRequired}
          />
          Add to Rail
        </label>
      </form>
      ) : (
        <p className="placeholder-copy">View only — ask an Admin or Manager to change notes.</p>
      )}

      {setupRequired ? (
        <div className="daily-notes-empty">
          Run <code>supabase/migration-daily-notes.sql</code> and{' '}
          <code>supabase/migration-daily-notes-assignee.sql</code> in the Supabase SQL Editor, then sync with{' '}
          <code>--notes</code>.
        </div>
      ) : null}

      {railSetupRequired ? (
        <div className="daily-notes-empty">
          Run <code>supabase/migration-daily-notes-rail.sql</code> in the Supabase SQL Editor to enable estimated
          dates and Add to Rail.
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
