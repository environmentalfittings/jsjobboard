import { supabase } from './supabase'

export type CustomerSalesRepRow = {
  id: number
  name: string
  sales_rep_employee_id: string | null
}

export type CustomerRecordUsage = {
  total: number
  jobs: number
  inventory: number
  received: number
  travelers: number
}

const EMPTY_USAGE: CustomerRecordUsage = {
  total: 0,
  jobs: 0,
  inventory: 0,
  received: 0,
  travelers: 0,
}

export function normalizeCustomerNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

function isMissingSalesRepColumn(message: string | null | undefined) {
  return /sales_rep_employee_id/i.test(String(message ?? '')) && /column|schema|does not exist/i.test(String(message ?? ''))
}

async function fetchAllColumnValues(table: string, column: string): Promise<{ values: string[]; error: string | null }> {
  const PAGE_SIZE = 1000
  const values: string[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(column).range(from, from + PAGE_SIZE - 1)
    if (error) return { values, error: error.message }
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    if (!rows.length) break
    for (const row of rows) {
      const raw = row[column]
      if (typeof raw === 'string' && raw.trim()) values.push(raw)
    }
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { values, error: null }
}

function bumpUsage(
  map: Map<string, CustomerRecordUsage>,
  name: string,
  field: keyof Omit<CustomerRecordUsage, 'total'>,
) {
  const key = normalizeCustomerNameKey(name)
  if (!key) return
  const prev = map.get(key) ?? { ...EMPTY_USAGE }
  const next = { ...prev, [field]: prev[field] + 1 }
  next.total = next.jobs + next.inventory + next.received + next.travelers
  map.set(key, next)
}

/**
 * Count jobs / inventory / received valves / traveler basic-info rows keyed by
 * trimmed lowercase customer name (list names are matched the same way).
 */
export async function loadCustomerRecordUsageByName(): Promise<{
  byName: Map<string, CustomerRecordUsage>
  error: string | null
}> {
  const byName = new Map<string, CustomerRecordUsage>()
  const [jobs, inventory, received, travelers] = await Promise.all([
    fetchAllColumnValues('valves', 'customer'),
    fetchAllColumnValues('inventory', 'customer'),
    fetchAllColumnValues('received_valves', 'customer'),
    fetchAllColumnValues('traveler_basic_info', 'customer'),
  ])

  for (const name of jobs.values) bumpUsage(byName, name, 'jobs')
  for (const name of inventory.values) bumpUsage(byName, name, 'inventory')
  for (const name of received.values) bumpUsage(byName, name, 'received')
  // Traveler table may be missing in older DBs — still return other counts
  if (!travelers.error) {
    for (const name of travelers.values) bumpUsage(byName, name, 'travelers')
  }

  const hardError = jobs.error || inventory.error || received.error || null
  return { byName, error: hardError }
}

export function usageForCustomerName(
  byName: Map<string, CustomerRecordUsage>,
  customerName: string,
): CustomerRecordUsage {
  return byName.get(normalizeCustomerNameKey(customerName)) ?? EMPTY_USAGE
}

export function formatCustomerUsageSummary(usage: CustomerRecordUsage): string {
  if (usage.total <= 0) return '0 records — safe to delete'
  const parts: string[] = []
  if (usage.jobs) parts.push(`${usage.jobs} job${usage.jobs === 1 ? '' : 's'}`)
  if (usage.inventory) parts.push(`${usage.inventory} inventory`)
  if (usage.received) parts.push(`${usage.received} received`)
  if (usage.travelers) parts.push(`${usage.travelers} traveler`)
  return `${usage.total} record${usage.total === 1 ? '' : 's'} (${parts.join(' · ')})`
}

export async function loadCustomersWithSalesRep(): Promise<{
  data: CustomerSalesRepRow[]
  error: string | null
  salesRepColumnMissing: boolean
}> {
  const withRep = await supabase
    .from('customers')
    .select('id,name,sales_rep_employee_id')
    .order('name')
    .limit(5000)

  if (!withRep.error) {
    return {
      data: ((withRep.data ?? []) as CustomerSalesRepRow[]).map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        sales_rep_employee_id: row.sales_rep_employee_id ? String(row.sales_rep_employee_id) : null,
      })),
      error: null,
      salesRepColumnMissing: false,
    }
  }

  if (isMissingSalesRepColumn(withRep.error.message)) {
    const fallback = await supabase.from('customers').select('id,name').order('name').limit(5000)
    if (fallback.error) {
      return { data: [], error: fallback.error.message, salesRepColumnMissing: true }
    }
    return {
      data: ((fallback.data ?? []) as { id: number; name: string }[]).map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        sales_rep_employee_id: null,
      })),
      error: null,
      salesRepColumnMissing: true,
    }
  }

  return { data: [], error: withRep.error.message, salesRepColumnMissing: false }
}

export async function updateCustomerSalesRep(
  customerId: number,
  salesRepEmployeeId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('customers')
    .update({ sales_rep_employee_id: salesRepEmployeeId })
    .eq('id', customerId)

  if (!error) return { error: null }
  if (isMissingSalesRepColumn(error.message)) {
    return { error: 'Run migration-customers-sales-rep.sql in Supabase, then try again' }
  }
  return { error: error.message }
}

export function findCustomerByName(
  customers: CustomerSalesRepRow[],
  customerName: string,
): CustomerSalesRepRow | null {
  const needle = normalizeCustomerNameKey(customerName)
  if (!needle) return null
  return customers.find((row) => normalizeCustomerNameKey(row.name) === needle) ?? null
}

type CustomerNameRewriteTarget = {
  table: string
  column: string
  label: string
}

const CUSTOMER_NAME_REWRITE_TARGETS: CustomerNameRewriteTarget[] = [
  { table: 'valves', column: 'customer', label: 'jobs' },
  { table: 'inventory', column: 'customer', label: 'inventory' },
  { table: 'inventory_events', column: 'customer', label: 'inventory activity' },
  { table: 'received_valves', column: 'customer', label: 'received valves' },
  { table: 'traveler_basic_info', column: 'customer', label: 'travelers' },
  { table: 'quality_incrs', column: 'customer_name', label: 'INCRs' },
  { table: 'customer_portal_users', column: 'customer_name', label: 'customer portal users' },
]

async function rewriteCustomerNameInTable(
  table: string,
  column: string,
  fromName: string,
  toName: string,
): Promise<{ updated: number; error: string | null; skipped?: boolean }> {
  const { data, error } = await supabase
    .from(table)
    .update({ [column]: toName })
    .eq(column, fromName)
    .select('id')

  if (error) {
    // Table/column may not exist in every environment — skip quietly.
    if (/schema cache|does not exist|relation|column/i.test(error.message)) {
      return { updated: 0, error: null, skipped: true }
    }
    return { updated: 0, error: error.message }
  }
  return { updated: (data ?? []).length, error: null }
}

export type CustomerMergeResult = {
  keepName: string
  mergedNames: string[]
  updatedByTable: Record<string, number>
  deletedCustomerRows: number
  error: string | null
}

/**
 * Merge duplicate customer list entries into one kept name.
 * Rewrites linked job/inventory/etc. rows that still use the source names,
 * then deletes the source customers list rows.
 */
export async function mergeCustomers(options: {
  keepCustomerId: number
  sourceCustomerIds: number[]
  customers: CustomerSalesRepRow[]
}): Promise<CustomerMergeResult> {
  const keep = options.customers.find((row) => row.id === options.keepCustomerId)
  if (!keep) {
    return {
      keepName: '',
      mergedNames: [],
      updatedByTable: {},
      deletedCustomerRows: 0,
      error: 'Keep customer not found',
    }
  }

  const sourceIds = [...new Set(options.sourceCustomerIds.filter((id) => id !== keep.id))]
  if (!sourceIds.length) {
    return {
      keepName: keep.name,
      mergedNames: [],
      updatedByTable: {},
      deletedCustomerRows: 0,
      error: 'Select at least one other customer to merge',
    }
  }

  const sources = options.customers.filter((row) => sourceIds.includes(row.id))
  if (!sources.length) {
    return {
      keepName: keep.name,
      mergedNames: [],
      updatedByTable: {},
      deletedCustomerRows: 0,
      error: 'Source customers not found',
    }
  }

  const keepName = keep.name.trim()
  const updatedByTable: Record<string, number> = {}
  const errors: string[] = []

  for (const source of sources) {
    const fromName = source.name.trim()
    if (!fromName || normalizeCustomerNameKey(fromName) === normalizeCustomerNameKey(keepName)) {
      continue
    }
    for (const target of CUSTOMER_NAME_REWRITE_TARGETS) {
      const result = await rewriteCustomerNameInTable(target.table, target.column, fromName, keepName)
      if (result.error) {
        errors.push(`${target.label}: ${result.error}`)
        continue
      }
      if (result.skipped) continue
      updatedByTable[target.label] = (updatedByTable[target.label] ?? 0) + result.updated
    }
  }

  // If the keep row has no salesman, inherit from the first source that has one.
  if (!keep.sales_rep_employee_id) {
    const donor = sources.find((row) => row.sales_rep_employee_id)
    if (donor?.sales_rep_employee_id) {
      const { error } = await updateCustomerSalesRep(keep.id, donor.sales_rep_employee_id)
      if (error) errors.push(`Salesman copy: ${error}`)
    }
  }

  const { error: deleteError, count } = await supabase
    .from('customers')
    .delete({ count: 'exact' })
    .in(
      'id',
      sources.map((row) => row.id),
    )

  if (deleteError) {
    errors.push(`Could not delete merged customer list rows: ${deleteError.message}`)
  }

  return {
    keepName,
    mergedNames: sources.map((row) => row.name),
    updatedByTable,
    deletedCustomerRows: count ?? sources.length,
    error: errors.length ? errors.join(' · ') : null,
  }
}
