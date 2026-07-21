import { jsPDF } from 'jspdf'
import type { Valve } from '../types'

/**
 * Shop production card — matches the blue grid card used on the floor.
 * (3.5" × 3" card stock; not the narrow 2.4" Brother list label.)
 */
export const VALVE_TICKET_CARD_WIDTH_IN = 3.5
export const VALVE_TICKET_CARD_HEIGHT_IN = 3
export const VALVE_TICKET_CARD_WIDTH_MM = 88.9
export const VALVE_TICKET_CARD_HEIGHT_MM = 76.2

/** Inset so borders are not clipped by printer non-printable area. */
const CARD_PRINT_INSET_MM = 4.5
const CARD_PRINT_INSET_IN = 0.15
/** Content area inside page margins (avoids transform:scale print clipping). */
const CARD_CONTENT_WIDTH_IN = VALVE_TICKET_CARD_WIDTH_IN - CARD_PRINT_INSET_IN * 2
const CARD_CONTENT_HEIGHT_IN = VALVE_TICKET_CARD_HEIGHT_IN - CARD_PRINT_INSET_IN * 2

/** Brother QL-810W continuous tape (optional USB path). */
export const VALVE_TICKET_LABEL_WIDTH_IN = 2.4
export const VALVE_TICKET_LABEL_HEIGHT_IN = 3.9
export const VALVE_TICKET_LABEL_WIDTH_MM = 62
export const VALVE_TICKET_LABEL_HEIGHT_MM = 99

export type ValveTicketCardModel = {
  valveId: string
  description: string
  dueLabel: string
  size: string
  pressureClass: string
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
    size: displayValue(valve.size),
    pressureClass: displayValue(valve.pressure_class),
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
    `Due: ${card.dueLabel}`,
    `Size: ${card.size}`,
    `Pressure: ${card.pressureClass}`,
    card.description,
    `Work Cell: ${card.workCell}`,
    card.customer,
  ]
}

function wrapPdfText(doc: jsPDF, text: string, maxWidth: number, fontSize: number): string[] {
  doc.setFontSize(fontSize)
  return doc.splitTextToSize(text, maxWidth) as string[]
}

function woFontSizePt(valveId: string): number {
  const len = valveId.length
  if (len <= 7) return 26
  if (len <= 9) return 23
  if (len <= 11) return 20
  return 17
}

function fitPdfFontSize(doc: jsPDF, text: string, maxWidth: number, maxPt: number, minPt: number): number {
  let size = maxPt
  while (size > minPt) {
    doc.setFontSize(size)
    if (doc.getTextWidth(text) <= maxWidth) return size
    size -= 0.5
  }
  return minPt
}

function scaledRowTops(heightMm: number, insetMm: number): number[] {
  const innerH = heightMm - insetMm * 2
  // WO/Due, Size, Pressure, Description, Work Cell, Customer
  const fractions = [0, 0.16, 0.26, 0.36, 0.58, 0.7]
  return fractions.map((f) => insetMm + innerH * f)
}

function drawPdfCard(doc: jsPDF, valve: Valve) {
  const card = buildValveTicketCardModel(valve)
  const W = VALVE_TICKET_CARD_WIDTH_MM
  const H = VALVE_TICKET_CARD_HEIGHT_MM
  const inset = CARD_PRINT_INSET_MM
  const innerW = W - inset * 2
  const pad = 2
  const halfW = inset + innerW / 2
  const rowTops = scaledRowTops(H, inset)
  const bottom = inset + (H - inset * 2)

  doc.setDrawColor(0)
  doc.setLineWidth(0.35)
  doc.rect(inset, inset, innerW, H - inset * 2)

  for (let i = 1; i < rowTops.length; i += 1) {
    doc.line(inset, rowTops[i], inset + innerW, rowTops[i])
  }
  doc.line(halfW, inset, halfW, rowTops[1])
  doc.line(halfW, rowTops[1], halfW, rowTops[3])

  const textLeft = inset + pad
  const valueLeft = halfW + pad
  const textWidth = halfW - inset - pad * 2
  const fullWidth = innerW - pad * 2

  doc.setFont('helvetica', 'bold')
  const woSize = fitPdfFontSize(doc, card.valveId, textWidth, woFontSizePt(card.valveId), 13)
  doc.setFontSize(woSize)
  doc.text(card.valveId, textLeft, rowTops[0] + 5)

  doc.setFontSize(11)
  doc.text('Due:', valueLeft, rowTops[0] + 4)
  doc.setFontSize(13)
  doc.text(card.dueLabel, valueLeft, rowTops[0] + 10)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Size:', textLeft, rowTops[1] + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(wrapPdfText(doc, card.size, textWidth, 11).slice(0, 1), valueLeft, rowTops[1] + 4)

  doc.setFont('helvetica', 'bold')
  doc.text('Pressure:', textLeft, rowTops[2] + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(wrapPdfText(doc, card.pressureClass, textWidth, 11).slice(0, 1), valueLeft, rowTops[2] + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(wrapPdfText(doc, card.description, fullWidth, 11).slice(0, 3), textLeft, rowTops[3] + 4)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Work Cell:', textLeft, rowTops[4] + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  const cellLabelWidth = doc.getTextWidth('Work Cell: ')
  doc.text(
    wrapPdfText(doc, card.workCell, fullWidth - cellLabelWidth, 12).slice(0, 1),
    textLeft + cellLabelWidth,
    rowTops[4] + 4.5,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  const customerMaxLines = Math.max(1, Math.floor((bottom - rowTops[5] - 3) / 5))
  doc.text(wrapPdfText(doc, card.customer, fullWidth, 14).slice(0, customerMaxLines), textLeft, rowTops[5] + 5)
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
  openValveTicketPrintPreview(valve, { autoPrint: true })
}

export function buildValveTicketPrintHtml(valve: Valve, options?: { autoPrint?: boolean }) {
  const autoPrint = options?.autoPrint ?? false
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
        width: ${VALVE_TICKET_CARD_WIDTH_IN}in;
        height: ${VALVE_TICKET_CARD_HEIGHT_IN}in;
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
        width: ${VALVE_TICKET_CARD_WIDTH_IN}in;
        height: ${VALVE_TICKET_CARD_HEIGHT_IN}in;
        padding: ${CARD_PRINT_INSET_IN}in;
      }

      .card-shell {
        width: 100%;
        height: 100%;
      }

      .card {
        width: 100%;
        height: 100%;
        border: 2px solid #111;
        background: #fff;
        display: grid;
        grid-template-rows: 0.95fr 0.5fr 0.5fr 1.35fr 0.55fr 0.9fr;
        grid-template-columns: 42% 58%;
      }

      .card > * {
        border: 1px solid #111;
        padding: 0.04in 0.07in;
        overflow: hidden;
        word-break: break-word;
        overflow-wrap: anywhere;
        min-height: 0;
      }

      .wo {
        grid-column: 1;
        grid-row: 1;
        font-size: ${woFontSizePt(card.valveId)}pt;
        font-weight: 700;
        line-height: 1.05;
        white-space: nowrap;
        word-break: normal;
        overflow-wrap: normal;
      }

      .due {
        grid-column: 2;
        grid-row: 1;
        font-size: 13pt;
        line-height: 1.2;
      }

      .due-label {
        font-size: 12pt;
        font-weight: 700;
      }

      .desc {
        grid-column: 1 / -1;
        grid-row: 4;
        font-size: 11pt;
        line-height: 1.2;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 4;
        line-clamp: 4;
      }

      .cell-label {
        font-size: 11pt;
        font-weight: 700;
        display: flex;
        align-items: center;
      }

      .cell-value {
        font-size: 12pt;
        font-weight: 700;
        display: flex;
        align-items: center;
      }

      .size-label { grid-column: 1; grid-row: 2; }
      .size-value { grid-column: 2; grid-row: 2; }
      .pressure-label { grid-column: 1; grid-row: 3; }
      .pressure-value { grid-column: 2; grid-row: 3; }

      .work-cell {
        grid-column: 1 / -1;
        grid-row: 5;
        font-size: 12pt;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 0.12in;
        white-space: nowrap;
      }

      .work-cell-label {
        font-weight: 700;
        flex: 0 0 auto;
      }

      .work-cell-value {
        font-weight: 700;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .customer {
        grid-column: 1 / -1;
        grid-row: 6;
        font-size: 16pt;
        font-weight: 700;
        line-height: 1.1;
        display: flex;
        align-items: center;
      }

      @media screen {
        html, body {
          width: auto;
          height: auto;
        }

        body {
          background: #e5e7eb;
          min-height: 100vh;
          padding: 16px;
        }

        .preview-wrap {
          width: auto;
          height: auto;
          padding: 12px;
          display: flex;
          justify-content: center;
        }

        .card-shell {
          width: ${CARD_CONTENT_WIDTH_IN}in;
          height: ${CARD_CONTENT_HEIGHT_IN}in;
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
        }
      }
    </style>
  </head>
  <body${autoPrint ? ' onload="window.focus(); window.print()"' : ''}>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print</button>
    </div>
    <p class="hint">
      Production card for ${VALVE_TICKET_CARD_WIDTH_IN}&Prime;&nbsp;&times;&nbsp;${VALVE_TICKET_CARD_HEIGHT_IN}&Prime; card stock.
      In the print dialog choose paper size <strong>${VALVE_TICKET_CARD_WIDTH_IN}&Prime;&nbsp;&times;&nbsp;${VALVE_TICKET_CARD_HEIGHT_IN}&Prime;</strong>
      (or closest custom size) and scale <strong>100%</strong> — do not use fit-to-page.
    </p>
    <div class="preview-wrap">
      <div class="card-shell">
      <div class="card" role="presentation">
        <div class="wo">${escapeHtml(card.valveId)}</div>
        <div class="due"><span class="due-label">Due:</span><br />${escapeHtml(card.dueLabel)}</div>
        <div class="cell-label size-label">Size:</div>
        <div class="cell-value size-value">${escapeHtml(card.size)}</div>
        <div class="cell-label pressure-label">Pressure:</div>
        <div class="cell-value pressure-value">${escapeHtml(card.pressureClass)}</div>
        <div class="desc">${escapeHtml(card.description)}</div>
        <div class="work-cell">
          <span class="work-cell-label">Work Cell:</span>
          <span class="work-cell-value">${escapeHtml(card.workCell)}</span>
        </div>
        <div class="customer">${escapeHtml(card.customer)}</div>
      </div>
      </div>
    </div>
  </body>
</html>`
}

export function openValveTicketPrintPreview(valve: Valve, options?: { autoPrint?: boolean }) {
  const html = buildValveTicketPrintHtml(valve, options)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const popup = window.open(url, '_blank', 'noopener,noreferrer,width=640,height=520')
  if (!popup) {
    URL.revokeObjectURL(url)
    throw new Error('Popup blocked. Allow popups to print production cards.')
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
