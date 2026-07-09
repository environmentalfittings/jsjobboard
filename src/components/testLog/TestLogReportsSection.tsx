import { useEffect, useRef, useState } from 'react'
import { useToast } from '../ToastNotification'
import {
  deleteTestLogReport,
  loadTestLogReports,
  testLogReportPublicUrl,
  uploadTestLogReport,
} from '../../lib/testLogReports'
import {
  downloadTestLogReportPdf,
  testLogReportFileName,
  testLogReportPdfBlob,
  type TestLogReportData,
} from '../../lib/testLogReportPdf'
import type { TestLogReport } from '../../types/testLogReport'

type DraftProps = {
  mode: 'draft'
  reportData: TestLogReportData
  pendingFiles: File[]
  onPendingFilesChange: (files: File[]) => void
}

type SavedProps = {
  mode: 'saved'
  testLogId: number
  reportData: TestLogReportData
}

type TestLogReportsSectionProps = DraftProps | SavedProps

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TestLogReportsSection(props: TestLogReportsSectionProps) {
  const { showToast } = useToast()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [reports, setReports] = useState<TestLogReport[]>([])
  const [loading, setLoading] = useState(props.mode === 'saved')
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    if (props.mode !== 'saved') return
    setLoading(true)
    const rows = await loadTestLogReports(props.testLogId)
    setReports(rows)
    setLoading(false)
  }

  useEffect(() => {
    if (props.mode === 'saved') void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode, props.mode === 'saved' ? props.testLogId : null])

  const addPendingFiles = (files: FileList | null) => {
    if (!files?.length || props.mode !== 'draft') return
    const next = [...props.pendingFiles]
    for (const file of Array.from(files)) {
      if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file)
    }
    props.onPendingFilesChange(next)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  const removePendingFile = (index: number) => {
    if (props.mode !== 'draft') return
    props.onPendingFilesChange(props.pendingFiles.filter((_, i) => i !== index))
  }

  const uploadSavedReports = async (files: FileList | null) => {
    if (!files?.length || props.mode !== 'saved') return
    setBusy(true)
    let uploaded = 0
    for (const file of Array.from(files)) {
      const { error } = await uploadTestLogReport(props.testLogId, file, 'upload')
      if (error) {
        showToast(`${file.name}: ${error}`)
      } else {
        uploaded += 1
      }
    }
    setBusy(false)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
    if (uploaded) {
      showToast(uploaded === 1 ? 'Test report uploaded' : `${uploaded} test reports uploaded`)
      await reload()
    }
  }

  const generatePdf = async (saveToEntry: boolean) => {
    if (saveToEntry) {
      if (props.mode !== 'saved') return
      setBusy(true)
      const fileName = testLogReportFileName(props.reportData.valve_id, props.reportData.tested_on)
      const blob = testLogReportPdfBlob(props.reportData)
      const file = new File([blob], fileName, { type: 'application/pdf' })
      const { error } = await uploadTestLogReport(props.testLogId, file, 'generated')
      setBusy(false)
      if (error) {
        showToast(error.includes('test_log_reports') ? 'Run migration-test-log-reports.sql in Supabase' : error)
        return
      }
      showToast('Test report PDF saved to this entry')
      await reload()
      return
    }

    downloadTestLogReportPdf(props.reportData)
    showToast('Test report PDF downloaded')
  }

  const removeReport = async (report: TestLogReport) => {
    if (!window.confirm(`Remove ${report.file_name}?`)) return
    setBusy(true)
    const { error } = await deleteTestLogReport(report)
    setBusy(false)
    if (error) {
      showToast(error)
      return
    }
    showToast('Test report removed')
    await reload()
  }

  return (
    <div className="test-log-reports-section">
      <div className="test-log-reports-header">
        <h5 className="test-log-reports-title">Test reports</h5>
        <p className="test-log-reports-note">
          {props.mode === 'draft'
            ? 'Attach chart scans or other report files — they upload when you save the entry. You can also download a PDF from the current form data.'
            : 'Upload chart scans or generate a PDF from the saved test data.'}
        </p>
      </div>

      <div className="test-log-reports-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => void generatePdf(false)}
        >
          Download PDF
        </button>
        {props.mode === 'saved' ? (
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => void generatePdf(true)}
          >
            Generate &amp; save PDF
          </button>
        ) : null}
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => uploadInputRef.current?.click()}
        >
          {props.mode === 'draft' ? 'Attach reports' : 'Upload report'}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          className="test-log-reports-file-input"
          onChange={(e) => {
            if (props.mode === 'draft') addPendingFiles(e.target.files)
            else void uploadSavedReports(e.target.files)
          }}
        />
      </div>

      {props.mode === 'draft' && props.pendingFiles.length ? (
        <ul className="test-log-reports-list">
          {props.pendingFiles.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="test-log-reports-item">
              <span className="test-log-reports-item-name">{file.name}</span>
              <span className="test-log-reports-item-meta">{formatFileSize(file.size)} · uploads on save</span>
              <button
                type="button"
                className="button-link test-log-reports-remove"
                onClick={() => removePendingFile(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {props.mode === 'saved' ? (
        loading ? (
          <p className="test-log-reports-empty">Loading reports…</p>
        ) : reports.length ? (
          <ul className="test-log-reports-list">
            {reports.map((report) => (
              <li key={report.id} className="test-log-reports-item">
                <a
                  className="test-log-reports-item-name"
                  href={testLogReportPublicUrl(report.storage_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {report.file_name}
                </a>
                <span className="test-log-reports-item-meta">
                  {report.source === 'generated' ? 'Generated PDF' : 'Uploaded'} ·{' '}
                  {new Date(report.created_at).toLocaleString()}
                </span>
                <button
                  type="button"
                  className="button-link test-log-reports-remove"
                  disabled={busy}
                  onClick={() => void removeReport(report)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="test-log-reports-empty">No test reports attached yet.</p>
        )
      ) : null}
    </div>
  )
}
