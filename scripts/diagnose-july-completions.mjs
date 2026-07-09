import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

loadEnv()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

let from = 0
const all = []
while (true) {
  const { data, error } = await sb
    .from('valves')
    .select('valve_id,order_type,status,date_closed,date_tested,updated_at,created_at')
    .range(from, from + 999)
  if (error) throw error
  if (!data?.length) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}

const completed = all.filter((v) => v.order_type === 'Completed')
const julyClosed = completed.filter((v) => String(v.date_closed ?? '').startsWith('2026-07'))

console.log('Total completed:', completed.length)
console.log('July 2026 date_closed:', julyClosed.length)

const byDay = new Map()
for (const v of julyClosed) {
  const day = String(v.date_closed).slice(0, 10)
  byDay.set(day, (byDay.get(day) ?? 0) + 1)
}
console.log('\nJuly 2026 by close date (top days):')
;[...byDay.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([day, count]) => console.log(`  ${day}: ${count}`))

const closeEqualsTested = julyClosed.filter((v) => v.date_closed && v.date_tested && v.date_closed === v.date_tested).length
const statusNotCompleted = julyClosed.filter((v) => v.status !== 'Completed' && v.status !== 'Warehouse RTS').length

console.log('\nJuly closed jobs where date_closed = date_tested:', closeEqualsTested)
console.log('July closed with shop status not Completed/RTS:', statusNotCompleted)

const today = '2026-07-09'
const julyAfterToday = julyClosed.filter((v) => String(v.date_closed) > today).length
console.log('July close dates AFTER today (2026-07-09):', julyAfterToday)

const juneClosed = completed.filter((v) => String(v.date_closed ?? '').startsWith('2026-06'))
console.log('\nJune 2026 date_closed:', juneClosed.length)

const bulkRepairWindow = completed.filter((v) => {
  const updated = String(v.updated_at ?? '')
  return (
    updated >= '2026-07-06T17:29:00' &&
    updated <= '2026-07-06T18:35:59' &&
    String(v.date_closed ?? '').startsWith('2026-07')
  )
})
console.log('July-dated completed updated during bulk-repair window (Jul 6):', bulkRepairWindow.length)

const doneStatuses = new Set(['Completed', 'Warehouse RTS', 'Replaced', 'Junked'])
const julyMetrics = julyClosed.filter((v) => doneStatuses.has(v.status))
console.log('July with done shop status:', julyMetrics.length)

const statusBreakdown = new Map()
for (const v of julyClosed) {
  statusBreakdown.set(v.status, (statusBreakdown.get(v.status) ?? 0) + 1)
}
console.log('\nJuly status breakdown:')
;[...statusBreakdown.entries()].sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log(`  ${s}: ${c}`))

const metricsEligible = completed.filter((v) => doneStatuses.has(v.status) && v.date_closed)
const julyEligible = metricsEligible.filter((v) => String(v.date_closed).startsWith('2026-07'))
const yearEligible = metricsEligible.filter((v) => String(v.date_closed).startsWith('2026-'))
console.log('\nWith done shop status + date_closed:')
console.log('  July 2026:', julyEligible.length)
console.log('  Year 2026:', yearEligible.length)
