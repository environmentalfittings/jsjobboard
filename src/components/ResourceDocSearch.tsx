import { useEffect, useRef } from 'react'

export type ResourceDocSearchSuggestion = {
  id: number | string
  title: string
  meta?: string
}

type ResourceDocSearchProps = {
  id: string
  label: string
  value: string
  placeholder: string
  suggestions: ResourceDocSearchSuggestion[]
  suggestOpen: boolean
  onChange: (value: string) => void
  onSuggestOpenChange: (open: boolean) => void
  onPick: (title: string) => void
}

export function ResourceDocSearch({
  id,
  label,
  value,
  placeholder,
  suggestions,
  suggestOpen,
  onChange,
  onSuggestOpenChange,
  onPick,
}: ResourceDocSearchProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!suggestOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (wrapRef.current?.contains(target)) return
      onSuggestOpenChange(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [onSuggestOpenChange, suggestOpen])

  return (
    <div className="weld-title-search" ref={wrapRef}>
      <label htmlFor={id}>
        {label}
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value)
            onSuggestOpenChange(true)
          }}
          onFocus={() => {
            if (value.trim()) onSuggestOpenChange(true)
          }}
        />
      </label>
      {suggestOpen && suggestions.length > 0 ? (
        <ul className="weld-title-suggestions" role="listbox" aria-label="Matching documents">
          {suggestions.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="weld-title-suggestion"
                onClick={() => {
                  onPick(row.title)
                  onSuggestOpenChange(false)
                }}
              >
                <span className="weld-title-suggestion-title">{row.title}</span>
                {row.meta ? <span className="weld-title-suggestion-meta">{row.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
