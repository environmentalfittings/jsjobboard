import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Technician } from '../types'

type TechnicianTypeaheadProps = {
  technicians: Technician[]
  value: number | null
  disabled?: boolean
  placeholder?: string
  onChange: (technicianId: number | null) => void
}

export function TechnicianTypeahead({
  technicians,
  value,
  disabled = false,
  placeholder = 'Type a name…',
  onChange,
}: TechnicianTypeaheadProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = useMemo(
    () => technicians.find((tech) => tech.id === value) ?? null,
    [technicians, value],
  )
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    setQuery(selected?.name ?? '')
  }, [selected?.name, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...technicians].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return list.slice(0, 12)
    return list
      .filter((tech) => {
        const name = tech.name.toLowerCase()
        const employee = (tech.employee_id ?? '').toLowerCase()
        return name.includes(q) || employee.includes(q)
      })
      .slice(0, 12)
  }, [technicians, query])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setQuery(selected?.name ?? '')
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, selected?.name])

  const pick = (tech: Technician | null) => {
    onChange(tech?.id ?? null)
    setQuery(tech?.name ?? '')
    setOpen(false)
  }

  return (
    <div className="daily-priority-tech-typeahead" ref={rootRef}>
      <input
        type="text"
        className="daily-priority-tech-select"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim() && value != null) onChange(null)
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
            setOpen(true)
            return
          }
          if (e.key === 'Escape') {
            setOpen(false)
            setQuery(selected?.name ?? '')
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
            if (choice) pick(choice)
            else if (!query.trim()) pick(null)
          }
        }}
        onBlur={() => {
          // Allow click on option; sync text if left incomplete.
          window.setTimeout(() => {
            if (!rootRef.current?.contains(document.activeElement)) {
              setOpen(false)
              setQuery(selected?.name ?? '')
            }
          }, 0)
        }}
      />
      {open ? (
        <ul className="daily-priority-tech-menu" id={listId} role="listbox">
          <li
            role="option"
            aria-selected={value == null}
            className={`daily-priority-tech-option${value == null ? ' is-selected' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              pick(null)
            }}
          >
            Unassigned
          </li>
          {filtered.length === 0 ? (
            <li className="daily-priority-tech-empty" role="presentation">
              No matches
            </li>
          ) : (
            filtered.map((tech, index) => (
              <li
                key={tech.id}
                role="option"
                aria-selected={tech.id === value}
                className={`daily-priority-tech-option${
                  tech.id === value || index === highlight ? ' is-selected' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(tech)
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
