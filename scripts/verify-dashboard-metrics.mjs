import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapValveStatusWorkbook } from './valve-status-import-utils.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const xlsxPath =
  process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'Valve Status 2026 new 5.26.26.xlsx')

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

function isClosedWorkOrder(v) {
  return v.order_type === 'Completed'
}

function completionDateForValve(v) {
  const raw = v.date_closed ?? v.date_tested ?? null
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calcActiveStatusBreakdown(valves) {
  const counts = new Map()
  for (const v of valves) {
    if (isClosedWorkOrder(v)) continue
    counts.set(v.status, (counts.get(v.status) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function calcCompletedMetrics(valves, now = new Date()) {
  const month = now.getMonth()
  const year = now.getFullYear()
  const lastYear = year - 1
  let monthCount = 0
  let yearCount = 0
  let lastYearCount = 0
  for (const v of valves) {
    if (!isClosedWorkOrder(v)) continue
    const closed = completionDateForValve(v)
    if (!closed) continue
    if (closed.getFullYear() === year) {
      yearCount += 1
      if (closed.getMonth() === month) monthCount += 1
    } else if (closed.getFullYear() === lastYear) {
      lastYearCount += 1
    }
  }
  return { monthCount, yearCount, lastYearCount }
}

function printBreakdown(label, rows) {
  console.log(`\n=== ${label} ===`)
  let total = 0
  for (const [status, count] of rows) {
    console.log(`${status}: ${count}`)
    total += count
  }
  console.log('TOTAL active rows:', total)
}

const valves = mapValveStatusWorkbook(xlsxPath)
const now = new Date()
console.log('Excel workbook:', path.basename(xlsxPath))
console.log('Total valves:', valves.length)
console.log('Reference date:', now.toISOString().slice(0, 10))

printBreakdown('Active status breakdown (order_type != Completed)', calcActiveStatusBreakdown(valves))
console.log('\nCompleted metrics:', calcCompletedMetrics(valves, now))

const completedStatusActive = valves.filter((v) => !isClosedWorkOrder(v) && v.status === 'Completed')
if (completedStatusActive.length) {
  console.log('\nAnomaly: shop status Completed but order_type not Completed:', completedStatusActive.length)
  for (const v of completedStatusActive.slice(0, 5)) {
    console.log(' ', v.valve_id, 'order_type=', v.order_type, 'status=', v.status)
  }
}

loadEnv()
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (url && key) {
  const supabase = createClient(url, key)
  const pageSize = 1000
  let from = 0
  const all = []
  while (true) {
    const { data, error } = await supabase
      .from('valves')
      .select('valve_id,status,order_type,date_closed,date_tested,updated_at,created_at')
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  console.log('\nSupabase valves loaded:', all.length)
  printBreakdown('Supabase active status breakdown', calcActiveStatusBreakdown(all))
  console.log('\nSupabase completed metrics:', calcCompletedMetrics(all, now))

  function closeDate(v) {
    const raw = v.date_closed ?? v.date_tested ?? v.updated_at ?? v.created_at
    if (!raw) return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const m = now.getMonth()
  const y = now.getFullYear()
  const ly = y - 1
  let mc = 0
  let yc = 0
  let lyc = 0
  for (const v of all) {
    if (v.order_type !== 'Completed') continue
    const d = closeDate(v)
    if (!d) continue
    if (d.getFullYear() === y) {
      yc++
      if (d.getMonth() === m) mc++
    } else if (d.getFullYear() === ly) lyc++
  }
  console.log('\nSupabase with app date fallback (incl updated_at):', { mc, yc, lyc })

  const { count: juneTests } = await supabase
    .from('test_logs')
    .select('*', { count: 'exact', head: true })
    .gte('tested_on', `${y}-${String(m + 1).padStart(2, '0')}-01`)
  console.log('Test log rows this month (partial):', juneTests)
}
