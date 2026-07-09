import { jsPDF } from 'jspdf'
import { formatTestProceduresSummary, type TestLogTestingDetails, type YesNo } from '../types/testLog'
import { resolveTestMedia } from '../lib/testLogMedia'
import { isFourHourChartTestSelected } from './testLogProcedure'

export type TestLogReportData = {
  tested_on: string
  valve_id: string
  size: string | null
  pressure: string | null
  valve_type: string | null
  manufacturer: string | null
  tester: string | null
  pass_fail: string | null
  action_taken: string | null
  testing_details: TestLogTestingDetails
}

const MARGIN = 14
const PAGE_WIDTH = 215.9
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

function formatYesNo(value: YesNo): string {
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return '—'
}

function formatResult(value: string): string {
  if (value === 'pass') return 'PASS'
  if (value === 'fail') return 'FAIL'
  return '—'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function display(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed || '—'
}

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(title, MARGIN, y)
  doc.setDrawColor(180, 180, 180)
  doc.line(MARGIN, y + 1.5, PAGE_WIDTH - MARGIN, y + 1.5)
  return y + 7
}

function addKeyValueLines(doc: jsPDF, rows: [string, string][], startY: number): number {
  doc.setFontSize(9.5)
  let y = startY
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    const wrapped = doc.splitTextToSize(value, CONTENT_WIDTH - 42) as string[]
    doc.text(wrapped, MARGIN + 40, y)
    y += Math.max(4.5, wrapped.length * 4.2)
  }
  return y + 2
}

function addPressureBlock(
  doc: jsPDF,
  title: string,
  block: TestLogTestingDetails['lowTest'],
  y: number,
  extraLines: [string, string][] = [],
): number {
  y = addSectionTitle(doc, title, y)
  const rows: [string, string][] = [
    ['Test media', display(resolveTestMedia(block))],
    ['Test gauge', display(block.gauge)],
    ['Test pressure', display(block.pressure)],
    ['Test time', display(block.time)],
    ...extraLines,
    ['Result', formatResult(block.result)],
  ]
  if (block.result === 'fail' && block.reason.trim()) {
    rows.push(['Reason', block.reason.trim()])
  }
  return addKeyValueLines(doc, rows, y)
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (y + needed > pageHeight - MARGIN) {
    doc.addPage()
    return MARGIN
  }
  return y
}

export function buildTestLogReportPdf(data: TestLogReportData): jsPDF {
  const details = data.testing_details
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Valve Test Report', MARGIN, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN, 24)

  let y = 32
  y = addSectionTitle(doc, 'Valve information', y)
  y = addKeyValueLines(
    doc,
    [
      ['Valve ID', display(data.valve_id)],
      ['Test date', formatDate(data.tested_on)],
      ['Size', display(data.size)],
      ['Pressure', display(data.pressure)],
      ['Type', display(data.valve_type)],
      ['Tester', display(data.tester)],
      ['Overall result', display(data.pass_fail)],
    ],
    y,
  )

  y = ensureSpace(doc, y, 40)
  y = addSectionTitle(doc, 'Test requirements', y)
  y = addKeyValueLines(doc, [['Requirements', display(formatTestProceduresSummary(details))]], y)

  const shellExtras: [string, string][] = []
  if (isFourHourChartTestSelected(details) && details.shellTest.chartRecorderNumber.trim()) {
    shellExtras.push(['Chart recorder', details.shellTest.chartRecorderNumber.trim()])
  }

  y = ensureSpace(doc, y, 48)
  y = addPressureBlock(doc, 'Low pressure test', details.lowTest, y)
  y = ensureSpace(doc, y, 48)
  y = addPressureBlock(doc, 'High pressure test', details.highTest, y)
  y = ensureSpace(doc, y, 48)
  y = addPressureBlock(doc, 'Shell pressure test', details.shellTest, y, shellExtras)

  if (details.heliumTest.enabled) {
    y = ensureSpace(doc, y, 70)
    y = addSectionTitle(doc, 'Helium test', y)
    y = addKeyValueLines(
      doc,
      [
        ['Test media', display(resolveTestMedia(details.heliumTest))],
        ['Helium calibrated', formatYesNo(details.heliumTest.heliumCalibrated)],
        ['Cycled 5×', formatYesNo(details.heliumTest.cycled5x)],
        ['Mid stroke', formatYesNo(details.heliumTest.midStroke)],
        ['Drafts eliminated', formatYesNo(details.heliumTest.draftsEliminated)],
        ['Test gauge', display(details.heliumTest.gauge)],
        ['Pressure', display(details.heliumTest.pressure)],
        ['Time', display(details.heliumTest.time)],
        ['Ambient', display(details.heliumTest.ambient)],
        ['Stem', display(details.heliumTest.stem)],
        ['Bonnet', display(details.heliumTest.bonnet)],
        ['Body', display(details.heliumTest.body)],
        ['Result', formatResult(details.heliumTest.result)],
      ],
      y,
    )
  }

  if (details.cavityReliefTest.enabled) {
    y = ensureSpace(doc, y, 50)
    y = addSectionTitle(doc, 'Cavity relief test', y)
    y = addKeyValueLines(
      doc,
      [
        ['Test media', display(resolveTestMedia(details.cavityReliefTest))],
        ['MAWP @ 100°F', display(details.cavityReliefTest.mawp100F)],
        ['Seat A', display(details.cavityReliefTest.seatA)],
        ['Seat B', display(details.cavityReliefTest.seatB)],
        ['Result', formatResult(details.cavityReliefTest.result)],
      ],
      y,
    )
  }

  const notes = details.additionalNotes.trim() || data.action_taken?.trim() || ''
  if (notes) {
    y = ensureSpace(doc, y, 24)
    y = addSectionTitle(doc, 'Notes', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const wrapped = doc.splitTextToSize(notes, CONTENT_WIDTH) as string[]
    doc.text(wrapped, MARGIN, y)
  }

  return doc
}

export function testLogReportFileName(valveId: string, testedOn: string): string {
  const safeValve = valveId.replace(/[^\w.-]+/g, '_')
  return `${safeValve}-test-report-${testedOn}.pdf`
}

export function downloadTestLogReportPdf(data: TestLogReportData) {
  const doc = buildTestLogReportPdf(data)
  doc.save(testLogReportFileName(data.valve_id, data.tested_on))
}

export function testLogReportPdfBlob(data: TestLogReportData): Blob {
  const doc = buildTestLogReportPdf(data)
  return doc.output('blob')
}
