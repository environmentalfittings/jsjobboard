import type { ToolCalibration } from '../types/toolCalibration'
import type { ToolCalibrationEvent } from '../types/toolCalibrationEvent'

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

function buildCertificateHtml(tool: ToolCalibration, event: ToolCalibrationEvent) {
  const resultLabel = event.result === 'pass' ? 'PASS' : 'FAIL — Non-Compliance'
  const resultClass = event.result === 'pass' ? 'pass' : 'fail'
  const measureRows =
    event.measurements.length === 0
      ? `<tr><td colspan="5" class="empty">No measurement points recorded.</td></tr>`
      : event.measurements
          .map(
            (m) => `<tr class="${m.passed ? '' : 'row-fail'}">
        <td>${escapeHtml(m.label)}${m.nominal ? ` <span class="nom">(${escapeHtml(m.nominal)})</span>` : ''}</td>
        <td>${escapeHtml(display(m.asFound))}</td>
        <td>${escapeHtml(display(m.asLeft))}</td>
        <td>${m.kind === 'measurement' ? 'Reading' : m.kind === 'visual' ? 'Visual' : 'Pass/Fail'}</td>
        <td class="${m.passed ? 'ok' : 'bad'}">${m.passed ? 'Pass' : 'Fail'}</td>
      </tr>`,
          )
          .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Calibration certificate — ${escapeHtml(display(tool.js_id || tool.serial_number))}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 20px;
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        font-size: 12px;
      }
      h1 { margin: 0 0 4px; font-size: 20px; }
      .sub { margin: 0 0 14px; color: #475569; }
      .meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 18px;
        margin-bottom: 14px;
        border: 1px solid #cbd5e1;
        padding: 10px 12px;
      }
      .meta div span { color: #64748b; display: inline-block; min-width: 110px; }
      .result {
        display: inline-block;
        font-weight: 800;
        letter-spacing: 0.04em;
        padding: 4px 10px;
        border-radius: 4px;
        margin-bottom: 12px;
      }
      .result.pass { background: #dcfce7; color: #166534; }
      .result.fail { background: #fee2e2; color: #991b1b; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #e2e8f0; }
      .nom { color: #64748b; font-weight: 400; }
      .ok { color: #166534; font-weight: 700; }
      .bad { color: #991b1b; font-weight: 700; }
      tr.row-fail { background: #fef2f2; }
      .notes { margin-top: 12px; }
      .sign {
        margin-top: 28px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }
      .sign .line { border-top: 1px solid #94a3b8; margin-top: 36px; padding-top: 4px; color: #475569; }
      .toolbar { margin-bottom: 12px; }
      .toolbar-hint { margin: 6px 0 0; color: #64748b; font-size: 11px; }
      .empty { color: #64748b; font-style: italic; }
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
        Turn off <strong>Headers and footers</strong> in the print dialog so the page URL does not appear.
      </p>
    </div>
    <h1>Calibration certificate</h1>
    <p class="sub">${escapeHtml(event.procedure_ref)} — Procedure for Calibration of Precision Tooling</p>
    <div class="result ${resultClass}">${escapeHtml(resultLabel)}</div>
    <div class="meta">
      <div><span>JS ID</span> ${escapeHtml(display(tool.js_id))}</div>
      <div><span>Serial</span> ${escapeHtml(display(tool.serial_number))}</div>
      <div><span>Manufacturer</span> ${escapeHtml(display(tool.manufacturer))}</div>
      <div><span>Model</span> ${escapeHtml(display(tool.model))}</div>
      <div><span>Category</span> ${escapeHtml(display(tool.category))}</div>
      <div><span>Type</span> ${escapeHtml(display(tool.tool_type))}</div>
      <div><span>Department</span> ${escapeHtml(display(tool.department))}</div>
      <div><span>Ambient temp</span> ${
        event.ambient_temp_f == null ? '—' : `${escapeHtml(String(event.ambient_temp_f))} °F`
      }</div>
      <div><span>Gauge block SN</span> ${escapeHtml(display(event.gauge_block_serial))}</div>
      <div><span>Gauge block due</span> ${escapeHtml(formatDate(event.gauge_block_next_due))}</div>
      <div><span>Certificate #</span> ${escapeHtml(display(event.certificate_number))}</div>
      <div><span>Calibrated</span> ${escapeHtml(formatDate(event.calibrated_at))}</div>
      <div><span>Next due</span> ${escapeHtml(formatDate(event.next_due_at))}</div>
      <div><span>Technician</span> ${escapeHtml(
        display(event.technician_name || event.tech_initials),
      )}</div>
      <div><span>Signed off</span> ${escapeHtml(formatDate(event.signed_off_at || event.calibrated_at))}</div>
      <div><span>Recorded</span> ${escapeHtml(formatDate(event.created_at.slice(0, 10)))}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Check point</th>
          <th>As found</th>
          <th>As left</th>
          <th>Kind</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        ${measureRows}
      </tbody>
    </table>
    ${
      event.notes?.trim()
        ? `<div class="notes"><strong>Notes</strong><br/>${escapeHtml(event.notes.trim())}</div>`
        : ''
    }
    <div class="sign">
      <div>
        <div class="line">
          Calibration technician (${escapeHtml(display(event.technician_name || event.tech_initials))})
        </div>
      </div>
      <div>
        <div class="line">Sign-off date (${escapeHtml(formatDate(event.signed_off_at || event.calibrated_at))})</div>
      </div>
    </div>
  </body>
</html>`
}

/** Print a single-tool calibration certificate via hidden iframe. */
export function openToolCalibrationCertificatePrint(
  tool: ToolCalibration,
  event: ToolCalibrationEvent,
) {
  const html = buildCertificateHtml(tool, event)
  const existing = document.getElementById('tool-calibration-cert-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'tool-calibration-cert-print-frame'
  iframe.title = 'Calibration certificate print'
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
