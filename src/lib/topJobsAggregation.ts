import { normalizeJobType } from '../constants/jobTypes'
import type { Valve } from '../types'
import { openPrintHtml } from './printHtml'

export type TopCountRow = {
  key: string
  label: string
  count: number
  pct: number
}

function blankLabel(value: string | null | undefined, fallback: string) {
  const trimmed = String(value ?? '').trim()
  return trimmed || fallback
}

export function customerKey(row: Valve): string {
  return blankLabel(row.customer, 'Unassigned')
}

export function valveTypeKey(row: Valve): string {
  return blankLabel(row.valve_type, 'Unknown type')
}

export function isValveRepairJob(row: Valve): boolean {
  return normalizeJobType(row.job_type) === 'Valve Repair'
}

/** Aggregate completed jobs into a ranked top-N list. */
export function aggregateTopCounts(
  rows: Valve[],
  keyFor: (row: Valve) => string,
  limit = 10,
): TopCountRow[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = keyFor(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = rows.length
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit))
}

export function filterJobsByCustomer(rows: Valve[], customerKeyValue: string): Valve[] {
  return rows.filter((row) => customerKey(row) === customerKeyValue)
}

export function filterJobsByValveType(rows: Valve[], valveType: string): Valve[] {
  return rows.filter((row) => valveTypeKey(row) === valveType)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Printable HTML preview of a ranked bar chart + table. */
export function printTopCountsChart(options: {
  title: string
  subtitle: string
  rows: TopCountRow[]
  totalJobs: number
  valueLabel?: string
}): { error: string | null } {
  const max = Math.max(1, ...options.rows.map((r) => r.count))
  const valueLabel = options.valueLabel ?? 'Jobs'
  const bars = options.rows
    .map((row) => {
      const width = Math.max(4, Math.round((row.count / max) * 100))
      return `<div class="row">
        <div class="label">${escapeHtml(row.label)}</div>
        <div class="track"><div class="bar" style="width:${width}%"></div></div>
        <div class="count">${row.count}</div>
        <div class="pct">${row.pct.toFixed(1)}%</div>
      </div>`
    })
    .join('')

  const tableRows = options.rows
    .map(
      (row, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(row.label)}</td>
      <td>${row.count}</td>
      <td>${row.pct.toFixed(1)}%</td>
    </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.55in; }
    h1 { font-size: 16pt; margin: 0 0 0.12in; }
    .meta { color: #475569; font-size: 10pt; margin: 0 0 0.28in; }
    .chart { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.16in; margin-bottom: 0.28in; }
    .row { display: grid; grid-template-columns: 2.1in 1fr 0.55in 0.65in; gap: 0.1in; align-items: center; margin: 0.08in 0; font-size: 9.5pt; }
    .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .track { height: 0.22in; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
    .bar { height: 100%; background: #0f766e; border-radius: 4px; }
    .count, .pct { text-align: right; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.08in 0.1in; text-align: left; }
    th { background: #f1f5f9; }
    td:nth-child(1), td:nth-child(3), td:nth-child(4),
    th:nth-child(1), th:nth-child(3), th:nth-child(4) { text-align: right; }
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
      .bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print</button>
  </div>
  <h1>${escapeHtml(options.title)}</h1>
  <div class="meta">
    <p>${escapeHtml(options.subtitle)}</p>
    <p>${options.totalJobs} total ${escapeHtml(valueLabel.toLowerCase())} in range · Generated ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
  <div class="chart">${bars || '<p>No data in this range.</p>'}</div>
  <table>
    <thead>
      <tr><th>#</th><th>Name</th><th>${escapeHtml(valueLabel)}</th><th>Share</th></tr>
    </thead>
    <tbody>${tableRows || '<tr><td colspan="4">No rows</td></tr>'}</tbody>
  </table>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    });
  </script>
</body>
</html>`

  return openPrintHtml(html, { width: 900, height: 1100 })
}
