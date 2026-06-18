import fs from 'node:fs'
import path from 'node:path'
import { esc, mapValveStatusWorkbook } from './valve-status-import-utils.mjs'

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

const mapped = mapValveStatusWorkbook(xlsxPath)

const out = []
out.push(`-- Generated from ${path.basename(xlsxPath)}`)
out.push(`-- Total rows imported: ${mapped.length}`)
out.push(`-- Batched inserts: ${Math.ceil(mapped.length / batchSize)}`)
out.push('begin;')
out.push('')

for (let i = 0; i < mapped.length; i += batchSize) {
  const chunk = mapped.slice(i, i + batchSize)
  out.push(
    'insert into public.valves (valve_id, customer, cell, size, status, order_type, valve_type, description, pressure_class, notes, due_date, date_tested, date_closed)',
  )
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
          row.order_type ? `'${esc(row.order_type)}'` : 'null',
          row.valve_type ? `'${esc(row.valve_type)}'` : 'null',
          row.description ? `'${esc(row.description)}'` : 'null',
          row.pressure_class ? `'${esc(row.pressure_class)}'` : 'null',
          row.notes ? `'${esc(row.notes)}'` : 'null',
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
  out.push('  order_type = excluded.order_type,')
  out.push('  valve_type = excluded.valve_type,')
  out.push('  description = excluded.description,')
  out.push('  pressure_class = excluded.pressure_class,')
  out.push('  notes = excluded.notes,')
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
console.log(`Imported rows: ${mapped.length}`)
