import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workbookPath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Tool Calibration Log 2026.xlsx')
const outputPath = path.join(ROOT, 'supabase', 'seed-tool-calibrations.sql')

function esc(value) {
  if (value == null) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function excelDate(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function cellText(value) {
  if (value == null || value === '') return null
  const s = String(value).trim()
  return s || null
}

function jsIdText(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return String(Math.trunc(value))
  const s = String(value).trim()
  return s || null
}

function inferCategory(toolType, model) {
  const hay = `${toolType ?? ''} ${model ?? ''}`.toLowerCase()
  if (/caliper/.test(hay)) return 'Calipers'
  if (/micrometer|\bmic\b/.test(hay)) return 'Micrometer'
  if (/dial\s*indicator/.test(hay)) return 'Dial Indicator'
  if (/torque/.test(hay)) return 'Torque Wrenches'
  if (/load\s*cell/.test(hay)) return 'Load Cells'
  if (/thickness/.test(hay)) return 'Thickness Tester'
  if (/dead\s*weight/.test(hay)) return 'Dead Weight Tester'
  if (/helium/.test(hay)) return 'Helium Leak Standard'
  if (/gauge\s*block/.test(hay)) return 'Gauge Block Standard'
  if (/chart\s*recorder|heat\s*treat/.test(hay)) return 'Heat Treat Chart Recorder'
  if (/welder\s*load/.test(hay)) return 'Welder Load Test'
  if (/gauge|pressure/.test(hay)) return 'Gauges'
  return null
}

/** @type {Map<string, object>} */
const byJsId = new Map()
/** @type {object[]} */
const noIdRows = []

function upsertRow(row) {
  const jsId = row.js_id
  if (jsId) {
    const existing = byJsId.get(jsId)
    // Prefer active over out_of_service when both sheets have the same JS ID.
    if (existing && existing.status === 'active' && row.status === 'out_of_service') return
    byJsId.set(jsId, { ...existing, ...row, js_id: jsId })
    return
  }
  noIdRows.push(row)
}

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`)
}

const workbook = XLSX.readFile(workbookPath)

// --- Calibration Log (header row ~3, data from row 4) ---
const calSheet = workbook.Sheets['Calibration Log']
if (!calSheet) throw new Error('Sheet "Calibration Log" not found')
const calRows = XLSX.utils.sheet_to_json(calSheet, { header: 1, defval: null })
for (let i = 4; i < calRows.length; i += 1) {
  const r = calRows[i]
  if (!Array.isArray(r) || r.every((c) => c == null || c === '')) continue
  const jsId = jsIdText(r[0])
  const model = cellText(r[2])
  const toolType = cellText(r[3])
  if (!jsId && !model && !toolType) continue
  upsertRow({
    js_id: jsId,
    manufacturer: cellText(r[1]),
    model,
    tool_type: toolType,
    category: inferCategory(toolType, model),
    serial_number: cellText(r[4]),
    calibration_date: excelDate(r[5]),
    expiration_date: excelDate(r[6]),
    department: cellText(r[7]),
    status: 'active',
    notes: null,
    active: true,
  })
}

// --- Out of Service ---
const oosSheet = workbook.Sheets['Out of Service']
if (!oosSheet) throw new Error('Sheet "Out of Service" not found')
const oosRows = XLSX.utils.sheet_to_json(oosSheet, { defval: null })
for (const row of oosRows) {
  const jsId = jsIdText(row['JS ID'])
  const model = cellText(row.Model)
  const toolType = cellText(row['Tool Type'])
  if (!jsId && !model && !toolType) continue
  upsertRow({
    js_id: jsId,
    manufacturer: cellText(row.MFG),
    model,
    tool_type: toolType,
    category: inferCategory(toolType, model),
    serial_number: cellText(row['Serial Number']),
    calibration_date: excelDate(row['Calibration Date']),
    expiration_date: excelDate(row['Expiration Date']),
    department: cellText(row.Department) || 'Out of Service',
    status: 'out_of_service',
    notes: cellText(row['Calibration Status']),
    active: false,
  })
}

const all = [...byJsId.values(), ...noIdRows].sort((a, b) => {
  const ai = Number(a.js_id) || 0
  const bi = Number(b.js_id) || 0
  if (ai !== bi) return ai - bi
  return String(a.model ?? '').localeCompare(String(b.model ?? ''))
})

const valueLines = all.map(
  (row) =>
    `  (${esc(row.js_id)}, ${esc(row.manufacturer)}, ${esc(row.model)}, ${esc(row.tool_type)}, ${esc(row.category)}, ${esc(row.serial_number)}, ${esc(row.calibration_date)}, ${esc(row.expiration_date)}, ${esc(row.department)}, ${esc(row.status)}, ${esc(row.notes)}, ${row.active ? 'true' : 'false'})`,
)

const sql = `-- Seed tool_calibrations from Tool Calibration Log 2026.xlsx
-- Generated by scripts/import-tool-calibration-log.mjs
-- Run AFTER migration-tool-calibrations.sql and migration-tool-calibrations-category.sql

begin;

-- Clear and reload (safe for initial import).
truncate table public.tool_calibrations restart identity;

insert into public.tool_calibrations (
  js_id, manufacturer, model, tool_type, category, serial_number,
  calibration_date, expiration_date, department, status, notes, active
) values
${valueLines.join(',\n')};

commit;
`

const jsonPath = path.join(ROOT, 'src', 'data', 'toolCalibrationsSeed.json')
fs.mkdirSync(path.dirname(jsonPath), { recursive: true })
fs.writeFileSync(jsonPath, JSON.stringify(all), 'utf8')
fs.writeFileSync(outputPath, sql, 'utf8')
console.log(`Wrote ${all.length} tools → ${outputPath}`)
console.log(`Wrote JSON seed → ${jsonPath}`)
console.log(`  active: ${all.filter((r) => r.status === 'active').length}`)
console.log(`  out_of_service: ${all.filter((r) => r.status === 'out_of_service').length}`)
console.log(`  with category: ${all.filter((r) => r.category).length}`)
