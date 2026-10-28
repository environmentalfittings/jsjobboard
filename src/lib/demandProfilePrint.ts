import { REPORT_PRINT_PAGINATION_CSS } from './reportChartsPrint'
import {
  customerYoyPct,
  isDecliningCustomer,
  stackedBarSeries,
  typeYoyPct,
  uniquePeriods,
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

function renderStackedChart(
  periods: string[],
  series: { period: string; total: number; values: Record<string, number> }[],
  labels: string[],
  max: number,
) {
  if (periods.length === 0) return '<p class="empty">No chart data</p>'
  const legend = labels
    .map(
      (label, i) =>
        `<span><i style="background:${TYPE_COLORS[i % TYPE_COLORS.length]}"></i>${escapeHtml(label)}</span>`,
    )
    .join('')
  const cols = series
    .map((col) => {
      const heightPct = Math.max(8, (col.total / Math.max(1, max)) * 100)
      const segs = labels
        .map((label, i) => {
          const n = col.values[label] ?? 0
          if (!n || !col.total) return ''
          const h = (n / col.total) * 100
          return `<div class="seg" style="height:${h}%;background:${TYPE_COLORS[i % TYPE_COLORS.length]}" title="${escapeHtml(col.period)} · ${escapeHtml(label)}: ${n}"></div>`
        })
        .join('')
      return `<div class="col">
        <div class="bars" style="height:${heightPct}%">${segs}</div>
        <div class="xlabel">${escapeHtml(col.period)}</div>
        <div class="count">${col.total}</div>
      </div>`
    })
    .join('')
  return `<div class="legend">${legend}</div><div class="chart">${cols}</div>`
}

function typeSectionHtml(report: DemandProfileReport) {
  const years = report.meta.years
  const typeLabels = report.typeSummary.map((r) => r.type)
  const periods = uniquePeriods(report.typePeriods)
  const stacked = stackedBarSeries(periods, report.typePeriods, typeLabels)
  const stackMax = Math.max(1, ...stacked.map((r) => r.total))

  const rows = report.typeSummary.map((row) => {
    const yearCells = years.map((y) => `<td>${row.yearCounts[y] ?? 0}</td>`).join('')
    return `<tr>
      <td>${escapeHtml(row.type)}</td>
      <td>${row.total}</td>
      <td>${row.pctOfTotal.toFixed(1)}%</td>
      ${yearCells}
      <td>${escapeHtml(formatYoy(typeYoyPct(row, years)))}</td>
    </tr>`
  })

  return `
  <section class="block">
    <h2>A — Demand by type</h2>
    <p class="note">Unspecified type share: ${report.meta.unspecifiedTypePct.toFixed(1)}%</p>
    ${renderStackedChart(periods, stacked, typeLabels, stackMax)}
    <table>
      <thead>
        <tr>
          <th>Type</th><th>Total</th><th>%</th>
          ${years.map((y) => `<th>${escapeHtml(y)}</th>`).join('')}
          <th>YoY</th>
        </tr>
      </thead>
      <tbody>${rows.join('') || '<tr><td colspan="5">No rows</td></tr>'}</tbody>
    </table>
  </section>`
}

function customerSectionHtml(report: DemandProfileReport) {
  const years = report.meta.years
  const top = report.customerSummary.filter((c) => c.rank <= 10)
  const keys = [...top.map((c) => c.key), '__other__']
  const labels = new Map(report.customerPeriods.map((r) => [r.key, r.customer] as const))
  const periodKeys = uniquePeriods(report.customerPeriods)
  const customerPeriods = periodKeys.map((p) => {
    const values: Record<string, number> = {}
    let total = 0
    for (const key of keys) {
      const n =
        report.customerPeriods.find((r) => r.period === p && r.key === key)?.jobCount ?? 0
      values[key] = n
      total += n
    }
    return { period: p, values, total }
  })
  const stackMax = Math.max(1, ...customerPeriods.map((r) => r.total))
  const chartLabels = keys.map((key) =>
    key === '__other__' ? 'All other' : labels.get(key) ?? key,
  )
  const chartSeries = customerPeriods.map((col) => {
    const values: Record<string, number> = {}
    keys.forEach((key, i) => {
      values[chartLabels[i]!] = col.values[key] ?? 0
    })
    return { period: col.period, total: col.total, values }
  })

  const rows = report.customerSummary.map((row) => {
    const yearCells = years.map((y) => `<td>${row.yearCounts[y] ?? 0}</td>`).join('')
    const flags = [
      row.isNewInRange ? 'New' : '',
      isDecliningCustomer(row, years) ? 'Declining' : '',
    ]
      .filter(Boolean)
      .join(', ')
    return `<tr>
      <td>${row.rank}</td>
      <td>${escapeHtml(row.customer)}</td>
      <td>${row.total}</td>
      <td>${row.pctOfTotal.toFixed(1)}%</td>
      ${yearCells}
      <td>${escapeHtml(formatYoy(customerYoyPct(row, years)))}</td>
      <td>${row.jobCount}</td>
      <td>${escapeHtml(row.lastJobDate ?? '—')}</td>
      <td>${escapeHtml(flags || '—')}</td>
    </tr>`
  })

  return `
  <section class="block">
    <h2>B — Demand by customer</h2>
    ${renderStackedChart(periodKeys, chartSeries, chartLabels, stackMax)}
    <table>
      <thead>
        <tr>
          <th>#</th><th>Customer</th><th>Total</th><th>%</th>
          ${years.map((y) => `<th>${escapeHtml(y)}</th>`).join('')}
          <th>YoY</th><th>Jobs</th><th>Last job</th><th>Flags</th>
        </tr>
      </thead>
      <tbody>${rows.join('') || '<tr><td colspan="9">No rows</td></tr>'}</tbody>
    </table>
  </section>`
}

function matrixSectionHtml(report: DemandProfileReport) {
  const { customers, types, cells } = report.matrix
  if (customers.length === 0) {
    return `<section class="block"><h2>C — Customer × type matrix</h2><p class="empty">No matrix data</p></section>`
  }
  const head = types.map((t) => `<th>${escapeHtml(t)}</th>`).join('')
  const rows = customers.map((c) => {
    const maxCell = Math.max(
      1,
      ...cells.filter((cell) => cell.customerKey === c.key).map((cell) => cell.jobCount),
    )
    const tds = types
      .map((t) => {
        const n = cells.find((cell) => cell.customerKey === c.key && cell.type === t)?.jobCount ?? 0
        if (!n) return '<td class="muted">—</td>'
        const intensity = 0.12 + (n / maxCell) * 0.55
        return `<td class="heat" style="background:rgba(15,118,110,${intensity.toFixed(3)})">${n}</td>`
      })
      .join('')
    return `<tr><td>${escapeHtml(c.customer)}</td>${tds}</tr>`
  })

  return `
  <section class="block">
    <h2>C — Customer × type matrix</h2>
    <table class="matrix">
      <thead><tr><th>Customer</th>${head}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </section>`
}

function wrapReportHtml(options: {
  title: string
  subtitle: string
  body: string
  orientation?: 'portrait' | 'landscape'
}) {
  const orientation = options.orientation ?? 'landscape'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.45in; }
    h1 { font-size: 15pt; margin: 0 0 0.08in; }
    h2 { font-size: 12.5pt; margin: 0 0 0.12in; }
    .meta { color: #475569; font-size: 9.5pt; margin: 0 0 0.18in; }
    .meta p { margin: 0.04in 0; }
    .note, .empty, .muted { color: #64748b; font-size: 9pt; }
    .block { margin: 0 0 0.35in; break-inside: avoid; page-break-inside: avoid; }
    .legend {
      display: flex; flex-wrap: wrap; gap: 0.12in 0.22in;
      font-size: 8.5pt; color: #475569; margin: 0 0 0.12in;
    }
    .legend i {
      display: inline-block; width: 0.14in; height: 0.14in; border-radius: 2px;
      margin-right: 0.06in; vertical-align: -1px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .chart {
      display: flex; align-items: flex-end; gap: 0.08in; min-height: 2.1in;
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.12in 0.08in 0.08in;
      background: #f8fafc; margin: 0 0 0.18in;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .col {
      flex: 1 0 0.35in; min-width: 0.32in; max-width: 0.7in;
      display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 0.04in;
    }
    .bars {
      width: 70%; min-height: 8px; display: flex; flex-direction: column-reverse;
      border-radius: 3px 3px 0 0; overflow: hidden; background: #e2e8f0;
    }
    .seg { width: 100%; min-height: 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .xlabel { font-size: 7pt; color: #64748b; text-align: center; line-height: 1.1; word-break: break-all; }
    .count { font-size: 7.5pt; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 0.08in; }
    th, td { border: 1px solid #cbd5e1; padding: 0.05in 0.06in; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
    table.matrix td:first-child, table.matrix th:first-child { text-align: left; }
    td.heat {
      text-align: center; font-weight: 600;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .footer-note { margin-top: 0.2in; font-size: 8.5pt; color: #64748b; }
    @page { size: letter ${orientation}; margin: 0.4in; }
    ${REPORT_PRINT_PAGINATION_CSS}
  </style>
</head>
<body>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">
    <p>${escapeHtml(options.subtitle)}</p>
    <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
  ${options.body}
</body>
</html>`
}

export type DemandProfilePrintOptions = {
  report: DemandProfileReport
  companyLabel: string
  sections?: Array<'type' | 'customer' | 'matrix' | 'all'>
}

function buildSubtitle(report: DemandProfileReport, companyLabel: string) {
  const company = companyLabel.trim() || 'JS Valve'
  return `${company} · ${report.meta.start} to ${report.meta.end} · Grouped by ${report.meta.period} · ${dimensionLabel(report.meta.typeDimension)} · ${report.meta.totalJobs} jobs`
}

export function printDemandProfileReport(
  options: DemandProfilePrintOptions,
): { error: string | null } {
  type Section = 'type' | 'customer' | 'matrix' | 'all'
  const sections: Section[] = options.sections?.length ? options.sections : ['all']
  const includeAll = sections.includes('all')
  const parts: string[] = []
  if (includeAll || sections.includes('type')) parts.push(typeSectionHtml(options.report))
  if (includeAll || sections.includes('customer')) parts.push(customerSectionHtml(options.report))
  if (includeAll || sections.includes('matrix')) parts.push(matrixSectionHtml(options.report))

  const title =
    includeAll || sections.length > 1
      ? `Demand profile by type and customer · ${options.companyLabel || 'JS Valve'}`
      : sections[0] === 'type'
        ? `Demand by type · ${options.companyLabel || 'JS Valve'}`
        : sections[0] === 'customer'
          ? `Demand by customer · ${options.companyLabel || 'JS Valve'}`
          : `Customer × type matrix · ${options.companyLabel || 'JS Valve'}`

  const html = wrapReportHtml({
    title,
    subtitle: buildSubtitle(options.report, options.companyLabel),
    body: `${parts.join('')}
      <p class="footer-note">${escapeHtml(options.report.meta.footnote)} Excludes null/bad demand dates (${options.report.meta.excludedNull + options.report.meta.excludedBad} of ${options.report.meta.scopedTotal} scoped jobs).</p>`,
    orientation: 'landscape',
  })

  const frameId =
    includeAll || sections.length > 1
      ? 'demand-profile-print-frame'
      : `demand-profile-print-${sections[0]}-frame`

  return printHtmlViaIframe(html, frameId, title)
}
