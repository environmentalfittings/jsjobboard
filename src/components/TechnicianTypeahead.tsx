import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Technician } from '../types'

type TechnicianTypeaheadProps = {
  technicians: Technician[]
  value: number[]
  disabled?: boolean
  placeholder?: string
  onChange: (technicianIds: number[]) => void
}

export function TechnicianTypeahead({
  technicians,
  value,
  disabled = false,
  placeholder = 'Add technician…',
  onChange,
}: TechnicianTypeaheadProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedIds = useMemo(() => [...new Set(value.filter((id) => Number.isFinite(id)))], [value])
  const selectedTechs = useMemo(
    () =>
      selectedIds
        .map((id) => technicians.find((tech) => tech.id === id))
        .filter((tech): tech is Technician => Boolean(tech)),
    [selectedIds, technicians],
  )
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selected = new Set(selectedIds)
    const list = [...technicians]
      .filter((tech) => !selected.has(tech.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list.slice(0, 12)
    return list
      .filter((tech) => {
        const name = tech.name.toLowerCase()
        const employee = (tech.employee_id ?? '').toLowerCase()
        return name.includes(q) || employee.includes(q)
      })
      .slice(0, 12)
  }, [technicians, query, selectedIds])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const add = (tech: Technician) => {
    if (selectedIds.includes(tech.id)) return
    onChange([...selectedIds, tech.id])
    setQuery('')
    setOpen(true)
  }

  const remove = (techId: number) => {
    onChange(selectedIds.filter((id) => id !== techId))
  }

  return (
    <div className="daily-priority-tech-typeahead" ref={rootRef}>
      {selectedTechs.length ? (
        <div className="daily-priority-tech-chips">
          {selectedTechs.map((tech) => (
            <span key={tech.id} className="daily-priority-tech-chip">
              {tech.name}
              {disabled ? null : (
                <button
                  type="button"
                  className="daily-priority-tech-chip-remove"
                  aria-label={`Remove ${tech.name}`}
                  onClick={() => remove(tech.id)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      ) : null}
      {disabled ? (
        selectedTechs.length ? null : <span>—</span>
      ) : (
        <input
          type="text"
          className="daily-priority-tech-select"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
              setOpen(true)
              return
            }
            if (e.key === 'Escape') {
              setOpen(false)
              setQuery('')
              return
            }
            if (e.key === 'Backspace' && !query && selectedIds.length) {
              remove(selectedIds[selectedIds.length - 1]!)
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)))
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((prev) => Math.max(prev - 1, 0))
              return
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault()
              const choice = filtered[highlight]
              if (choice) add(choice)
            }
          }}
        />
      )}
      {open && !disabled ? (
        <ul className="daily-priority-tech-menu" id={listId} role="listbox">
          {filtered.length === 0 ? (
            <li className="daily-priority-tech-empty" role="presentation">
              {query.trim() ? 'No matches' : 'All technicians assigned'}
            </li>
          ) : (
            filtered.map((tech, index) => (
              <li
                key={tech.id}
                role="option"
                aria-selected={index === highlight}
                className={`daily-priority-tech-option${index === highlight ? ' is-selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(tech)
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                {tech.name}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
