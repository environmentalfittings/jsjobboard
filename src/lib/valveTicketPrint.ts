import { jsPDF } from 'jspdf'
import type { Valve } from '../types'
import { isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'

/** Brother QL continuous tape — matches Excel production card (2.4" x 3.9"). */
export const VALVE_TICKET_LABEL_WIDTH_IN = 2.4
export const VALVE_TICKET_LABEL_HEIGHT_IN = 3.9
export const VALVE_TICKET_LABEL_WIDTH_MM = 62
export const VALVE_TICKET_LABEL_HEIGHT_MM = 99

const CONTENT_WIDTH_MM = VALVE_TICKET_LABEL_WIDTH_MM - 4

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function buildValveTicketLines(valve: Valve): string[] {
  const jobType = normalizeJobType(valve.job_type)
  const valveRelated = isValveRelatedJobType(jobType)
  const lines = [
    'Production Card',
    valve.valve_id,
    `Customer: ${valve.customer ?? '-'}`,
    `Work Cell: ${valve.cell ?? '-'}`,
    `Size: ${valve.size ?? '-'}`,
    `Pressure class: ${valve.pressure_class ?? '-'}`,
    `Body material: ${valve.body_material ?? '-'}`,
    `Job type: ${jobType}`,
  ]

  if (valveRelated) {
    lines.push(`Valve type: ${valve.valve_type ?? '-'}`)
    lines.push(`Test type: ${valve.test_type ?? '-'}`)
  } else {
    lines.push(`Material / spec: ${valve.material_spec ?? '-'}`)
    lines.push(`Drawing / PO #: ${valve.drawing_po_number ?? '-'}`)
  }

  lines.push(`Order type: ${valve.order_type ?? '-'}`)
  lines.push(`Due date: ${formatDate(valve.due_date)}`)
  lines.push(`Status: ${valve.status}`)
  if (valve.description?.trim()) lines.push(`Description: ${valve.description.trim()}`)
  if (valve.notes?.trim()) lines.push(`Notes: ${valve.notes.trim()}`)

  return lines
}

export function downloadValveTicketPdf(valve: Valve) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [VALVE_TICKET_LABEL_WIDTH_MM, VALVE_TICKET_LABEL_HEIGHT_MM],
  })

  let y = 3.5
  for (const line of buildValveTicketLines(valve)) {
    const isTitle = line === 'Production Card'
    const isId = line === valve.valve_id
    doc.setFont('helvetica', isTitle || isId ? 'bold' : 'normal')
    doc.setFontSize(isId ? 11 : isTitle ? 8 : 7)
    const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH_MM) as string[]
    doc.text(wrapped, 2, y)
    y += wrapped.length * (isId ? 4.2 : 3.1)
    if (y > VALVE_TICKET_LABEL_HEIGHT_MM - 2) break
  }

  doc.save(`${valve.valve_id}-production-card.pdf`)
}

export function openValveTicketPdfForPrint(valve: Valve) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [VALVE_TICKET_LABEL_WIDTH_MM, VALVE_TICKET_LABEL_HEIGHT_MM],
  })

  let y = 3.5
  for (const line of buildValveTicketLines(valve)) {
    const isTitle = line === 'Production Card'
    const isId = line === valve.valve_id
    doc.setFont('helvetica', isTitle || isId ? 'bold' : 'normal')
    doc.setFontSize(isId ? 11 : isTitle ? 8 : 7)
    const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH_MM) as string[]
    doc.text(wrapped, 2, y)
    y += wrapped.length * (isId ? 4.2 : 3.1)
    if (y > VALVE_TICKET_LABEL_HEIGHT_MM - 2) break
  }

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank', 'noopener,noreferrer')
  if (!popup) {
    URL.revokeObjectURL(url)
    throw new Error('Popup blocked. Allow popups to print the PDF.')
  }
  popup.addEventListener('load', () => {
    popup.focus()
    popup.print()
  })
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function buildValveTicketPrintHtml(valve: Valve) {
  const lines = buildValveTicketLines(valve)
  const body = lines
    .map((line, index) => {
      if (index === 0) return `<div class="title">${escapeHtml(line)}</div>`
      if (index === 1) return `<div class="id">${escapeHtml(line)}</div>`
      return `<div class="row">${escapeHtml(line)}</div>`
    })
    .join('\n')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Production Card ${escapeHtml(valve.valve_id)}</title>
    <style>
      @media print {
        @page {
          size: ${VALVE_TICKET_LABEL_WIDTH_MM}mm ${VALVE_TICKET_LABEL_HEIGHT_MM}mm;
          margin: 0;
        }
      }

      html, body {
        width: ${VALVE_TICKET_LABEL_WIDTH_IN}in;
        min-height: ${VALVE_TICKET_LABEL_HEIGHT_IN}in;
        margin: 0;
        padding: 0;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 8.5pt;
        line-height: 1.25;
        color: #111;
        box-sizing: border-box;
        padding: 0.12in;
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

      .hint {
        font-size: 12px;
        color: #4b5563;
        margin: 0 0 12px;
        max-width: 3.8in;
      }

      .ticket {
        border: 1px solid #111;
        border-radius: 4px;
        padding: 0.1in;
      }

      .title {
        font-weight: 700;
        font-size: 9pt;
        margin-bottom: 2px;
      }

      .id {
        font-size: 13pt;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .row {
        margin-bottom: 1px;
        word-break: break-word;
      }

      @media print {
        .toolbar,
        .hint {
          display: none !important;
        }

        body {
          padding: 0.08in;
        }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print</button>
    </div>
    <p class="hint">
      For Brother QL-810W: choose 62&nbsp;mm (2.4&quot;) continuous tape, 99&nbsp;mm length.
      If the driver still shows 1.1&quot;&nbsp;x&nbsp;3.5&quot;, use <strong>Download PDF</strong> on the app instead.
    </p>
    <div class="ticket">
      ${body}
    </div>
  </body>
</html>`
}

export function openValveTicketPrintPreview(valve: Valve) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=520,height=720')
  if (!popup) {
    throw new Error('Popup blocked. Allow popups to print production cards.')
  }
  popup.document.write(buildValveTicketPrintHtml(valve))
  popup.document.close()
}
