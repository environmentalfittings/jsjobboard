/**
 * Reads "Valve Status" sheet: ValveID + Description + Type -> valves.description, valves.valve_type
 * Usage: node scripts/generate-valve-descriptions-sql.mjs [path-to.xlsx] [output.sql]
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const xlsxPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Valve Status 2026 new 3.31.26.xlsx')
const outPath = process.argv[3] || path.join(root, 'supabase', 'update-valve-descriptions-from-valve-status-2026.sql')

const BATCH = 250

function sqlQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
}

const wb = XLSX.readFile(xlsxPath)
const sh = wb.Sheets['Valve Status']
if (!sh) {
  console.error('Sheet "Valve Status" not found. Sheets:', wb.SheetNames.join(', '))
  process.exit(1)
}

const rows = XLSX.utils.sheet_to_json(sh, { defval: '' })
/** @type {Map<string, { description: string, valveType: string }>} */
const map = new Map()
for (const r of rows) {
  const id = norm(r.ValveID)
  if (!id) continue
  map.set(id, {
    description: norm(r.Description),
    valveType: norm(r.Type),
  })
}

const entries = [...map.entries()]
const chunks = []
for (let i = 0; i < entries.length; i += BATCH) {
  chunks.push(entries.slice(i, i + BATCH))
}

let out = `-- Sync from spreadsheet "Valve Status": ValveID -> description, Type -> valve_type
-- Generated: ${new Date().toISOString()}
-- Unique ValveIDs: ${map.size} (${rows.length} sheet rows; duplicates use last occurrence)
begin;

alter table public.valves add column if not exists description text;
alter table public.valves add column if not exists valve_type text;

`

for (const ch of chunks) {
  const vals = ch
    .map(([vid, { description, valveType }]) => {
      const idq = sqlQuote(vid) + '::text'
      const dq = description === '' ? 'NULL::text' : sqlQuote(description) + '::text'
      const tq = valveType === '' ? 'NULL::text' : sqlQuote(valveType) + '::text'
      return `  (${idq}, ${dq}, ${tq})`
    })
    .join(',\n')
  out += `UPDATE public.valves AS v
SET description = x.d, valve_type = x.t, updated_at = now()
FROM (VALUES
${vals}
) AS x(vid, d, t)
WHERE v.valve_id = x.vid;

`
}

out += 'commit;\n'

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, out, 'utf8')
console.error('Wrote', outPath)
console.error('Unique IDs:', map.size, 'Batches:', chunks.length)
