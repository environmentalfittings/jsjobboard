import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workbookPath = 'C:/Users/envir/Downloads/Valve Status 2026 new 3.31.26 (1).xlsx'
const outputPath = path.join(ROOT, 'supabase', 'backfill-pressure-class-from-valve-status.sql')

const validClasses = new Set(['150', '300', '400', '600', '800', '900', '1500', '2500', '3000', '5000', '10000'])

const classFromDescription = (description) => {
  const s = String(description ?? '')
  const m = s.match(/\b(150|300|400|600|800|900|1500|2500|3000|5000|10000)\s*#/i)
  return m ? m[1] : ''
}

const normalizeClass = (value) => {
  const digits = String(value ?? '').match(/\d+/g)?.join('') ?? ''
  return validClasses.has(digits) ? digits : ''
}

const esc = (value) => String(value).replace(/'/g, "''")

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`)
}

const workbook = XLSX.readFile(workbookPath)
const sheet = workbook.Sheets['Valve Status']
if (!sheet) throw new Error('Sheet "Valve Status" not found in workbook')

const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
const valveClassMap = new Map()

for (const row of rows) {
  const valveId = String(row.ValveID ?? '').trim()
  if (!valveId) continue

  const fromPressure = normalizeClass(row.Pressure)
  const cls = fromPressure || classFromDescription(row.Description)
  if (!cls) continue

  valveClassMap.set(valveId, cls)
}

const pairs = [...valveClassMap.entries()].sort((a, b) =>
  a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }),
)

if (!pairs.length) {
  throw new Error('No valid valve/class pairs were found.')
}

const valuesSql = pairs.map(([valveId, cls]) => `  ('${esc(valveId)}', '${esc(cls)}')`).join(',\n')

const sql = `-- Generated from Valve Status 2026 new 3.31.26 (1).xlsx
-- Backfills public.valves.pressure_class from original Valve Status workbook.
-- Generated pairs: ${pairs.length}

begin;

create temporary table tmp_valve_pressure_class (
  valve_id text primary key,
  pressure_class text not null
) on commit drop;

insert into tmp_valve_pressure_class (valve_id, pressure_class) values
${valuesSql}
;

update public.valves v
set pressure_class = t.pressure_class
from tmp_valve_pressure_class t
where v.valve_id = t.valve_id
  and (
    v.pressure_class is null
    or btrim(v.pressure_class) = ''
    or v.pressure_class <> t.pressure_class
  );

commit;
`

fs.writeFileSync(outputPath, sql)
console.log(`Wrote ${pairs.length} mappings to ${outputPath}`)
