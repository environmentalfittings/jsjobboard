import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { listStatusFilterOptions, type ColumnFilterState } from '../lib/jobBoardListColumns'
import type { Valve } from '../types'

const PANEL_WIDTH = 280
const VIEWPORT_MARGIN = 8

function statusFilterLabel(status: string): string {
  return status === 'Warehouse RTS' ? 'Ready to Ship' : status
}

interface ColumnFilterStatusChecklistProps {
  label: string
  valves: Valve[]
  filter: ColumnFilterState
  onChange: (next: ColumnFilterState) => void
}

export function ColumnFilterStatusChecklist({
  label,
  valves,
  filter,
  onChange,
}: ColumnFilterStatusChecklistProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 })

  const options = useMemo(() => listStatusFilterOptions(valves), [valves])
  const checked = filter.checked ?? []
  const isActive = checked.length > 0

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

  const toggleStatus = (status: string) => {
    const set = new Set(checked)
    if (set.has(status)) set.delete(status)
    else set.add(status)
    onChange({ query: '', selected: '', checked: [...set] })
  }

  const selectAll = () => {
    onChange({ query: '', selected: '', checked: options.map((row) => row.value) })
  }

  const clearAll = () => {
    onChange({ query: '', selected: '', checked: [] })
    setOpen(false)
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="column-filter-panel column-filter-panel-floating column-filter-status-panel"
      style={{ top: panelPosition.top, left: panelPosition.left, width: PANEL_WIDTH }}
      role="dialog"
      aria-label={`Filter ${label}`}
    >
      <div className="column-filter-panel-title">Filter {label}</div>
      <div className="column-filter-status-actions">
        <button type="button" className="column-filter-status-action" onClick={selectAll}>
          Select all
        </button>
        <button type="button" className="column-filter-status-action" onClick={clearAll}>
          Clear
        </button>
      </div>
      {options.length === 0 ? (
        <p className="column-filter-status-empty">No statuses in this list.</p>
      ) : (
        <ul className="column-filter-status-list">
          {options.map((row) => (
            <li key={row.value}>
              <label className="column-filter-status-option">
                <input
                  type="checkbox"
                  checked={checked.includes(row.value)}
                  onChange={() => toggleStatus(row.value)}
                />
                <span className="column-filter-status-option-label">{statusFilterLabel(row.value)}</span>
                <span className="column-filter-status-option-count">{row.count}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null

  const activeTitle =
    checked.length > 0
      ? `${checked.length} status${checked.length === 1 ? '' : 'es'} selected`
      : `Filter ${label}`

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
        aria-label={activeTitle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={activeTitle}
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
