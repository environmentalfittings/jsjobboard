import { localValveIdsForCompany } from './companyDataScope'
import type { CompanyWorkflowKey } from '../constants/companyWorkflows'
import { supabase } from './supabase'
import type { Organization } from '../types/organizations'

export type DemandPeriod = 'month' | 'quarter' | 'year'
export type DemandTypeDimension = 'valve_type' | 'job_type' | 'size' | 'pressure_class'

export type DemandProfileMeta = {
  start: string
  end: string
  period: DemandPeriod
  typeDimension: DemandTypeDimension
  metric: 'job_count'
  scopedTotal: number
  excludedNull: number
  excludedBad: number
  totalJobs: number
  unspecifiedTypePct: number
  years: string[]
  footnote: string
}

export type DemandTypePeriodRow = { type: string; period: string; jobCount: number }
export type DemandTypeSummaryRow = {
  type: string
  total: number
  pctOfTotal: number
  yearCounts: Record<string, number>
  lastJobDate: string | null
}
export type DemandCustomerSummaryRow = {
  key: string
  customer: string
  total: number
  pctOfTotal: number
  jobCount: number
  yearCounts: Record<string, number>
  firstJobDate: string | null
  lastJobDate: string | null
  isNewInRange: boolean
  rank: number
}
export type DemandCustomerPeriodRow = {
  key: string
  customer: string
  period: string
  jobCount: number
}
export type DemandMatrix = {
  customers: { key: string; customer: string; total: number }[]
  types: string[]
  cells: { customerKey: string; type: string; jobCount: number }[]
}

export type DemandProfileReport = {
  meta: DemandProfileMeta
  typePeriods: DemandTypePeriodRow[]
  typeSummary: DemandTypeSummaryRow[]
  customerSummary: DemandCustomerSummaryRow[]
  customerPeriods: DemandCustomerPeriodRow[]
  matrix: DemandMatrix
  filterOptions: {
    types: string[]
    customers: { key: string; label: string }[]
    jobTypes: string[]
  }
}

export type DemandProfileJobRow = {
  id: number
  valveId: string
  customer: string
  type: string
  jobType: string
  status: string
  demandDate: string
  dueDate: string | null
  dateReceived: string | null
}

export type CustomerAliasCandidates = {
  unmatched: { name: string; normalized: string; jobCount: number }[]
  nearDuplicates: {
    nameA: string
    jobsA: number
    nameB: string
    jobsB: number
    normalizedA: string
    normalizedB: string
  }[]
  canonicalCustomers: { id: number; name: string }[]
}

/** Last N full calendar months ending yesterday (not including partial current month). */
export function demandDefaultRange(fullMonths = 24, now = new Date()): { start: string; end: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), 0) // last day of previous month
  const start = new Date(end.getFullYear(), end.getMonth() - (fullMonths - 1), 1)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

export function demandAllTimeStart(): string {
  return '2022-01-01'
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function companyValveIdScope(options: {
  workflowKey: CompanyWorkflowKey
  activeOrganization: Organization | null
}): { workflowKey: CompanyWorkflowKey; includeIds: number[] | null; excludeIds: number[] | null } {
  const workflowKey = options.workflowKey
  if (workflowKey === 'vsi') {
    const include = [...localValveIdsForCompany('vsi')]
    return { workflowKey, includeIds: include.length ? include : [-1], excludeIds: null }
  }
  const exclude = [...localValveIdsForCompany('vsi')]
  return { workflowKey, includeIds: null, excludeIds: exclude.length ? exclude : null }
}

function yoyChange(yearCounts: Record<string, number>, years: string[]): number | null {
  if (years.length < 2) return null
  const sorted = [...years].sort()
  const latest = sorted[sorted.length - 1]
  const prior = sorted[sorted.length - 2]
  const a = yearCounts[latest] ?? 0
  const b = yearCounts[prior] ?? 0
  if (b <= 0) return a > 0 ? 100 : null
  return ((a - b) / b) * 100
}

export function customerYoyPct(row: DemandCustomerSummaryRow, years: string[]): number | null {
  return yoyChange(row.yearCounts ?? {}, years)
}

export function typeYoyPct(row: DemandTypeSummaryRow, years: string[]): number | null {
  return yoyChange(row.yearCounts ?? {}, years)
}

export function isDecliningCustomer(row: DemandCustomerSummaryRow, years: string[]): boolean {
  const yoy = customerYoyPct(row, years)
  return yoy != null && yoy <= -20
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

function normalizeReport(raw: unknown): DemandProfileReport {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const metaIn = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Record<string, unknown>
  const matrixIn = (data.matrix && typeof data.matrix === 'object' ? data.matrix : {}) as Record<string, unknown>
  const filtersIn =
    (data.filterOptions && typeof data.filterOptions === 'object' ? data.filterOptions : {}) as Record<
      string,
      unknown
    >

  return {
    meta: {
      start: String(metaIn.start ?? ''),
      end: String(metaIn.end ?? ''),
      period: (String(metaIn.period ?? 'quarter') as DemandPeriod) || 'quarter',
      typeDimension: (String(metaIn.typeDimension ?? 'valve_type') as DemandTypeDimension) || 'valve_type',
      metric: 'job_count',
      scopedTotal: Number(metaIn.scopedTotal) || 0,
      excludedNull: Number(metaIn.excludedNull) || 0,
      excludedBad: Number(metaIn.excludedBad) || 0,
      totalJobs: Number(metaIn.totalJobs) || 0,
      unspecifiedTypePct: Number(metaIn.unspecifiedTypePct) || 0,
      years: Array.isArray(metaIn.years) ? metaIn.years.map(String) : [],
      footnote: String(
        metaIn.footnote ??
          'Historical demand is based on due date, which typically lags receipt by a few weeks.',
      ),
    },
    typePeriods: Array.isArray(data.typePeriods)
      ? data.typePeriods.map((row) => {
          const r = row as Record<string, unknown>
          return { type: String(r.type ?? ''), period: String(r.period ?? ''), jobCount: Number(r.jobCount) || 0 }
        })
      : [],
    typeSummary: Array.isArray(data.typeSummary)
      ? data.typeSummary.map((row) => {
          const r = row as Record<string, unknown>
          return {
            type: String(r.type ?? ''),
            total: Number(r.total) || 0,
            pctOfTotal: Number(r.pctOfTotal) || 0,
            yearCounts: asRecord(r.yearCounts),
            lastJobDate: r.lastJobDate ? String(r.lastJobDate).slice(0, 10) : null,
          }
        })
      : [],
    customerSummary: Array.isArray(data.customerSummary)
      ? data.customerSummary.map((row) => {
          const r = row as Record<string, unknown>
          return {
            key: String(r.key ?? ''),
            customer: String(r.customer ?? ''),
            total: Number(r.total) || 0,
            pctOfTotal: Number(r.pctOfTotal) || 0,
            jobCount: Number(r.jobCount) || 0,
            yearCounts: asRecord(r.yearCounts),
            firstJobDate: r.firstJobDate ? String(r.firstJobDate).slice(0, 10) : null,
            lastJobDate: r.lastJobDate ? String(r.lastJobDate).slice(0, 10) : null,
            isNewInRange: Boolean(r.isNewInRange),
            rank: Number(r.rank) || 0,
          }
        })
      : [],
    customerPeriods: Array.isArray(data.customerPeriods)
      ? data.customerPeriods.map((row) => {
          const r = row as Record<string, unknown>
          return {
            key: String(r.key ?? ''),
            customer: String(r.customer ?? ''),
            period: String(r.period ?? ''),
            jobCount: Number(r.jobCount) || 0,
          }
        })
      : [],
    matrix: {
      customers: Array.isArray(matrixIn.customers)
        ? matrixIn.customers.map((row) => {
            const r = row as Record<string, unknown>
            return {
              key: String(r.key ?? ''),
              customer: String(r.customer ?? ''),
              total: Number(r.total) || 0,
            }
          })
        : [],
      types: Array.isArray(matrixIn.types) ? matrixIn.types.map(String) : [],
      cells: Array.isArray(matrixIn.cells)
        ? matrixIn.cells.map((row) => {
            const r = row as Record<string, unknown>
            return {
              customerKey: String(r.customerKey ?? ''),
              type: String(r.type ?? ''),
              jobCount: Number(r.jobCount) || 0,
            }
          })
        : [],
    },
    filterOptions: {
      types: Array.isArray(filtersIn.types) ? filtersIn.types.map(String) : [],
      customers: Array.isArray(filtersIn.customers)
        ? filtersIn.customers.map((row) => {
            const r = row as Record<string, unknown>
            return { key: String(r.key ?? ''), label: String(r.label ?? '') }
          })
        : [],
      jobTypes: Array.isArray(filtersIn.jobTypes) ? filtersIn.jobTypes.map(String) : [],
    },
  }
}

export async function fetchDemandProfileReport(options: {
  start: string
  end: string
  period: DemandPeriod
  typeDimension: DemandTypeDimension
  jobTypes?: string[]
  typeKeys?: string[]
  customerKeys?: string[]
  workflowKey: CompanyWorkflowKey
  activeOrganization: Organization | null
}): Promise<{ data: DemandProfileReport | null; error: string | null }> {
  const scope = companyValveIdScope(options)
  const { data, error } = await supabase.rpc('demand_profile_report', {
    p_start: options.start,
    p_end: options.end,
    p_period: options.period,
    p_type_dimension: options.typeDimension,
    p_job_types: options.jobTypes?.length ? options.jobTypes : null,
    p_type_keys: options.typeKeys?.length ? options.typeKeys : null,
    p_customer_keys: options.customerKeys?.length ? options.customerKeys : null,
    p_workflow_key: scope.workflowKey,
    p_include_valve_ids: scope.includeIds,
    p_exclude_valve_ids: scope.excludeIds,
  })
  if (error) return { data: null, error: error.message }
  return { data: normalizeReport(data), error: null }
}

export async function fetchDemandProfileJobs(options: {
  start: string
  end: string
  typeDimension: DemandTypeDimension
  jobTypes?: string[]
  customerKey?: string | null
  typeLabel?: string | null
  workflowKey: CompanyWorkflowKey
  activeOrganization: Organization | null
}): Promise<{ data: DemandProfileJobRow[]; error: string | null }> {
  const scope = companyValveIdScope(options)
  const { data, error } = await supabase.rpc('demand_profile_jobs', {
    p_start: options.start,
    p_end: options.end,
    p_type_dimension: options.typeDimension,
    p_job_types: options.jobTypes?.length ? options.jobTypes : null,
    p_customer_key: options.customerKey ?? null,
    p_type_label: options.typeLabel ?? null,
    p_workflow_key: scope.workflowKey,
    p_include_valve_ids: scope.includeIds,
    p_exclude_valve_ids: scope.excludeIds,
    p_limit: 500,
  })
  if (error) return { data: [], error: error.message }
  const rows = Array.isArray(data) ? data : []
  return {
    data: rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        id: Number(r.id) || 0,
        valveId: String(r.valveId ?? ''),
        customer: String(r.customer ?? ''),
        type: String(r.type ?? ''),
        jobType: String(r.jobType ?? ''),
        status: String(r.status ?? ''),
        demandDate: String(r.demandDate ?? '').slice(0, 10),
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
        dateReceived: r.dateReceived ? String(r.dateReceived).slice(0, 10) : null,
      }
    }),
    error: null,
  }
}

export async function fetchCustomerAliasCandidates(): Promise<{
  data: CustomerAliasCandidates | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('customer_alias_candidates')
  if (error) return { data: null, error: error.message }
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return {
    data: {
      unmatched: Array.isArray(raw.unmatched)
        ? raw.unmatched.map((row) => {
            const r = row as Record<string, unknown>
            return {
              name: String(r.name ?? ''),
              normalized: String(r.normalized ?? ''),
              jobCount: Number(r.jobCount) || 0,
            }
          })
        : [],
      nearDuplicates: Array.isArray(raw.nearDuplicates)
        ? raw.nearDuplicates.map((row) => {
            const r = row as Record<string, unknown>
            return {
              nameA: String(r.nameA ?? ''),
              jobsA: Number(r.jobsA) || 0,
              nameB: String(r.nameB ?? ''),
              jobsB: Number(r.jobsB) || 0,
              normalizedA: String(r.normalizedA ?? ''),
              normalizedB: String(r.normalizedB ?? ''),
            }
          })
        : [],
      canonicalCustomers: Array.isArray(raw.canonicalCustomers)
        ? raw.canonicalCustomers.map((row) => {
            const r = row as Record<string, unknown>
            return { id: Number(r.id) || 0, name: String(r.name ?? '') }
          })
        : [],
    },
    error: null,
  }
}

export function normalizeCustomerAliasText(raw: string): string {
  return raw.trim().toLowerCase()
}

export async function saveCustomerAlias(options: {
  aliasText: string
  customerId: number
  createdByName?: string
}): Promise<{ error: string | null }> {
  const alias = normalizeCustomerAliasText(options.aliasText)
  if (!alias) return { error: 'Alias text is required' }
  if (!options.customerId) return { error: 'Pick a canonical customer' }
  const { error } = await supabase.from('customer_aliases').upsert(
    {
      alias_text: alias,
      customer_id: options.customerId,
      created_by_name: String(options.createdByName ?? '').trim(),
    },
    { onConflict: 'alias_text' },
  )
  return { error: error?.message ?? null }
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [
    headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function stackedBarSeries(
  periods: string[],
  typePeriods: DemandTypePeriodRow[],
  types: string[],
): { period: string; values: Record<string, number>; total: number }[] {
  return periods.map((period) => {
    const values: Record<string, number> = {}
    let total = 0
    for (const type of types) {
      const hit = typePeriods.find((r) => r.period === period && r.type === type)
      const n = hit?.jobCount ?? 0
      values[type] = n
      total += n
    }
    return { period, values, total }
  })
}

export function uniquePeriods(rows: { period: string }[]): string[] {
  return [...new Set(rows.map((r) => r.period))].sort()
}
