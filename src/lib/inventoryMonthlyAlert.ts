import { supabase } from './supabase'

const STORAGE_KEY = 'js-customer-inventory-monthly-report-claim'

export type InventoryMonthlyReportClaim = {
  period_key: string
  claimed_by_name: string
  claimed_by_user_id: string | null
  claimed_at: string
}

type LocalClaim = {
  period_key: string
  claimed_by_name: string
  claimed_at: string
}

/** Calendar month key used for the dashboard reminder, e.g. "2026-08". */
export function inventoryMonthlyReportPeriodKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function currentInventoryMonthlyReportLabel(date = new Date()): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function readLocalClaim(): LocalClaim | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Migrate prior "cleared for month" flag (no owner name).
      const legacy = window.localStorage.getItem('js-customer-inventory-monthly-report-cleared')
      if (!legacy) return null
      return {
        period_key: legacy,
        claimed_by_name: 'Someone',
        claimed_at: new Date().toISOString(),
      }
    }
    const parsed = JSON.parse(raw) as Partial<LocalClaim>
    if (!parsed.period_key || !parsed.claimed_by_name) return null
    return {
      period_key: parsed.period_key,
      claimed_by_name: parsed.claimed_by_name,
      claimed_at: parsed.claimed_at || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

function writeLocalClaim(claim: LocalClaim): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(claim))
    window.localStorage.setItem('js-customer-inventory-monthly-report-cleared', claim.period_key)
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Reminder becomes due on the 1st of each month and stays visible until someone
 * takes responsibility for that month (shared via Supabase when available).
 */
export async function loadInventoryMonthlyReportClaim(
  date = new Date(),
): Promise<InventoryMonthlyReportClaim | null> {
  const periodKey = inventoryMonthlyReportPeriodKey(date)

  const { data, error } = await supabase
    .from('inventory_monthly_report_claims')
    .select('period_key,claimed_by_name,claimed_by_user_id,claimed_at')
    .eq('period_key', periodKey)
    .maybeSingle()

  if (!error && data) {
    const claim: InventoryMonthlyReportClaim = {
      period_key: String(data.period_key),
      claimed_by_name: String(data.claimed_by_name),
      claimed_by_user_id: data.claimed_by_user_id ? String(data.claimed_by_user_id) : null,
      claimed_at: String(data.claimed_at),
    }
    writeLocalClaim({
      period_key: claim.period_key,
      claimed_by_name: claim.claimed_by_name,
      claimed_at: claim.claimed_at,
    })
    return claim
  }

  const local = readLocalClaim()
  if (local?.period_key === periodKey) {
    return {
      period_key: local.period_key,
      claimed_by_name: local.claimed_by_name,
      claimed_by_user_id: null,
      claimed_at: local.claimed_at,
    }
  }

  return null
}

export function isInventoryMonthlyReportAlertVisible(
  claim: InventoryMonthlyReportClaim | null | undefined,
  date = new Date(),
): boolean {
  if (!claim) return true
  return claim.period_key !== inventoryMonthlyReportPeriodKey(date)
}

export async function claimInventoryMonthlyReportResponsibility(args: {
  claimedByName: string
  claimedByUserId?: string | null
  date?: Date
}): Promise<{ claim: InventoryMonthlyReportClaim | null; error?: string }> {
  const date = args.date ?? new Date()
  const periodKey = inventoryMonthlyReportPeriodKey(date)
  const claimedByName = args.claimedByName.trim() || 'Team member'
  const claimedAt = new Date().toISOString()
  const claim: InventoryMonthlyReportClaim = {
    period_key: periodKey,
    claimed_by_name: claimedByName,
    claimed_by_user_id: args.claimedByUserId ?? null,
    claimed_at: claimedAt,
  }

  const { data, error } = await supabase
    .from('inventory_monthly_report_claims')
    .upsert(
      {
        period_key: periodKey,
        claimed_by_name: claimedByName,
        claimed_by_user_id: args.claimedByUserId ?? null,
        claimed_at: claimedAt,
      },
      { onConflict: 'period_key' },
    )
    .select('period_key,claimed_by_name,claimed_by_user_id,claimed_at')
    .maybeSingle()

  if (error) {
    // Keep the reminder clear for this browser if the shared table is not migrated yet.
    writeLocalClaim({
      period_key: periodKey,
      claimed_by_name: claimedByName,
      claimed_at: claimedAt,
    })
    const missingTable =
      /inventory_monthly_report_claims/i.test(error.message) ||
      error.code === '42P01' ||
      error.code === 'PGRST205'
    if (missingTable) {
      return { claim }
    }
    return { claim, error: error.message }
  }

  const saved: InventoryMonthlyReportClaim = data
    ? {
        period_key: String(data.period_key),
        claimed_by_name: String(data.claimed_by_name),
        claimed_by_user_id: data.claimed_by_user_id ? String(data.claimed_by_user_id) : null,
        claimed_at: String(data.claimed_at),
      }
    : claim

  writeLocalClaim({
    period_key: saved.period_key,
    claimed_by_name: saved.claimed_by_name,
    claimed_at: saved.claimed_at,
  })

  return { claim: saved }
}

/** @deprecated Prefer claimInventoryMonthlyReportResponsibility so an owner is recorded. */
export function clearInventoryMonthlyReportAlert(date = new Date()): void {
  writeLocalClaim({
    period_key: inventoryMonthlyReportPeriodKey(date),
    claimed_by_name: 'Someone',
    claimed_at: new Date().toISOString(),
  })
}
