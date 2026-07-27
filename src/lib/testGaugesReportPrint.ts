import {
  formatGaugeCalibrationStatusLabel,
  getGaugeCalibrationStatus,
} from './testGaugeRegistry'
import type { TestGauge } from '../types/testGauge'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function display(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '—'
}

function formatDate(value: string | null | undefined) {
  if (!value?.trim()) return '—'
  const parsed = new Date(`${value.trim()}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value.trim()
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatReportDate(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function statusLabel(row: TestGauge) {
  return row.active ? 'Active' : 'Inactive'
}

function dueNote(row: TestGauge) {
  return formatGaugeCalibrationStatusLabel(row)
}

function buildTestGaugesReportHtml(
  rows: TestGauge[],
  options?: { title?: string; filterNote?: string | null },
) {
  const title = options?.title?.trim() || 'Test gauges calibration report'
  const filterNote = options?.filterNote?.trim() || ''
  const bodyRows =
    rows.length === 0
      ? `<tr><td colspan="8" class="empty">No gauges match the current filters.</td></tr>`
      : rows
          .map((row, index) => {
            const calStatus = getGaugeCalibrationStatus(row)
            const dueClass =
              calStatus === 'critical' || calStatus === 'due'
                ? 'due-expired'
                : calStatus === 'expiring'
                  ? 'due-soon'
                  : ''
            const note = dueNote(row)
            return `<tr class="${dueClass}">
        <td class="rank">${index + 1}</td>
        <td class="gauge">${escapeHtml(row.gauge_number)}</td>
        <td>${escapeHtml(display(row.manufacturer))}</td>
        <td>${escapeHtml(display(row.gauge_type))}</td>
        <td>${escapeHtml(display(row.department))}</td>
        <td class="date">${escapeHtml(formatDate(row.last_calibration_date))}</td>
        <td class="date ${dueClass}">${escapeHtml(formatDate(row.next_calibration_date))}${
              note ? `<div class="due-note">${escapeHtml(note)}</div>` : ''
            }</td>
        <td>${escapeHtml(statusLabel(row))}</td>
      </tr>`
          })
          .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 18px;
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        font-size: 12px;
      }
      h1 {
        margin: 0 0 4px;
        font-size: 20px;
      }
      .report-date, .filter-note {
        margin: 0 0 8px;
        color: #475569;
      }
      .count {
        margin: 0 0 12px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: #e2e8f0;
        font-weight: 700;
      }
      .rank { width: 4%; text-align: center; font-weight: 700; }
      .gauge { font-weight: 700; white-space: nowrap; }
      .date { white-space: nowrap; }
      .due-note { font-size: 11px; font-weight: 700; margin-top: 2px; }
      .due-expired, .due-expired .due-note { color: #b91c1c; }
      .due-soon, .due-soon .due-note { color: #b45309; }
      tr.due-expired { background: #fef2f2; }
      tr.due-soon { background: #fffbeb; }
      .empty { color: #64748b; font-style: italic; }
      .toolbar { margin-bottom: 12px; }
      .toolbar-hint { margin: 6px 0 0; color: #64748b; font-size: 11px; }
      @media print {
        .toolbar { display: none !important; }
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print</button>
      <p class="toolbar-hint">
        Use landscape if needed. In the print dialog, turn off <strong>Headers and footers</strong>
        so the page URL does not appear.
      </p>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="report-date">${escapeHtml(formatReportDate())}</p>
    ${filterNote ? `<p class="filter-note">${escapeHtml(filterNote)}</p>` : ''}
    <p class="count">${rows.length} gauge${rows.length === 1 ? '' : 's'}</p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Gauge #</th>
          <th>Manufacturer</th>
          <th>Type</th>
          <th>Dept</th>
          <th>Calibrated</th>
          <th>Expires</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  </body>
</html>`
}

/** Print the current test-gauges table view via a hidden iframe (no popup). */
export function openTestGaugesReportPrint(
  rows: TestGauge[],
  options?: { title?: string; filterNote?: string | null },
) {
  const html = buildTestGaugesReportHtml(rows, options)
  const existing = document.getElementById('test-gauges-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'test-gauges-print-frame'
  iframe.title = 'Test gauges print'
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    window.print()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  const triggerPrint = () => {
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(() => iframe.remove(), 1000)
    }
  }

  if (doc.readyState === 'complete') {
    window.setTimeout(triggerPrint, 250)
  } else {
    win.addEventListener('load', () => window.setTimeout(triggerPrint, 250), { once: true })
  }
}
