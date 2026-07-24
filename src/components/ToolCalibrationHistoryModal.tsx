import { useEffect, useState } from 'react'
import {
  loadToolCalibrationEvents,
  toolCalibrationCertificateUrl,
} from '../lib/toolCalibrationRegistry'
import { openToolCalibrationCertificatePrint } from '../lib/toolCalibrationCertificatePrint'
import type { ToolCalibration } from '../types/toolCalibration'
import type { ToolCalibrationEvent } from '../types/toolCalibrationEvent'

type Props = {
  tool: ToolCalibration
  onClose: () => void
  showToast: (message: string) => void
}

function formatShortDate(value: string | null | undefined) {
  if (!value?.trim()) return '—'
  const parsed = new Date(`${value.trim()}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value.trim()
  return parsed.toLocaleDateString()
}

export function ToolCalibrationHistoryModal({ tool, onClose, showToast }: Props) {
  const [history, setHistory] = useState<ToolCalibrationEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadToolCalibrationEvents(tool.id).then(({ events, error }) => {
      if (cancelled) return
      setLoading(false)
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
  }, [tool.id, showToast])

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card tool-external-cert-modal"
        role="dialog"
        aria-labelledby="tool-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-with-close">
          <div className="modal-header-text">
            <h2 id="tool-history-title">
              Calibration history — {tool.js_id?.trim() || tool.serial_number || 'Tool'}
            </h2>
            <p className="modal-meta">
              {tool.category ?? '—'} · {tool.model ?? tool.tool_type ?? '—'}
            </p>
          </div>
          <button type="button" className="modal-window-toggle" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="placeholder-copy resources-hint">
          Prior calibrations are archived automatically when you recalibrate, upload a new certificate, or
          change calibration dates.
        </p>

        <div className="tool-recal-history">
          {loading ? (
            <p className="placeholder-copy">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="placeholder-copy">No archived calibration records yet for this tool.</p>
          ) : (
            <table className="tool-recal-table">
              <thead>
                <tr>
                  <th>Calibrated</th>
                  <th>Due</th>
                  <th>Cert #</th>
                  <th>Technician</th>
                  <th>Type</th>
                  <th>File</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((event) => {
                  const url = toolCalibrationCertificateUrl(event.certificate_storage_path)
                  const canPrint =
                    /SOP 2010/i.test(event.procedure_ref) && !/archived/i.test(event.procedure_ref)
                  return (
                    <tr key={event.id}>
                      <td>{formatShortDate(event.calibrated_at)}</td>
                      <td>{formatShortDate(event.next_due_at)}</td>
                      <td>{event.certificate_number?.trim() || '—'}</td>
                      <td>{event.technician_name || event.tech_initials || '—'}</td>
                      <td>{event.procedure_ref}</td>
                      <td>
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer">
                            {event.certificate_file_name ?? 'View'}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {canPrint ? (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => openToolCalibrationCertificatePrint(tool, event)}
                          >
                            Print
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-details-actions tool-recal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
