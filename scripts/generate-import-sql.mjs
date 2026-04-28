import fs from 'node:fs'
import path from 'node:path'

const inputPath = process.argv[2]
const outputPath = process.argv[3]

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/generate-import-sql.mjs <input-json> <output-sql>')
  process.exit(1)
}

const rawBuffer = fs.readFileSync(inputPath)
let raw = rawBuffer.toString('utf8')
if (raw.includes('\u0000')) {
  raw = rawBuffer.toString('utf16le')
}
raw = raw.replace(/^\uFEFF/, '')
const rows = JSON.parse(raw)

const allowedStatuses = new Set([
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

function esc(value) {
  return String(value).replaceAll("'", "''")
}

function excelDateToISO(value) {
  if (value == null || value === '' || value === 'Not Tested') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const utc = new Date(excelEpoch.getTime() + value * 86400000)
    return utc.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return null
}

function textOrNull(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeStatus(status, orderType) {
  const s = textOrNull(status)
  if (s && allowedStatuses.has(s)) return s
  const fallback = textOrNull(orderType)
  if (fallback && allowedStatuses.has(fallback)) return fallback
  return 'Arrived - Not Started'
}

const mapped = []
const seen = new Set()
for (const row of rows) {
  const valveId = textOrNull(row.ValveID)
  if (!valveId || seen.has(valveId)) continue
  seen.add(valveId)

  mapped.push({
    valve_id: valveId,
    customer: textOrNull(row.Customer),
    cell: textOrNull(row['Finish Cell']),
    size: textOrNull(row.Size),
    status: normalizeStatus(row.Status, row['Order Type']),
    due_date: excelDateToISO(row['Due Date']),
    date_tested: excelDateToISO(row['Date Tested']),
    date_closed: excelDateToISO(row['Date Closed']),
  })
}

const chunks = []
chunks.push('-- Generated from Valve Status 2026 new 3.31.26.xlsx')
chunks.push(`-- Total rows imported: ${mapped.length}`)
chunks.push('begin;')
chunks.push('')
chunks.push('insert into public.valves (valve_id, customer, cell, size, status, due_date, date_tested, date_closed)')
chunks.push('values')

const values = mapped.map((row) => {
  const v = [
    `'${esc(row.valve_id)}'`,
    row.customer ? `'${esc(row.customer)}'` : 'null',
    row.cell ? `'${esc(row.cell)}'` : 'null',
    row.size ? `'${esc(row.size)}'` : 'null',
    `'${esc(row.status)}'`,
    row.due_date ? `'${row.due_date}'::date` : 'null',
    row.date_tested ? `'${row.date_tested}'::date` : 'null',
    row.date_closed ? `'${row.date_closed}'::date` : 'null',
  ]
  return `  (${v.join(', ')})`
})

chunks.push(values.join(',\n'))
chunks.push('on conflict (valve_id) do update set')
chunks.push('  customer = excluded.customer,')
chunks.push('  cell = excluded.cell,')
chunks.push('  size = excluded.size,')
chunks.push('  status = excluded.status,')
chunks.push('  due_date = excluded.due_date,')
chunks.push('  date_tested = excluded.date_tested,')
chunks.push('  date_closed = excluded.date_closed,')
chunks.push('  updated_at = now();')
chunks.push('')
chunks.push('commit;')
chunks.push('')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, chunks.join('\n'))
console.log(`Wrote SQL: ${outputPath}`)
console.log(`Imported rows: ${mapped.length}`)
