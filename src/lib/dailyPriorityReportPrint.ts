import { displayJobStatus } from './jobDisplayStatus'
import type { YesterdayClosedJob, YesterdayStatusMove } from './dailyPriorityYesterday'
import type { Valve } from '../types'

export type DailyPriorityReportAssignment = {
  technicianName?: string | null
  notes?: string | null
}

export type DailyPriorityReportSection = {
  /** Section heading (status name or finish-cell label). */
  shopStatus: string
  valves: Valve[]
  /** When `cell`, the mid column shows shop status instead of finish cell. */
  kind?: 'status' | 'cell'
  assignments?: Record<string, DailyPriorityReportAssignment>
}

export type DailyPriorityYesterdayPrint = {
  label: string
  closed: YesterdayClosedJob[]
  moves: YesterdayStatusMove[]
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
  return trimmed ? trimmed : ''
}

function formatDue(value: string | null | undefined) {
  if (!value?.trim()) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.trim()
  return parsed.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })
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
      const assignment = section.assignments?.[valve.valve_id]
      return `<tr>
        <td class="rank">${index + 1}</td>
        <td class="wo">${escapeHtml(valve.valve_id)}</td>
        <td class="customer">${escapeHtml(display(valve.customer))}</td>
        <td class="mid">${escapeHtml(mid)}</td>
        <td class="size">${escapeHtml(display(valve.size))}</td>
        <td class="pressure">${escapeHtml(display(valve.pressure_class))}</td>
        <td class="due">${escapeHtml(formatDue(valve.due_date))}</td>
        <td class="desc">${escapeHtml(display(valve.description))}</td>
        <td class="tech">${escapeHtml(display(assignment?.technicianName))}</td>
        <td class="notes">${escapeHtml(display(assignment?.notes))}</td>
      </tr>`
    })
    .join('')

  const empty =
    section.valves.length === 0
      ? '<tr><td colspan="10" class="empty">No active valves in this department.</td></tr>'
      : ''

  return `<section class="dept">
    <header class="dept-head">
      <h2>${escapeHtml(section.shopStatus)}</h2>
      <p class="count">${section.valves.length} job${section.valves.length === 1 ? '' : 's'}</p>
    </header>
    <table>
      <thead>
        <tr>
          <th class="rank">#</th>
          <th class="wo">WO #</th>
          <th class="customer">Customer</th>
          <th class="mid">${escapeHtml(midLabel)}</th>
          <th class="size">Size</th>
          <th class="pressure">Pressure</th>
          <th class="due">Due</th>
          <th class="desc">Description</th>
          <th class="tech">Technician</th>
          <th class="notes">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows || empty}
      </tbody>
    </table>
  </section>`
}

function formatChangedAt(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function yesterdayHtml(yesterday: DailyPriorityYesterdayPrint): string {
  const closedRows =
    yesterday.closed.length === 0
      ? '<tr><td colspan="4" class="empty">None</td></tr>'
      : yesterday.closed
          .map(
            (row) => `<tr>
        <td class="wo">${escapeHtml(row.valve_id)}</td>
        <td class="customer">${escapeHtml(display(row.customer))}</td>
        <td class="mid">${escapeHtml(display(row.status))}</td>
        <td class="due">${escapeHtml(row.date_closed)}</td>
      </tr>`,
          )
          .join('')

  const moveRows =
    yesterday.moves.length === 0
      ? '<tr><td colspan="4" class="empty">None</td></tr>'
      : yesterday.moves
          .map(
            (row) => `<tr>
        <td class="wo">${escapeHtml(row.valve_id)}</td>
        <td class="customer">${escapeHtml(display(row.customer))}</td>
        <td class="mid">${escapeHtml(`${row.fromStatus} → ${row.toStatus}`)}</td>
        <td class="due">${escapeHtml(formatChangedAt(row.changedAt))}</td>
      </tr>`,
          )
          .join('')

  return `<section class="dept yesterday">
    <header class="dept-head">
      <h2>Yesterday — completed (${escapeHtml(yesterday.label)})</h2>
      <p class="count">${yesterday.closed.length} job${yesterday.closed.length === 1 ? '' : 's'}</p>
    </header>
    <table>
      <thead>
        <tr>
          <th class="wo">WO #</th>
          <th class="customer">Customer</th>
          <th class="mid">Status</th>
          <th class="due">Closed</th>
        </tr>
      </thead>
      <tbody>${closedRows}</tbody>
    </table>
    <header class="dept-head yesterday-subhead">
      <h2>Yesterday — status moves (${escapeHtml(yesterday.label)})</h2>
      <p class="count">${yesterday.moves.length} move${yesterday.moves.length === 1 ? '' : 's'}</p>
    </header>
    <table>
      <thead>
        <tr>
          <th class="wo">WO #</th>
          <th class="customer">Customer</th>
          <th class="mid">From → To</th>
          <th class="due">When</th>
        </tr>
      </thead>
      <tbody>${moveRows}</tbody>
    </table>
  </section>`
}

export function buildDailyPriorityReportHtml(
  sections: DailyPriorityReportSection[],
  options?: { title?: string; autoPrint?: boolean; yesterday?: DailyPriorityYesterdayPrint | null },
): string {
  const title = options?.title ?? 'Daily Priority Report'
  const autoPrint = options?.autoPrint ?? false
  const body = [
    ...sections.map(sectionHtml),
    options?.yesterday ? yesterdayHtml(options.yesterday) : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: letter landscape;
        margin: 0.35in;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 12px;
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        font-size: 10px;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        padding-bottom: 10px;
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
      .toolbar-hint {
        margin: 0;
        color: #64748b;
        font-size: 12px;
        max-width: 36rem;
      }
      h1 {
        margin: 0 0 2px;
        font-size: 16px;
      }
      .report-date {
        margin: 0 0 10px;
        color: #4b5563;
        font-size: 11px;
      }
      .dept {
        margin: 0 0 12px;
      }
      .dept + .dept {
        page-break-before: always;
      }
      .dept-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin: 0 0 6px;
      }
      h2 {
        margin: 0;
        font-size: 13px;
      }
      .count {
        margin: 0;
        color: #4b5563;
        font-size: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 9.5px;
      }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      th, td {
        border: 1px solid #94a3b8;
        padding: 3px 5px;
        text-align: left;
        vertical-align: top;
        word-wrap: break-word;
        overflow-wrap: anywhere;
      }
      th {
        background: #e2e8f0;
        font-weight: 700;
      }
      .rank { width: 3%; text-align: center; font-weight: 700; }
      .wo { width: 8%; font-weight: 700; white-space: nowrap; }
      .customer { width: 13%; }
      .mid { width: 9%; }
      .size { width: 5%; white-space: nowrap; }
      .pressure { width: 6%; white-space: nowrap; }
      .due { width: 6%; white-space: nowrap; }
      .desc { width: 18%; }
      .tech { width: 14%; }
      .notes { width: 18%; }
      .empty { color: #64748b; font-style: italic; }
      .yesterday-subhead { margin-top: 14px; }
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
        Use landscape. In the print dialog, turn off <strong>Headers and footers</strong>
        so the page URL and date do not appear on the page.
      </p>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="report-date">${escapeHtml(formatReportDate())}</p>
    ${body}
    <script>
      ${
        autoPrint
          ? `window.addEventListener('load', function () {
        window.focus();
        setTimeout(function () { window.print(); }, 250);
      });`
          : ''
      }
    </script>
  </body>
</html>`
}

export function openDailyPriorityReportPrint(
  sections: DailyPriorityReportSection[],
  options?: { title?: string; autoPrint?: boolean; yesterday?: DailyPriorityYesterdayPrint | null },
) {
  // Use a hidden iframe so browsers do not treat this as a popup.
  const html = buildDailyPriorityReportHtml(sections, { ...options, autoPrint: false })
  const existing = document.getElementById('daily-priority-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'daily-priority-print-frame'
  iframe.title = 'Daily priority print'
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
    throw new Error('Could not open print preview.')
  }

  doc.open()
  doc.write(html)
  doc.close()

  const cleanup = () => {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  win.addEventListener('afterprint', cleanup)
  // Fallback if afterprint never fires (some browsers).
  window.setTimeout(cleanup, 60_000)

  const shouldAutoPrint = options?.autoPrint ?? false
  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
      throw new Error('Could not open the print dialog.')
    }
  }

  if (shouldAutoPrint) {
    // Defer one tick so the iframe finishes painting inline styles.
    window.setTimeout(runPrint, 50)
  }
}
