import { REPORT_PRINT_PAGINATION_CSS } from './reportChartsPrint'
import { MONTH_LABELS, type SeasonalityReportModel } from './seasonality'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printHtmlViaIframe(html: string, frameId: string, title: string): { error: string | null } {
  const existing = document.getElementById(frameId)
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.title = title
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '8.5in',
    height: '11in',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    return { error: 'Could not open the print dialog' }
  }

  doc.open()
  doc.write(html)
  doc.close()

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }
  win.addEventListener('afterprint', cleanup)
  window.setTimeout(cleanup, 60_000)

  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
    }
  }

  if (doc.readyState === 'complete') {
    window.setTimeout(runPrint, 120)
  } else {
    win.addEventListener('load', () => window.setTimeout(runPrint, 120), { once: true })
  }
  return { error: null }
}

export function printSeasonalityReport(options: {
  companyLabel: string
  subtitle: string
  model: SeasonalityReportModel
  footnote: string
}): { error: string | null } {
  const { model, companyLabel, subtitle, footnote } = options
  const title = `Seasonality · volume variation month by month · ${companyLabel || 'JS Valve'}`

  const avgCols = model.monthAverages
    .map((row) => {
      const h = Math.max(row.avg > 0 ? 6 : 0, Math.round((row.avg / model.maxMonthAvg) * 160))
      return `<div class="col">
        <div class="bars"><div class="bar" style="height:${h}px"></div></div>
        <div class="count">${row.avg.toFixed(0)}</div>
        <div class="xlabel">${escapeHtml(row.label)}</div>
      </div>`
    })
    .join('')

  const yearHead = model.years.map((y) => `<th>${y}</th>`).join('')
  const matrixRows = model.monthAverages
    .map((row) => {
      const cells = model.years
        .map((year) => {
          const n = model.matrix[year]?.[row.month]
          if (n == null) return '<td class="muted">—</td>'
          const intensity = 0.12 + (n / model.maxCell) * 0.55
          return `<td class="heat" style="background:rgba(15,118,110,${intensity.toFixed(3)})">${n}</td>`
        })
        .join('')
      return `<tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${row.avg.toFixed(1)}</td>
        <td>${row.index}</td>
        ${cells}
      </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.45in; }
    h1 { font-size: 15pt; margin: 0 0 0.08in; }
    h2 { font-size: 12pt; margin: 0.22in 0 0.1in; }
    .meta { color: #475569; font-size: 9.5pt; margin: 0 0 0.16in; }
    .meta p { margin: 0.04in 0; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.12in; margin: 0 0 0.18in; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.1in 0.12in; background: #f8fafc; }
    .kpi span { display: block; font-size: 8.5pt; color: #64748b; }
    .kpi strong { font-size: 13pt; }
    .chart {
      display: flex; align-items: flex-end; gap: 0.08in; height: 2.2in;
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.12in 0.08in 0.08in;
      background: #fff; margin: 0 0 0.16in;
    }
    .col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 0.04in; }
    .bars { display: flex; align-items: flex-end; height: 160px; }
    .bar {
      width: 0.22in; background: #0f766e; border-radius: 3px 3px 0 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .count { font-size: 7.5pt; font-weight: 700; }
    .xlabel { font-size: 7pt; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.05in 0.06in; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th { background: #f1f5f9; }
    td.heat {
      text-align: center; font-weight: 600;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .muted { color: #94a3b8; text-align: center; }
    .footer-note { margin-top: 0.18in; font-size: 8.5pt; color: #64748b; }
    @page { size: letter landscape; margin: 0.4in; }
    ${REPORT_PRINT_PAGINATION_CSS}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <p>${escapeHtml(subtitle)}</p>
    <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
  <div class="kpis">
    <div class="kpi"><span>Peak month</span><strong>${escapeHtml(model.peakMonth?.label ?? '—')} (${model.peakMonth ? model.peakMonth.avg.toFixed(0) : '—'})</strong></div>
    <div class="kpi"><span>Trough month</span><strong>${escapeHtml(model.troughMonth?.label ?? '—')} (${model.troughMonth ? model.troughMonth.avg.toFixed(0) : '—'})</strong></div>
    <div class="kpi"><span>Avg / month</span><strong>${model.overallMonthlyAvg.toFixed(0)}</strong></div>
    <div class="kpi"><span>Years</span><strong>${model.years.length ? `${model.years[0]}–${model.years[model.years.length - 1]}` : '—'}</strong></div>
  </div>
  <h2>Average volume by calendar month</h2>
  <div class="chart">${avgCols || '<p>No data</p>'}</div>
  <h2>Month × year matrix</h2>
  <table>
    <thead>
      <tr><th>Month</th><th>Avg</th><th>Index</th>${yearHead}</tr>
    </thead>
    <tbody>${matrixRows || `<tr><td colspan="${3 + model.years.length}">No rows</td></tr>`}</tbody>
  </table>
  <p class="footer-note">Index 100 = average month. Months: ${MONTH_LABELS.join(', ')}. ${escapeHtml(footnote)}</p>
</body>
</html>`

  return printHtmlViaIframe(html, 'seasonality-print-frame', title)
}
