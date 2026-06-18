import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  suggestColumnValues,
  type ColumnFilterState,
  type ColumnSuggestion,
  type ListColumnContext,
  type ListColumnKey,
} from '../lib/jobBoardListColumns'
import type { Valve } from '../types'

const PANEL_WIDTH = 260
const VIEWPORT_MARGIN = 8

interface ColumnFilterComboboxProps {
  column: ListColumnKey
  label: string
  valves: Valve[]
  filter: ColumnFilterState
  context: ListColumnContext
  placeholder?: string
  onChange: (next: ColumnFilterState) => void
}

export function ColumnFilterCombobox({
  column,
  label,
  valves,
  filter,
  context,
  placeholder = 'Filter…',
  onChange,
}: ColumnFilterComboboxProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 })
  const inputValue = filter.selected || filter.query
  const isActive = Boolean(inputValue.trim())

  const suggestions = useMemo(
    () => suggestColumnValues(valves, column, filter.query, context),
    [valves, column, filter.query, context],
  )

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    let left = rect.left
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, rect.right - PANEL_WIDTH)
    }

    setPanelPosition({
      top: rect.bottom + 6,
      left,
    })
  }, [])

  useEffect(() => {
    if (!open) return

    updatePanelPosition()
    inputRef.current?.focus()

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }

    const onReposition = () => updatePanelPosition()

    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, updatePanelPosition])

  const pickSuggestion = (item: ColumnSuggestion) => {
    onChange({ query: item.value, selected: item.value })
    setOpen(false)
  }

  const handleClear = () => {
    onChange({ query: '', selected: '' })
    setOpen(false)
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="column-filter-panel column-filter-panel-floating"
      style={{ top: panelPosition.top, left: panelPosition.left, width: PANEL_WIDTH }}
      role="dialog"
      aria-label={`Filter ${label}`}
    >
      <div className="column-filter-panel-title">Filter {label}</div>
      <div className="column-filter-panel-input">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={Boolean(filter.query.trim() && !filter.selected && suggestions.length)}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={inputValue}
          onChange={(event) => {
            onChange({ query: event.target.value, selected: '' })
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              return
            }
            if (event.key === 'Enter' && suggestions[0]) {
              event.preventDefault()
              pickSuggestion(suggestions[0])
            }
          }}
        />
        {inputValue ? (
          <button type="button" className="column-filter-clear" onClick={handleClear} aria-label="Clear filter">
            ×
          </button>
        ) : null}
      </div>
      {filter.query.trim() && !filter.selected && suggestions.length > 0 ? (
        <ul className="column-filter-suggestions" id={listId} role="listbox">
          {suggestions.map((item) => (
            <li key={`${column}-${item.value}`} role="none">
              <button
                type="button"
                role="option"
                className="column-filter-suggestion"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickSuggestion(item)}
              >
                <strong>{item.value}</strong>
                {item.hint ? <span>{item.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null

  return (
    <div className="column-filter-popover" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`column-filter-trigger ${isActive ? 'active' : ''} ${open ? 'open' : ''}`}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev
            if (next) updatePanelPosition()
            return next
          })
        }}
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={isActive ? inputValue : `Filter ${label}`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="column-filter-icon">
          <path d="M2 3.5h12M4.5 8h7M6.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {isActive ? <span className="column-filter-active-dot" aria-hidden="true" /> : null}
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
