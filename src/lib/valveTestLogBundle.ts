import { supabase } from './supabase'
import { normalizeValveId } from './valveId'
import { loadTestLogReports } from './testLogReports'
import { parseTestLogTestingDetails } from '../types/testLog'
import type { TestLogEntry } from '../types'
import type { TestLogReport } from '../types/testLogReport'

const TEST_LOG_SELECT =
  'id,tested_on,valve_id,size,pressure,manufacturer,valve_type,test_type,worked,pass_fail,action_taken,tester,testing_details,created_at'

/** Latest test log entry plus parsed details and attached report files for one valve. */
export type ValveTestLogBundle = {
  entry: TestLogEntry
  details: NonNullable<ReturnType<typeof parseTestLogTestingDetails>>
  reports: TestLogReport[]
}

/**
 * Load test data for traveler / customer valve reports.
 * Join key is `valve_id` (same as travelers.valve_id). Returns the most recent test log.
 */
export async function loadValveTestLogForReport(valveId: string): Promise<ValveTestLogBundle | null> {
  const normalized = normalizeValveId(valveId)
  const candidates = Array.from(new Set([normalized, valveId.trim()].filter(Boolean)))

  let entry: TestLogEntry | null = null
  for (const id of candidates) {
    const { data } = await supabase
      .from('test_logs')
      .select(TEST_LOG_SELECT)
      .eq('valve_id', id)
      .order('tested_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      entry = data as TestLogEntry
      break
    }
  }

  if (!entry) return null

  const details = parseTestLogTestingDetails(entry.testing_details)
  if (!details) return null

  const reports = await loadTestLogReports(entry.id)
  return { entry, details, reports }
}
