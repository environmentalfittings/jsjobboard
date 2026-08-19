import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { isClosedWorkOrder } from '../lib/jobDisplayStatus'
import {
  suggestWorkOrders,
  type ValveListSort,
} from '../lib/valveWorkOrderSearch'
import type { Valve } from '../types'

interface WorkOrderFilterBarProps {
  valves: Valve[]
  query: string
  customerQuery: string
  descriptionQuery: string
  selectedValveId: string
  sort: ValveListSort
  onQueryChange: (value: string) => void
  onCustomerQueryChange: (value: string) => void
  onDescriptionQueryChange: (value: string) => void
  onSelect: (valve: Valve) => void
  onClear: () => void
  onSortChange: (sort: ValveListSort) => void
  /** Optional status line under the filter (e.g. closed-match hint). */
  statusMessage?: string | null
}

export function WorkOrderFilterBar({
  valves,
  query,
  customerQuery,
  descriptionQuery,
  selectedValveId,
  sort,
  onQueryChange,
  onCustomerQueryChange,
  onDescriptionQueryChange,
  onSelect,
  onClear,
  onSortChange,
  statusMessage = null,
}: WorkOrderFilterBarProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const inputValue = selectedValveId || query
  const suggestions = useMemo(() => suggestWorkOrders(valves, query, 25), [valves, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const handleClear = () => {
    onClear()
    onQueryChange('')
    setOpen(false)
  }

  return (
    <div className="job-board-wo-filter-wrap">
      <div className="job-board-wo-filter" ref={rootRef}>
        <label className="job-board-wo-filter-field">
          <span>Work order #</span>
          <div className="job-board-wo-combobox">
            <input
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              placeholder="Search all jobs (including closed)…"
              value={inputValue}
              onChange={(event) => {
                onClear()
                onQueryChange(event.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false)
                  return
                }
                if (event.key === 'Enter' && suggestions[0]) {
                  event.preventDefault()
                  onSelect(suggestions[0])
                  setOpen(false)
                }
              }}
            />
            {inputValue ? (
              <button
                type="button"
                className="job-board-wo-clear"
                onClick={handleClear}
                aria-label="Clear work order filter"
              >
                ×
              </button>
            ) : null}
            {open && query.trim() && !selectedValveId && suggestions.length > 0 ? (
              <ul className="job-board-wo-suggestions" id={listId} role="listbox">
                {suggestions.map((valve) => {
                  const closed = isClosedWorkOrder(valve)
                  return (
                    <li key={valve.id} role="none">
                      <button
                        type="button"
                        role="option"
                        className="job-board-wo-suggestion"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onSelect(valve)
                          setOpen(false)
                        }}
                      >
                        <strong>{valve.valve_id}</strong>
                        <span>{valve.customer ?? 'Unknown customer'}</span>
                        <span className="job-board-wo-suggestion-status">
                          {closed ? `Closed · ${valve.status}` : valve.status}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {open && query.trim() && !selectedValveId && suggestions.length === 0 ? (
              <div className="job-board-wo-empty" role="status">
                No jobs match “{query.trim()}”. If New Job says it already exists, try List → Closed
                valves.
              </div>
            ) : null}
          </div>
        </label>

        <label className="job-board-wo-filter-field job-board-wo-filter-field--customer">
          <span>Customer</span>
          <div className="job-board-wo-combobox">
            <input
              type="search"
              placeholder="Search customer name…"
              value={customerQuery}
              onChange={(event) => onCustomerQueryChange(event.target.value)}
            />
            {customerQuery.trim() ? (
              <button
                type="button"
                className="job-board-wo-clear"
                onClick={() => onCustomerQueryChange('')}
                aria-label="Clear customer filter"
              >
                ×
              </button>
            ) : null}
          </div>
        </label>

        <label className="job-board-wo-filter-field job-board-wo-filter-field--description">
          <span>Description</span>
          <div className="job-board-wo-combobox">
            <input
              type="search"
              placeholder="Search description text…"
              value={descriptionQuery}
              onChange={(event) => onDescriptionQueryChange(event.target.value)}
            />
            {descriptionQuery.trim() ? (
              <button
                type="button"
                className="job-board-wo-clear"
                onClick={() => onDescriptionQueryChange('')}
                aria-label="Clear description filter"
              >
                ×
              </button>
            ) : null}
          </div>
        </label>

        <label className="job-board-wo-filter-field">
          <span>Sort</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as ValveListSort)}>
            <option value="default">Default (priority)</option>
            <option value="wo-asc">Work order — ascending</option>
            <option value="wo-desc">Work order — descending</option>
            <option value="due-asc">Due date — ascending</option>
            <option value="due-desc">Due date — descending</option>
            <option value="customer-asc">Customer — A to Z</option>
            <option value="customer-desc">Customer — Z to A</option>
          </select>
        </label>
      </div>
      {statusMessage ? <p className="job-board-wo-status">{statusMessage}</p> : null}
    </div>
  )
}
