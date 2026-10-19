import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleReportPanel } from './CollapsibleReportPanel'
import { useToast } from './ToastNotification'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { resolveActiveCompanyKey, valveRowBelongsToCompany } from '../lib/companyDataScope'
import {
  currentWeekRange,
  formatDueDateLabel,
  formatStatusChangedLabel,
  isOpenDueJob,
  sortDueJobRows,
  statusLabel,
  type DueJobReportRow,
} from '../lib/dueThisWeekReport'
import { printTableReport } from '../lib/reportChartsPrint'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 1000
const JOB_SELECT =
  'id,valve_id,customer,description,due_date,status,order_type,organization_id'
const JOB_SELECT_NO_ORG = 'id,valve_id,customer,description,due_date,status,order_type'

function statusFromJson(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return ''
  return typeof row.status === 'string' ? row.status.trim() : ''
}

/** Most recent status-changing update per valve row id from valve_change_log. */
async function fetchLastStatusChangedAt(
  valveRowIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (valveRowIds.length === 0) return map

  const chunkSize = 200
  for (let i = 0; i < valveRowIds.length; i += chunkSize) {
    const chunk = valveRowIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('valve_change_log')
      .select('valve_id,changed_at,old_row,new_row')
      .in('valve_id', chunk)
      .eq('action', 'update')
      .order('changed_at', { ascending: false })
      .limit(8000)

    if (error) {
      console.warn('Could not load last status change dates', error.message)
      continue
    }

    for (const raw of data ?? []) {
      const rowId = Number((raw as { valve_id?: unknown }).valve_id)
      if (!Number.isFinite(rowId) || map.has(rowId)) continue
      const fromStatus = statusFromJson((raw as { old_row?: Record<string, unknown> }).old_row)
      const toStatus = statusFromJson((raw as { new_row?: Record<string, unknown> }).new_row)
      if (!fromStatus && !toStatus) continue
      if (fromStatus === toStatus) continue
      const changedAt = String((raw as { changed_at?: string }).changed_at ?? '').trim()
      if (changedAt) map.set(rowId, changedAt)
    }
  }

  return map
}

async function fetchDueJobsInRange(
  start: string,
  end: string,
): Promise<{ data: DueJobReportRow[]; error: string | null }> {
  const rows: DueJobReportRow[] = []
  let from = 0
  let select = JOB_SELECT
  let skippedOrg = false

  while (true) {
    const { data, error } = await supabase
      .from('valves')
      .select(select)
      .not('due_date', 'is', null)
      .gte('due_date', start)
      .lte('due_date', end)
      .not('status', 'in', '(Completed,Junked,Replaced)')
      .order('due_date', { ascending: true })
      .order('valve_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error && !skippedOrg && /organization_id/i.test(error.message)) {
      select = JOB_SELECT_NO_ORG
      skippedOrg = true
      continue
    }
    if (error) return { data: rows, error: error.message }

    const batch = (data ?? []) as unknown as DueJobReportRow[]
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const open = rows.filter(isOpenDueJob)
  const lastChanged = await fetchLastStatusChangedAt(open.map((row) => row.id))
  return {
    data: open.map((row) => ({
      ...row,
      lastStatusChangedAt: lastChanged.get(row.id) ?? null,
    })),
    error: null,
  }
}

export function DueThisWeekReportPanel() {
  const { showToast } = useToast()
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyKey = resolveActiveCompanyKey(workflow.key, activeOrganization)
  const companyName = activeOrganization?.name?.trim() || (companyKey === 'vsi' ? 'VSI' : 'JS Valve')

  const defaultRange = useMemo(() => currentWeekRange(), [])
  const [start, setStart] = useState(defaultRange.start)
  const [end, setEnd] = useState(defaultRange.end)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<DueJobReportRow[]>([])

  const scopeRow = useCallback(
    (row: DueJobReportRow) =>
      valveRowBelongsToCompany(row.id, {
        workflowKey: companyKey,
        activeOrganization,
        valveOrganizationId: row.organization_id ?? null,
      }),
    [activeOrganization, companyKey],
  )

  const reload = useCallback(async () => {
    if (!start || !end) {
      showToast('Pick a start and end date')
      return
    }
    if (start > end) {
      showToast('Start date must be on or before end date')
      return
    }
    setLoading(true)
    const { data, error } = await fetchDueJobsInRange(start, end)
    setLoading(false)
    if (error) {
      showToast(`Could not load due jobs: ${error}`)
      setRows([])
      return
    }
    setRows(sortDueJobRows(data.filter(scopeRow)))
  }, [end, scopeRow, showToast, start])

  useEffect(() => {
    void reload()
  }, [reload])

  const resetToThisWeek = () => {
    const week = currentWeekRange()
    setStart(week.start)
    setEnd(week.end)
  }

  const printReport = () => {
    const body = rows.map((row) => [
      row.valve_id || '—',
      String(row.customer ?? '').trim() || '—',
      String(row.description ?? '').trim() || '—',
      statusLabel(row.status),
      formatStatusChangedLabel(row.lastStatusChangedAt),
      formatDueDateLabel(row.due_date),
      '',
    ])
    const { error } = printTableReport({
      title: 'Due jobs',
      subtitle: `${companyName} · Due ${start} to ${end}. Open jobs only (not Completed, Junked, or Replaced). Notes column is blank for handwritten updates.`,
      columns: [
        'Job number',
        'Customer',
        'Description',
        'Status',
        'Last status change',
        'Due date',
        'Notes',
      ],
      rows: body,
      summaryLines: [`${rows.length} job${rows.length === 1 ? '' : 's'} due in this range`],
      orientation: 'landscape',
      frameId: 'due-this-week-print-frame',
      noteColumnIndexes: [6],
    })
    if (error) showToast(error)
  }

  return (
    <CollapsibleReportPanel
      id="due-this-week"
      title={(
        <>
          Due this week
          {companyName ? ` · ${companyName}` : ''}
        </>
      )}
    >
      <p className="placeholder-copy">
        Open jobs with a due date in the selected range. Defaults to the current week (Monday–Sunday). Use the
        date pickers to change the timeframe, then print a PDF with a blank Notes column for handwritten updates.
        Status and last status change come from the job card / change log.
        {companyKey === 'vsi' ? ' VSI jobs only.' : ''}
      </p>

      <div className="report-filters">
        <label>
          From
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button type="button" className="button-secondary" onClick={resetToThisWeek}>
          This week
        </button>
        <button type="button" className="button-secondary" disabled={loading} onClick={() => void reload()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={loading || rows.length === 0}
          onClick={printReport}
        >
          Print PDF
        </button>
      </div>

      <p className="status-breakdown-note">
        {loading
          ? 'Loading…'
          : `${rows.length} job${rows.length === 1 ? '' : 's'} due ${start} → ${end}`}
      </p>

      <div className="table-wrap">
        <table className="dashboard-table due-this-week-table">
          <thead>
            <tr>
              <th>Job number</th>
              <th>Customer</th>
              <th>Description</th>
              <th>Status</th>
              <th>Last status change</th>
              <th>Due date</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>{loading ? 'Loading…' : 'No open jobs due in this range.'}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.valve_id || '—'}</td>
                  <td>{String(row.customer ?? '').trim() || '—'}</td>
                  <td>{String(row.description ?? '').trim() || '—'}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td>{formatStatusChangedLabel(row.lastStatusChangedAt)}</td>
                  <td>{formatDueDateLabel(row.due_date)}</td>
                  <td className="due-this-week-notes-cell" aria-label="Notes" />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleReportPanel>
  )
}
