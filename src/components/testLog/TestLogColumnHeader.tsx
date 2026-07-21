import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PANEL_WIDTH = 240
const VIEWPORT_MARGIN = 8

type SortDirection = 'asc' | 'desc'

interface TestLogColumnHeaderProps {
  label: string
  sortActive: boolean
  sortDirection: SortDirection
  onSort: () => void
  filterOptions?: string[]
  selectedFilters?: string[]
  onFilterChange?: (selected: string[]) => void
}

export function TestLogColumnHeader({
  label,
  sortActive,
  sortDirection,
  onSort,
  filterOptions,
  selectedFilters = [],
  onFilterChange,
}: TestLogColumnHeaderProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 })

  const canFilter = Boolean(filterOptions && onFilterChange)
  const isFilterActive = selectedFilters.length > 0

  const filteredOptions = useMemo(() => {
    const options = filterOptions ?? []
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => option.toLowerCase().includes(q))
  }, [filterOptions, query])

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    let left = rect.left
    if (left + PANEL_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, rect.right - PANEL_WIDTH)
    }
    setPanelPosition({ top: rect.bottom + 6, left })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePanelPosition()
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

  const toggleValue = (value: string) => {
    if (!onFilterChange) return
    if (selectedFilters.includes(value)) {
      onFilterChange(selectedFilters.filter((item) => item !== value))
    } else {
      onFilterChange([...selectedFilters, value])
    }
  }

  const panel =
    open && canFilter ? (
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
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
          />
          {isFilterActive ? (
            <button
              type="button"
              className="column-filter-clear"
              onClick={() => onFilterChange?.([])}
              aria-label="Clear filter"
            >
              ×
            </button>
          ) : null}
        </div>
        <ul className="test-log-column-filter-list" role="listbox" aria-multiselectable="true">
          {filteredOptions.length === 0 ? (
            <li className="test-log-column-filter-empty">No matches</li>
          ) : (
            filteredOptions.map((option) => {
              const checked = selectedFilters.includes(option)
              return (
                <li key={option} role="option" aria-selected={checked}>
                  <label className="test-log-column-filter-option">
                    <input type="checkbox" checked={checked} onChange={() => toggleValue(option)} />
                    <span>{option}</span>
                  </label>
                </li>
              )
            })
          )}
        </ul>
        {isFilterActive ? (
          <button type="button" className="button-secondary test-log-column-filter-clear-all" onClick={() => onFilterChange?.([])}>
            Clear {selectedFilters.length} selected
          </button>
        ) : null}
      </div>
    ) : null

  return (
    <div className="list-col-header" ref={rootRef}>
      <button
        type="button"
        className={`list-col-sort-btn ${sortActive ? `sorted-${sortDirection}` : ''}`}
        onClick={onSort}
        aria-label={`Sort by ${label}`}
      >
        <span className="list-col-label">{label}</span>
        <span className="list-col-sort-indicator" aria-hidden="true">
          {sortActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
      {canFilter ? (
        <button
          ref={triggerRef}
          type="button"
          className={`column-filter-trigger ${isFilterActive ? 'active' : ''} ${open ? 'open' : ''}`}
          onClick={() => {
            setOpen((prev) => {
              const next = !prev
              if (next) {
                setQuery('')
                updatePanelPosition()
              }
              return next
            })
          }}
          aria-label={`Filter ${label}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={isFilterActive ? `${selectedFilters.length} selected` : `Filter ${label}`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="column-filter-icon">
            <path d="M2 3.5h12M4.5 8h7M6.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {isFilterActive ? <span className="column-filter-active-dot" aria-hidden="true" /> : null}
        </button>
      ) : null}
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
