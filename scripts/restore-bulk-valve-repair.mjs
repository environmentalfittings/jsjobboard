/**
 * Restore valves incorrectly reopened by the 2026-07-06 job-board auto-repair.
 * Uses the Valve Status workbook when provided; otherwise restores order_type only.
 *
 * Usage:
 *   node scripts/restore-bulk-valve-repair.mjs [path-to.xlsx] [--dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { mapValveStatusWorkbook } from './valve-status-import-utils.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPAIR_START = '2026-07-06T17:29:00.000Z'
const REPAIR_END = '2026-07-06T18:35:00.000Z'
const BATCH = 50

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

function isBulkRepairVictim(valve) {
  if (valve.order_type !== 'In-Process Order') return false
  if (valve.date_closed) return false
  if (!valve.updated_at) return false
  const updatedAt = new Date(valve.updated_at).getTime()
  if (updatedAt < new Date(REPAIR_START).getTime() || updatedAt > new Date(REPAIR_END).getTime()) {
    return false
  }
  if (!valve.created_at) return false
  return new Date(valve.created_at).getTime() < new Date('2026-07-06T00:00:00.000Z').getTime()
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const xlsxArg = args.find((arg) => !arg.startsWith('--'))
  const xlsxPath = xlsxArg ? path.resolve(xlsxArg) : ''
  const hasWorkbook = Boolean(xlsxPath && fs.existsSync(xlsxPath) && fs.statSync(xlsxPath).isFile())

  loadEnv()
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
    process.exit(1)
  }

  const excelById = new Map()
  if (hasWorkbook) {
    for (const row of mapValveStatusWorkbook(xlsxPath)) {
      excelById.set(row.valve_id, row)
    }
    console.log(`Workbook: ${path.basename(xlsxPath)} (${excelById.size} valves)`)
  } else {
    console.log('No workbook provided; restoring order_type only (date_closed left null).')
  }

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

  const victims = all.filter(isBulkRepairVictim)
  const toRestore = victims.filter((valve) => {
    const excel = excelById.get(valve.valve_id)
    if (excel) return excel.order_type === 'Completed'
    return true
  })

  const skippedByWorkbook = victims.length - toRestore.length
  console.log({
    totalValves: all.length,
    bulkRepairVictims: victims.length,
    restoring: toRestore.length,
    skippedBecauseWorkbookSaysActive: skippedByWorkbook,
    dryRun,
  })

  if (!toRestore.length) return

  let restored = 0
  let sample = null
  for (let i = 0; i < toRestore.length; i += BATCH) {
    const chunk = toRestore.slice(i, i + BATCH)
    const results = await Promise.all(
      chunk.map(async (valve) => {
        const excel = excelById.get(valve.valve_id)
        const patch = {
          order_type: 'Completed',
          date_closed: excel?.date_closed ?? valve.date_tested ?? null,
        }
        if (dryRun) return { valve_id: valve.valve_id, patch }
        const { error } = await supabase.from('valves').update(patch).eq('id', valve.id)
        if (error) throw new Error(`${valve.valve_id}: ${error.message}`)
        return { valve_id: valve.valve_id, patch }
      }),
    )
    if (!sample && results[0]) sample = results[0]
    restored += results.length
    process.stdout.write(`\rRestored ${restored}/${toRestore.length}`)
  }
  process.stdout.write('\n')
  if (dryRun) {
    console.log('Sample restore patch:', sample)
  } else {
    console.log('Restore complete.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
