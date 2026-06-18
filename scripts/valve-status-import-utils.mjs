/** Shared parsing for "Valve Status" worksheet rows → valves table shape. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import XLSX from 'xlsx'

export const CANONICAL_STATUSES = new Set([
  'Pull from Warehouse',
  'Pull from JS Yard',
  'Pull from Customer Yard',
  'Coming in from Vendor',
  'Coming in from Customer',
  'Not Arrived',
  'Arrived - Not Started',
  'Teardown',
  'Machine 1',
  'Welding',
  'Machine 2',
  'Water Jet',
  'Grinding',
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Fitting',
  'Assembly',
  'Adaption',
  'Outsourced',
  'On Hold',
  'Testing',
  'Painting',
  'Warehouse RTS',
  'Replaced',
  'Junked',
  'Completed',
])

const STATUS_ALIASES = new Map(
  Object.entries({
    arrived: 'Arrived - Not Started',
    'ready to ship': 'Warehouse RTS',
    test: 'Testing',
    testing: 'Testing',
    'in testing': 'Testing',
    'tear down': 'Teardown',
    machine1: 'Machine 1',
    'machine 1': 'Machine 1',
    'macine 1': 'Machine 1',
    'machine shop': 'Machine 1',
    'in machine shop': 'Machine 1',
    'machine 2': 'Machine 2',
    weld: 'Welding',
    grind: 'Grinding',
    'grind, drill, tap': 'Grinding',
    paint: 'Painting',
    'paint and tag': 'Painting',
    'fitting cell': 'Fitting',
    'in fitting': 'Fitting',
    assemble: 'Assembly',
    complete: 'Completed',
    'on hold': 'On Hold',
    'failed test': 'Testing',
    'not here': 'Not Arrived',
    'durco cell': 'Teardown',
    'ball cell': 'Assembly',
    'ball valve cell': 'Assembly',
    'prv cell': 'Fitting',
    'actuation cell': 'Assembly',
    'wok': 'Arrived - Not Started',
    'at vsi': 'Outsourced',
    'tested - waiting on actuator': 'Waiting on Parts',
  }),
)

const VALID_PRESSURE_CLASSES = new Set([
  '150',
  '300',
  '400',
  '600',
  '800',
  '900',
  '1500',
  '2500',
  '3000',
  '5000',
  '10000',
])

export function esc(value) {
  return String(value).replaceAll("'", "''")
}

export function textOrNull(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

export function excelDateToISO(value) {
  if (value == null || value === '' || value === 'Not Tested') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const utc = new Date(excelEpoch.getTime() + value * 86400000)
    return utc.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const parsed = new Date(value.trim())
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return null
}

function classFromDescription(description) {
  const m = String(description ?? '').match(/\b(150|300|400|600|800|900|1500|2500|3000|5000|10000)\s*#/i)
  return m ? m[1] : null
}

export function normalizePressureClass(pressure, description) {
  const digits = String(pressure ?? '').match(/\d+/g)?.join('') ?? ''
  if (VALID_PRESSURE_CLASSES.has(digits)) return digits
  return classFromDescription(description)
}

export function normalizeStatus(status, orderType) {
  const s = textOrNull(status)
  if (s && CANONICAL_STATUSES.has(s)) return s

  if (s) {
    const alias = STATUS_ALIASES.get(s.toLowerCase())
    if (alias) return alias
    if (/^coming\s+in\s+from/i.test(s)) {
      return /customer/i.test(s) ? 'Coming in from Customer' : 'Coming in from Vendor'
    }
  }

  const order = textOrNull(orderType)
  if (order === 'Completed') return 'Completed'
  if (order === 'On-Hold' || order === 'On Hold') return 'On Hold'
  if (order === 'Waiting on Arrival') return 'Not Arrived'
  if (order && CANONICAL_STATUSES.has(order)) return order

  return 'Arrived - Not Started'
}

export function readValveStatusRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const sh = wb.Sheets['Valve Status']
  if (!sh) {
    throw new Error(`Sheet "Valve Status" not found. Sheets: ${wb.SheetNames.join(', ')}`)
  }
  return XLSX.utils.sheet_to_json(sh, { defval: '' })
}

export function mapValveStatusWorkbook(xlsxPath) {
  const rows = readValveStatusRows(xlsxPath)
  const mapped = []
  const seen = new Set()

  for (const row of rows) {
    const valveId = textOrNull(row.ValveID)
    if (!valveId || seen.has(valveId)) continue
    seen.add(valveId)

    const description = textOrNull(row.Description)
    mapped.push({
      valve_id: valveId,
      customer: textOrNull(row.Customer),
      cell: textOrNull(row['Finish Cell']),
      size: textOrNull(row.Size),
      status: normalizeStatus(row.Status, row['Order Type']),
      order_type: textOrNull(row['Order Type']),
      valve_type: textOrNull(row.Type),
      description,
      pressure_class: normalizePressureClass(row.Pressure, description),
      notes: textOrNull(row['Status Notes']),
      due_date: excelDateToISO(row['Due Date']),
      date_tested: excelDateToISO(row['Date Tested']),
      date_closed: excelDateToISO(row['Date Closed']),
    })
  }

  return mapped
}

export function readTestLogRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const sh = wb.Sheets['Test Log Current']
  if (!sh) {
    throw new Error(`Sheet "Test Log Current" not found. Sheets: ${wb.SheetNames.join(', ')}`)
  }
  return XLSX.utils.sheet_to_json(sh, { defval: '' })
}

export function normalizeValveId(value) {
  const text = textOrNull(value)
  if (!text) return null
  return text.replace(/^R(?=\d)/i, '')
}

export function mapTestLogWorkbook(xlsxPath) {
  const rows = readTestLogRows(xlsxPath)
  const mapped = []

  for (const row of rows) {
    const testedOn = excelDateToISO(row.Date)
    const valveId = normalizeValveId(row['W.O. #'])
    if (!testedOn || !valveId) continue
    mapped.push({
      tested_on: testedOn,
      valve_id: valveId,
      size: textOrNull(row.Size),
      pressure: textOrNull(row.Pressure),
      manufacturer: textOrNull(row.Manufacturer),
      valve_type: textOrNull(row.Type),
      test_type: textOrNull(row['Test Type']),
      worked: textOrNull(row.Worked),
      pass_fail: textOrNull(row['Pass/Fail']),
      action_taken: textOrNull(row['Action Taken']),
      tester: textOrNull(row.Tester),
    })
  }

  return mapped
}

export function readDailyNotesRows(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const sh = wb.Sheets['Daily Notes']
  if (!sh) {
    throw new Error(`Sheet "Daily Notes" not found. Sheets: ${wb.SheetNames.join(', ')}`)
  }
  return XLSX.utils.sheet_to_json(sh, { defval: '' })
}

function unzipXlsxToTemp(xlsxPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-notes-'))
  const zipPath = path.join(tmpDir, 'book.zip')
  fs.copyFileSync(xlsxPath, zipPath)
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'pipe' },
    )
  } else {
    execSync(`unzip -q ${JSON.stringify(zipPath)} -d ${JSON.stringify(tmpDir)}`, { stdio: 'pipe' })
  }
  fs.unlinkSync(zipPath)
  return tmpDir
}

function loadDailyNotesStrikeMeta(unzipDir) {
  const stylesXml = fs.readFileSync(path.join(unzipDir, 'xl', 'styles.xml'), 'utf8')
  const fonts = [...stylesXml.matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m, i) => ({
    index: i,
    strike: /<strike\s*\/?>/.test(m[1]) || /strike="1"/.test(m[1]),
  }))
  const strikeFontIds = new Set(fonts.filter((f) => f.strike).map((f) => f.index))
  const cellXfs = [...stylesXml.matchAll(/<xf\b([^>]*)\/?>/g)]
  const strikeStyleIds = new Set()
  for (let i = 0; i < cellXfs.length; i++) {
    const fontId = Number((cellXfs[i][1].match(/\bfontId="(\d+)"/) ?? [])[1] ?? 0)
    if (strikeFontIds.has(fontId)) strikeStyleIds.add(i)
  }

  const sharedPath = path.join(unzipDir, 'xl', 'sharedStrings.xml')
  const strikeSharedIndexes = new Set()
  if (fs.existsSync(sharedPath)) {
    const sharedXml = fs.readFileSync(sharedPath, 'utf8')
    for (const [i, m] of [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].entries()) {
      if (/<strike\s*\/?>/.test(m[1])) strikeSharedIndexes.add(i)
    }
  }

  return { strikeStyleIds, strikeSharedIndexes }
}

/** Bold / highlighted note styles on the Daily Notes sheet = active to-do items. */
const ACTIVE_TODO_CELL_STYLE_IDS = new Set([175, 361])

function dailyNoteCellStyleId(cellXml) {
  const styleMatch = cellXml.match(/\bs="(\d+)"/)
  return styleMatch ? Number(styleMatch[1]) : null
}

function dailyNotesCellIsCrossedOut(cellXml, strikeStyleIds, strikeSharedIndexes) {
  if (!cellXml) return false
  if (/<(?:is|rPr)[^>]*>[\s\S]*?<strike\s*\/?>[\s\S]*?<\/(?:is|rPr)>/.test(cellXml)) return true
  const styleMatch = cellXml.match(/\bs="(\d+)"/)
  if (styleMatch && strikeStyleIds.has(Number(styleMatch[1]))) return true
  if (/\bt="s"/.test(cellXml)) {
    const vMatch = cellXml.match(/<v>(\d+)<\/v>/)
    if (vMatch && strikeSharedIndexes.has(Number(vMatch[1]))) return true
  }
  return false
}

function readDailyNotesSheetXml(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const sheetIndex = wb.SheetNames.indexOf('Daily Notes')
  if (sheetIndex < 0) {
    throw new Error(`Sheet "Daily Notes" not found. Sheets: ${wb.SheetNames.join(', ')}`)
  }

  const tmpDir = unzipXlsxToTemp(xlsxPath)
  try {
    const sheetXmlPath = path.join(tmpDir, 'xl', 'worksheets', `sheet${sheetIndex + 1}.xml`)
    const sheetXml = fs.readFileSync(sheetXmlPath, 'utf8')
    const strikeMeta = loadDailyNotesStrikeMeta(tmpDir)
    return { wb, sheetXml, ...strikeMeta }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function mapDailyNotesWorkbook(xlsxPath, { includeHiddenRows = false } = {}) {
  const { wb, sheetXml, strikeStyleIds, strikeSharedIndexes } = readDailyNotesSheetXml(xlsxPath)
  const sh = wb.Sheets['Daily Notes']
  const mapped = []
  let sortOrder = 0
  let skippedCrossedOut = 0
  let skippedHidden = 0
  let skippedNonTodo = 0

  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowMatch[1]
    const rowBody = rowMatch[2]
    const rowNum = Number((rowAttrs.match(/\br="(\d+)"/) ?? [])[1])
    if (!Number.isFinite(rowNum) || rowNum < 3) continue

    const hidden = /\bhidden="1"/.test(rowAttrs)
    if (hidden && !includeHiddenRows) {
      skippedHidden++
      continue
    }

    const bCellMatch = rowBody.match(/<c\b[^>]*\br="B\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/)
    if (!bCellMatch) continue
    const bCellXml = bCellMatch[0]
    const bAddr = bCellXml.match(/\br="(B\d+)"/)?.[1]
    if (!bAddr) continue

    const body = textOrNull(sh[bAddr]?.v)
    if (!body || body === 'Notes') continue

    if (dailyNotesCellIsCrossedOut(bCellXml, strikeStyleIds, strikeSharedIndexes)) {
      skippedCrossedOut++
      continue
    }

    const cellStyleId = dailyNoteCellStyleId(bCellXml)
    if (cellStyleId == null || !ACTIVE_TODO_CELL_STYLE_IDS.has(cellStyleId)) {
      skippedNonTodo++
      continue
    }

    const aCellMatch = rowBody.match(/<c\b[^>]*\br="A\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/)
    const aAddr = aCellMatch?.[0].match(/\br="(A\d+)"/)?.[1]
    const noteDate = excelDateToISO(aAddr ? sh[aAddr]?.v : null)
    if (!noteDate) continue

    mapped.push({
      note_date: noteDate,
      body,
      sort_order: sortOrder++,
      is_done: false,
      completed_at: null,
      assigned_to: null,
      source: 'excel',
      created_at: `${noteDate}T12:00:00.000Z`,
    })
  }

  mapped._meta = { skippedCrossedOut, skippedHidden, skippedNonTodo }
  return mapped
}
