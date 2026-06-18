/**
 * Upsert valves (+ optional test log refresh) from Valve Status workbook into Supabase.
 * Usage: node scripts/sync-valve-status-from-xlsx.mjs <path-to.xlsx> [--test-logs] [--notes]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  mapDailyNotesWorkbook,
  mapTestLogWorkbook,
  mapValveStatusWorkbook,
} from './valve-status-import-utils.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BATCH = 100

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

async function insertBatches(supabase, table, rows) {
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw new Error(`${table} batch ${i / BATCH + 1}: ${error.message}`)
    done += chunk.length
    process.stdout.write(`\r${table}: ${done}/${rows.length}`)
  }
  process.stdout.write('\n')
}

async function syncDailyNotes(supabase, xlsxPath) {
  const notes = mapDailyNotesWorkbook(xlsxPath)
  const { skippedCrossedOut = 0, skippedHidden = 0, skippedNonTodo = 0 } = notes._meta ?? {}
  const rows = [...notes]

  const { data: existing, error: readError } = await supabase
    .from('daily_notes')
    .select('id,note_date,body,source,is_done,completed_at')
  if (readError) throw new Error(`Could not read daily_notes: ${readError.message}`)

  const importKeys = new Set(rows.map((row) => `${row.note_date}|${row.body}`))
  const staleExcelIds = (existing ?? [])
    .filter((row) => row.source === 'excel')
    .filter((row) => !importKeys.has(`${row.note_date}|${row.body}`))
    .map((row) => row.id)

  if (staleExcelIds.length > 0) {
    const { error: deleteError } = await supabase.from('daily_notes').delete().in('id', staleExcelIds)
    if (deleteError) throw new Error(`Could not prune stale daily_notes: ${deleteError.message}`)
  }

  const seen = new Set((existing ?? []).map((row) => `${row.note_date}|${row.body}`))
  const toInsert = rows.filter((row) => !seen.has(`${row.note_date}|${row.body}`))
  if (!toInsert.length && staleExcelIds.length === 0) {
    console.log(
      `Daily notes: ${rows.length} active in workbook (${skippedCrossedOut} crossed out, ${skippedHidden} hidden, ${skippedNonTodo} non-todo skipped), 0 changes`,
    )
    return
  }

  if (toInsert.length > 0) {
    await insertBatches(supabase, 'daily_notes', toInsert)
  }

  const autoCompletedExcel = (existing ?? []).filter(
    (row) =>
      row.source === 'excel' &&
      importKeys.has(`${row.note_date}|${row.body}`) &&
      row.is_done &&
      row.completed_at === `${row.note_date}T23:59:59.000Z`,
  )
  if (autoCompletedExcel.length > 0) {
    const { error: reopenError } = await supabase
      .from('daily_notes')
      .update({ is_done: false, completed_at: null })
      .in(
        'id',
        autoCompletedExcel.map((row) => row.id),
      )
    if (reopenError) throw new Error(`Could not reopen auto-completed daily_notes: ${reopenError.message}`)
  }

  console.log(
    `Daily notes: ${rows.length} active in workbook (${skippedCrossedOut} crossed out, ${skippedHidden} hidden, ${skippedNonTodo} non-todo skipped); imported ${toInsert.length} new, removed ${staleExcelIds.length} stale, reopened ${autoCompletedExcel.length} auto-completed`,
  )
}

async function backfillValveDateTested(supabase, logs, valveIds) {
  const latestPass = new Map()
  for (const row of logs) {
    if (!String(row.pass_fail ?? '').toUpperCase().includes('PASS')) continue
    const prev = latestPass.get(row.valve_id)
    if (!prev || row.tested_on > prev) latestPass.set(row.valve_id, row.tested_on)
  }

  const updates = [...latestPass.entries()]
    .filter(([valve_id]) => valveIds.has(valve_id))
    .map(([valve_id, date_tested]) => ({ valve_id, date_tested }))
  if (!updates.length) return

  let done = 0
  const CONCURRENCY = 25
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      chunk.map(({ valve_id, date_tested }) =>
        supabase.from('valves').update({ date_tested }).eq('valve_id', valve_id),
      ),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      throw new Error(`date_tested backfill: ${failed.error.message}`)
    }
    done += chunk.length
    process.stdout.write(`\rdate_tested backfill: ${done}/${updates.length}`)
  }
  process.stdout.write('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const withTestLogs = args.includes('--test-logs')
  const withNotes = args.includes('--notes')
  const xlsxPath = path.resolve(args.find((a) => !a.startsWith('--')) || '')
  if (!xlsxPath || !fs.existsSync(xlsxPath)) {
    console.error(
      'Usage: node scripts/sync-valve-status-from-xlsx.mjs <path-to.xlsx> [--test-logs] [--notes]',
    )
    process.exit(1)
  }

  loadEnv()
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const valves = mapValveStatusWorkbook(xlsxPath)
  console.log(`Workbook: ${path.basename(xlsxPath)}`)
  console.log(`Valves to upsert: ${valves.length}`)

  await upsertBatches(supabase, 'valves', valves, 'valve_id')
  console.log('Valve sync complete.')

  const inProcessIds = new Set(
    valves.filter((v) => v.order_type === 'In-Process Order').map((v) => v.valve_id),
  )
  const { data: priorityRows, error: priorityError } = await supabase
    .from('priority_queue')
    .select('valve_id')
  if (priorityError) {
    console.warn('Could not read priority_queue:', priorityError.message)
  } else {
    const stale = (priorityRows ?? [])
      .map((row) => row.valve_id)
      .filter((valveId) => !inProcessIds.has(valveId))
    if (stale.length > 0) {
      const { error: pruneError } = await supabase.from('priority_queue').delete().in('valve_id', stale)
      if (pruneError) console.warn('Could not prune priority_queue:', pruneError.message)
      else console.log(`Pruned ${stale.length} closed/stale priority queue entries`)
    }
  }

  if (withTestLogs) {
    const logs = mapTestLogWorkbook(xlsxPath)
    console.log(`Test log rows: ${logs.length}`)
    const { error: delErr } = await supabase.from('test_logs').delete().neq('id', 0)
    if (delErr) throw new Error(`Could not clear test_logs: ${delErr.message}`)
    await insertBatches(supabase, 'test_logs', logs)
    console.log('Test log sync complete.')
    await backfillValveDateTested(supabase, logs, new Set(valves.map((v) => v.valve_id)))
    console.log('Valve date_tested backfill complete.')
  }

  if (withNotes) {
    await syncDailyNotes(supabase, xlsxPath)
    console.log('Daily notes sync complete.')
  }
}

async function upsertBatches(supabase, table, rows, onConflict) {
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`${table} batch ${i / BATCH + 1}: ${error.message}`)
    done += chunk.length
    process.stdout.write(`\r${table}: ${done}/${rows.length}`)
  }
  process.stdout.write('\n')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
