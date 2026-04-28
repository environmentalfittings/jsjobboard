import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastNotification'
import { loadLookupOptionsMap } from '../lib/lookupValues'
import { supabase } from '../lib/supabase'

export type ValveTypeProcedureRow = {
  id: number
  valve_type: string
  title: string
  body: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type ValveTypeProceduresPanelProps = {
  /** When set, selects this type once options load (e.g. job card valve type in ITP). */
  initialValveType?: string | null
  /** `page` = full Resources page panel; `itp` = embedded in ITP modal. */
  variant?: 'page' | 'itp'
  /** Optional id prefix for the valve type select (accessibility). */
  selectId?: string
}

export function ValveTypeProceduresPanel({
  initialValveType,
  variant = 'page',
  selectId = 'resources-valve-type',
}: ValveTypeProceduresPanelProps) {
  const { showToast } = useToast()
  const [valveTypes, setValveTypes] = useState<string[]>([])
  const [typesLoading, setTypesLoading] = useState(true)
  const [selectedType, setSelectedType] = useState('')
  const [initialApplied, setInitialApplied] = useState(false)
  const [rows, setRows] = useState<ValveTypeProcedureRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setTypesLoading(true)
      try {
        const map = await loadLookupOptionsMap()
        if (!cancelled) {
          setValveTypes(map.valve_type ?? [])
        }
      } catch {
        if (!cancelled) showToast('Could not load valve types')
      } finally {
        if (!cancelled) setTypesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const wantType = (initialValveType ?? '').trim()

  useEffect(() => {
    if (initialValveType === undefined) return
    setInitialApplied(false)
    setSelectedType('')
    setEditingId(null)
  }, [initialValveType])

  useEffect(() => {
    if (typesLoading || initialApplied) return
    if (!wantType) return
    setSelectedType(wantType)
    setInitialApplied(true)
  }, [typesLoading, wantType, initialApplied])

  const typeOptions = useMemo(() => {
    const base = [...valveTypes]
    if (wantType && !base.includes(wantType)) {
      return [wantType, ...base]
    }
    return base
  }, [valveTypes, wantType])

  const loadProcedures = useCallback(
    async (valveType: string) => {
      if (!valveType.trim()) {
        setRows([])
        return
      }
      setRowsLoading(true)
      setTableMissing(false)
      const { data, error } = await supabase
        .from('valve_type_procedures')
        .select('id,valve_type,title,body,sort_order,created_at,updated_at')
        .eq('valve_type', valveType)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
      setRowsLoading(false)
      if (error) {
        const msg = `${error.message ?? ''} ${(error as { details?: string }).details ?? ''}`
        if (/relation|does not exist|schema cache|PGRST205/i.test(msg)) {
          setTableMissing(true)
          setRows([])
          return
        }
        showToast('Could not load procedures')
        setRows([])
        return
      }
      setRows((data ?? []) as ValveTypeProcedureRow[])
    },
    [showToast],
  )

  useEffect(() => {
    void loadProcedures(selectedType)
  }, [selectedType, loadProcedures])

  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id), [rows])

  const addProcedure = async () => {
    const vt = selectedType.trim()
    const title = newTitle.trim()
    if (!vt) {
      showToast('Choose a valve type first')
      return
    }
    if (!title) {
      showToast('Enter a procedure title')
      return
    }
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), -1)
    setSaving(true)
    const { error } = await supabase.from('valve_type_procedures').insert({
      valve_type: vt,
      title,
      body: newBody,
      sort_order: maxOrder + 1,
    })
    setSaving(false)
    if (error) {
      if (/relation|does not exist|schema cache|PGRST205/i.test(error.message ?? '')) {
        setTableMissing(true)
        showToast('Database table missing — run migration-valve-type-procedures.sql in Supabase')
      } else {
        showToast('Could not add procedure')
      }
      return
    }
    showToast('Procedure added')
    setNewTitle('')
    setNewBody('')
    void loadProcedures(vt)
  }

  const startEdit = (row: ValveTypeProcedureRow) => {
    setEditingId(row.id)
    setEditTitle(row.title)
    setEditBody(row.body)
  }

  const saveEdit = async (id: number) => {
    const title = editTitle.trim()
    if (!title) {
      showToast('Title cannot be empty')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('valve_type_procedures')
      .update({ title, body: editBody })
      .eq('id', id)
    setSaving(false)
    if (error) {
      showToast('Could not save')
      return
    }
    setEditingId(null)
    showToast('Saved')
    void loadProcedures(selectedType)
  }

  const deleteRow = async (id: number) => {
    if (!window.confirm('Delete this procedure?')) return
    const { error } = await supabase.from('valve_type_procedures').delete().eq('id', id)
    if (error) {
      showToast('Could not delete')
      return
    }
    showToast('Deleted')
    void loadProcedures(selectedType)
  }

  const moveRow = async (row: ValveTypeProcedureRow, direction: -1 | 1) => {
    const list = [...sortedRows]
    const i = list.findIndex((r) => r.id === row.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i]
    const b = list[j]
    setSaving(true)
    const e1 = await supabase.from('valve_type_procedures').update({ sort_order: b.sort_order }).eq('id', a.id)
    const e2 = await supabase.from('valve_type_procedures').update({ sort_order: a.sort_order }).eq('id', b.id)
    setSaving(false)
    if (e1.error || e2.error) {
      showToast('Could not reorder')
      return
    }
    void loadProcedures(selectedType)
  }

  const panelClass = variant === 'itp' ? 'resources-panel itp-resources-panel' : 'dashboard-panel resources-panel'

  return (
    <section className={panelClass}>
      {variant === 'itp' ? (
        <p className="placeholder-copy itp-resources-lead">
          Shop procedures and notes for the valve type on this job. Change the type below to view another library.
        </p>
      ) : null}

      <div className="resources-type-row">
        <label className="resources-type-label" htmlFor={selectId}>
          Valve type
        </label>
        {typesLoading ? (
          <p className="placeholder-copy">Loading types…</p>
        ) : (
          <select
            id={selectId}
            className="resources-type-select"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value)
              setEditingId(null)
            }}
          >
            <option value="">{variant === 'itp' ? '— Select valve type —' : '— Select a valve type —'}</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {tableMissing ? (
        <p className="resources-missing-table">
          The <code>valve_type_procedures</code> table is not in your database yet. In Supabase → SQL Editor, run{' '}
          <code>supabase/migration-valve-type-procedures.sql</code> (or use the latest <code>schema.sql</code> on a new
          project).
        </p>
      ) : null}

      {!selectedType ? (
        <p className="placeholder-copy resources-hint">
          {variant === 'itp' ? 'Select a valve type to view or add procedures.' : 'Select a valve type to view or add procedures.'}
        </p>
      ) : rowsLoading ? (
        <p className="placeholder-copy">Loading procedures…</p>
      ) : (
        <>
          {sortedRows.length === 0 ? (
            <p className="placeholder-copy resources-hint">No procedures for this type yet. Add one below.</p>
          ) : (
            <ul className="resources-procedure-list">
              {sortedRows.map((row) => (
                <li key={row.id} className="resources-procedure-card">
                  {editingId === row.id ? (
                    <div className="resources-procedure-edit">
                      <label className="resources-field">
                        <span className="resources-field-label">Title</span>
                        <input
                          className="resources-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          aria-label="Procedure title"
                        />
                      </label>
                      <label className="resources-field">
                        <span className="resources-field-label">Procedure / notes</span>
                        <textarea
                          className="resources-textarea"
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={10}
                          aria-label="Procedure body"
                        />
                      </label>
                      <div className="resources-procedure-actions">
                        <button
                          type="button"
                          className="button-primary"
                          disabled={saving}
                          onClick={() => void saveEdit(row.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={saving}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="resources-procedure-head">
                        <h3 className="resources-procedure-title">{row.title}</h3>
                        <div className="resources-procedure-toolbar">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move up"
                            disabled={saving}
                            onClick={() => void moveRow(row, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move down"
                            disabled={saving}
                            onClick={() => void moveRow(row, 1)}
                          >
                            ↓
                          </button>
                          <button type="button" className="button-secondary admin-list-btn" onClick={() => startEdit(row)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => void deleteRow(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {row.body.trim() ? (
                        <div className="resources-procedure-body">{row.body}</div>
                      ) : (
                        <p className="placeholder-copy resources-body-empty">No detail text yet.</p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="resources-add-block">
            <h3 className="resources-add-heading">Add procedure</h3>
            <label className="resources-field">
              <span className="resources-field-label">Title</span>
              <input
                className="resources-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Teardown sequence, torque spec reference"
                disabled={!selectedType || saving}
                aria-label="New procedure title"
              />
            </label>
            <label className="resources-field">
              <span className="resources-field-label">Procedure / notes</span>
              <textarea
                className="resources-textarea"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={variant === 'itp' ? 6 : 8}
                placeholder="Steps, warnings, links, drawing refs…"
                disabled={!selectedType || saving}
                aria-label="New procedure body"
              />
            </label>
            <button
              type="button"
              className="button-primary"
              disabled={!selectedType || saving}
              onClick={() => void addProcedure()}
            >
              Add procedure
            </button>
          </div>
        </>
      )}
    </section>
  )
}
