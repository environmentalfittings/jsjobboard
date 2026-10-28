import { REPORT_PRINT_PAGINATION_CSS } from './reportChartsPrint'
import {
  customerYoyPct,
  typeYoyPct,
  uniquePeriods,
  type DemandCustomerSummaryRow,
  type DemandProfileReport,
} from './demandProfile'

const TYPE_COLORS = [
  '#0f766e',
  '#0369a1',
  '#a16207',
  '#be123c',
  '#7c3aed',
  '#15803d',
  '#c2410c',
  '#334155',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#4b5563',
]

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatYoy(pct: number | null): string {
  if (pct == null) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
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

function dimensionLabel(value: string) {
  switch (value) {
    case 'job_type':
      return 'Job type'
    case 'size':
      return 'Size'
    case 'pressure_class':
      return 'Pressure class'
    default:
      return 'Valve type'
  }
}

export function printCustomerBreakdownReport(options: {
  companyLabel: string
  customer: DemandCustomerSummaryRow
  companyTotalJobs: number
  customerReport: DemandProfileReport
}): { error: string | null } {
  const { customer, customerReport, companyTotalJobs, companyLabel } = options
  const years = customerReport.meta.years
  const share =
    companyTotalJobs > 0 ? ((customer.total / companyTotalJobs) * 100).toFixed(1) : '0.0'
  const periods = uniquePeriods(customerReport.typePeriods)
  const periodTotals = periods.map((period) => {
    const n = customerReport.typePeriods
      .filter((r) => r.period === period)
      .reduce((sum, r) => sum + r.jobCount, 0)
    return { period, n }
  })
  const maxPeriod = Math.max(1, ...periodTotals.map((p) => p.n))

  const trendCols = periodTotals
    .map((col) => {
      const h = Math.max(col.n > 0 ? 6 : 0, Math.round((col.n / maxPeriod) * 160))
      return `<div class="col">
        <div class="bars"><div class="bar" style="height:${h}px"></div></div>
        <div class="count">${col.n}</div>
        <div class="xlabel">${escapeHtml(col.period)}</div>
      </div>`
    })
    .join('')

  const mixRows = customerReport.typeSummary.map((row, i) => {
    const yearCells = years.map((y) => `<td>${row.yearCounts[y] ?? 0}</td>`).join('')
    return `<tr>
      <td><span class="swatch" style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></span>${escapeHtml(row.type)}</td>
      <td>${row.total}</td>
      <td>${row.pctOfTotal.toFixed(1)}%</td>
      ${yearCells}
      <td>${escapeHtml(formatYoy(typeYoyPct(row, years)))}</td>
    </tr>`
  })

  const yearHead = years.map((y) => `<th>${escapeHtml(y)}</th>`).join('')
  const title = `Customer breakdown · ${customer.customer}`
  const subtitle = `${companyLabel || 'JS Valve'} · ${customerReport.meta.start} to ${customerReport.meta.end} · Grouped by ${customerReport.meta.period} · ${dimensionLabel(customerReport.meta.typeDimension)}`

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
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.12in; margin: 0 0 0.2in; }
    .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.1in 0.12in; background: #f8fafc; }
    .kpi span { display: block; font-size: 8.5pt; color: #64748b; }
    .kpi strong { font-size: 14pt; }
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
    .xlabel { font-size: 7pt; color: #64748b; text-align: center; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.05in 0.06in; text-align: left; }
    th { background: #f1f5f9; }
    td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
    .swatch {
      display: inline-block; width: 0.12in; height: 0.12in; border-radius: 2px;
      margin-right: 0.06in; vertical-align: -1px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
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
    <div class="kpi"><span>Jobs</span><strong>${customer.total}</strong></div>
    <div class="kpi"><span>Share of company</span><strong>${share}%</strong></div>
    <div class="kpi"><span>YoY</span><strong>${escapeHtml(formatYoy(customerYoyPct(customer, years)))}</strong></div>
    <div class="kpi"><span>Last job</span><strong>${escapeHtml(customer.lastJobDate ?? '—')}</strong></div>
  </div>
  <h2>Demand over time</h2>
  <div class="chart">${trendCols || '<p>No data</p>'}</div>
  <h2>Mix by ${escapeHtml(dimensionLabel(customerReport.meta.typeDimension))}</h2>
  <table>
    <thead>
      <tr>
        <th>Type</th><th>Total</th><th>%</th>${yearHead}<th>YoY</th>
      </tr>
    </thead>
    <tbody>${mixRows.join('') || '<tr><td colspan="5">No rows</td></tr>'}</tbody>
  </table>
  <p class="footer-note">${escapeHtml(customerReport.meta.footnote)}</p>
</body>
</html>`

  return printHtmlViaIframe(html, 'customer-breakdown-print-frame', title)
}
