import { jsPDF } from 'jspdf'
import { finishCellTone } from '../constants/finishCellColors'
import { normalizeJobType } from '../constants/jobTypes'
import type { Valve } from '../types'

export type CompletedJobsPdfFilters = {
  startDate: string
  endDate: string
  turnaroundFilterLabel: string
  jobTypeFilterLabel: string
  /** Optional heading override (e.g. customer-specific print). */
  reportTitle?: string
  /** Optional download filename stem override (without .pdf). */
  fileNameStem?: string
}

const MARGIN_X = 10
const MARGIN_Y = 12
const ROW_PAD_Y = 1.6
const LINE_H = 3.4
const HEADER_H = 8
const BORDER: [number, number, number] = [148, 163, 184]

type Col = {
  key: string
  label: string
  width: number
  /** Soft wrap long text */
  wrap?: boolean
}

/** Landscape letter content width ≈ 259.4mm with 10mm side margins. */
const COLS: Col[] = [
  { key: 'valve_id', label: 'Job ID', width: 24 },
  { key: 'job_type', label: 'Job type', width: 26 },
  { key: 'customer', label: 'Customer', width: 38 },
  { key: 'cell', label: 'Cell', width: 28 },
  { key: 'size', label: 'Size', width: 16 },
  { key: 'pressure', label: 'Pressure', width: 20 },
  { key: 'valve_type', label: 'Valve type', width: 28 },
  { key: 'date_closed', label: 'Date closed', width: 24 },
  { key: 'description', label: 'Description', width: 55.4, wrap: true },
]

function tableWidth(): number {
  return COLS.reduce((sum, col) => sum + col.width, 0)
}

function display(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim()
  if (raw.length === 3) {
    const r = raw[0] + raw[0]
    const g = raw[1] + raw[1]
    const b = raw[2] + raw[2]
    return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)]
  }
  if (raw.length !== 6) return [226, 232, 240]
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)]
}

function cellValues(row: Valve): Record<string, string> {
  return {
    valve_id: display(row.valve_id),
    job_type: normalizeJobType(row.job_type),
    customer: display(row.customer),
    cell: display(row.cell),
    size: display(row.size),
    pressure: display(row.pressure_class),
    valve_type: display(row.valve_type),
    date_closed: display(row.date_closed),
    description: display(row.description),
  }
}

function setBorderStroke(doc: jsPDF) {
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.25)
}

function drawVerticalGrid(doc: jsPDF, y: number, height: number) {
  setBorderStroke(doc)
  let x = MARGIN_X
  doc.line(x, y, x, y + height)
  for (const col of COLS) {
    x += col.width
    doc.line(x, y, x, y + height)
  }
}

function drawPageHeader(doc: jsPDF, filters: CompletedJobsPdfFilters, pageWidth: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text(filters.reportTitle?.trim() || 'Completed jobs report', MARGIN_X, MARGIN_Y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  const range = `${filters.startDate} to ${filters.endDate}`
  const meta = [
    `Close date: ${range}`,
    `Turnaround filter: ${filters.turnaroundFilterLabel}`,
    `Job type: ${filters.jobTypeFilterLabel}`,
    `Generated ${new Date().toLocaleString()}`,
  ].join('  ·  ')
  doc.text(meta, MARGIN_X, MARGIN_Y + 6)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_X, MARGIN_Y + 9, pageWidth - MARGIN_X, MARGIN_Y + 9)
  return MARGIN_Y + 12
}

function drawTableHeader(doc: jsPDF, y: number): number {
  const width = tableWidth()
  doc.setFillColor(241, 245, 249)
  doc.rect(MARGIN_X, y, width, HEADER_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  let x = MARGIN_X
  for (const col of COLS) {
    doc.text(col.label, x + 1.2, y + 5.2)
    x += col.width
  }
  setBorderStroke(doc)
  doc.rect(MARGIN_X, y, width, HEADER_H, 'S')
  drawVerticalGrid(doc, y, HEADER_H)
  return y + HEADER_H
}

function wrappedLines(doc: jsPDF, text: string, maxWidth: number, maxLines: number): string[] {
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  const last = clipped[maxLines - 1]
  clipped[maxLines - 1] = last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 1))}…` : '…'
  return clipped
}

function measureRowHeight(doc: jsPDF, values: Record<string, string>): number {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  let maxLines = 1
  for (const col of COLS) {
    if (!col.wrap) continue
    const lines = wrappedLines(doc, values[col.key] ?? '—', col.width - 2.4, 4)
    maxLines = Math.max(maxLines, lines.length)
  }
  return Math.max(7.2, maxLines * LINE_H + ROW_PAD_Y * 2)
}

function drawRow(doc: jsPDF, y: number, row: Valve, rowHeight: number, zebra: boolean) {
  const values = cellValues(row)
  const width = tableWidth()
  if (zebra) {
    doc.setFillColor(248, 250, 252)
    doc.rect(MARGIN_X, y, width, rowHeight, 'F')
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(30, 41, 59)

  let x = MARGIN_X
  for (const col of COLS) {
    const text = values[col.key] ?? '—'
    if (col.key === 'cell' && text !== '—') {
      const tone = finishCellTone(row.cell)
      if (tone) {
        const [r, g, b] = hexToRgb(tone.background)
        const [tr, tg, tb] = hexToRgb(tone.color)
        const badgeW = Math.min(col.width - 2, doc.getTextWidth(text) + 4)
        const badgeH = 4.8
        const badgeX = x + 1
        const badgeY = y + (rowHeight - badgeH) / 2
        doc.setFillColor(r, g, b)
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 0.8, 0.8, 'F')
        doc.setTextColor(tr, tg, tb)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.text(text, badgeX + 2, badgeY + 3.3)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(30, 41, 59)
        x += col.width
        continue
      }
    }

    if (col.wrap) {
      const lines = wrappedLines(doc, text, col.width - 2.4, 4)
      let ty = y + ROW_PAD_Y + LINE_H
      for (const line of lines) {
        doc.text(line, x + 1.2, ty)
        ty += LINE_H
      }
    } else {
      const clipped = doc.splitTextToSize(text, col.width - 2.4) as string[]
      doc.text(clipped[0] ?? '—', x + 1.2, y + rowHeight / 2 + 1.1)
    }
    x += col.width
  }

  setBorderStroke(doc)
  doc.rect(MARGIN_X, y, width, rowHeight, 'S')
  drawVerticalGrid(doc, y, rowHeight)
}

function addFooter(doc: jsPDF, pageWidth: number, pageHeight: number, page: number, total: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(`Page ${page} of ${total}`, pageWidth / 2, pageHeight - 6, { align: 'center' })
}

export function buildCompletedJobsReportPdf(rows: Valve[], filters: CompletedJobsPdfFilters): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  type LayoutRow = { row: Valve; height: number }
  const layout: LayoutRow[] = rows.map((row) => ({
    row,
    height: measureRowHeight(doc, cellValues(row)),
  }))

  const pages: LayoutRow[][] = []
  let current: LayoutRow[] = []
  const startBodyY = () => MARGIN_Y + 12 + HEADER_H

  let yCursor = startBodyY()
  for (const item of layout) {
    if (yCursor + item.height > pageHeight - 12) {
      pages.push(current)
      current = []
      yCursor = startBodyY()
    }
    current.push(item)
    yCursor += item.height
  }
  pages.push(current)

  const totalPages = Math.max(1, pages.length)

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    if (pageIndex > 0) doc.addPage()
    let y = drawPageHeader(doc, filters, pageWidth)
    y = drawTableHeader(doc, y)
    const pageRows = pages[pageIndex] ?? []
    if (pageRows.length === 0 && pageIndex === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139)
      doc.text('No completed jobs in this date range.', MARGIN_X, y + 10)
    } else {
      pageRows.forEach((item, i) => {
        drawRow(doc, y, item.row, item.height, i % 2 === 1)
        y += item.height
      })
    }
    addFooter(doc, pageWidth, pageHeight, pageIndex + 1, totalPages)
  }

  return doc
}

export function completedJobsReportFileName(startDate: string, endDate: string, stem?: string): string {
  const base = (stem ?? 'completed-jobs').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${base || 'completed-jobs'}-${startDate}-to-${endDate}.pdf`
}

export function downloadCompletedJobsReportPdf(rows: Valve[], filters: CompletedJobsPdfFilters): void {
  const doc = buildCompletedJobsReportPdf(rows, filters)
  doc.save(completedJobsReportFileName(filters.startDate, filters.endDate, filters.fileNameStem))
}
