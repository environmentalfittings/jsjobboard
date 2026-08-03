import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { isClosedWorkOrder } from '../lib/jobDisplayStatus'
import {
  suggestWorkOrders,
  type ValveListSort,
} from '../lib/valveWorkOrderSearch'
import type { Valve } from '../types'

type OpenMenu = 'workOrder' | 'description' | 'customer' | null

interface WorkOrderFilterBarProps {
  valves: Valve[]
  query: string
  descriptionQuery: string
  customerFilter: string
  selectedValveId: string
  sort: ValveListSort
  onQueryChange: (value: string) => void
  onDescriptionQueryChange: (value: string) => void
  onCustomerFilterChange: (value: string) => void
  onSelect: (valve: Valve) => void
  onClear: () => void
  onSortChange: (sort: ValveListSort) => void
  /** Optional status line under the filter (e.g. closed-match hint). */
  statusMessage?: string | null
}

function uniqueSortedStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function filterStringOptions(options: string[], query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase()
  const matched = q
    ? options.filter((option) => option.toLowerCase().includes(q))
    : options
  return matched.slice(0, limit)
}

interface StringSuggestFieldProps {
  label: string
  fieldClassName?: string
  placeholder: string
  value: string
  options: string[]
  open: boolean
  listId: string
  clearAriaLabel: string
  emptyLabel?: (query: string) => string
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
}

function StringSuggestField({
  label,
  fieldClassName,
  placeholder,
  value,
  options,
  open,
  listId,
  clearAriaLabel,
  emptyLabel,
  onOpenChange,
  onChange,
}: StringSuggestFieldProps) {
  const rootRef = useRef<HTMLLabelElement>(null)
  const suggestions = useMemo(() => filterStringOptions(options, value), [options, value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onOpenChange])

  return (
    <label className={`job-board-wo-filter-field ${fieldClassName ?? ''}`.trim()} ref={rootRef}>
      <span>{label}</span>
      <div className="job-board-wo-combobox">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            onOpenChange(true)
          }}
          onFocus={() => onOpenChange(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onOpenChange(false)
              return
            }
            if (event.key === 'Enter' && suggestions[0]) {
              event.preventDefault()
              onChange(suggestions[0])
              onOpenChange(false)
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="job-board-wo-clear"
            onClick={() => {
              onChange('')
              onOpenChange(false)
            }}
            aria-label={clearAriaLabel}
          >
            ×
          </button>
        ) : null}
        {open && suggestions.length > 0 ? (
          <ul className="job-board-wo-suggestions" id={listId} role="listbox">
            {suggestions.map((option) => (
              <li key={option} role="none">
                <button
                  type="button"
                  role="option"
                  className="job-board-wo-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option)
                    onOpenChange(false)
                  }}
                >
                  <strong>{option}</strong>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && value.trim() && suggestions.length === 0 ? (
          <div className="job-board-wo-empty" role="status">
            {emptyLabel?.(value.trim()) ?? `No matches for “${value.trim()}”.`}
          </div>
        ) : null}
      </div>
    </label>
  )
}

export function WorkOrderFilterBar({
  valves,
  query,
  descriptionQuery,
  customerFilter,
  selectedValveId,
  sort,
  onQueryChange,
  onDescriptionQueryChange,
  onCustomerFilterChange,
  onSelect,
  onClear,
  onSortChange,
  statusMessage = null,
}: WorkOrderFilterBarProps) {
  const workOrderListId = useId()
  const descriptionListId = useId()
  const customerListId = useId()
  const workOrderRootRef = useRef<HTMLLabelElement>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const inputValue = selectedValveId || query
  const suggestions = useMemo(() => suggestWorkOrders(valves, query, 25), [valves, query])
  const customerOptions = useMemo(
    () => uniqueSortedStrings(valves.map((valve) => valve.customer)),
    [valves],
  )
  const descriptionOptions = useMemo(
    () => uniqueSortedStrings(valves.map((valve) => valve.description)),
    [valves],
  )

  useEffect(() => {
    if (openMenu !== 'workOrder') return
    const onPointerDown = (event: MouseEvent) => {
      if (!workOrderRootRef.current?.contains(event.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openMenu])

  const handleClear = () => {
    onClear()
    onQueryChange('')
    setOpenMenu(null)
  }

  return (
    <div className="job-board-wo-filter-wrap">
      <div className="job-board-wo-filter">
        <label className="job-board-wo-filter-field" ref={workOrderRootRef}>
          <span>Work order #</span>
          <div className="job-board-wo-combobox">
            <input
              type="text"
              role="combobox"
              aria-expanded={openMenu === 'workOrder'}
              aria-controls={workOrderListId}
              aria-autocomplete="list"
              placeholder="Search all jobs (including closed)…"
              value={inputValue}
              onChange={(event) => {
                onClear()
                onQueryChange(event.target.value)
                setOpenMenu('workOrder')
              }}
              onFocus={() => setOpenMenu('workOrder')}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpenMenu(null)
                  return
                }
                if (event.key === 'Enter' && suggestions[0]) {
                  event.preventDefault()
                  onSelect(suggestions[0])
                  setOpenMenu(null)
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
            {openMenu === 'workOrder' && query.trim() && !selectedValveId && suggestions.length > 0 ? (
              <ul className="job-board-wo-suggestions" id={workOrderListId} role="listbox">
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
                          setOpenMenu(null)
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
            {openMenu === 'workOrder' && query.trim() && !selectedValveId && suggestions.length === 0 ? (
              <div className="job-board-wo-empty" role="status">
                No jobs match “{query.trim()}”. If New Job says it already exists, try List → Closed
                valves.
              </div>
            ) : null}
          </div>
        </label>

        <StringSuggestField
          label="Description"
          fieldClassName="job-board-wo-filter-field--description"
          placeholder="Type to find descriptions…"
          value={descriptionQuery}
          options={descriptionOptions}
          open={openMenu === 'description'}
          listId={descriptionListId}
          clearAriaLabel="Clear description filter"
          emptyLabel={(q) => `No descriptions match “${q}”.`}
          onOpenChange={(open) => setOpenMenu(open ? 'description' : null)}
          onChange={onDescriptionQueryChange}
        />

        <StringSuggestField
          label="Customer"
          fieldClassName="job-board-wo-filter-field--customer"
          placeholder="Type to find customers…"
          value={customerFilter}
          options={customerOptions}
          open={openMenu === 'customer'}
          listId={customerListId}
          clearAriaLabel="Clear customer filter"
          emptyLabel={(q) => `No customers match “${q}”.`}
          onOpenChange={(open) => setOpenMenu(open ? 'customer' : null)}
          onChange={onCustomerFilterChange}
        />

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
