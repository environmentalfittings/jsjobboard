import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadToolCalibrationEvents,
  recordExternalToolCalibration,
  toolCalibrationCertificateUrl,
} from '../lib/toolCalibrationRegistry'
import {
  CALIBRATION_FREQUENCY_OPTIONS,
  nextDueFromFrequency,
  todayIsoDate,
  type CalibrationFrequency,
} from '../lib/toolCalibrationSopPoints'
import { supabase } from '../lib/supabase'
import type { Technician } from '../types'
import type { ToolCalibration } from '../types/toolCalibration'
import type { ToolCalibrationEvent } from '../types/toolCalibrationEvent'

type Tab = 'new' | 'history'

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

export function ToolExternalCertModal({ tool, onClose, onSaved, showToast }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('new')
  const [calibratedAt, setCalibratedAt] = useState(todayIsoDate())
  const [frequency, setFrequency] = useState<CalibrationFrequency>('annually')
  const [nextDueAt, setNextDueAt] = useState(() => nextDueFromFrequency(todayIsoDate(), 'annually'))
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [techniciansLoading, setTechniciansLoading] = useState(true)
  const [signedOffAt, setSignedOffAt] = useState(todayIsoDate())
  const [certificateNumber, setCertificateNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<ToolCalibrationEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const selectedTechnician = useMemo(
    () => (technicianId === '' ? null : (technicians.find((t) => t.id === technicianId) ?? null)),
    [technicianId, technicians],
  )

  const willArchive = Boolean(
    tool.calibration_date ||
      tool.expiration_date ||
      tool.certificate_storage_path ||
      tool.certificate_number,
  )

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

  const save = async () => {
    if (!file) {
      showToast('Choose the calibration certificate PDF or image')
      return
    }
    if (!certificateNumber.trim()) {
      showToast('Enter the certificate number')
      return
    }
    if (!calibratedAt.trim() || !nextDueAt.trim()) {
      showToast('Calibration date and next due are required')
      return
    }
    if (!selectedTechnician) {
      showToast('Select the technician who signed off')
      return
    }
    if (!signedOffAt.trim()) {
      showToast('Enter the sign-off date')
      return
    }

    setSaving(true)
    const { error } = await recordExternalToolCalibration(tool, {
      calibratedAt,
      nextDueAt,
      technicianId: selectedTechnician.id,
      technicianName: selectedTechnician.name,
      signedOffAt,
      certificateNumber,
      notes,
      file,
    })
    setSaving(false)

    if (error) {
      showToast(error)
      return
    }
    showToast(
      willArchive
        ? 'Prior calibration archived and new certificate saved'
        : 'External calibration certificate saved',
    )
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card tool-external-cert-modal"
        role="dialog"
        aria-labelledby="tool-ext-cert-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h2 id="tool-ext-cert-title">
              Upload certificate — {tool.js_id?.trim() || tool.serial_number || 'Tool'}
            </h2>
            <p className="modal-meta">
              {tool.category ?? 'External calibration'} · {tool.model ?? tool.tool_type ?? '—'}
            </p>
          </div>
          <button type="button" className="modal-window-toggle" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tool-recal-tabs">
          <button
            type="button"
            className={`tool-recal-tab${tab === 'new' ? ' is-active' : ''}`}
            onClick={() => setTab('new')}
          >
            New certificate
          </button>
          <button
            type="button"
            className={`tool-recal-tab${tab === 'history' ? ' is-active' : ''}`}
            onClick={() => setTab('history')}
          >
            Archive / history
          </button>
        </div>

        {tab === 'new' ? (
          <>
            <p className="placeholder-copy resources-hint">
              Enter the new lab certificate details. Uploading archives the current calibration dates and
              certificate so they remain available under Archive / history.
            </p>

            {willArchive ? (
              <p className="tool-recal-gauge-warn">
                Current record will be archived
                {tool.certificate_number ? ` (cert # ${tool.certificate_number})` : ''}
                {tool.calibration_date ? ` · calibrated ${formatShortDate(tool.calibration_date)}` : ''}
                {tool.expiration_date ? ` · due ${formatShortDate(tool.expiration_date)}` : ''}.
              </p>
            ) : null}

            <div className="tool-recal-meta-grid">
              <label>
                Certificate number
                <input
                  type="text"
                  value={certificateNumber}
                  placeholder="Lab certificate #"
                  onChange={(e) => setCertificateNumber(e.target.value)}
                />
              </label>
              <label>
                Calibration date
                <input type="date" value={calibratedAt} onChange={(e) => setCalibratedAt(e.target.value)} />
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
              <label className="tool-recal-gauge-block-field">
                Certificate file
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <label className="tool-recal-notes">
              Notes
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — lab name, remarks, etc."
              />
            </label>

            <div className="modal-details-actions tool-recal-actions">
              <button type="button" className="button-primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : willArchive ? 'Archive prior & save new' : 'Save certificate'}
              </button>
              <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="tool-recal-history">
            {historyLoading ? (
              <p className="placeholder-copy">Loading archive…</p>
            ) : history.length === 0 ? (
              <p className="placeholder-copy">No archived calibration certificates yet for this tool.</p>
            ) : (
              <table className="tool-recal-table">
                <thead>
                  <tr>
                    <th>Calibrated</th>
                    <th>Due</th>
                    <th>Cert #</th>
                    <th>Technician</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((event) => {
                    const url = toolCalibrationCertificateUrl(event.certificate_storage_path)
                    return (
                      <tr key={event.id}>
                        <td>{formatShortDate(event.calibrated_at)}</td>
                        <td>{formatShortDate(event.next_due_at)}</td>
                        <td>{event.certificate_number?.trim() || '—'}</td>
                        <td>{event.technician_name || event.tech_initials || '—'}</td>
                        <td>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer">
                              {event.certificate_file_name ?? 'View'}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
