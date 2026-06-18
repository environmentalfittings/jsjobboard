import fs from 'node:fs'
import path from 'node:path'
import { esc, mapTestLogWorkbook } from './valve-status-import-utils.mjs'

const [, , xlsxPathArg, outputPathArg] = process.argv

if (!xlsxPathArg || !outputPathArg) {
  console.error('Usage: node scripts/generate-test-log-from-xlsx.mjs <input.xlsx> <output.sql>')
  process.exit(1)
}

const xlsxPath = path.resolve(xlsxPathArg)
const outputPath = path.resolve(outputPathArg)
const mapped = mapTestLogWorkbook(xlsxPath)

const lines = []
lines.push(`-- Generated from ${path.basename(xlsxPath)} "Test Log Current" worksheet`)
lines.push(`-- Total test rows imported: ${mapped.length}`)
lines.push('begin;')
lines.push('')
lines.push('truncate table public.test_logs restart identity;')
lines.push('')
lines.push(
  'insert into public.test_logs (tested_on, valve_id, size, pressure, manufacturer, valve_type, test_type, worked, pass_fail, action_taken, tester)',
)
lines.push('values')

for (let i = 0; i < mapped.length; i += 500) {
  const chunk = mapped.slice(i, i + 500)
  if (i > 0) {
    lines.push(';')
    lines.push('')
    lines.push(
      'insert into public.test_logs (tested_on, valve_id, size, pressure, manufacturer, valve_type, test_type, worked, pass_fail, action_taken, tester)',
    )
    lines.push('values')
  }
  lines.push(
    chunk
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
}

lines.push(';')
lines.push('')
lines.push('commit;')
lines.push('')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, lines.join('\n'))
console.log(`Wrote SQL: ${outputPath}`)
console.log(`Imported rows: ${mapped.length}`)
