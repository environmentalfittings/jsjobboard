import { useEffect, useId, useRef, useState } from 'react'
import {
  formatGaugeCalibrationStatusLabel,
  formatTestGaugeOptionLabel,
  getGaugeCalibrationStatus,
} from '../../lib/testGaugeRegistry'
import type { TestGauge } from '../../types/testGauge'

export type GaugeSelection = {
  gaugeId: string
  gauge: string
}

type TestGaugeSelectProps = {
  id: string
  label?: string
  options: TestGauge[]
  value: GaugeSelection
  onChange: (next: GaugeSelection) => void
}

function statusBadgeShort(status: ReturnType<typeof getGaugeCalibrationStatus>): string {
  if (status === 'expiring') return 'Expiring soon'
  if (status === 'due') return 'Overdue'
  if (status === 'critical') return 'Expired'
  return ''
}

export function TestGaugeSelect({ id, label = 'Test Gauge #', options, value, onChange }: TestGaugeSelectProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = options.find((g) => g.id === value.gaugeId) ?? options.find((g) => g.gauge_number === value.gauge)
  const status = selected ? getGaugeCalibrationStatus(selected) : 'ok'

  const triggerLabel = selected
    ? formatTestGaugeOptionLabel(selected)
    : value.gauge && !value.gaugeId
      ? `${value.gauge} (saved entry)`
      : 'Select gauge…'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const pickGauge = (gauge: TestGauge | null) => {
    if (!gauge) {
      onChange({ gaugeId: '', gauge: '' })
    } else {
      onChange({ gaugeId: gauge.id, gauge: gauge.gauge_number })
    }
    setOpen(false)
  }

  const pickLegacy = () => {
    if (value.gauge) onChange({ gaugeId: '', gauge: value.gauge })
    setOpen(false)
  }

  return (
    <div
      className={`test-gauge-select${status !== 'ok' ? ` test-gauge-select--${status}` : ''}`}
      ref={rootRef}
    >
      <span className="test-gauge-select-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="test-gauge-combobox">
        <button
          type="button"
          id={id}
          className={`test-gauge-combobox-trigger${open ? ' test-gauge-combobox-trigger--open' : ''}`}
          aria-labelledby={`${id}-label`}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="test-gauge-combobox-trigger-text">{triggerLabel}</span>
          <span className="test-gauge-combobox-caret" aria-hidden>
            ▾
          </span>
        </button>

        {open ? (
          <ul className="test-gauge-combobox-menu" id={listId} role="listbox" aria-labelledby={`${id}-label`}>
            <li role="none">
              <button
                type="button"
                role="option"
                className={`test-gauge-combobox-option${!value.gaugeId && !value.gauge ? ' test-gauge-combobox-option--selected' : ''}`}
                aria-selected={!value.gaugeId && !value.gauge}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickGauge(null)}
              >
                <span className="test-gauge-combobox-option-label">Select gauge…</span>
              </button>
            </li>

            {value.gauge && !value.gaugeId ? (
              <li role="none">
                <button
                  type="button"
                  role="option"
                  className="test-gauge-combobox-option test-gauge-combobox-option--selected"
                  aria-selected
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickLegacy()}
                >
                  <span className="test-gauge-combobox-option-label">{value.gauge} (saved entry)</span>
                </button>
              </li>
            ) : null}

            {options.map((gauge) => {
              const optionStatus = getGaugeCalibrationStatus(gauge)
              const statusLabel = formatGaugeCalibrationStatusLabel(gauge)
              const isSelected = value.gaugeId === gauge.id
              return (
                <li key={gauge.id} role="none">
                  <button
                    type="button"
                    role="option"
                    className={`test-gauge-combobox-option test-gauge-combobox-option--${optionStatus}${isSelected ? ' test-gauge-combobox-option--selected' : ''}`}
                    aria-selected={isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickGauge(gauge)}
                  >
                    <span className="test-gauge-combobox-option-label">{formatTestGaugeOptionLabel(gauge)}</span>
                    {statusLabel ? (
                      <span className={`test-gauge-combobox-status test-gauge-combobox-status--${optionStatus}`}>
                        {statusBadgeShort(optionStatus) || statusLabel}
                      </span>
                    ) : gauge.next_calibration_date ? (
                      <span className="test-gauge-combobox-status test-gauge-combobox-status--ok">
                        Due {gauge.next_calibration_date}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      {selected?.next_calibration_date ? (
        <p className={`test-gauge-cal-note test-gauge-cal-note--${status}`}>
          Next calibration: {selected.next_calibration_date}
          {status === 'expiring' ? ` (${formatGaugeCalibrationStatusLabel(selected)})` : null}
          {status === 'due' ? ' (overdue)' : null}
          {status === 'critical' ? ` (${formatGaugeCalibrationStatusLabel(selected)})` : null}
        </p>
      ) : null}
    </div>
  )
}
