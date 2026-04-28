import fs from 'node:fs'
import path from 'node:path'

const inputPath = process.argv[2]
const outputPath = process.argv[3]

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/generate-test-log-import-sql.mjs <input-json> <output-sql>')
  process.exit(1)
}

const rawBuffer = fs.readFileSync(inputPath)
let raw = rawBuffer.toString('utf8')
if (raw.includes('\u0000')) raw = rawBuffer.toString('utf16le')
raw = raw.replace(/^\uFEFF/, '')
const rows = JSON.parse(raw)

function esc(value) {
  return String(value).replaceAll("'", "''")
}

function textOrNull(value) {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeValveId(value) {
  const text = textOrNull(value)
  if (!text) return null
  return text.replace(/^R(?=\d)/i, '')
}

function excelDateToISO(value) {
  if (value == null || value === '') return null
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

const lines = []
lines.push('-- Generated from "Test Log Current" worksheet')
lines.push(`-- Total test rows imported: ${mapped.length}`)
lines.push('begin;')
lines.push('')
lines.push(
  'insert into public.test_logs (tested_on, valve_id, size, pressure, manufacturer, valve_type, test_type, worked, pass_fail, action_taken, tester)',
)
lines.push('values')
lines.push(
  mapped
    .map((row) => {
      const values = [
        `'${row.tested_on}'::date`,
        `'${esc(row.valve_id)}'`,
        row.size ? `'${esc(row.size)}'` : 'null',
        row.pressure ? `'${esc(row.pressure)}'` : 'null',
        row.manufacturer ? `'${esc(row.manufacturer)}'` : 'null',
        row.valve_type ? `'${esc(row.valve_type)}'` : 'null',
        row.test_type ? `'${esc(row.test_type)}'` : 'null',
        row.worked ? `'${esc(row.worked)}'` : 'null',
        row.pass_fail ? `'${esc(row.pass_fail)}'` : 'null',
        row.action_taken ? `'${esc(row.action_taken)}'` : 'null',
        row.tester ? `'${esc(row.tester)}'` : 'null',
      ]
      return `  (${values.join(', ')})`
    })
    .join(',\n'),
)
lines.push(';')
lines.push('')
lines.push('-- Update valves that have PASS test results with latest tested date.')
lines.push('with latest_pass as (')
lines.push('  select valve_id, max(tested_on) as tested_on')
lines.push("  from public.test_logs where upper(coalesce(pass_fail, '')) like '%PASS%'")
lines.push('  group by valve_id')
lines.push(')')
lines.push('update public.valves v')
lines.push('set')
lines.push('  date_tested = lp.tested_on,')
lines.push("  status = case when v.status = 'Completed' then 'Completed' else 'Warehouse RTS' end,")
lines.push('  updated_at = now()')
lines.push('from latest_pass lp')
lines.push('where v.valve_id = lp.valve_id;')
lines.push('')
lines.push('commit;')
lines.push('')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, lines.join('\n'))
console.log(`Wrote SQL: ${outputPath}`)
console.log(`Imported rows: ${mapped.length}`)
