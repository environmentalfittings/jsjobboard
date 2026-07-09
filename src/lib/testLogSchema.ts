import { supabase } from './supabase'

export const TEST_LOG_SELECT_BASE =
  'id,tested_on,valve_id,size,pressure,manufacturer,valve_type,test_type,worked,pass_fail,action_taken,tester,created_at'

export const TEST_LOG_SELECT_WITH_DETAILS = `${TEST_LOG_SELECT_BASE},testing_details`

export const TEST_LOG_DETAILS_MIGRATION = 'supabase/migration-test-log-testing-details.sql'

let detailsColumnPromise: Promise<boolean> | null = null

/** Whether `test_logs.testing_details` exists (cached for the session). */
export async function testLogHasDetailsColumn(): Promise<boolean> {
  if (!detailsColumnPromise) {
    detailsColumnPromise = (async () => {
      const { error } = await supabase.from('test_logs').select('testing_details').limit(1)
      return !error
    })()
  }
  return detailsColumnPromise
}

export async function testLogSelectColumns(): Promise<string> {
  const hasDetails = await testLogHasDetailsColumn()
  return hasDetails ? TEST_LOG_SELECT_WITH_DETAILS : TEST_LOG_SELECT_BASE
}

export function isMissingTestingDetailsError(message: string | undefined): boolean {
  return Boolean(message?.includes('testing_details'))
}
