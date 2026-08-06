import { openPrintHtml } from './printHtml'

export type OnTimeDeliveryMonthRow = {
  month: number
  label: string
  total: number
  onTime: number
  late: number
  noDueDate: number
  pct: number
}

export type OnTimeDeliverySummary = {
  total: number
  onTime: number
  late: number
  noDueDate: number
  pct: number
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pctLabel(pct: number, total: number) {
  return total > 0 ? `${pct.toFixed(1)}%` : '—'
}

function pctColor(pct: number, total: number) {
  if (total <= 0) return '#64748b'
  if (pct >= 90) return '#166534'
  if (pct >= 75) return '#a16207'
  return '#b91c1c'
}

/** Opens a printable preview with summary, monthly chart, and table. */
export function printOnTimeDeliveryReport(options: {
  year: number
  monthLabel: string
  yearSummary: OnTimeDeliverySummary
  monthSummary: OnTimeDeliverySummary
  byMonth: OnTimeDeliveryMonthRow[]
}): { error: string | null } {
  const { year, monthLabel, yearSummary, monthSummary, byMonth } = options
  const generated = new Date().toLocaleString()

  const chartBars = byMonth
    .map((row) => {
      const height = row.total > 0 ? Math.max(4, Math.round(row.pct)) : 0
      const color = pctColor(row.pct, row.total)
      const short = row.label.slice(0, 3)
      return `<div class="bar-col">
        <div class="bar-track">
          <div class="bar" style="height:${height}%;background:${color}">
            ${row.total > 0 ? `<span>${row.pct.toFixed(0)}%</span>` : ''}
          </div>
        </div>
        <div class="bar-label">${escapeHtml(short)}</div>
      </div>`
    })
    .join('')

  const tableRows = byMonth
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${row.total}</td>
      <td>${row.onTime}</td>
      <td>${row.late}</td>
      <td>${row.noDueDate}</td>
      <td style="color:${pctColor(row.pct, row.total)};font-weight:700">${pctLabel(row.pct, row.total)}</td>
    </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>On-time delivery — ${escapeHtml(String(year))}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.55in; }
    h1 { font-size: 18pt; margin: 0 0 0.15in; }
    .meta { color: #475569; font-size: 10pt; margin: 0 0 0.3in; }
    .meta p { margin: 0.08rem 0; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 0.2in; margin-bottom: 0.3in; }
    .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.14in 0.16in; background: #f8fafc; }
    .card h2 { margin: 0 0 0.08in; font-size: 11pt; }
    .card dl { display: grid; grid-template-columns: 1fr auto; gap: 0.06in 0.12in; margin: 0; font-size: 10pt; }
    .card dt { color: #64748b; }
    .card dd { margin: 0; font-weight: 700; text-align: right; }
    .chart-title { font-size: 11pt; font-weight: 700; margin: 0 0 0.12in; }
    .chart {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.16in 0.12in 0.1in;
      margin-bottom: 0.28in; background: #fff;
    }
    .bars { display: flex; align-items: flex-end; gap: 0.08in; height: 2.1in; }
    .bar-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; height: 100%; }
    .bar-track {
      flex: 1; width: 100%; max-width: 0.42in; display: flex; align-items: flex-end;
      background: #f1f5f9; border-radius: 4px 4px 0 0; overflow: hidden;
    }
    .bar {
      width: 100%; min-height: 0; display: flex; align-items: flex-start; justify-content: center;
      padding-top: 0.04in; color: #fff; font-size: 7.5pt; font-weight: 700;
    }
    .bar-label { margin-top: 0.06in; font-size: 8pt; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.08in 0.1in; text-align: left; }
    th { background: #f1f5f9; }
    td:nth-child(n+2), th:nth-child(n+2) { text-align: right; }
    .no-print {
      display: flex; gap: 0.5rem; justify-content: flex-end; margin: -0.35in -0.35in 0.3in;
      padding: 0.5rem 0.75rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .no-print button {
      appearance: none; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px;
      padding: 0.45rem 0.85rem; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer;
    }
    .no-print button.primary { background: #0f766e; border-color: #0f766e; color: #fff; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0.4in; }
      .bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print</button>
  </div>
  <h1>On-time delivery — ${escapeHtml(String(year))}</h1>
  <div class="meta">
    <p>Percentage of completed jobs closed on or before their due date. Jobs with no due date are excluded from %.</p>
    <p>Generated ${escapeHtml(generated)}</p>
  </div>
  <div class="summary">
    <div class="card">
      <h2>Year ${escapeHtml(String(year))}</h2>
      <dl>
        <dt>On-time %</dt><dd style="color:${pctColor(yearSummary.pct, yearSummary.total)}">${pctLabel(yearSummary.pct, yearSummary.total)}</dd>
        <dt>Jobs w/ due date</dt><dd>${yearSummary.total}</dd>
        <dt>On-time</dt><dd>${yearSummary.onTime}</dd>
        <dt>Late</dt><dd>${yearSummary.late}</dd>
      </dl>
    </div>
    <div class="card">
      <h2>${escapeHtml(monthLabel)} ${escapeHtml(String(year))}</h2>
      <dl>
        <dt>On-time %</dt><dd style="color:${pctColor(monthSummary.pct, monthSummary.total)}">${pctLabel(monthSummary.pct, monthSummary.total)}</dd>
        <dt>Jobs w/ due date</dt><dd>${monthSummary.total}</dd>
        <dt>On-time</dt><dd>${monthSummary.onTime}</dd>
        <dt>Late</dt><dd>${monthSummary.late}</dd>
      </dl>
    </div>
  </div>
  <p class="chart-title">Monthly on-time %</p>
  <div class="chart" role="img" aria-label="Bar chart of monthly on-time percentage">
    <div class="bars">${chartBars}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Month</th>
        <th>Jobs w/ due date</th>
        <th>On-time</th>
        <th>Late</th>
        <th>No due date</th>
        <th>On-time %</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    });
  </script>
</body>
</html>`

  return openPrintHtml(html, { width: 960, height: 1100 })
}
