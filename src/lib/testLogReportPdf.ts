import { jsPDF } from 'jspdf'
import type { TestLogTestingDetails } from '../types/testLog'
import { resolveTestMedia } from './testLogMedia'
import jsLogoUrl from '../assets/js-logo.png'
import {
  averageReliefValveReseatTests,
  averageReliefValveTests,
  ensureReliefAttempts,
  formatReliefValveAverage,
  formatReliefValveSize,
  isReliefValveType,
  resolveReliefValveMedia,
  type ReliefValveRunFields,
  type ReliefValveTestFields,
} from './reliefValveTest'

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
  customer?: string | null
  customerPo?: string | null
  testing_details: TestLogTestingDetails
}

const PAGE_W = 215.9
const PAGE_H = 279.4
const MARGIN = 12
const INNER = 4
const BRAND = { r: 146, g: 64, b: 14 } // reddish-brown company name

let cachedLogoDataUrl: string | null = null

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl
  try {
    const response = await fetch(jsLogoUrl)
    const blob = await response.blob()
    cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('logo read failed'))
      reader.readAsDataURL(blob)
    })
    return cachedLogoDataUrl
  } catch {
    return null
  }
}

function display(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed || '—'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

function formatResult(value: string | null | undefined): string {
  if (!value) return '—'
  const n = value.trim().toLowerCase()
  if (n === 'pass' || n === 'passed') return 'PASS'
  if (n === 'fail' || n === 'failed') return 'FAIL'
  return value.trim().toUpperCase() || '—'
}

function psi(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '—'
  return /psi|#/i.test(trimmed) ? trimmed : `${trimmed} PSI`
}

function drawDoubleBorder(doc: jsPDF) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.7)
  doc.rect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2)
  doc.setLineWidth(0.3)
  doc.rect(
    MARGIN + INNER,
    MARGIN + INNER,
    PAGE_W - (MARGIN + INNER) * 2,
    PAGE_H - (MARGIN + INNER) * 2,
  )
}

function drawUnderlineField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  const labelText = `${label} `
  doc.text(labelText, x, y)
  const labelWidth = doc.getTextWidth(labelText)
  const lineStart = x + labelWidth
  const lineEnd = x + width
  doc.setFont('times', 'normal')
  doc.text(value && value !== '—' ? value : '', lineStart + 1, y)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.line(lineStart, y + 1.2, lineEnd, y + 1.2)
}

function attemptHasContent(run: ReliefValveRunFields): boolean {
  return Boolean(
    run.tester ||
      run.gauge ||
      run.gaugeId ||
      run.test1 ||
      run.test2 ||
      run.test3 ||
      run.reseat1 ||
      run.reseat2 ||
      run.reseat3 ||
      run.result ||
      run.reason,
  )
}

function drawHydroTable(doc: jsPDF, details: TestLogTestingDetails, y: number): number {
  const left = MARGIN + 18
  const width = PAGE_W - left * 2
  const col1 = left
  const col2 = left + width * 0.42
  const col3 = left + width * 0.71
  const rowH = 10

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('Test Pressure', col2, y, { align: 'center' })
  doc.text('Test Time', col3, y, { align: 'center' })
  y += 4
  doc.setLineWidth(0.2)
  doc.line(col2 - 18, y, col2 + 18, y)
  doc.line(col3 - 16, y, col3 + 16, y)
  y += 8

  const rows: Array<[string, string, string]> = [
    ['High Pressure:', display(details.highTest.pressure), display(details.highTest.time)],
    ['Low Pressure:', display(details.lowTest.pressure), display(details.lowTest.time)],
    ['Shell Pressure:', display(details.shellTest.pressure), display(details.shellTest.time)],
  ]

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  for (const [label, pressure, time] of rows) {
    doc.setFont('times', 'bold')
    doc.text(label, col1, y)
    doc.setFont('times', 'normal')
    doc.text(pressure === '—' ? '' : pressure, col2, y, { align: 'center' })
    doc.text(time === '—' ? '' : time, col3, y, { align: 'center' })
    doc.setDrawColor(0, 0, 0)
    doc.line(col2 - 22, y + 1.5, col2 + 22, y + 1.5)
    doc.line(col3 - 20, y + 1.5, col3 + 20, y + 1.5)
    y += rowH
  }

  const mediaBits = [
    details.highTest.result ? `High: ${formatResult(details.highTest.result)}` : '',
    details.lowTest.result ? `Low: ${formatResult(details.lowTest.result)}` : '',
    details.shellTest.result ? `Shell: ${formatResult(details.shellTest.result)}` : '',
  ].filter(Boolean)
  if (mediaBits.length) {
    y += 2
    doc.setFont('times', 'italic')
    doc.setFontSize(10)
    doc.text(mediaBits.join('   ·   '), PAGE_W / 2, y, { align: 'center' })
    y += 6
  }

  const media = [
    resolveTestMedia(details.highTest),
    resolveTestMedia(details.lowTest),
    resolveTestMedia(details.shellTest),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
  const uniqueMedia = Array.from(new Set(media))
  if (uniqueMedia.length) {
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.text(`Test media: ${uniqueMedia.join(' / ')}`, PAGE_W / 2, y, { align: 'center' })
    y += 6
  }

  return y + 4
}

function drawReliefTable(doc: jsPDF, fields: ReliefValveTestFields, y: number): number {
  const left = MARGIN + 14
  const width = PAGE_W - left * 2
  const colLabel = left
  const colPop = left + width * 0.38
  const colReseat = left + width * 0.62
  const colResult = left + width * 0.86

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text('Pop Avg', colPop, y, { align: 'center' })
  doc.text('Reseat Avg', colReseat, y, { align: 'center' })
  doc.text('Result', colResult, y, { align: 'center' })
  y += 3.5
  doc.setLineWidth(0.2)
  doc.line(colPop - 14, y, colPop + 14, y)
  doc.line(colReseat - 16, y, colReseat + 16, y)
  doc.line(colResult - 12, y, colResult + 12, y)
  y += 8

  const rows: Array<{ label: string; run: ReliefValveRunFields }> = []
  if (fields.includePretest) {
    ensureReliefAttempts(fields.pretestAttempts)
      .filter(attemptHasContent)
      .forEach((run, index, list) => {
        rows.push({
          label: list.length > 1 ? `Pretest ${index + 1}:` : 'Pretest:',
          run,
        })
      })
  }
  ensureReliefAttempts(fields.finalAttempts)
    .filter(attemptHasContent)
    .forEach((run, index, list) => {
      rows.push({
        label: list.length > 1 ? `Final ${index + 1}:` : 'Final test:',
        run,
      })
    })

  if (!rows.length) {
    doc.setFont('times', 'italic')
    doc.setFontSize(11)
    doc.text('No pop / reseat readings recorded yet.', PAGE_W / 2, y, { align: 'center' })
    return y + 10
  }

  doc.setFontSize(11)
  for (const row of rows) {
    const pop = formatReliefValveAverage(averageReliefValveTests(row.run))
    const reseat = formatReliefValveAverage(averageReliefValveReseatTests(row.run))
    doc.setFont('times', 'bold')
    doc.text(row.label, colLabel, y)
    doc.setFont('times', 'normal')
    doc.text(pop ? `${pop} PSI` : '', colPop, y, { align: 'center' })
    doc.text(reseat ? `${reseat} PSI` : '', colReseat, y, { align: 'center' })
    doc.text(formatResult(row.run.result) === '—' ? '' : formatResult(row.run.result), colResult, y, {
      align: 'center',
    })
    doc.line(colPop - 16, y + 1.4, colPop + 16, y + 1.4)
    doc.line(colReseat - 18, y + 1.4, colReseat + 18, y + 1.4)
    doc.line(colResult - 14, y + 1.4, colResult + 14, y + 1.4)
    y += 9
    if (row.run.tester.trim()) {
      doc.setFont('times', 'italic')
      doc.setFontSize(9.5)
      doc.text(`Tester: ${row.run.tester.trim()}`, colLabel + 2, y)
      y += 6
      doc.setFontSize(11)
    }
  }

  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.text(
    `Set pressure ${psi(fields.setPressure)}  ·  Media ${display(resolveReliefValveMedia(fields))}`,
    PAGE_W / 2,
    y,
    { align: 'center' },
  )
  return y + 8
}

function certificationText(isRelief: boolean, passed: boolean): string {
  if (isRelief) {
    return passed
      ? 'Was tested in accordance with applicable relief / safety valve procedures and having successfully met all requirements, passed.'
      : 'Was tested in accordance with applicable relief / safety valve procedures. This valve did not meet all requirements on the recorded test(s).'
  }
  return passed
    ? 'Was hydrostatically tested in accordance with API 6-D test specifications and having successfully met all requirements, passed.'
    : 'Was hydrostatically tested in accordance with API 6-D test specifications. This valve did not meet all requirements on the recorded test(s).'
}

export async function buildTestLogReportPdf(data: TestLogReportData): Promise<jsPDF> {
  const details = data.testing_details
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const logo = await getLogoDataUrl()
  const relief = details.reliefValve
  const isRelief =
    isReliefValveType(data.valve_type) ||
    Boolean(relief?.includePretest || relief?.inletSize?.trim() || relief?.setPressure?.trim())
  const passed = formatResult(data.pass_fail) === 'PASS'

  drawDoubleBorder(doc)

  const contentTop = MARGIN + INNER + 6
  const logoSize = 28
  if (logo) {
    doc.addImage(logo, 'PNG', MARGIN + INNER + 2, contentTop, logoSize, logoSize)
    doc.addImage(logo, 'PNG', PAGE_W - MARGIN - INNER - 2 - logoSize, contentTop, logoSize, logoSize)
  }

  let y = contentTop + 8
  doc.setFont('times', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b)
  doc.text('J~S Machine and Valve Inc.', PAGE_W / 2, y, { align: 'center' })

  y += 10
  doc.setTextColor(0, 0, 0)
  doc.setFont('times', 'bolditalic')
  doc.setFontSize(18)
  doc.text(isRelief ? 'Relief Valve Test Report' : 'Hydrostatic Test Report', PAGE_W / 2, y, {
    align: 'center',
  })

  y += 10
  doc.setFont('times', 'italic')
  doc.setFontSize(12)
  doc.text('This certificate certifies that', PAGE_W / 2, y, { align: 'center' })

  y += 14
  const sizeValue = display(data.size || (relief ? formatReliefValveSize(relief) : null))
  const pressureValue = display(data.pressure || relief?.setPressure || null)
  const typeValue = display(data.valve_type)

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  const leftX = MARGIN + 20
  const midX = PAGE_W / 2
  const rightX = PAGE_W - MARGIN - 20

  doc.text(`Size: ${sizeValue}`, leftX, y)
  doc.text(`Valve ID: ${display(data.valve_id)}`, midX, y, { align: 'center' })
  doc.text(`Type: ${typeValue}`, rightX, y, { align: 'right' })
  y += 8
  doc.text(
    isRelief ? `Set Pressure: ${pressureValue}` : `Pressure: ${pressureValue}`,
    midX,
    y,
    { align: 'center' },
  )

  y += 16
  if (isRelief && relief) {
    y = drawReliefTable(doc, relief, y)
  } else {
    y = drawHydroTable(doc, details, y)
  }

  y = Math.max(y + 8, 165)
  doc.setFont('times', 'bolditalic')
  doc.setFontSize(12)
  const cert = certificationText(isRelief, passed)
  const wrapped = doc.splitTextToSize(cert, PAGE_W - (MARGIN + 28) * 2) as string[]
  doc.text(wrapped, PAGE_W / 2, y, { align: 'center' })
  y += wrapped.length * 5.5 + 10

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  const dateLabel = 'Dated '
  const dateValue = formatDate(data.tested_on)
  const dateWidth = doc.getTextWidth(dateLabel + dateValue)
  const dateX = (PAGE_W - dateWidth) / 2
  doc.text(dateLabel, dateX, y)
  doc.text(dateValue, dateX + doc.getTextWidth(dateLabel), y)
  doc.setLineWidth(0.25)
  doc.line(
    dateX + doc.getTextWidth(dateLabel),
    y + 1.2,
    dateX + doc.getTextWidth(dateLabel) + doc.getTextWidth(dateValue) + 8,
    y + 1.2,
  )

  y += 22
  const sigWidth = 70
  const sigLeft = MARGIN + 22
  const sigRight = PAGE_W - MARGIN - 22 - sigWidth
  doc.setLineWidth(0.35)
  doc.line(sigLeft, y, sigLeft + sigWidth, y)
  doc.line(sigRight, y, sigRight + sigWidth, y)
  y += 5
  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  if (isRelief && relief?.includePretest) {
    doc.text('Pretest Tester', sigLeft + sigWidth / 2, y, { align: 'center' })
    doc.text('Final Tester', sigRight + sigWidth / 2, y, { align: 'center' })
    const pretestTester = ensureReliefAttempts(relief.pretestAttempts).filter(attemptHasContent).at(-1)
      ?.tester
    const finalTester = ensureReliefAttempts(relief.finalAttempts).filter(attemptHasContent).at(-1)
      ?.tester
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    if (pretestTester?.trim()) doc.text(pretestTester.trim(), sigLeft + sigWidth / 2, y - 7, { align: 'center' })
    if (finalTester?.trim()) doc.text(finalTester.trim(), sigRight + sigWidth / 2, y - 7, { align: 'center' })
  } else {
    doc.text('Tester', sigLeft + sigWidth / 2, y, { align: 'center' })
    doc.text('Inspector', sigRight + sigWidth / 2, y, { align: 'center' })
    if (data.tester?.trim()) {
      doc.setFont('times', 'normal')
      doc.setFontSize(10)
      doc.text(data.tester.trim(), sigLeft + sigWidth / 2, y - 7, { align: 'center' })
    }
  }

  y += 18
  const fieldWidth = 78
  drawUnderlineField(doc, 'Customer', display(data.customer), sigLeft, y, fieldWidth)
  drawUnderlineField(doc, 'Customer PO #', display(data.customerPo), sigRight, y, fieldWidth)

  if (data.action_taken?.trim() && !passed) {
    y += 14
    doc.setFont('times', 'italic')
    doc.setFontSize(9)
    const notes = doc.splitTextToSize(`Notes: ${data.action_taken.trim()}`, PAGE_W - (MARGIN + 24) * 2) as string[]
    doc.text(notes, PAGE_W / 2, y, { align: 'center' })
  }

  return doc
}

export function testLogReportFileName(valveId: string, testedOn: string): string {
  const safeValve = valveId.replace(/[^\w.-]+/g, '_')
  return `${safeValve}-test-report-${testedOn}.pdf`
}

export async function downloadTestLogReportPdf(data: TestLogReportData) {
  const doc = await buildTestLogReportPdf(data)
  doc.save(testLogReportFileName(data.valve_id, data.tested_on))
}

export async function testLogReportPdfBlob(data: TestLogReportData): Promise<Blob> {
  const doc = await buildTestLogReportPdf(data)
  return doc.output('blob')
}
