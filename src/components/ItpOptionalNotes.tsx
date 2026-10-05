import { useEffect, useState } from 'react'

type ItpOptionalNotesProps = {
  notes: string
  disabled?: boolean
  onChange: (notes: string) => void
}

export function ItpOptionalNotes({ notes, disabled = false, onChange }: ItpOptionalNotesProps) {
  const [open, setOpen] = useState(() => notes.trim().length > 0)

  useEffect(() => {
    if (notes.trim()) setOpen(true)
  }, [notes])

  return (
    <div className="itp-optional-notes">
      <label className="itp-optional-notes-toggle">
        <input
          type="checkbox"
          checked={open}
          disabled={disabled}
          onChange={(e) => setOpen(e.target.checked)}
        />
        Add notes
      </label>
      {open ? (
        <textarea
          rows={3}
          value={notes}
          disabled={disabled}
          placeholder="Notes / observations…"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  )
}
