import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const [, , xlsxPathArg, outputPathArg, batchSizeArg] = process.argv

if (!xlsxPathArg || !outputPathArg) {
  console.error(
    'Usage: node scripts/generate-import-sql-batched.mjs <input.xlsx> <output.sql> [batch-size]',
  )
  process.exit(1)
}

const xlsxPath = path.resolve(xlsxPathArg)
const outputPath = path.resolve(outputPathArg)
const batchSize = Number(batchSizeArg || 250)

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
    const parsed = new Date(value.trim())
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
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

const wb = XLSX.readFile(xlsxPath)
const sh = wb.Sheets['Valve Status']
if (!sh) {
  console.error('Sheet "Valve Status" not found. Sheets:', wb.SheetNames.join(', '))
  process.exit(1)
}
const rows = XLSX.utils.sheet_to_json(sh, { defval: '' })

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

const out = []
out.push(`-- Generated from ${path.basename(xlsxPath)}`)
out.push(`-- Total rows imported: ${mapped.length}`)
out.push(`-- Batched inserts: ${Math.ceil(mapped.length / batchSize)}`)
out.push('begin;')
out.push('')

for (let i = 0; i < mapped.length; i += batchSize) {
  const chunk = mapped.slice(i, i + batchSize)
  out.push('insert into public.valves (valve_id, customer, cell, size, status, due_date, date_tested, date_closed)')
  out.push('values')
  out.push(
    chunk
      .map((row) => {
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
      .join(',\n'),
  )
  out.push('on conflict (valve_id) do update set')
  out.push('  customer = excluded.customer,')
  out.push('  cell = excluded.cell,')
  out.push('  size = excluded.size,')
  out.push('  status = excluded.status,')
  out.push('  due_date = excluded.due_date,')
  out.push('  date_tested = excluded.date_tested,')
  out.push('  date_closed = excluded.date_closed,')
  out.push('  updated_at = now();')
  out.push('')
}

out.push('commit;')
out.push('')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, out.join('\n'))
console.log(`Wrote SQL: ${outputPath}`)
