import type { CalendarDayItem, CalendarItemKind } from './companyCalendar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function printHtmlViaIframe(html: string): { error: string | null } {
  const frameId = 'company-calendar-print-frame'
  const existing = document.getElementById(frameId)
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.title = 'Company calendar print'
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '11in',
    height: '8.5in',
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
  if (doc.readyState === 'complete') window.setTimeout(runPrint, 120)
  else win.addEventListener('load', () => window.setTimeout(runPrint, 120), { once: true })
  return { error: null }
}

function kindClass(kind: CalendarItemKind) {
  if (kind === 'training') return 'chip training'
  if (kind === 'due') return 'chip due'
  return 'chip event'
}

/** Print a month grid with calendar items (landscape letter). */
export function printCompanyCalendarMonth(options: {
  companyName: string
  year: number
  monthIndex: number
  items: CalendarDayItem[]
}): { error: string | null } {
  const monthLabel = new Date(options.year, options.monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const first = new Date(options.year, options.monthIndex, 1)
  const daysInMonth = new Date(options.year, options.monthIndex + 1, 0).getDate()
  const startPad = first.getDay()

  const byDate = new Map<string, CalendarDayItem[]>()
  for (const item of options.items) {
    const list = byDate.get(item.date) ?? []
    list.push(item)
    byDate.set(item.date, list)
  }

  const cells: string[] = []
  for (let i = 0; i < startPad; i += 1) {
    cells.push('<div class="day empty"></div>')
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${options.year}-${String(options.monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayItems = byDate.get(date) ?? []
    const chips = dayItems
      .slice(0, 8)
      .map(
        (item) =>
          `<div class="${kindClass(item.kind)}" title="${escapeHtml(item.subtitle ?? '')}">${escapeHtml(item.title)}</div>`,
      )
      .join('')
    const more =
      dayItems.length > 8 ? `<div class="more">+${dayItems.length - 8} more</div>` : ''
    cells.push(`<div class="day">
      <div class="day-num">${day}</div>
      <div class="chips">${chips}${more}</div>
    </div>`)
  }
  while (cells.length % 7 !== 0) cells.push('<div class="day empty"></div>')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.companyName)} calendar — ${escapeHtml(monthLabel)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 0; padding: 0.35in; }
    h1 { font-size: 14pt; margin: 0 0 0.06in; }
    .meta { color: #475569; font-size: 9pt; margin: 0 0 0.15in; }
    .legend { display: flex; gap: 0.75rem; font-size: 8.5pt; margin: 0 0 0.12in; color: #475569; }
    .legend span::before {
      content: ""; display: inline-block; width: 0.14in; height: 0.14in; border-radius: 2px;
      margin-right: 0.08in; vertical-align: -2px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .legend .event::before { background: #0f766e; }
    .legend .training::before { background: #1d4ed8; }
    .legend .due::before { background: #b45309; }
    .weekdays, .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .weekdays div {
      font-size: 8.5pt; font-weight: 700; text-align: center; padding: 0.04in;
      background: #f1f5f9; border: 1px solid #cbd5e1;
    }
    .day {
      min-height: 1.35in; border: 1px solid #cbd5e1; padding: 0.05in;
      break-inside: avoid; background: #fff;
    }
    .day.empty { background: #f8fafc; }
    .day-num { font-size: 9pt; font-weight: 700; margin-bottom: 0.04in; }
    .chip {
      font-size: 7.5pt; line-height: 1.2; padding: 1px 3px; margin: 1px 0;
      border-radius: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .chip.event { background: #ccfbf1; color: #115e59; }
    .chip.training { background: #dbeafe; color: #1e3a8a; }
    .chip.due { background: #ffedd5; color: #9a3412; }
    .more { font-size: 7pt; color: #64748b; }
    @page { size: letter landscape; margin: 0.35in; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.companyName)} — Company calendar</h1>
  <div class="meta">${escapeHtml(monthLabel)} · Generated ${escapeHtml(new Date().toLocaleString())}</div>
  <div class="legend">
    <span class="event">Posted events</span>
    <span class="training">Scheduled training</span>
    <span class="due">Job due dates</span>
  </div>
  <div class="weekdays">${WEEKDAYS.map((d) => `<div>${d}</div>`).join('')}</div>
  <div class="grid">${cells.join('')}</div>
</body>
</html>`

  return printHtmlViaIframe(html)
}
