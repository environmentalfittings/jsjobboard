import { jsPDF } from 'jspdf'
import type { Valve } from '../types'

/**
 * Shop production card — matches the blue grid card used on the floor.
 * (4" × 3" card stock; not the narrow 2.4" Brother list label.)
 */
export const VALVE_TICKET_CARD_WIDTH_IN = 4
export const VALVE_TICKET_CARD_HEIGHT_IN = 3
export const VALVE_TICKET_CARD_WIDTH_MM = 101.6
export const VALVE_TICKET_CARD_HEIGHT_MM = 76.2

/** Brother QL-810W continuous tape (optional USB path). */
export const VALVE_TICKET_LABEL_WIDTH_IN = 2.4
export const VALVE_TICKET_LABEL_HEIGHT_IN = 3.9
export const VALVE_TICKET_LABEL_WIDTH_MM = 62
export const VALVE_TICKET_LABEL_HEIGHT_MM = 99

export type ValveTicketCardModel = {
  valveId: string
  description: string
  dueLabel: string
  workCell: string
  customer: string
}

export type ValveTicketField = { label: string; value: string }

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

function displayValue(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : '-'
}

function formatDescription(valve: Valve) {
  const raw = valve.description?.trim()
  if (!raw) return '-'
  return raw.startsWith('#') ? raw : `# ${raw}`
}

/** Grid card content (blue shop card layout). */
export function buildValveTicketCardModel(valve: Valve): ValveTicketCardModel {
  return {
    valveId: valve.valve_id,
    description: formatDescription(valve),
    dueLabel: formatDate(valve.due_date),
    workCell: displayValue(valve.cell),
    customer: displayValue(valve.customer),
  }
}

/** Legacy flat lines — Brother USB fallback only. */
export function buildValveTicketFields(valve: Valve): ValveTicketField[] {
  return [
    { label: 'Customer', value: displayValue(valve.customer) },
    { label: 'Work Cell', value: displayValue(valve.cell) },
    { label: 'Due date', value: formatDate(valve.due_date) },
    { label: 'Description', value: formatDescription(valve) },
  ]
}

export function buildValveTicketLines(valve: Valve): string[] {
  const card = buildValveTicketCardModel(valve)
  return [
    card.valveId,
    card.description,
    `Due: ${card.dueLabel}`,
    `Work Cell: ${card.workCell}`,
    card.customer,
  ]
}

function wrapPdfText(doc: jsPDF, text: string, maxWidth: number, fontSize: number): string[] {
  doc.setFontSize(fontSize)
  return doc.splitTextToSize(text, maxWidth) as string[]
}

function drawPdfCard(doc: jsPDF, valve: Valve) {
  const card = buildValveTicketCardModel(valve)
  const W = VALVE_TICKET_CARD_WIDTH_MM
  const H = VALVE_TICKET_CARD_HEIGHT_MM
  const pad = 2
  const halfW = W / 2

  const rowHeights = [24, 20, 16, H - 24 - 20 - 16]
  const rowTops = [
    0,
    rowHeights[0],
    rowHeights[0] + rowHeights[1],
    rowHeights[0] + rowHeights[1] + rowHeights[2],
  ]

  doc.setDrawColor(0)
  doc.setLineWidth(0.35)
  doc.rect(0, 0, W, H)

  // Row dividers
  for (let i = 1; i < rowTops.length; i += 1) {
    doc.line(0, rowTops[i], W, rowTops[i])
  }
  // Top row + work cell vertical split
  doc.line(halfW, 0, halfW, rowTops[1])
  doc.line(halfW, rowTops[2], halfW, rowTops[3])

  // WO #
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  const woLines = wrapPdfText(doc, card.valveId, halfW - pad * 2, 22)
  doc.text(woLines, pad, rowTops[0] + 8)

  // Due
  doc.setFontSize(11)
  doc.text('Due:', halfW + pad, rowTops[0] + 7)
  doc.setFontSize(13)
  doc.text(card.dueLabel, halfW + pad, rowTops[0] + 14)

  // Description
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const descLines = wrapPdfText(doc, card.description, W - pad * 2, 11)
  doc.text(descLines.slice(0, 2), pad, rowTops[1] + 7)

  // Work cell
  doc.setFontSize(10)
  doc.text('Work Cell:', pad, rowTops[2] + 7)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  const cellLines = wrapPdfText(doc, card.workCell, halfW - pad * 2, 11)
  doc.text(cellLines.slice(0, 2), halfW + pad, rowTops[2] + 7)

  // Customer
  doc.setFontSize(16)
  const customerLines = wrapPdfText(doc, card.customer, W - pad * 2, 16)
  doc.text(customerLines.slice(0, 2), pad, rowTops[3] + 10)
}

function createValveTicketPdf(valve: Valve) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [VALVE_TICKET_CARD_WIDTH_MM, VALVE_TICKET_CARD_HEIGHT_MM],
  })
  drawPdfCard(doc, valve)
  return doc
}

export function downloadValveTicketPdf(valve: Valve) {
  createValveTicketPdf(valve).save(`${valve.valve_id}-production-card.pdf`)
}

export function openValveTicketPdfForPrint(valve: Valve) {
  const doc = createValveTicketPdf(valve)
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
  const card = buildValveTicketCardModel(valve)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Production Card ${escapeHtml(valve.valve_id)}</title>
    <style>
      * { box-sizing: border-box; }

      @page {
        size: ${VALVE_TICKET_CARD_WIDTH_IN}in ${VALVE_TICKET_CARD_HEIGHT_IN}in;
        margin: 0;
      }

      html, body {
        margin: 0;
        padding: 0;
      }

      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
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
        max-width: 5in;
        line-height: 1.4;
      }

      .preview-wrap {
        display: flex;
        justify-content: flex-start;
      }

      .card {
        width: ${VALVE_TICKET_CARD_WIDTH_IN}in;
        height: ${VALVE_TICKET_CARD_HEIGHT_IN}in;
        border: 2px solid #111;
        border-collapse: collapse;
        table-layout: fixed;
        background: #fff;
      }

      .card td {
        border: 1px solid #111;
        padding: 0.12in 0.14in;
        vertical-align: top;
        overflow: hidden;
        word-break: break-word;
        overflow-wrap: anywhere;
      }

      .wo {
        width: 55%;
        font-size: 28pt;
        font-weight: 700;
        line-height: 1.05;
      }

      .due {
        width: 45%;
        font-size: 13pt;
        line-height: 1.25;
      }

      .due-label {
        font-size: 11pt;
        font-weight: 700;
      }

      .desc {
        font-size: 12pt;
        line-height: 1.25;
        height: 0.75in;
      }

      .cell-label {
        width: 38%;
        font-size: 11pt;
        font-weight: 700;
        vertical-align: middle;
      }

      .cell-value {
        width: 62%;
        font-size: 13pt;
        font-weight: 700;
        vertical-align: middle;
      }

      .customer {
        font-size: 18pt;
        font-weight: 700;
        line-height: 1.15;
        height: 0.85in;
        vertical-align: middle;
      }

      @media screen {
        body {
          background: #e5e7eb;
          padding: 16px;
        }

        .preview-wrap {
          justify-content: center;
        }

        .card {
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
        }
      }

      @media print {
        .toolbar,
        .hint {
          display: none !important;
        }

        body {
          background: #fff;
          padding: 0;
        }

        .preview-wrap {
          justify-content: flex-start;
        }

        .card {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print</button>
    </div>
    <p class="hint">
      Production card layout for ${VALVE_TICKET_CARD_WIDTH_IN}&Prime;&nbsp;&times;&nbsp;${VALVE_TICKET_CARD_HEIGHT_IN}&Prime; blue card stock.
      Use <strong>Print production card</strong> or <strong>Download PDF</strong>, then print at 100% scale (no fit-to-page).
    </p>
    <div class="preview-wrap">
      <table class="card" role="presentation">
        <tr>
          <td class="wo">${escapeHtml(card.valveId)}</td>
          <td class="due"><span class="due-label">Due:</span><br />${escapeHtml(card.dueLabel)}</td>
        </tr>
        <tr>
          <td class="desc" colspan="2">${escapeHtml(card.description)}</td>
        </tr>
        <tr>
          <td class="cell-label">Work Cell:</td>
          <td class="cell-value">${escapeHtml(card.workCell)}</td>
        </tr>
        <tr>
          <td class="customer" colspan="2">${escapeHtml(card.customer)}</td>
        </tr>
      </table>
    </div>
  </body>
</html>`
}

export function openValveTicketPrintPreview(valve: Valve) {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=640,height=520')
  if (!popup) {
    throw new Error('Popup blocked. Allow popups to print production cards.')
  }
  popup.document.write(buildValveTicketPrintHtml(valve))
  popup.document.close()
}
