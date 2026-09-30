/** Printable pie / bar chart reports for the Reports page (hidden iframe — stays on page). */

export type PieSlice = {
  label: string
  count: number
  color: string
}

export type MonthlyBar = {
  key: string
  label: string
  count: number
  priorYearCount?: number
  priorYearLabel?: string
}

const PIE_COLORS = [
  '#0f766e',
  '#1d4ed8',
  '#b45309',
  '#be123c',
  '#047857',
  '#0369a1',
  '#a16207',
  '#9f1239',
  '#334155',
  '#0e7490',
  '#c2410c',
  '#15803d',
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function pieColorForIndex(index: number) {
  return PIE_COLORS[index % PIE_COLORS.length]!
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

function conicGradient(slices: PieSlice[], total: number) {
  if (total <= 0 || slices.length === 0) return 'conic-gradient(#e2e8f0 0deg 360deg)'
  let cursor = 0
  const parts: string[] = []
  for (const slice of slices) {
    const start = (cursor / total) * 360
    cursor += slice.count
    const end = (cursor / total) * 360
    parts.push(`${slice.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`)
  }
  return `conic-gradient(${parts.join(', ')})`
}

/** Printable pie chart + legend table. */
export function printPieChartReport(options: {
  title: string
  subtitle: string
  slices: PieSlice[]
  valueLabel?: string
}): { error: string | null } {
  const total = options.slices.reduce((sum, s) => sum + s.count, 0)
  const valueLabel = options.valueLabel ?? 'Items'
  const gradient = conicGradient(options.slices, total)

  const legend = options.slices
    .map((slice) => {
      const pct = total > 0 ? ((slice.count / total) * 100).toFixed(1) : '0.0'
      return `<tr>
        <td><span class="swatch" style="background:${escapeHtml(slice.color)}"></span>${escapeHtml(slice.label)}</td>
        <td>${slice.count}</td>
        <td>${pct}%</td>
      </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.55in; }
    h1 { font-size: 16pt; margin: 0 0 0.1in; }
    .meta { color: #475569; font-size: 10pt; margin: 0 0 0.28in; }
    .layout { display: grid; grid-template-columns: 3.2in 1fr; gap: 0.35in; align-items: center; }
    .pie {
      width: 2.9in; height: 2.9in; border-radius: 50%;
      background: ${gradient};
      border: 1px solid #cbd5e1;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .pie-empty {
      display: flex; align-items: center; justify-content: center;
      background: #f1f5f9; color: #64748b; font-weight: 600; font-size: 11pt;
    }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.08in 0.1in; text-align: left; }
    th { background: #f1f5f9; }
    td:nth-child(2), td:nth-child(3), th:nth-child(2), th:nth-child(3) { text-align: right; }
    .swatch {
      display: inline-block; width: 0.16in; height: 0.16in; border-radius: 3px;
      margin-right: 0.1in; vertical-align: -2px;
      border: 1px solid rgba(15,23,42,0.15);
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .total { margin-top: 0.2in; font-weight: 700; }
    @page { size: letter; margin: 0.5in; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">
    <p>${escapeHtml(options.subtitle)}</p>
    <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
  <div class="layout">
    <div class="pie${total <= 0 ? ' pie-empty' : ''}">${total <= 0 ? 'No data' : ''}</div>
    <div>
      <table>
        <thead><tr><th>Cell</th><th>${escapeHtml(valueLabel)}</th><th>Share</th></tr></thead>
        <tbody>${legend || '<tr><td colspan="3">No rows</td></tr>'}</tbody>
      </table>
      <p class="total">Total: ${total} ${escapeHtml(valueLabel.toLowerCase())}</p>
    </div>
  </div>
</body>
</html>`

  return printHtmlViaIframe(html, 'report-pie-print-frame', options.title)
}

/** Printable monthly units delivered bar chart + table. */
export function printMonthlyBarsReport(options: {
  title: string
  subtitle: string
  bars: MonthlyBar[]
  valueLabel?: string
  showPriorYear?: boolean
}): { error: string | null } {
  const valueLabel = options.valueLabel ?? 'Units'
  const showPrior = options.showPriorYear !== false
  const max = Math.max(
    1,
    ...options.bars.map((b) => Math.max(b.count, showPrior ? (b.priorYearCount ?? 0) : 0)),
  )

  const chartCols = options.bars
    .map((bar) => {
      const h = Math.max(bar.count > 0 ? 6 : 0, Math.round((bar.count / max) * 160))
      const priorH = showPrior
        ? Math.max((bar.priorYearCount ?? 0) > 0 ? 6 : 0, Math.round(((bar.priorYearCount ?? 0) / max) * 160))
        : 0
      return `<div class="col">
        <div class="bars">
          ${showPrior ? `<div class="bar prior" style="height:${priorH}px" title="${escapeHtml(bar.priorYearLabel ?? 'Prior year')}: ${bar.priorYearCount ?? 0}"></div>` : ''}
          <div class="bar current" style="height:${h}px" title="${escapeHtml(bar.label)}: ${bar.count}"></div>
        </div>
        <div class="count">${bar.count}</div>
        <div class="xlabel">${escapeHtml(bar.label)}</div>
      </div>`
    })
    .join('')

  const tableRows = options.bars
    .map((bar) => {
      const prior = bar.priorYearCount ?? 0
      const delta = bar.count - prior
      const deltaLabel = delta === 0 ? '—' : delta > 0 ? `+${delta}` : String(delta)
      return `<tr>
        <td>${escapeHtml(bar.label)}</td>
        <td>${bar.count}</td>
        ${showPrior ? `<td>${prior}</td><td>${deltaLabel}</td>` : ''}
      </tr>`
    })
    .join('')

  const total = options.bars.reduce((sum, b) => sum + b.count, 0)

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.55in; }
    h1 { font-size: 16pt; margin: 0 0 0.1in; }
    .meta { color: #475569; font-size: 10pt; margin: 0 0 0.22in; }
    .legend { display: flex; gap: 1rem; font-size: 9.5pt; margin: 0 0 0.18in; color: #475569; }
    .legend i { display: inline-block; width: 0.18in; height: 0.18in; border-radius: 3px; margin-right: 0.08in; vertical-align: -2px; }
    .legend .current { background: #0f766e; }
    .legend .prior { background: #94a3b8; }
    .chart {
      display: flex; align-items: flex-end; gap: 0.12in; height: 2.4in;
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.16in 0.12in 0.1in;
      margin-bottom: 0.28in; background: #fff;
    }
    .col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 0.06in; }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 160px; }
    .bar {
      width: 0.16in; border-radius: 3px 3px 0 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .bar.current { background: #0f766e; }
    .bar.prior { background: #94a3b8; }
    .count { font-size: 8.5pt; font-weight: 700; }
    .xlabel { font-size: 7.5pt; color: #64748b; text-align: center; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.08in 0.1in; text-align: left; }
    th { background: #f1f5f9; }
    td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
    .total { margin-top: 0.18in; font-weight: 700; }
    @page { size: letter; margin: 0.5in; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">
    <p>${escapeHtml(options.subtitle)}</p>
    <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
  ${
    showPrior
      ? `<div class="legend"><span><i class="current"></i>This period</span><span><i class="prior"></i>Same month prior year</span></div>`
      : ''
  }
  <div class="chart">${chartCols || '<p>No data</p>'}</div>
  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th>${escapeHtml(valueLabel)}</th>
        ${showPrior ? '<th>Prior year</th><th>Δ</th>' : ''}
      </tr>
    </thead>
    <tbody>${tableRows || `<tr><td colspan="${showPrior ? 4 : 2}">No rows</td></tr>`}</tbody>
  </table>
  <p class="total">Total (${options.bars.length} months): ${total} ${escapeHtml(valueLabel.toLowerCase())}</p>
</body>
</html>`

  return printHtmlViaIframe(html, 'report-monthly-bars-print-frame', options.title)
}

/** Simple printable table report (training / certification). */
export function printTableReport(options: {
  title: string
  subtitle: string
  columns: string[]
  rows: string[][]
  summaryLines?: string[]
}): { error: string | null } {
  const head = options.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
  const body = options.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const summary = (options.summaryLines ?? [])
    .map((line) => `<p class="summary">${escapeHtml(line)}</p>`)
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.5in; }
    h1 { font-size: 15pt; margin: 0 0 0.08in; }
    .meta { color: #475569; font-size: 9.5pt; margin: 0 0 0.18in; }
    .summary { margin: 0.04in 0; font-size: 10pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 0.15in; }
    th, td { border: 1px solid #cbd5e1; padding: 0.06in 0.08in; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    tr.overdue td { background: #fef2f2; }
    @page { size: letter landscape; margin: 0.4in; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">
    <p>${escapeHtml(options.subtitle)}</p>
    <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
  ${summary}
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body || `<tr><td colspan="${options.columns.length}">No rows</td></tr>`}</tbody>
  </table>
</body>
</html>`

  return printHtmlViaIframe(html, 'report-table-print-frame', options.title)
}
