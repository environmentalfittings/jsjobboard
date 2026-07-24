import { useEffect, useMemo, useState } from 'react'
import {
  completeToolRecalibration,
  loadToolCalibrationEvents,
  loadToolCalibrations,
} from '../lib/toolCalibrationRegistry'
import { openToolCalibrationCertificatePrint } from '../lib/toolCalibrationCertificatePrint'
import {
  blankMeasurementsFromPoints,
  CALIBRATION_FREQUENCY_OPTIONS,
  nextDueFromFrequency,
  resolveSopCheckPoints,
  todayIsoDate,
  type CalibrationFrequency,
  type ToolCalibrationMeasurement,
} from '../lib/toolCalibrationSopPoints'
import { supabase } from '../lib/supabase'
import type { Technician } from '../types'
import type { ToolCalibration } from '../types/toolCalibration'
import type { ToolCalibrationEvent, ToolCalibrationEventResult } from '../types/toolCalibrationEvent'

type Tab = 'calibrate' | 'history'

type Props = {
  tool: ToolCalibration
  onClose: () => void
  onSaved: () => void
  showToast: (message: string) => void
}

function formatShortDate(value: string | null | undefined) {
  if (!value?.trim()) return '—'
  const parsed = new Date(`${value.trim()}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value.trim()
  return parsed.toLocaleDateString()
}

function isGaugeBlockStandard(row: ToolCalibration): boolean {
  const hay = `${row.category ?? ''} ${row.tool_type ?? ''} ${row.model ?? ''}`.toLowerCase()
  return (
    (row.category ?? '').trim().toLowerCase() === 'gauge block standard' ||
    /gauge\s*block/.test(hay)
  )
}

function gaugeBlockOptionLabel(row: ToolCalibration): string {
  const id = row.js_id?.trim() || `#${row.id}`
  const name = row.model?.trim() || row.tool_type?.trim() || 'Gauge block set'
  const sn = row.serial_number?.trim() || 'no SN'
  const due = row.expiration_date?.trim() || 'no due date'
  return `${id} · ${name} · SN ${sn} · due ${due}`
}

function isExpiredDate(value: string | null | undefined, today = new Date()): boolean {
  if (!value?.trim()) return false
  const due = new Date(`${value.trim()}T12:00:00`)
  if (Number.isNaN(due.getTime())) return false
  const t = new Date(today)
  t.setHours(12, 0, 0, 0)
  return due.getTime() < t.getTime()
}

export function ToolRecalibrateModal({ tool, onClose, onSaved, showToast }: Props) {
  const template = useMemo(() => resolveSopCheckPoints(tool), [tool])
  const [tab, setTab] = useState<Tab>('calibrate')
  const [calibratedAt, setCalibratedAt] = useState(todayIsoDate())
  const [frequency, setFrequency] = useState<CalibrationFrequency>('annually')
  const [nextDueAt, setNextDueAt] = useState(() => nextDueFromFrequency(todayIsoDate(), 'annually'))
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [techniciansLoading, setTechniciansLoading] = useState(true)
  const [signedOffAt, setSignedOffAt] = useState(todayIsoDate())
  const [ambientTempF, setAmbientTempF] = useState('70')
  const [gaugeBlocks, setGaugeBlocks] = useState<ToolCalibration[]>([])
  const [gaugeBlockId, setGaugeBlockId] = useState<number | ''>('')
  const [gaugeBlocksLoading, setGaugeBlocksLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [measurements, setMeasurements] = useState<ToolCalibrationMeasurement[]>(() =>
    blankMeasurementsFromPoints(template.points),
  )
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<ToolCalibrationEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const selectedGaugeBlock = useMemo(
    () => (gaugeBlockId === '' ? null : (gaugeBlocks.find((row) => row.id === gaugeBlockId) ?? null)),
    [gaugeBlockId, gaugeBlocks],
  )
  const selectedTechnician = useMemo(
    () => (technicianId === '' ? null : (technicians.find((t) => t.id === technicianId) ?? null)),
    [technicianId, technicians],
  )
  const gaugeBlockSerial = selectedGaugeBlock?.serial_number?.trim() || ''
  const gaugeBlockNextDue = selectedGaugeBlock?.expiration_date?.trim() || ''
  const gaugeBlockExpired = isExpiredDate(gaugeBlockNextDue)

  useEffect(() => {
    setMeasurements(blankMeasurementsFromPoints(template.points))
  }, [template])

  useEffect(() => {
    setNextDueAt(nextDueFromFrequency(calibratedAt, frequency))
  }, [calibratedAt, frequency])

  useEffect(() => {
    setSignedOffAt(calibratedAt)
  }, [calibratedAt])

  useEffect(() => {
    let cancelled = false
    setTechniciansLoading(true)
    void supabase
      .from('technicians')
      .select('id,name,employee_id,work_cell_specialties,group_team,active,created_at,updated_at')
      .eq('active', true)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        setTechniciansLoading(false)
        if (error) {
          showToast(error.message)
          setTechnicians([])
          return
        }
        setTechnicians((data as Technician[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    setGaugeBlocksLoading(true)
    void loadToolCalibrations(true)
      .then((rows) => {
        if (cancelled) return
        const blocks = rows
          .filter(isGaugeBlockStandard)
          .filter((row) => row.status === 'active' || row.active)
          .sort((a, b) =>
            (a.js_id ?? '').localeCompare(b.js_id ?? '', undefined, {
              numeric: true,
              sensitivity: 'base',
            }),
          )
        setGaugeBlocks(blocks)
        if (blocks.length > 0) setGaugeBlockId(blocks[0].id)
      })
      .catch((error) => {
        if (cancelled) return
        showToast(error instanceof Error ? error.message : 'Could not load gauge block sets')
        setGaugeBlocks([])
      })
      .finally(() => {
        if (!cancelled) setGaugeBlocksLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    if (tab !== 'history') return
    let cancelled = false
    setHistoryLoading(true)
    void loadToolCalibrationEvents(tool.id).then(({ events, error }) => {
      if (cancelled) return
      setHistoryLoading(false)
      if (error) {
        showToast(error)
        setHistory([])
        return
      }
      setHistory(events)
    })
    return () => {
      cancelled = true
    }
  }, [tab, tool.id, showToast])

  const anyFailed = measurements.some((m) => !m.passed)
  const result: ToolCalibrationEventResult = anyFailed ? 'fail' : 'pass'

  const updateMeasurement = (pointId: string, patch: Partial<ToolCalibrationMeasurement>) => {
    setMeasurements((prev) => prev.map((row) => (row.pointId === pointId ? { ...row, ...patch } : row)))
  }

  const parseTemp = (): number | null => {
    const trimmed = ambientTempF.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  const save = async (printAfter: boolean) => {
    const temp = parseTemp()
    if (ambientTempF.trim() && temp === null) {
      showToast('Ambient temperature must be a number (°F)')
      return
    }
    if (temp != null && (temp < 68 || temp > 73)) {
      const ok = window.confirm(
        `SOP 2010 specifies 68–73 °F. Entered temperature is ${temp} °F. Continue anyway?`,
      )
      if (!ok) return
    }
    if (!selectedTechnician) {
      showToast('Select the technician who signed off')
      return
    }
    if (!signedOffAt.trim()) {
      showToast('Enter the sign-off date')
      return
    }
    if (!selectedGaugeBlock || !gaugeBlockSerial) {
      showToast('Select the gauge block set used for this calibration')
      return
    }
    if (!gaugeBlockNextDue) {
      showToast('Selected gauge block set is missing a next due date — update it on the tool log first')
      return
    }
    if (gaugeBlockExpired) {
      const ok = window.confirm(
        `Gauge block set SN ${gaugeBlockSerial} is past due (${gaugeBlockNextDue}). Continue anyway?`,
      )
      if (!ok) return
    }
    if (result === 'fail' && !notes.trim()) {
      showToast('Add a note for failed / Non-Compliance calibrations')
      return
    }

    setSaving(true)
    const { event, error } = await completeToolRecalibration(tool, {
      calibratedAt,
      nextDueAt,
      technicianId: selectedTechnician.id,
      technicianName: selectedTechnician.name,
      signedOffAt,
      ambientTempF: temp,
      gaugeBlockSerial,
      gaugeBlockNextDue,
      result,
      notes,
      measurements,
    })
    setSaving(false)

    if (error && !event) {
      showToast(error)
      return
    }
    if (error) showToast(error)
    else
      showToast(
        result === 'pass' ? 'Calibration recorded' : 'Failed calibration recorded — tool out of service',
      )

    if (event && printAfter) {
      openToolCalibrationCertificatePrint(tool, event)
    }
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide tool-recal-modal"
        role="dialog"
        aria-labelledby="tool-recal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h2 id="tool-recal-title">Recalibrate — {tool.js_id?.trim() || tool.serial_number || 'Tool'}</h2>
            <p className="modal-meta">
              {tool.model ?? tool.tool_type ?? '—'} · {template.title}
            </p>
          </div>
          <button type="button" className="modal-window-toggle" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tool-recal-tabs">
          <button
            type="button"
            className={`tool-recal-tab${tab === 'calibrate' ? ' is-active' : ''}`}
            onClick={() => setTab('calibrate')}
          >
            New calibration
          </button>
          <button
            type="button"
            className={`tool-recal-tab${tab === 'history' ? ' is-active' : ''}`}
            onClick={() => setTab('history')}
          >
            History / certificates
          </button>
        </div>

        {tab === 'calibrate' ? (
          <>
            <div className="tool-recal-meta-grid">
              <label>
                Calibration date
                <input
                  type="date"
                  value={calibratedAt}
                  onChange={(e) => setCalibratedAt(e.target.value)}
                />
              </label>
              <label>
                Calibration frequency
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as CalibrationFrequency)}
                >
                  {CALIBRATION_FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Next due
                <input type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
              </label>
              <label>
                Technician
                <select
                  value={technicianId === '' ? '' : String(technicianId)}
                  disabled={techniciansLoading}
                  onChange={(e) => {
                    const value = e.target.value
                    setTechnicianId(value ? Number(value) : '')
                  }}
                >
                  <option value="">{techniciansLoading ? 'Loading…' : 'Select technician…'}</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sign-off date
                <input type="date" value={signedOffAt} onChange={(e) => setSignedOffAt(e.target.value)} />
              </label>
              <label>
                Ambient temp (°F)
                <input
                  type="text"
                  inputMode="decimal"
                  value={ambientTempF}
                  placeholder="68–73"
                  onChange={(e) => setAmbientTempF(e.target.value)}
                />
              </label>
              <label className="tool-recal-gauge-block-field">
                Gauge block set
                <select
                  value={gaugeBlockId === '' ? '' : String(gaugeBlockId)}
                  disabled={gaugeBlocksLoading || gaugeBlocks.length === 0}
                  onChange={(e) => {
                    const value = e.target.value
                    setGaugeBlockId(value ? Number(value) : '')
                  }}
                >
                  {gaugeBlocksLoading ? (
                    <option value="">Loading…</option>
                  ) : gaugeBlocks.length === 0 ? (
                    <option value="">No gauge block standards on tool log</option>
                  ) : (
                    <>
                      <option value="">Select gauge block set…</option>
                      {gaugeBlocks.map((row) => (
                        <option key={row.id} value={row.id}>
                          {gaugeBlockOptionLabel(row)}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <label>
                Gauge block set SN
                <input type="text" value={gaugeBlockSerial} readOnly placeholder="From selected set" />
              </label>
              <label>
                Gauge block set next due
                <input type="date" value={gaugeBlockNextDue} readOnly />
              </label>
            </div>

            {selectedGaugeBlock && gaugeBlockExpired ? (
              <p className="tool-recal-gauge-warn">
                Selected gauge block set is expired ({formatShortDate(gaugeBlockNextDue)}). Recalibrate it on
                the tool log before using it as a standard when possible.
              </p>
            ) : null}

            <p className="tool-recal-result">
              Overall result:{' '}
              <strong className={result === 'pass' ? 'ok' : 'bad'}>
                {result === 'pass' ? 'PASS' : 'FAIL — Non-Compliance'}
              </strong>{' '}
              (check Pass on each verified row)
            </p>

            <div className="tool-recal-table-wrap">
              <table className="tool-recal-table">
                <thead>
                  <tr>
                    <th>Check point</th>
                    <th>As found</th>
                    <th>As left</th>
                    <th>Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((row) => (
                    <tr key={row.pointId} className={row.passed ? undefined : 'is-fail'}>
                      <td>
                        <div className="tool-recal-point-label">{row.label}</div>
                        {row.nominal ? <div className="tool-recal-nominal">{row.nominal}</div> : null}
                        <div className="tool-recal-kind">
                          {row.kind === 'measurement'
                            ? 'Reading'
                            : row.kind === 'visual'
                              ? 'Visual'
                              : 'Pass / fail'}
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.asFound}
                          placeholder={row.kind === 'measurement' ? 'Reading' : 'Notes'}
                          onChange={(e) => updateMeasurement(row.pointId, { asFound: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={row.asLeft}
                          placeholder={row.kind === 'measurement' ? 'Reading' : 'Notes'}
                          onChange={(e) => updateMeasurement(row.pointId, { asLeft: e.target.value })}
                        />
                      </td>
                      <td className="tool-recal-pass-cell">
                        <input
                          type="checkbox"
                          checked={row.passed}
                          aria-label={`Pass ${row.label}`}
                          onChange={(e) => updateMeasurement(row.pointId, { passed: e.target.checked })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="tool-recal-notes">
              Notes{result === 'fail' ? ' (required for fail)' : ''}
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  result === 'fail'
                    ? 'Non-Compliance details…'
                    : 'Optional notes (standards used, adjustments, etc.)'
                }
              />
            </label>

            <div className="modal-details-actions tool-recal-actions">
              <button
                type="button"
                className="button-primary"
                disabled={saving}
                onClick={() => void save(true)}
              >
                {saving ? 'Saving…' : 'Save & print certificate'}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={saving}
                onClick={() => void save(false)}
              >
                Save only
              </button>
              <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="tool-recal-history">
            {historyLoading ? (
              <p className="placeholder-copy">Loading history…</p>
            ) : history.length === 0 ? (
              <p className="placeholder-copy">No calibration events recorded yet for this tool.</p>
            ) : (
              <table className="tool-recal-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Next due</th>
                    <th>Technician</th>
                    <th>Signed off</th>
                    <th>Result</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.map((event) => (
                    <tr key={event.id}>
                      <td>{formatShortDate(event.calibrated_at)}</td>
                      <td>{formatShortDate(event.next_due_at)}</td>
                      <td>{event.technician_name || event.tech_initials || '—'}</td>
                      <td>{formatShortDate(event.signed_off_at || event.calibrated_at)}</td>
                      <td className={event.result === 'pass' ? 'ok' : 'bad'}>
                        {event.result === 'pass' ? 'Pass' : 'Fail'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => openToolCalibrationCertificatePrint(tool, event)}
                        >
                          Print certificate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
