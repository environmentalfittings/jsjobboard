import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapValveStatusWorkbook } from './valve-status-import-utils.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INCOMING = new Set([
  'Pull from Warehouse',
  'Pull from JS Yard',
  'Pull from Customer Yard',
  'Coming in from Vendor',
  'Coming in from Customer',
  'Arrived - Not Started',
])
const IN_SHOP = new Set([
  'Teardown',
  'Machine 1',
  'Machine 2',
  'Water Jet',
  'Grinding',
  'Welding',
  'Fitting',
  'Assembly',
  'Adaption',
  'Painting',
])
const TESTING = new Set(['Testing'])
const WAITING = new Set([
  'Not Arrived',
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Outsourced',
  'On Hold',
])
const DONE = new Set(['Warehouse RTS', 'Replaced', 'Junked', 'Completed'])
const TERMINAL = new Set(['Completed', 'Junked', 'Replaced'])
const ACTIVE_ORDER = new Set(['In-Process Order', 'On-Hold', 'Waiting on Arrival'])

function loadEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function phaseFor(status) {
  if (INCOMING.has(status)) return 'incoming'
  if (IN_SHOP.has(status)) return 'in-shop'
  if (TESTING.has(status)) return 'testing'
  if (WAITING.has(status)) return 'waiting'
  if (DONE.has(status)) return 'done'
  return 'unmapped'
}

function displayJobStatus(v) {
  if (v.order_type === 'Completed') return 'Completed'
  if (v.order_type === 'On-Hold') return 'On Hold'
  if (v.order_type === 'Waiting on Arrival') return 'Waiting on Arrival'
  return v.status
}

function boardValves(valves) {
  return valves.filter((v) => ACTIVE_ORDER.has(v.order_type) && !TERMINAL.has(v.status))
}

function countPhases(valves) {
  const c = { incoming: 0, 'in-shop': 0, testing: 0, waiting: 0, unmapped: 0 }
  for (const v of boardValves(valves)) {
    const status = displayJobStatus(v)
    c[phaseFor(status)] = (c[phaseFor(status)] ?? 0) + 1
  }
  const done = valves
    .filter((v) => DONE.has(v.status) || v.order_type === 'Completed')
    .sort((a, b) => (b.date_closed ?? '').localeCompare(a.date_closed ?? ''))
    .slice(0, 20)
  c.done = done.length
  c.activeTotal = boardValves(valves).length
  return c
}

async function fetchAllValves(sb) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('valves')
      .select('valve_id,status,order_type,due_date,date_closed,customer,description')
      .range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

loadEnv()
const xlsxPath =
  process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'Valve Status 2026 new 5.26.26.xlsx')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const excel = mapValveStatusWorkbook(xlsxPath)
const db = await fetchAllValves(sb)

console.log('Excel kanban counts:', countPhases(excel))
console.log('DB kanban counts:', countPhases(db))

const sampleIds = ['6246-27', '489057-1', '495078-1', '478557-1', '6928-1', '487514-1']
console.log('\nSample compare:')
for (const id of sampleIds) {
  const ex = excel.find((v) => v.valve_id === id)
  const row = db.find((v) => v.valve_id === id)
  console.log(id, {
    excel: ex ? { status: ex.status, order_type: ex.order_type, due: ex.due_date } : null,
    db: row ? { status: row.status, order_type: row.order_type, due: row.due_date } : null,
  })
}

let statusMismatch = 0
let orderMismatch = 0
for (const v of excel) {
  if (v.order_type === 'Completed') continue
  const row = db.find((x) => x.valve_id === v.valve_id)
  if (!row) continue
  if (row.status !== v.status) statusMismatch++
  if (row.order_type !== v.order_type) orderMismatch++
}
console.log('\nExcel vs DB field mismatches (non-completed):', { statusMismatch, orderMismatch })

let staleOnBoard = 0
const excelById = new Map(excel.map((v) => [v.valve_id, v]))
for (const v of boardValves(db)) {
  const ex = excelById.get(v.valve_id)
  if (!ex || ex.status !== v.status || ex.order_type !== v.order_type) staleOnBoard++
}
console.log('Stale DB board valves vs excel:', staleOnBoard, '/', boardValves(db).length)

const notActiveOnBoard = boardValves(db).filter((v) => !ACTIVE_ORDER.has(v.order_type))
console.log('Board valves with non-active order_type:', notActiveOnBoard.length)
if (notActiveOnBoard.length) {
  console.log('Examples:', notActiveOnBoard.slice(0, 10).map((v) => ({ id: v.valve_id, status: v.status, order_type: v.order_type })))
}
