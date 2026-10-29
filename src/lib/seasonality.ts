import type { DemandProfileReport, DemandTypePeriodRow } from './demandProfile'

export const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export type SeasonalityMonthKey = `${number}-${string}` // YYYY-MM

export type SeasonalityMonthTotal = {
  period: SeasonalityMonthKey
  year: number
  month: number // 1-12
  jobCount: number
}

export type SeasonalityDemandLevel = 'busy' | 'typical' | 'quiet'

export type SeasonalityMonthAverage = {
  month: number
  label: string
  avg: number
  total: number
  yearsObserved: number
  index: number // 100 = average month
}

/** Busy ≥115 index, Quiet ≤85, else Typical. */
export function seasonalityDemandLevel(index: number): SeasonalityDemandLevel {
  if (index >= 115) return 'busy'
  if (index <= 85) return 'quiet'
  return 'typical'
}

export function seasonalityDemandLabel(level: SeasonalityDemandLevel): string {
  if (level === 'busy') return 'Busy'
  if (level === 'quiet') return 'Quiet'
  return 'Typical'
}

/** e.g. "51% above typical", "47% below typical", "Typical". */
export function seasonalityVsTypicalLabel(index: number): string {
  if (!index) return '—'
  const pct = index - 100
  if (pct === 0) return 'Typical'
  if (pct > 0) return `${pct}% above typical`
  return `${Math.abs(pct)}% below typical`
}

export type SeasonalityReportModel = {
  monthTotals: SeasonalityMonthTotal[]
  years: number[]
  /** year -> month(1-12) -> count */
  matrix: Record<number, Record<number, number>>
  monthAverages: SeasonalityMonthAverage[]
  peakMonth: SeasonalityMonthAverage | null
  troughMonth: SeasonalityMonthAverage | null
  overallMonthlyAvg: number
  maxCell: number
  maxMonthAvg: number
}

function parseMonthPeriod(period: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

/** Sum all type rows into one total per calendar month period. */
export function monthlyTotalsFromTypePeriods(
  typePeriods: DemandTypePeriodRow[],
): SeasonalityMonthTotal[] {
  const byPeriod = new Map<string, number>()
  for (const row of typePeriods) {
    const parsed = parseMonthPeriod(row.period)
    if (!parsed) continue
    byPeriod.set(row.period, (byPeriod.get(row.period) ?? 0) + (row.jobCount || 0))
  }
  return [...byPeriod.entries()]
    .map(([period, jobCount]) => {
      const parsed = parseMonthPeriod(period)!
      return {
        period: period as SeasonalityMonthKey,
        year: parsed.year,
        month: parsed.month,
        jobCount,
      }
    })
    .sort((a, b) => a.period.localeCompare(b.period))
}

export function buildSeasonalityModel(report: DemandProfileReport | null): SeasonalityReportModel {
  const empty: SeasonalityReportModel = {
    monthTotals: [],
    years: [],
    matrix: {},
    monthAverages: [],
    peakMonth: null,
    troughMonth: null,
    overallMonthlyAvg: 0,
    maxCell: 1,
    maxMonthAvg: 1,
  }
  if (!report) return empty

  const monthTotals = monthlyTotalsFromTypePeriods(report.typePeriods)
  if (monthTotals.length === 0) return empty

  const years = [...new Set(monthTotals.map((r) => r.year))].sort((a, b) => a - b)
  const matrix: Record<number, Record<number, number>> = {}
  for (const year of years) matrix[year] = {}
  let maxCell = 1
  for (const row of monthTotals) {
    matrix[row.year]![row.month] = row.jobCount
    if (row.jobCount > maxCell) maxCell = row.jobCount
  }

  const monthAverages: SeasonalityMonthAverage[] = []
  for (let month = 1; month <= 12; month++) {
    let total = 0
    let yearsObserved = 0
    for (const year of years) {
      const n = matrix[year]?.[month]
      if (n == null) continue
      total += n
      yearsObserved += 1
    }
    const avg = yearsObserved > 0 ? total / yearsObserved : 0
    monthAverages.push({
      month,
      label: MONTH_LABELS[month - 1]!,
      avg,
      total,
      yearsObserved,
      index: 0,
    })
  }

  const observed = monthAverages.filter((m) => m.yearsObserved > 0)
  const overallMonthlyAvg =
    observed.length > 0 ? observed.reduce((sum, m) => sum + m.avg, 0) / observed.length : 0

  for (const row of monthAverages) {
    row.index =
      overallMonthlyAvg > 0 && row.yearsObserved > 0
        ? Math.round((row.avg / overallMonthlyAvg) * 100)
        : 0
  }

  const ranked = [...observed].sort((a, b) => b.avg - a.avg)
  const peakMonth = ranked[0] ?? null
  const troughMonth = ranked.length ? ranked[ranked.length - 1]! : null
  const maxMonthAvg = Math.max(1, ...monthAverages.map((m) => m.avg))

  return {
    monthTotals,
    years,
    matrix,
    monthAverages,
    peakMonth,
    troughMonth,
    overallMonthlyAvg,
    maxCell,
    maxMonthAvg,
  }
}

export function seasonalityCsvRows(model: SeasonalityReportModel): string[][] {
  return model.monthAverages.map((row) => {
    const level = row.yearsObserved ? seasonalityDemandLevel(row.index) : null
    return [
      row.label,
      row.avg.toFixed(1),
      level ? seasonalityDemandLabel(level) : '',
      row.yearsObserved ? seasonalityVsTypicalLabel(row.index) : '',
      String(row.yearsObserved),
      ...model.years.map((year) => String(model.matrix[year]?.[row.month] ?? '')),
    ]
  })
}
