import { jsPDF } from 'jspdf'
import { formatTestProceduresSummary, type TestLogTestingDetails, type YesNo } from '../types/testLog'
import { resolveTestMedia } from '../lib/testLogMedia'
import { isFourHourChartTestSelected } from './testLogProcedure'
import {
  averageReliefValveReseatTests,
  averageReliefValveTests,
  ensureReliefAttempts,
  evaluateReliefValveRun,
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
  if (value === 'na') return 'N/A'
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

function psi(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '—'
  return /psi/i.test(trimmed) ? trimmed : `${trimmed} PSI`
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

function addReliefAttempt(
  doc: jsPDF,
  title: string,
  run: ReliefValveRunFields,
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>,
  y: number,
): number {
  const evaluation = evaluateReliefValveRun(run, header)
  const popAvg = formatReliefValveAverage(averageReliefValveTests(run))
  const reseatAvg = formatReliefValveAverage(averageReliefValveReseatTests(run))
  const popMin = formatReliefValveAverage(evaluation.pop.setPressure)
  const popMax = formatReliefValveAverage(evaluation.pop.maxPassPressure)
  const reseatMin = formatReliefValveAverage(evaluation.reseat.minPass)
  const reseatMax = formatReliefValveAverage(evaluation.reseat.maxPass)

  y = ensureSpace(doc, y, 70)
  y = addSectionTitle(doc, title, y)
  y = addKeyValueLines(
    doc,
    [
      ['Tester', display(run.tester)],
      ['Test gauge', display(run.gauge)],
      ['Pop 1', psi(run.test1)],
      ['Pop 2', psi(run.test2)],
      ['Pop 3', psi(run.test3)],
      ['Pop average', popAvg ? `${popAvg} PSI` : '—'],
      [
        'Pop pass band',
        popMin && popMax ? `${popMin}–${popMax} PSI` : '—',
      ],
      ['Pop result', formatResult(evaluation.pop.result)],
      ['Reseat 1', psi(run.reseat1)],
      ['Reseat 2', psi(run.reseat2)],
      ['Reseat 3', psi(run.reseat3)],
      ['Reseat average', reseatAvg ? `${reseatAvg} PSI` : '—'],
      [
        'Reseat pass band',
        reseatMin && reseatMax ? `${reseatMin}–${reseatMax} PSI` : '—',
      ],
      ['Reseat result', formatResult(run.reseatResult || evaluation.reseat.result)],
      ['Overall result', formatResult(run.result)],
      ...(run.result === 'fail' && run.reason.trim()
        ? ([['Fail reason', run.reason.trim()]] as [string, string][])
        : []),
    ],
    y,
  )
  return y
}

function addReliefValveSections(doc: jsPDF, fields: ReliefValveTestFields, y: number): number {
  y = ensureSpace(doc, y, 40)
  y = addSectionTitle(doc, 'Relief / safety valve', y)
  y = addKeyValueLines(
    doc,
    [
      ['Inlet size', display(fields.inletSize)],
      ['Outlet size', display(fields.outletSize)],
      ['Size', display(formatReliefValveSize(fields))],
      ['Set pressure', psi(fields.setPressure)],
      ['Media', display(resolveReliefValveMedia(fields))],
      ...(fields.includePretest
        ? ([['Pretest type', display(fields.pretestKind)]] as [string, string][])
        : []),
    ],
    y,
  )

  if (fields.includePretest) {
    const pretestAttempts = ensureReliefAttempts(fields.pretestAttempts).filter(attemptHasContent)
    if (pretestAttempts.length === 0) {
      y = ensureSpace(doc, y, 24)
      y = addSectionTitle(doc, 'Pretest', y)
      y = addKeyValueLines(doc, [['Status', 'Included — no readings saved yet']], y)
    } else {
      pretestAttempts.forEach((run, index) => {
        const title =
          pretestAttempts.length > 1
            ? `Pretest · Attempt ${index + 1}${index > 0 ? ' (re-test)' : ''}`
            : 'Pretest'
        y = addReliefAttempt(doc, title, run, fields, y)
      })
    }
  }

  const finalAttempts = ensureReliefAttempts(fields.finalAttempts).filter(attemptHasContent)
  if (finalAttempts.length === 0) {
    y = ensureSpace(doc, y, 24)
    y = addSectionTitle(doc, 'Final test', y)
    y = addKeyValueLines(doc, [['Status', 'Not completed yet']], y)
  } else {
    finalAttempts.forEach((run, index) => {
      const title =
        finalAttempts.length > 1
          ? `Final test · Attempt ${index + 1}${index > 0 ? ' (re-test)' : ''}`
          : 'Final test'
      y = addReliefAttempt(doc, title, run, fields, y)
    })
  }

  return y
}

export function buildTestLogReportPdf(data: TestLogReportData): jsPDF {
  const details = data.testing_details
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const relief = details.reliefValve
  const isRelief =
    isReliefValveType(data.valve_type) ||
    Boolean(relief?.includePretest || relief?.inletSize?.trim() || relief?.setPressure?.trim())

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
      ['Size', display(data.size || (relief ? formatReliefValveSize(relief) : null))],
      [
        isRelief ? 'Set pressure' : 'Pressure',
        display(data.pressure || relief?.setPressure || null),
      ],
      ['Type', display(data.valve_type)],
      ...(isRelief && relief
        ? ([['Media', display(resolveReliefValveMedia(relief))]] as [string, string][])
        : []),
      ['Tester', display(data.tester)],
      ['Overall result', display(data.pass_fail)],
    ],
    y,
  )

  if (isRelief && relief) {
    y = addReliefValveSections(doc, relief, y)
  } else {
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
