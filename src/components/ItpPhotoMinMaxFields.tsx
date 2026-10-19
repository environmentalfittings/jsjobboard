import { useEffect, useState } from 'react'
import {
  clampLinePhotoMax,
  clampLinePhotoMin,
  MEAS_PICTURE_MAX,
} from '../lib/itpItemRequirements'

type Props = {
  minPhotos: number
  maxPhotos?: number
  onChange: (next: { minPhotos: number; maxPhotos: number }) => void
  stopClick?: boolean
}

/**
 * Picture min/max editors. Min may be 0 (optional photos). Uses a local draft while
 * typing so clearing the field does not immediately snap back to 1 before 0 can be entered.
 */
export function ItpPhotoMinMaxFields({ minPhotos, maxPhotos, onChange, stopClick }: Props) {
  const min = clampLinePhotoMin(minPhotos)
  const max = clampLinePhotoMax(maxPhotos, min)
  const [minDraft, setMinDraft] = useState(String(min))
  const [minFocused, setMinFocused] = useState(false)

  useEffect(() => {
    if (!minFocused) setMinDraft(String(min))
  }, [min, minFocused])

  const stop = stopClick
    ? (event: { stopPropagation: () => void }) => event.stopPropagation()
    : undefined

  const commitMinDraft = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      // Keep showing empty while focused; on blur fall back to current min.
      setMinDraft(String(min))
      return
    }
    const nextMin = clampLinePhotoMin(trimmed)
    onChange({
      minPhotos: Math.min(nextMin, MEAS_PICTURE_MAX),
      maxPhotos: Math.max(max, nextMin === 0 ? 1 : nextMin),
    })
    setMinDraft(String(nextMin))
  }

  return (
    <>
      <label className="itp-master-global-field" onClick={stop}>
        <span>Pictures required</span>
        <input
          type="number"
          min={0}
          max={max}
          step={1}
          value={minFocused ? minDraft : String(min)}
          aria-label="Pictures required (0 = optional)"
          title="0 means photos are optional — techs can still attach up to the Allow up to limit"
          onClick={stop}
          onFocus={() => {
            setMinFocused(true)
            setMinDraft(String(min))
          }}
          onBlur={() => {
            commitMinDraft(minDraft)
            setMinFocused(false)
          }}
          onChange={(e) => {
            const raw = e.target.value
            setMinDraft(raw)
            // Commit immediately for spinner / valid numbers, including 0.
            if (raw.trim() === '') return
            const asNum = Number(raw)
            if (!Number.isFinite(asNum) || asNum < 0) return
            commitMinDraft(raw)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitMinDraft(minDraft)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </label>
      <label className="itp-master-global-field" onClick={stop}>
        <span>Allow up to</span>
        <input
          type="number"
          min={1}
          max={MEAS_PICTURE_MAX}
          value={max}
          aria-label="Allow up to"
          onClick={stop}
          onChange={(e) => {
            const nextMax = clampLinePhotoMax(e.target.value, min)
            onChange({
              minPhotos: Math.min(min, nextMax),
              maxPhotos: nextMax,
            })
          }}
        />
      </label>
    </>
  )
}
