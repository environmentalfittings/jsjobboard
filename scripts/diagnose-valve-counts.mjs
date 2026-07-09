import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(ROOT, '.env')
if (fs.existsSync(envPath)) {
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

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.log('Missing Supabase env')
  process.exit(1)
}

const DONE = new Set(['Warehouse RTS', 'Replaced', 'Junked', 'Completed'])
const supabase = createClient(url, key)
const pageSize = 1000
let from = 0
const all = []
while (true) {
  const { data, error } = await supabase
    .from('valves')
    .select('id,valve_id,status,order_type,date_closed,date_tested,updated_at,created_at')
    .range(from, from + pageSize - 1)
  if (error) throw error
  if (!data?.length) break
  all.push(...data)
  if (data.length < pageSize) break
  from += pageSize
}

const dayAgo = Date.now() - 24 * 3600 * 1000
const stats = {
  total: all.length,
  inProcess: all.filter((v) => v.order_type === 'In-Process Order').length,
  completed: all.filter((v) => v.order_type === 'Completed').length,
  anomalyCompletedOrder: all.filter((v) => v.order_type === 'Completed' && !DONE.has(v.status)).length,
  inProcessNoDateClosed: all.filter((v) => v.order_type === 'In-Process Order' && !v.date_closed).length,
  inProcessWithDateClosed: all.filter((v) => v.order_type === 'In-Process Order' && v.date_closed).length,
  inProcessUpdatedLast24h: all.filter(
    (v) => v.order_type === 'In-Process Order' && v.updated_at && new Date(v.updated_at).getTime() > dayAgo,
  ).length,
}

console.log(stats)

const suspects = all.filter(
  (v) =>
    v.order_type === 'In-Process Order' &&
    !v.date_closed &&
    v.updated_at &&
    new Date(v.updated_at).getTime() > dayAgo &&
    v.created_at &&
    new Date(v.created_at).getTime() < Date.now() - 90 * 24 * 3600 * 1000,
)
console.log('Likely bulk-repair victims (old created, in-process, updated <24h):', suspects.length)
console.log('Victims with date_tested:', suspects.filter((v) => v.date_tested).length)
if (suspects[0]) console.log('Sample:', suspects.slice(0, 3))
