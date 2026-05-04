import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workbookPath = 'C:/Users/envir/Downloads/Employee List.xlsx'

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function normalizeName(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (!s.includes(',')) return s.replace(/\s+/g, ' ').trim()
  const [last, rest] = s.split(',')
  return `${String(rest ?? '').trim()} ${String(last ?? '').trim()}`.replace(/\s+/g, ' ').trim()
}

function normalizeEmployeeId(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return s
}

function nameKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function usernameBase(name) {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return 'tech'
  if (tokens.length === 1) return tokens[0]
  return `${tokens[0]}.${tokens[tokens.length - 1]}`
}

function uniqueUsername(base, used) {
  let candidate = base
  let i = 1
  while (used.has(candidate)) {
    i += 1
    candidate = `${base}${i}`
  }
  used.add(candidate)
  return candidate
}

const env = {
  ...readEnvFile(path.join(ROOT, '.env.local')),
  ...readEnvFile(path.join(ROOT, '.env')),
  ...process.env,
}

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const loginDomain = String(env.VITE_LOGIN_EMAIL_DOMAIN ?? 'users.jsvalve.local').trim() || 'users.jsvalve.local'
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}
if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const wb = XLSX.readFile(workbookPath)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })

const { data: existingRows, error: existingErr } = await supabase
  .from('technicians')
  .select('id,name,employee_id,login_username')
if (existingErr) throw new Error(`Could not read technicians: ${existingErr.message}`)

const existingByEmployeeId = new Set(
  (existingRows ?? [])
    .map((r) => normalizeEmployeeId(r.employee_id))
    .filter(Boolean),
)
const existingByName = new Set(
  (existingRows ?? [])
    .map((r) => nameKey(normalizeName(r.name)))
    .filter(Boolean),
)
const usedUsernames = new Set(
  (existingRows ?? [])
    .map((r) => String(r.login_username ?? '').trim().toLowerCase())
    .filter(Boolean),
)

const inserts = []
let skipped = 0
for (const row of rows) {
  const name = normalizeName(row.Name)
  const employeeId = normalizeEmployeeId(row['Employee #'])
  if (!name) {
    skipped += 1
    continue
  }

  const key = nameKey(name)
  if ((employeeId && existingByEmployeeId.has(employeeId)) || existingByName.has(key)) {
    skipped += 1
    continue
  }

  const username = uniqueUsername(usernameBase(name), usedUsernames)
  inserts.push({
    name,
    employee_id: employeeId || null,
    work_cell_specialties: [],
    group_team: null,
    active: true,
    role: 'technician',
    login_username: username,
    login_email: `${username}@${loginDomain}`,
  })
  if (employeeId) existingByEmployeeId.add(employeeId)
  existingByName.add(key)
}

const chunkSize = 200
let inserted = 0
for (let i = 0; i < inserts.length; i += chunkSize) {
  const chunk = inserts.slice(i, i + chunkSize)
  const { error } = await supabase.from('technicians').insert(chunk)
  if (error) throw new Error(`Insert failed at chunk ${Math.floor(i / chunkSize) + 1}: ${error.message}`)
  inserted += chunk.length
}

console.log(`Spreadsheet rows: ${rows.length}`)
console.log(`Inserted technicians: ${inserted}`)
console.log(`Skipped (already exists/blank): ${skipped}`)
