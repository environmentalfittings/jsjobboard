import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import {
  attachTestGaugeCertificate,
  createTestGauge,
  deleteTestGauge,
  getGaugeCalibrationStatus,
  formatGaugeCalibrationAlert,
  loadTestGauges,
  removeTestGaugeCertificate,
  testGaugeCertificateUrl,
  updateTestGauge,
} from '../lib/testGaugeRegistry'
import { emptyTestGaugeForm, testGaugeToForm, type TestGauge, type TestGaugeFormState } from '../types/testGauge'

export function TestGaugesPanel() {
  const { showToast } = useToast()
  const certInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<TestGauge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TestGaugeFormState>(emptyTestGaugeForm())
  const [pendingCertGaugeId, setPendingCertGaugeId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await loadTestGauges(true))
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load test gauges')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyTestGaugeForm())
  }

  const startEdit = (row: TestGauge) => {
    setEditingId(row.id)
    setForm(testGaugeToForm(row))
  }

  const saveGauge = async () => {
    setSaving(true)
    if (editingId) {
      const { error } = await updateTestGauge(editingId, form)
      setSaving(false)
      if (error) {
        showToast(error)
        return
      }
      showToast('Test gauge updated')
    } else {
      const { row, error } = await createTestGauge(form)
      setSaving(false)
      if (error || !row) {
        showToast(error ?? 'Could not save gauge')
        return
      }
      showToast('Test gauge added')
      if (pendingCertGaugeId === 'new' && certInputRef.current?.files?.[0]) {
        setUploadingId(row.id)
        const { error: certError } = await attachTestGaugeCertificate(row, certInputRef.current.files[0])
        setUploadingId(null)
        if (certError) showToast(certError)
        if (certInputRef.current) certInputRef.current.value = ''
      }
    }
    resetForm()
    setPendingCertGaugeId(null)
    await reload()
  }

  const removeGauge = async (row: TestGauge) => {
    if (!window.confirm(`Delete gauge ${row.gauge_number}?`)) return
    const { error } = await deleteTestGauge(row)
    if (error) {
      showToast(error)
      return
    }
    if (editingId === row.id) resetForm()
    showToast('Test gauge deleted')
    await reload()
  }

  const uploadCert = async (row: TestGauge, file: File | undefined) => {
    if (!file) return
    setUploadingId(row.id)
    const { error } = await attachTestGaugeCertificate(row, file)
    setUploadingId(null)
    if (error) {
      showToast(error)
      return
    }
    showToast('Calibration certificate uploaded')
    if (editingId === row.id) await reload()
    else await reload()
  }

  const clearCert = async (row: TestGauge) => {
    if (!window.confirm('Remove calibration certificate?')) return
    const { error } = await removeTestGaugeCertificate(row)
    if (error) {
      showToast(error)
      return
    }
    showToast('Certificate removed')
    await reload()
  }

  return (
    <section className="dashboard-panel admin-lists-panel">
      <h3>Test gauges</h3>
      <p className="placeholder-copy resources-hint">
        Register calibrated test gauges for the test log. Technicians pick from this list when recording low, high,
        shell, and helium tests.
      </p>

      <div className="test-gauge-admin-form">
        <h4>{editingId ? 'Edit gauge' : 'Add gauge'}</h4>
        <div className="test-gauge-admin-grid">
          <label>
            Gauge number
            <input
              type="text"
              value={form.gauge_number}
              onChange={(e) => setForm((f) => ({ ...f, gauge_number: e.target.value }))}
              placeholder="e.g. JS284"
            />
          </label>
          <label>
            Manufacturer
            <input
              type="text"
              value={form.manufacturer}
              onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
            />
          </label>
          <label>
            Type
            <input
              type="text"
              value={form.gauge_type}
              onChange={(e) => setForm((f) => ({ ...f, gauge_type: e.target.value }))}
              placeholder="e.g. Pressure gauge"
            />
          </label>
          <label>
            Last calibration date
            <input
              type="date"
              value={form.last_calibration_date}
              onChange={(e) => setForm((f) => ({ ...f, last_calibration_date: e.target.value }))}
            />
          </label>
          <label>
            Next calibration date
            <input
              type="date"
              value={form.next_calibration_date}
              onChange={(e) => setForm((f) => ({ ...f, next_calibration_date: e.target.value }))}
            />
          </label>
          <label className="test-gauge-admin-active">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active (show in test log dropdowns)
          </label>
        </div>

        {!editingId ? (
          <label className="test-gauge-cert-upload">
            Calibration certificate (optional)
            <input
              ref={certInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={() => setPendingCertGaugeId('new')}
            />
          </label>
        ) : null}

        <div className="test-gauge-admin-actions">
          <button type="button" className="button-primary" disabled={saving} onClick={() => void saveGauge()}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add gauge'}
          </button>
          {editingId ? (
            <button type="button" className="button-secondary" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="placeholder-copy">Loading gauges…</p>
      ) : rows.length === 0 ? (
        <p className="placeholder-copy">No test gauges registered yet.</p>
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table test-gauge-admin-table">
            <thead>
              <tr>
                <th>Gauge #</th>
                <th>Manufacturer</th>
                <th>Type</th>
                <th>Last cal.</th>
                <th>Next cal.</th>
                <th>Certificate</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const certUrl = testGaugeCertificateUrl(row.certificate_storage_path)
                const calStatus = getGaugeCalibrationStatus(row)
                return (
                  <tr key={row.id} className={calStatus !== 'ok' ? `test-gauge-row--${calStatus}` : undefined}>
                    <td>{row.gauge_number}</td>
                    <td>{row.manufacturer ?? '—'}</td>
                    <td>{row.gauge_type ?? '—'}</td>
                    <td>{row.last_calibration_date ?? '—'}</td>
                    <td className={calStatus !== 'ok' ? `test-gauge-cal-cell--${calStatus}` : undefined}>
                      {row.next_calibration_date ?? '—'}
                      {calStatus !== 'ok' ? (
                        <span className={`test-gauge-cal-badge test-gauge-cal-badge--${calStatus}`}>
                          {formatGaugeCalibrationAlert(row)}
                        </span>
                      ) : null}
                    </td>
                    <td className="test-gauge-cert-cell">
                      {certUrl ? (
                        <a href={certUrl} target="_blank" rel="noreferrer">
                          {row.certificate_file_name ?? 'View'}
                        </a>
                      ) : (
                        '—'
                      )}
                      <div className="test-gauge-cert-actions">
                        <label className="test-gauge-cert-inline-upload">
                          {uploadingId === row.id ? 'Uploading…' : 'Upload'}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            disabled={uploadingId === row.id}
                            onChange={(e) => {
                              void uploadCert(row, e.target.files?.[0])
                              e.currentTarget.value = ''
                            }}
                          />
                        </label>
                        {certUrl ? (
                          <button type="button" className="link-button" onClick={() => void clearCert(row)}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{row.active ? 'Yes' : 'No'}</td>
                    <td className="test-gauge-row-actions">
                      <button type="button" className="link-button" onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      <button type="button" className="link-button link-button-danger" onClick={() => void removeGauge(row)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
