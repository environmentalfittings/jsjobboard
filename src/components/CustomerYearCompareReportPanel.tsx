import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleReportPanel } from './CollapsibleReportPanel'
import { useToast } from './ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { resolveActiveCompanyKey, valveRowBelongsToCompany } from '../lib/companyDataScope'
import {
  aggregateCustomerYearCompare,
  formatCustomerJobDelta,
  isFinishedJobForYearCompare,
  isOpenShopJobForYearCompare,
  priorFullYears,
  sameCalendarDayInYear,
  sortCustomerYearRows,
  sumCustomerYearCompare,
  type ClosedJobCustomerRow,
  type CustomerYearSort,
} from '../lib/customerYearCompare'
import { loadCustomersWithSalesRep } from '../lib/customers'
import { printTableReport } from '../lib/reportChartsPrint'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 1000

const JOB_SELECT = 'id,valve_id,customer,date_closed,status,order_type,organization_id'
const JOB_SELECT_NO_ORG = 'id,valve_id,customer,date_closed,status,order_type'

async function fetchValvePages(
  run: (from: number, select: string) => Promise<{ data: unknown; error: { message: string } | null }>,
): Promise<{ data: ClosedJobCustomerRow[]; error: string | null }> {
  const rows: ClosedJobCustomerRow[] = []
  let from = 0
  let select = JOB_SELECT
  let skippedOrgColumn = false

  while (true) {
    const { data, error } = await run(from, select)
    if (error && !skippedOrgColumn && /organization_id/i.test(error.message)) {
      select = JOB_SELECT_NO_ORG
      skippedOrgColumn = true
      continue
    }
    if (error) return { data: rows, error: error.message }
    const batch = (data ?? []) as unknown as ClosedJobCustomerRow[]
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return { data: rows, error: null }
}

async function fetchClosedCustomerJobs(
  start: string,
  end: string,
): Promise<{ data: ClosedJobCustomerRow[]; error: string | null }> {
  const result = await fetchValvePages(async (from, select) => {
    const { data, error } = await supabase
      .from('valves')
      .select(select)
      .or('order_type.eq.Completed,status.eq.Completed')
      .gte('date_closed', start)
      .lte('date_closed', end)
      .order('date_closed', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    return { data, error }
  })
  if (result.error) return result
  return { data: result.data.filter(isFinishedJobForYearCompare), error: null }
}

async function fetchOpenCustomerJobs(): Promise<{ data: ClosedJobCustomerRow[]; error: string | null }> {
  const result = await fetchValvePages(async (from, select) => {
    const { data, error } = await supabase
      .from('valves')
      .select(select)
      .in('order_type', ['In-Process Order', 'On-Hold', 'Waiting on Arrival'])
      .not('status', 'in', '(Completed,Junked,Replaced)')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    return { data, error }
  })
  if (result.error) return result
  return { data: result.data.filter(isOpenShopJobForYearCompare), error: null }
}

export function CustomerYearCompareReportPanel() {
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyKey = resolveActiveCompanyKey(workflow.key, activeOrganization)
  const companyName = activeOrganization?.name?.trim() || (companyKey === 'vsi' ? 'VSI' : 'JS Valve')

  const asOf = useMemo(() => {
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    return now
  }, [])
  const thisYear = asOf.getFullYear()
  const lastYear = thisYear - 1

  const [priorCount, setPriorCount] = useState(3)
  const [sort, setSort] = useState<CustomerYearSort>('this_year')
  const [query, setQuery] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [limit, setLimit] = useState<'25' | '50' | 'all'>('50')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ClosedJobCustomerRow[]>([])
  const [openRows, setOpenRows] = useState<ClosedJobCustomerRow[]>([])
  const [canonicalNames, setCanonicalNames] = useState<string[]>([])

  const years = useMemo(() => priorFullYears(thisYear, priorCount), [priorCount, thisYear])
  const rangeStart = `${years[0] ?? lastYear}-01-01`
  const rangeEnd = sameCalendarDayInYear(asOf, thisYear)
  const lastYearYtdEnd = sameCalendarDayInYear(asOf, lastYear)

  const scopeRow = useCallback(
    (row: ClosedJobCustomerRow) =>
      valveRowBelongsToCompany(row.id, {
        workflowKey: companyKey,
        activeOrganization,
        valveOrganizationId: row.organization_id ?? null,
      }),
    [activeOrganization, companyKey],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    const [closed, open] = await Promise.all([
      fetchClosedCustomerJobs(rangeStart, rangeEnd),
      fetchOpenCustomerJobs(),
    ])
    if (closed.error) {
      showToast(`Could not load customer year comparison: ${closed.error}`)
      return { rows: [] as ClosedJobCustomerRow[], openRows: [] as ClosedJobCustomerRow[], error: closed.error }
    }
    if (open.error) {
      showToast(`Could not load in-shop jobs: ${open.error}`)
      return { rows: closed.data.filter(scopeRow), openRows: [] as ClosedJobCustomerRow[], error: open.error }
    }
    return {
      rows: closed.data.filter(scopeRow),
      openRows: open.data.filter(scopeRow),
      error: null,
    }
  }, [rangeEnd, rangeStart, scopeRow, showToast])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void reload().then((result) => {
      if (cancelled) return
      setRows(result.rows)
      setOpenRows(result.openRows)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  useEffect(() => {
    let cancelled = false
    void loadCustomersWithSalesRep().then((result) => {
      if (cancelled) return
      setCanonicalNames(
        result.data.map((row) => row.name.trim()).filter(Boolean),
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  const aggregated = useMemo(
    () => aggregateCustomerYearCompare(rows, { years, thisYear, asOf, canonicalNames, openRows }),
    [asOf, canonicalNames, openRows, rows, thisYear, years],
  )

  const customerOptions = useMemo(
    () =>
      [...aggregated].sort((a, b) =>
        a.customer.localeCompare(b.customer, undefined, { sensitivity: 'base' }),
      ),
    [aggregated],
  )

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return aggregated.filter((row) => {
      if (customerFilter && row.key !== customerFilter) return false
      if (!needle) return true
      return (
        row.customer.toLowerCase().includes(needle) ||
        row.mergedFrom.some((name) => name.toLowerCase().includes(needle))
      )
    })
  }, [aggregated, customerFilter, query])

  const filtered = useMemo(() => {
    const ranked = [...matched].sort(
      (a, b) =>
        b.thisYearYtd + b.inShop - (a.thisYearYtd + a.inShop) ||
        b.totalInWindow - a.totalInWindow ||
        a.customer.localeCompare(b.customer),
    )
    const limited =
      customerFilter || limit === 'all' ? ranked : ranked.slice(0, Number(limit))
    return sortCustomerYearRows(limited, sort)
  }, [customerFilter, limit, matched, sort])

  const totals = useMemo(() => sumCustomerYearCompare(matched, years.length), [matched, years.length])
  const shownTotals = useMemo(() => sumCustomerYearCompare(filtered, years.length), [filtered, years.length])
  const chartRows = useMemo(
    () => sortCustomerYearRows(filtered, 'this_year').slice(0, 10),
    [filtered],
  )
  const chartMax = Math.max(1, ...chartRows.map((row) => Math.max(row.thisYearYtd, row.lastYearYtd)))

  const printTable = () => {
    const columns = [
      'Customer',
      ...years.map(String),
      `${thisYear} YTD`,
      `${lastYear} YTD`,
      'In shop',
      'Change vs last year YTD',
    ]
    const body = filtered.map((row) => [
      row.customer,
      ...row.yearCounts.map((count) => String(count)),
      String(row.thisYearYtd),
      String(row.lastYearYtd),
      String(row.inShop),
      formatCustomerJobDelta(row).text,
    ])
      const footer = [
      filtered.length === matched.length ? 'Total' : 'Total (shown)',
      ...shownTotals.yearCounts.map((count) => String(count)),
      String(shownTotals.thisYearYtd),
      String(shownTotals.lastYearYtd),
      String(shownTotals.inShop),
      formatCustomerJobDelta(shownTotals).text,
    ]
    const { error } = printTableReport({
      title: 'Customer jobs by year',
      subtitle: `${companyName} · Closed jobs ${rangeStart} to ${rangeEnd}. This year is year-to-date; prior year YTD uses ${lastYear}-01-01 to ${lastYearYtdEnd}. In shop is open work on the board now.`,
      columns,
      rows: [...body, footer],
      summaryLines: [
        `${totals.thisYearYtd} jobs closed this year through ${rangeEnd}`,
        `${totals.lastYearYtd} jobs closed last year through ${lastYearYtdEnd}`,
        `${totals.inShop} valves in shop now`,
        `${totals.customers} customer${totals.customers === 1 ? '' : 's'} shown`,
      ],
      orientation: 'landscape',
    })
    if (error) showToast(error)
  }

  return (
    <CollapsibleReportPanel
      id="customer-jobs-by-year"
      title={(
        <>
          Customer jobs by year
          {companyName ? ` · ${companyName}` : ''}
        </>
      )}
    >
      <p className="placeholder-copy">
        Year columns count jobs that <strong>left the board</strong> (Completed, including cards whose shop status
        was never flipped) by close date — prior full years versus <strong>this year to date</strong>. The change
        column compares {thisYear} through {rangeEnd.slice(5)} with the same dates in {lastYear} (
        {lastYearYtdEnd}). <strong>In shop</strong> is open work still on the job board (teardown, assembly,
        waiting, Warehouse RTS, and so on), so a customer with valves in process is not listed as zero.
        {companyKey === 'vsi' ? ' VSI jobs only — historical JS Valve work is not included.' : ''} Similar job-card
        names are combined. Different sites stay separate.
      </p>

      <div className="report-filters">
        <label>
          Prior years
          <select value={priorCount} onChange={(e) => setPriorCount(Number(e.target.value))}>
            <option value={2}>Last 2 years + this year</option>
            <option value={3}>Last 3 years + this year</option>
            <option value={4}>Last 4 years + this year</option>
          </select>
        </label>
        <label>
          Customer
          <select
            value={customerFilter}
            aria-label="Filter by customer"
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">All customers</option>
            {customerOptions.map((row) => (
              <option key={row.key} value={row.key}>
                {row.customer}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as CustomerYearSort)}>
            <option value="this_year">This year (most closed)</option>
            <option value="in_shop">In shop (most open)</option>
            <option value="name">A to Z</option>
            <option value="name_desc">Z to A</option>
            <option value="gain">Biggest gain vs last year YTD</option>
            <option value="drop">Biggest drop vs last year YTD</option>
          </select>
        </label>
        <label>
          Show
          <select
            value={limit}
            disabled={Boolean(customerFilter)}
            onChange={(e) => setLimit(e.target.value as '25' | '50' | 'all')}
          >
            <option value="25">Top 25</option>
            <option value="50">Top 50</option>
            <option value="all">All customers</option>
          </select>
        </label>
        <label>
          Find customer
          <input
            type="search"
            value={query}
            placeholder="Name contains…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            void reload().then((result) => {
              setRows(result.rows)
              setOpenRows(result.openRows)
              setLoading(false)
            })
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={loading || filtered.length === 0}
          onClick={printTable}
        >
          Print table
        </button>
      </div>

      <div className="report-summary-bar">
        <div className="report-summary-item">
          <span>{thisYear} YTD</span>
          <strong>{loading ? '…' : totals.thisYearYtd}</strong>
        </div>
        <div className="report-summary-item">
          <span>{lastYear} YTD</span>
          <strong>{loading ? '…' : totals.lastYearYtd}</strong>
        </div>
        <div className="report-summary-item">
          <span>Change vs {lastYear} YTD</span>
          <strong className={`otd-compare-tone--${formatCustomerJobDelta(totals).tone}`}>
            {loading ? '…' : formatCustomerJobDelta(totals).text}
          </strong>
        </div>
        <div className="report-summary-item">
          <span>In shop now</span>
          <strong>{loading ? '…' : totals.inShop}</strong>
        </div>
        <div className="report-summary-item">
          <span>Customers shown</span>
          <strong>{loading ? '…' : totals.customers}</strong>
        </div>
      </div>

      {loading ? (
        <p className="placeholder-copy">Loading customer jobs…</p>
      ) : aggregated.length === 0 ? (
        <p className="placeholder-copy">No closed or in-shop jobs in this year window.</p>
      ) : (
        <>
          {chartRows.length > 0 ? (
            <div className="customer-yoy-chart" role="img" aria-label={`Top customers ${thisYear} versus ${lastYear} year to date`}>
              <div className="top-jobs-chart-head">
                <h4>Top customers · {thisYear} vs {lastYear} YTD</h4>
                <div className="otd-chart-legend">
                  <span>
                    <i className="report-monthly-swatch report-monthly-swatch--prior" /> {lastYear} YTD
                  </span>
                  <span>
                    <i className="report-monthly-swatch report-monthly-swatch--current" /> {thisYear} YTD
                  </span>
                </div>
              </div>
              <div className="customer-yoy-bars">
                {chartRows.map((row) => {
                  const priorWidth = Math.max(row.lastYearYtd > 0 ? 4 : 0, (row.lastYearYtd / chartMax) * 100)
                  const currentWidth = Math.max(row.thisYearYtd > 0 ? 4 : 0, (row.thisYearYtd / chartMax) * 100)
                  const delta = formatCustomerJobDelta(row)
                  return (
                    <div key={row.key} className="customer-yoy-bar-group" title={`${row.customer}: ${row.thisYearYtd} this year, ${row.lastYearYtd} last year YTD, ${delta.text}`}>
                      <div className="customer-yoy-bar-name">{row.customer}</div>
                      <div className="customer-yoy-bar-pair">
                        <div className="customer-yoy-bar-line">
                          <span className="customer-yoy-bar-year">{lastYear}</span>
                          <span className="customer-yoy-bar-track">
                            <span className="top-jobs-bar-fill top-jobs-bar-fill--accent" style={{ width: `${priorWidth}%` }} />
                          </span>
                          <span className="customer-yoy-bar-n">{row.lastYearYtd}</span>
                        </div>
                        <div className="customer-yoy-bar-line">
                          <span className="customer-yoy-bar-year">{thisYear}</span>
                          <span className="customer-yoy-bar-track">
                            <span className="top-jobs-bar-fill" style={{ width: `${currentWidth}%` }} />
                          </span>
                          <span className="customer-yoy-bar-n">{row.thisYearYtd}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="dashboard-table-wrap">
            <table className="dashboard-table customer-yoy-table">
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className="customer-yoy-sort"
                      aria-label="Sort customers A to Z"
                      onClick={() => setSort((prev) => (prev === 'name' ? 'name_desc' : 'name'))}
                    >
                      Customer{sort === 'name' ? ' ↑' : sort === 'name_desc' ? ' ↓' : ''}
                    </button>
                  </th>
                  {years.map((year) => (
                    <th key={year} className="customer-yoy-num">
                      {year}
                    </th>
                  ))}
                  <th className="customer-yoy-num">{thisYear} YTD</th>
                  <th className="customer-yoy-num">{lastYear} YTD</th>
                  <th className="customer-yoy-num customer-yoy-inshop">In shop</th>
                  <th className="customer-yoy-num">Change</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const delta = formatCustomerJobDelta(row)
                  return (
                    <tr key={row.key}>
                      <td title={row.mergedFrom.length > 1 ? `Also recorded as: ${row.mergedFrom.join(', ')}` : undefined}>
                        {row.customer}
                        {row.mergedFrom.length > 1 ? (
                          <div className="status-breakdown-note">
                            Combined {row.mergedFrom.length} name spellings
                          </div>
                        ) : null}
                      </td>
                      {row.yearCounts.map((count, index) => (
                        <td key={years[index]} className="customer-yoy-num">
                          {count}
                        </td>
                      ))}
                      <td className="customer-yoy-num">
                        <strong>{row.thisYearYtd}</strong>
                      </td>
                      <td className="customer-yoy-num">{row.lastYearYtd}</td>
                      <td className="customer-yoy-num customer-yoy-inshop">
                        <strong>{row.inShop}</strong>
                      </td>
                      <td className={`customer-yoy-num otd-compare-tone--${delta.tone}`}>{delta.text}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{filtered.length === matched.length ? 'Total' : 'Total (shown)'}</td>
                  {shownTotals.yearCounts.map((count, index) => (
                    <td key={years[index]} className="customer-yoy-num">
                      {count}
                    </td>
                  ))}
                  <td className="customer-yoy-num">
                    <strong>{shownTotals.thisYearYtd}</strong>
                  </td>
                  <td className="customer-yoy-num">{shownTotals.lastYearYtd}</td>
                  <td className="customer-yoy-num customer-yoy-inshop">
                    <strong>{shownTotals.inShop}</strong>
                  </td>
                  <td className={`customer-yoy-num otd-compare-tone--${formatCustomerJobDelta(shownTotals).tone}`}>
                    {formatCustomerJobDelta(shownTotals).text}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {matched.length > filtered.length ? (
            <p className="status-breakdown-note">
              Showing {filtered.length} of {matched.length} customers. Choose All customers to list everyone with
              closed or in-shop work in this window.
            </p>
          ) : null}
        </>
      )}
    </CollapsibleReportPanel>
  )
}
