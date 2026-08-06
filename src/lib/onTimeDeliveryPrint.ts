import { jsPDF } from 'jspdf'

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

const MARGIN_X = 14
const MARGIN_Y = 14

function pctLabel(pct: number, total: number) {
  return total > 0 ? `${pct.toFixed(1)}%` : '—'
}

function pctRgb(pct: number, total: number): [number, number, number] {
  if (total <= 0) return [100, 116, 139]
  if (pct >= 90) return [22, 163, 74]
  if (pct >= 75) return [202, 138, 4]
  return [220, 38, 38]
}

function drawSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  lines: Array<{ label: string; value: string; color?: [number, number, number] }>,
) {
  doc.setDrawColor(203, 213, 225)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text(title, x + 4, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let ty = y + 14
  for (const line of lines) {
    doc.setTextColor(100, 116, 139)
    doc.text(line.label, x + 4, ty)
    doc.setFont('helvetica', 'bold')
    if (line.color) doc.setTextColor(...line.color)
    else doc.setTextColor(15, 23, 42)
    doc.text(line.value, x + w - 4, ty, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    ty += 6
  }
}

function drawBarChart(doc: jsPDF, byMonth: OnTimeDeliveryMonthRow[], x: number, y: number, w: number, h: number) {
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  const plotLeft = x + 12
  const plotRight = x + w - 6
  const plotTop = y + 8
  const plotBottom = y + h - 14
  const plotW = plotRight - plotLeft
  const plotH = plotBottom - plotTop

  // Grid lines at 0/25/50/75/100
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  for (const tick of [0, 25, 50, 75, 100]) {
    const gy = plotBottom - (tick / 100) * plotH
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.2)
    doc.line(plotLeft, gy, plotRight, gy)
    doc.setTextColor(148, 163, 184)
    doc.text(`${tick}%`, plotLeft - 2, gy + 1.5, { align: 'right' })
  }

  const slot = plotW / 12
  const barW = Math.min(10, slot * 0.55)
  byMonth.forEach((row, i) => {
    const cx = plotLeft + slot * i + slot / 2
    const height = row.total > 0 ? Math.max(1.2, (row.pct / 100) * plotH) : 0
    if (height > 0) {
      const [r, g, b] = pctRgb(row.pct, row.total)
      doc.setFillColor(r, g, b)
      doc.rect(cx - barW / 2, plotBottom - height, barW, height, 'F')
      if (height >= 10) {
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.text(`${row.pct.toFixed(0)}%`, cx, plotBottom - height + 4, { align: 'center' })
      }
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(71, 85, 105)
    doc.text(row.label.slice(0, 3), cx, plotBottom + 5, { align: 'center' })
  })
}

export function buildOnTimeDeliveryPdf(options: {
  year: number
  monthLabel: string
  yearSummary: OnTimeDeliverySummary
  monthSummary: OnTimeDeliverySummary
  byMonth: OnTimeDeliveryMonthRow[]
}): jsPDF {
  const { year, monthLabel, yearSummary, monthSummary, byMonth } = options
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentW = pageWidth - MARGIN_X * 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(`On-time delivery — ${year}`, MARGIN_X, MARGIN_Y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(
    'Percentage of completed jobs closed on or before their due date. Jobs with no due date are excluded.',
    MARGIN_X,
    MARGIN_Y + 6,
  )
  doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN_X, MARGIN_Y + 11)

  const cardY = MARGIN_Y + 16
  const cardH = 34
  const cardGap = 4
  const cardW = (contentW - cardGap) / 2
  drawSummaryCard(doc, MARGIN_X, cardY, cardW, cardH, `Year ${year}`, [
    { label: 'On-time %', value: pctLabel(yearSummary.pct, yearSummary.total), color: pctRgb(yearSummary.pct, yearSummary.total) },
    { label: 'Jobs w/ due date', value: String(yearSummary.total) },
    { label: 'On-time', value: String(yearSummary.onTime) },
    { label: 'Late', value: String(yearSummary.late) },
  ])
  drawSummaryCard(doc, MARGIN_X + cardW + cardGap, cardY, cardW, cardH, `${monthLabel} ${year}`, [
    {
      label: 'On-time %',
      value: pctLabel(monthSummary.pct, monthSummary.total),
      color: pctRgb(monthSummary.pct, monthSummary.total),
    },
    { label: 'Jobs w/ due date', value: String(monthSummary.total) },
    { label: 'On-time', value: String(monthSummary.onTime) },
    { label: 'Late', value: String(monthSummary.late) },
  ])

  const chartY = cardY + cardH + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Monthly on-time %', MARGIN_X, chartY)
  drawBarChart(doc, byMonth, MARGIN_X, chartY + 3, contentW, 62)

  const tableY = chartY + 72
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Monthly detail', MARGIN_X, tableY)

  const cols = [
    { key: 'label', label: 'Month', width: 32 },
    { key: 'total', label: 'Jobs w/ due', width: 28 },
    { key: 'onTime', label: 'On-time', width: 24 },
    { key: 'late', label: 'Late', width: 22 },
    { key: 'noDueDate', label: 'No due date', width: 28 },
    { key: 'pct', label: 'On-time %', width: contentW - 32 - 28 - 24 - 22 - 28 },
  ] as const

  const headerH = 8
  let y = tableY + 3
  doc.setFillColor(241, 245, 249)
  doc.rect(MARGIN_X, y, contentW, headerH, 'F')
  doc.setDrawColor(148, 163, 184)
  doc.setLineWidth(0.25)
  doc.rect(MARGIN_X, y, contentW, headerH, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  let x = MARGIN_X
  for (const col of cols) {
    doc.text(col.label, x + 2, y + 5.2)
    x += col.width
  }
  y += headerH

  const rowH = 7.2
  byMonth.forEach((row, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(MARGIN_X, y, contentW, rowH, 'F')
    }
    doc.setDrawColor(203, 213, 225)
    doc.rect(MARGIN_X, y, contentW, rowH, 'S')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(30, 41, 59)
    const values = [
      row.label,
      String(row.total),
      String(row.onTime),
      String(row.late),
      String(row.noDueDate),
      pctLabel(row.pct, row.total),
    ]
    x = MARGIN_X
    values.forEach((value, idx) => {
      if (idx === 5 && row.total > 0) {
        doc.setTextColor(...pctRgb(row.pct, row.total))
        doc.setFont('helvetica', 'bold')
      } else {
        doc.setTextColor(30, 41, 59)
        doc.setFont('helvetica', 'normal')
      }
      doc.text(value, x + 2, y + 4.8)
      x += cols[idx].width
    })
    y += rowH
  })

  return doc
}

export function downloadOnTimeDeliveryPdf(options: {
  year: number
  monthLabel: string
  yearSummary: OnTimeDeliverySummary
  monthSummary: OnTimeDeliverySummary
  byMonth: OnTimeDeliveryMonthRow[]
}): void {
  const doc = buildOnTimeDeliveryPdf(options)
  doc.save(`on-time-delivery-${options.year}.pdf`)
}

/** @deprecated Use downloadOnTimeDeliveryPdf — kept name for call-site clarity during transition. */
export function printOnTimeDeliveryReport(options: {
  year: number
  monthLabel: string
  yearSummary: OnTimeDeliverySummary
  monthSummary: OnTimeDeliverySummary
  byMonth: OnTimeDeliveryMonthRow[]
}): { error: string | null } {
  try {
    downloadOnTimeDeliveryPdf(options)
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not create PDF' }
  }
}
