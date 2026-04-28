import type { Attachment } from '../types'
import { formatDateTime, formatFileSize } from '../utils/formatters'
import { openAttachmentData } from '../utils/files'

interface AttachmentListProps {
  items: Attachment[]
  onUpload?: (files: FileList | null) => void
  uploadLabel?: string
}

export function AttachmentList({ items, onUpload, uploadLabel }: AttachmentListProps) {
  return (
    <div className="space-y-2">
      {onUpload ? (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-qt-border bg-qt-bg/50 px-4 py-6 text-sm text-qt-muted hover:border-qt-accent/50">
          <input
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
            onChange={(e) => onUpload(e.target.files)}
          />
          {uploadLabel ?? 'Drop files or click to upload (max 10 MB each)'}
        </label>
      ) : null}
      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-qt-border bg-qt-panel2/50 px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-lg">📎</span>
              <div className="min-w-0">
                <div className="truncate font-medium text-qt-text">{a.fileName}</div>
                <div className="text-xs text-qt-muted">
                  {formatFileSize(a.fileSize)} · {formatDateTime(new Date(a.uploadedAt))} ·{' '}
                  <span className="rounded bg-qt-bg px-1">{a.tag}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded bg-qt-accent px-2 py-1 text-xs font-semibold text-white"
              onClick={() => openAttachmentData(a)}
            >
              View
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
