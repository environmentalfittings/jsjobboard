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

export function ItpPhotoMinMaxFields({ minPhotos, maxPhotos, onChange, stopClick }: Props) {
  const min = clampLinePhotoMin(minPhotos)
  const max = clampLinePhotoMax(maxPhotos, min)
  const stop = stopClick
    ? (event: { stopPropagation: () => void }) => event.stopPropagation()
    : undefined

  return (
    <>
      <label className="itp-master-global-field" onClick={stop}>
        <span>Pictures required</span>
        <input
          type="number"
          min={1}
          max={max}
          value={min}
          aria-label="Pictures required"
          onClick={stop}
          onChange={(e) => {
            const nextMin = clampLinePhotoMin(e.target.value)
            onChange({
              minPhotos: Math.min(nextMin, MEAS_PICTURE_MAX),
              maxPhotos: Math.max(max, nextMin),
            })
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
            const nextMax = clampLinePhotoMax(e.target.value, 1)
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
