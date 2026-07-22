import { useEffect, useId, useRef, useState } from 'react'
import {
  formatGaugeCalibrationDueDate,
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
  placeholder?: string
  options: TestGauge[]
  value: GaugeSelection
  onChange: (next: GaugeSelection) => void
}

function isExpiredStatus(status: ReturnType<typeof getGaugeCalibrationStatus>) {
  return status === 'critical' || status === 'due'
}

export function TestGaugeSelect({
  id,
  label = 'Test Gauge #',
  placeholder = 'Select gauge…',
  options,
  value,
  onChange,
}: TestGaugeSelectProps) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = options.find((g) => g.id === value.gaugeId) ?? options.find((g) => g.gauge_number === value.gauge)
  const status = selected ? getGaugeCalibrationStatus(selected) : 'ok'
  const selectStatusClass = isExpiredStatus(status) ? 'critical' : status

  const triggerLabel = selected
    ? formatTestGaugeOptionLabel(selected)
    : value.gauge && !value.gaugeId
      ? `${value.gauge} (saved entry)`
      : placeholder

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
      className={`test-gauge-select${selectStatusClass !== 'ok' ? ` test-gauge-select--${selectStatusClass}` : ''}`}
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
          {isExpiredStatus(status) ? (
            <span className="test-gauge-expired-badge test-gauge-expired-badge--inline" aria-hidden>
              Expired
            </span>
          ) : null}
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
                <span className="test-gauge-combobox-option-label">{placeholder}</span>
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

            {options.length === 0 ? (
              <li className="test-gauge-combobox-empty" role="presentation">
                No matching gauges in the registry.
              </li>
            ) : null}

            {options.map((gauge) => {
              const optionStatus = getGaugeCalibrationStatus(gauge)
              const optionClass = isExpiredStatus(optionStatus) ? 'critical' : optionStatus
              const dueLabel = formatGaugeCalibrationDueDate(gauge)
              const statusLabel = formatGaugeCalibrationStatusLabel(gauge)
              const isSelected = value.gaugeId === gauge.id
              return (
                <li key={gauge.id} role="none">
                  <button
                    type="button"
                    role="option"
                    className={`test-gauge-combobox-option test-gauge-combobox-option--${optionClass}${isSelected ? ' test-gauge-combobox-option--selected' : ''}`}
                    aria-selected={isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickGauge(gauge)}
                  >
                    <span className="test-gauge-combobox-option-main">
                      <span className="test-gauge-combobox-option-label">{formatTestGaugeOptionLabel(gauge)}</span>
                      {isExpiredStatus(optionStatus) ? (
                        <span className="test-gauge-expired-badge">Expired</span>
                      ) : null}
                    </span>
                    {dueLabel ? (
                      <span className={`test-gauge-combobox-due test-gauge-combobox-due--${optionClass}`}>
                        Calibration due: {dueLabel}
                        {statusLabel && optionStatus === 'expiring' ? ` · ${statusLabel}` : null}
                      </span>
                    ) : (
                      <span className="test-gauge-combobox-due test-gauge-combobox-due--ok">
                        No calibration due date
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      {selected?.next_calibration_date ? (
        <p className={`test-gauge-cal-note test-gauge-cal-note--${selectStatusClass}`}>
          Calibration due: {formatGaugeCalibrationDueDate(selected)}
          {status === 'expiring' ? ` (${formatGaugeCalibrationStatusLabel(selected)})` : null}
          {isExpiredStatus(status) ? ` (${formatGaugeCalibrationStatusLabel(selected)})` : null}
        </p>
      ) : null}
    </div>
  )
}
