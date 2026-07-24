import { useEffect, useMemo, useRef, useState } from 'react'
import { recordExternalToolCalibration } from '../lib/toolCalibrationRegistry'
import {
  CALIBRATION_FREQUENCY_OPTIONS,
  nextDueFromFrequency,
  todayIsoDate,
  type CalibrationFrequency,
} from '../lib/toolCalibrationSopPoints'
import { supabase } from '../lib/supabase'
import type { Technician } from '../types'
import type { ToolCalibration } from '../types/toolCalibration'

type Props = {
  tool: ToolCalibration
  onClose: () => void
  onSaved: () => void
  showToast: (message: string) => void
}

export function ToolExternalCertModal({ tool, onClose, onSaved, showToast }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [calibratedAt, setCalibratedAt] = useState(todayIsoDate())
  const [frequency, setFrequency] = useState<CalibrationFrequency>('annually')
  const [nextDueAt, setNextDueAt] = useState(() => nextDueFromFrequency(todayIsoDate(), 'annually'))
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [techniciansLoading, setTechniciansLoading] = useState(true)
  const [signedOffAt, setSignedOffAt] = useState(todayIsoDate())
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedTechnician = useMemo(
    () => (technicianId === '' ? null : (technicians.find((t) => t.id === technicianId) ?? null)),
    [technicianId, technicians],
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

  const save = async () => {
    if (!file) {
      showToast('Choose the calibration certificate PDF or image')
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
      notes,
      file,
    })
    setSaving(false)

    if (error) {
      showToast(error)
      return
    }
    showToast('External calibration certificate saved')
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

        <p className="placeholder-copy resources-hint">
          Torque wrenches and deadweight testers are calibrated by an outside lab. Enter the certificate dates,
          technician sign-off, and upload the PDF or image.
        </p>

        <div className="tool-recal-meta-grid">
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
            placeholder="Optional — lab name, cert number, etc."
          />
        </label>

        <div className="modal-details-actions tool-recal-actions">
          <button type="button" className="button-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save certificate'}
          </button>
          <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
