import { displayJobStatus } from './jobDisplayStatus'
import type { Valve } from '../types'

export type DailyPriorityReportSection = {
  /** Section heading (status name or finish-cell label). */
  shopStatus: string
  valves: Valve[]
  /** When `cell`, the mid column shows shop status instead of finish cell. */
  kind?: 'status' | 'cell'
}

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

function formatReportDate(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function sectionHtml(section: DailyPriorityReportSection): string {
  const midLabel = section.kind === 'cell' ? 'Status' : 'Cell'
  const rows = section.valves
    .map((valve, index) => {
      const mid =
        section.kind === 'cell' ? displayJobStatus(valve) : display(valve.cell)
      return `<tr>
        <td class="rank">${index + 1}</td>
        <td class="wo">${escapeHtml(valve.valve_id)}</td>
        <td>${escapeHtml(display(valve.customer))}</td>
        <td>${escapeHtml(mid)}</td>
        <td>${escapeHtml(display(valve.due_date))}</td>
        <td class="desc">${escapeHtml(display(valve.description))}</td>
      </tr>`
    })
    .join('')

  const empty =
    section.valves.length === 0
      ? '<tr><td colspan="6" class="empty">No active valves in this department.</td></tr>'
      : ''

  return `<section class="dept">
    <h2>${escapeHtml(section.shopStatus)}</h2>
    <p class="count">${section.valves.length} job${section.valves.length === 1 ? '' : 's'}</p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>WO #</th>
          <th>Customer</th>
          <th>${escapeHtml(midLabel)}</th>
          <th>Due</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows || empty}
      </tbody>
    </table>
  </section>`
}

export function buildDailyPriorityReportHtml(
  sections: DailyPriorityReportSection[],
  options?: { title?: string; autoPrint?: boolean },
): string {
  const title = options?.title ?? 'Daily Priority Report'
  const autoPrint = options?.autoPrint ?? false
  const body = sections.map(sectionHtml).join('\n')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 16px;
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
      }
      .toolbar {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #d1d5db;
      }
      .toolbar button {
        font: inherit;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid #2563eb;
        background: #2563eb;
        color: #fff;
        cursor: pointer;
      }
      h1 {
        margin: 0 0 4px;
        font-size: 22px;
      }
      .report-date {
        margin: 0 0 18px;
        color: #4b5563;
        font-size: 14px;
      }
      .dept {
        margin-bottom: 24px;
        page-break-inside: avoid;
      }
      .dept + .dept {
        page-break-before: always;
      }
      h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }
      .count {
        margin: 0 0 10px;
        color: #4b5563;
        font-size: 13px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 6px 8px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: #f1f5f9;
        font-weight: 700;
      }
      .rank { width: 36px; text-align: center; font-weight: 700; }
      .wo { font-weight: 700; white-space: nowrap; }
      .desc { max-width: 280px; }
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
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="report-date">${escapeHtml(formatReportDate())}</p>
    ${body}
    <script>
      ${autoPrint ? 'window.focus(); window.print();' : ''}
    </script>
  </body>
</html>`
}

export function openDailyPriorityReportPrint(
  sections: DailyPriorityReportSection[],
  options?: { title?: string; autoPrint?: boolean },
) {
  const html = buildDailyPriorityReportHtml(sections, options)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!popup) {
    URL.revokeObjectURL(url)
    throw new Error('Popup blocked. Allow popups to print the daily priority report.')
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
