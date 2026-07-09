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

function parseLocal(raw) {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw).trim())
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseUtc(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

loadEnv()
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

const sb = createClient(url, key)
const now = new Date('2026-07-09T12:00:00')

let from = 0
const all = []
while (true) {
  const { data, error } = await sb.from('valves').select('order_type,date_closed').range(from, from + 999)
  if (error) throw error
  if (!data?.length) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}

const closed = all.filter((v) => v.order_type === 'Completed' && v.date_closed)
const countsLocal = new Map()
const countsUtc = new Map()

for (const v of closed) {
  for (const [parser, map] of [
    [parseLocal, countsLocal],
    [parseUtc, countsUtc],
  ]) {
    const d = parser(v.date_closed)
    if (!d) continue
    const keyName = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    map.set(keyName, (map.get(keyName) ?? 0) + 1)
  }
}

const months = []
for (let offset = 11; offset >= 0; offset -= 1) {
  const md = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  const keyName = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}`
  const prior = new Date(md.getFullYear() - 1, md.getMonth(), 1)
  const priorKey = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}`
  months.push({
    label: md.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    count: countsLocal.get(keyName) ?? 0,
    prior: countsLocal.get(priorKey) ?? 0,
    countUtc: countsUtc.get(keyName) ?? 0,
    priorUtc: countsUtc.get(priorKey) ?? 0,
  })
}

console.log('Monthly bars (local vs UTC parse):')
for (const m of months) {
  const flag = m.count !== m.countUtc || m.prior !== m.priorUtc ? ' *TZ*' : ''
  console.log(
    `${m.label.padEnd(7)} local ${String(m.count).padStart(4)}/${String(m.prior).padStart(4)} | utc ${String(m.countUtc).padStart(4)}/${String(m.priorUtc).padStart(4)}${flag}`,
  )
}

let mc = 0
let yc = 0
let lyc = 0
let lysp = 0
const y = now.getFullYear()
const ly = y - 1
const month = now.getMonth()
const sameEnd = new Date(ly, month, Math.min(now.getDate(), new Date(ly, month + 1, 0).getDate()), 23, 59, 59, 999)
const lyStart = new Date(ly, 0, 1)

for (const v of closed) {
  const d = parseLocal(v.date_closed)
  if (!d) continue
  if (d.getFullYear() === y) {
    yc += 1
    if (d.getMonth() === month) mc += 1
  } else if (d.getFullYear() === ly) {
    lyc += 1
    if (d >= lyStart && d <= sameEnd) lysp += 1
  }
}

console.log('\nKPIs (local parse):', { mc, yc, lysp, lyc, samePeriodEnd: sameEnd.toISOString().slice(0, 10) })

const noDateClosed = all.filter((v) => v.order_type === 'Completed' && !v.date_closed).length
console.log('Completed without date_closed:', noDateClosed)
