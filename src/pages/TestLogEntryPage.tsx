import { Fragment, useEffect, useState } from 'react'
import { TestLogEntryForm } from '../components/testLog/TestLogEntryForm'
import { TestLogReportsSection } from '../components/testLog/TestLogReportsSection'
import { normalizeValveId } from '../lib/valveId'
import { supabase } from '../lib/supabase'
import { formatTestProceduresSummary, parseTestLogTestingDetails, resolveTestMedia } from '../types/testLog'
import { formatCheckedStandardsSummary, formatTestPressuresSummary } from '../lib/testStandardParams'
import type { TestLogEntry } from '../types'

const TEST_LOG_SELECT =
  'id,tested_on,valve_id,size,pressure,manufacturer,valve_type,test_type,worked,pass_fail,action_taken,tester,testing_details,created_at'

export function TestLogEntryPage() {
  const [rows, setRows] = useState<TestLogEntry[]>([])
  const [valveSearch, setValveSearch] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [searchOptions, setSearchOptions] = useState<string[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)

  const loadRows = async (searchOverride?: string) => {
    setLoadingRows(true)
    let query = supabase
      .from('test_logs')
      .select(TEST_LOG_SELECT)
      .order('tested_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

    const rawSearch = searchOverride !== undefined ? searchOverride : valveSearch
    const normalizedSearch = normalizeValveId(rawSearch)
    if (normalizedSearch) query = query.ilike('valve_id', `%${normalizedSearch}%`)
    if (filterStartDate) query = query.gte('tested_on', filterStartDate)
    if (filterEndDate) query = query.lte('tested_on', filterEndDate)

    const { data } = await query
    setRows((data as TestLogEntry[]) ?? [])
    setLoadingRows(false)
  }

  useEffect(() => {
    void loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const run = async () => {
      const normalizedSearch = normalizeValveId(valveSearch)
      if (!normalizedSearch) {
        setSearchOptions([])
        return
      }
      const { data } = await supabase
        .from('test_logs')
        .select('valve_id')
        .ilike('valve_id', `%${normalizedSearch}%`)
        .limit(12)
      setSearchOptions(Array.from(new Set((data ?? []).map((row: { valve_id: string }) => row.valve_id))))
    }
    void run()
  }, [valveSearch])

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Test log entry</h2>
      </div>

      <TestLogEntryForm onSaved={() => void loadRows()} />

      <section className="dashboard-panel">
        <h3>Recent test log entries</h3>
        <div className="report-filters">
          <label>
            Search valve ID
            <input
              type="text"
              value={valveSearch}
              onChange={(e) => setValveSearch(e.target.value)}
              placeholder="Start typing valve ID"
              list="test-log-valve-options"
            />
            <datalist id="test-log-valve-options">
              {searchOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label>
            From date (optional)
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
          </label>
          <label>
            To date (optional)
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
          </label>
          <button type="button" className="button-primary" onClick={() => void loadRows()} disabled={loadingRows}>
            {loadingRows ? 'Filtering…' : 'Apply filters'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setValveSearch('')
              setFilterStartDate('')
              setFilterEndDate('')
              void loadRows('')
            }}
          >
            Clear
          </button>
        </div>
        <p className="status-breakdown-note">Showing up to 300 rows.</p>
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Valve ID</th>
                <th>Standard</th>
                <th>Test pressures</th>
                <th>Test medium</th>
                <th>Pass/Fail</th>
                <th>Tester</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedRowId === row.id
                const details = parseTestLogTestingDetails(row.testing_details)
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`test-log-row${isExpanded ? ' test-log-row-expanded' : ''}`}
                      onClick={() => setExpandedRowId((prev) => (prev === row.id ? null : row.id))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedRowId((prev) => (prev === row.id ? null : row.id))
                        }
                      }}
                      aria-expanded={isExpanded}
                    >
                      <td>
                        <span className="test-log-row-toggle" aria-hidden>
                          {isExpanded ? '▼' : '▶'}
                        </span>{' '}
                        {row.tested_on}
                      </td>
                      <td>{row.valve_id}</td>
                      <td>
                        {details?.testStandardParams?.checkedStandards?.length
                          ? formatCheckedStandardsSummary(details.testStandardParams.checkedStandards)
                          : '—'}
                      </td>
                      <td>
                        {details?.testStandardParams
                          ? formatTestPressuresSummary({
                              shellPressure: details.testStandardParams.shellPressure,
                              hpSeatPressure: details.testStandardParams.hpSeatPressure,
                              lpSeatPressure: details.testStandardParams.lpSeatPressure,
                            })
                          : '—'}
                      </td>
                      <td>{row.test_type ?? '-'}</td>
                      <td>{row.pass_fail ?? '-'}</td>
                      <td>{row.tester ?? '-'}</td>
                      <td>{row.action_taken ?? '-'}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className="test-log-detail-row">
                        <td colSpan={8}>
                          <div className="test-log-detail-panel">
                            <div className="test-log-detail-grid">
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Size</span>
                                <span className={row.size ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'}>
                                  {row.size ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Pressure</span>
                                <span
                                  className={
                                    row.pressure ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {row.pressure ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Type</span>
                                <span
                                  className={
                                    row.valve_type ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {row.valve_type ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Test requirements</span>
                                <span
                                  className={
                                    details && formatTestProceduresSummary(details)
                                      ? 'test-log-detail-value'
                                      : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {(details && formatTestProceduresSummary(details)) || row.worked || '—'}
                                </span>
                              </div>
                            </div>

                            {details ? (
                              <>
                                <div className="test-log-detail-pressure-grid">
                                  {(
                                    [
                                      ['Low', details.lowTest],
                                      ['High', details.highTest],
                                      ['Shell', details.shellTest],
                                    ] as const
                                  ).map(([label, block]) => (
                                  <div key={label} className="test-log-detail-pressure-card">
                                    <div className="test-log-detail-pressure-title">{label} pressure</div>
                                    <div>Media: {resolveTestMedia(block) || '—'}</div>
                                    <div>Gauge: {block.gauge || '—'}</div>
                                      <div>Pressure: {block.pressure || '—'}</div>
                                    <div>Time: {block.time || '—'}</div>
                                    {label === 'Shell' && block.chartRecorderNumber ? (
                                      <div>Chart recorder: {block.chartRecorderNumber}</div>
                                    ) : null}
                                    <div>Result: {block.result ? block.result.toUpperCase() : '—'}</div>
                                      {block.reason ? <div>Reason: {block.reason}</div> : null}
                                    </div>
                                  ))}
                                </div>

                                {details.heliumTest.enabled ? (
                                  <div className="test-log-detail-additional-block">
                                    <div className="test-log-detail-pressure-title">Helium test</div>
                                    <div>Media: {resolveTestMedia(details.heliumTest) || '—'}</div>
                                    <div>Gauge: {details.heliumTest.gauge || '—'}</div>
                                    <div>Pressure: {details.heliumTest.pressure || '—'}</div>
                                    <div>Time: {details.heliumTest.time || '—'}</div>
                                    <div>Ambient: {details.heliumTest.ambient || '—'}</div>
                                    <div>Stem: {details.heliumTest.stem || '—'}</div>
                                    <div>Bonnet: {details.heliumTest.bonnet || '—'}</div>
                                    <div>Body: {details.heliumTest.body || '—'}</div>
                                    <div>
                                      Result: {details.heliumTest.result ? details.heliumTest.result.toUpperCase() : '—'}
                                    </div>
                                  </div>
                                ) : null}

                                {details.cavityReliefTest.enabled ? (
                                  <div className="test-log-detail-additional-block">
                                    <div className="test-log-detail-pressure-title">Cavity relief test</div>
                                    <div>Media: {resolveTestMedia(details.cavityReliefTest) || '—'}</div>
                                    <div>MAWP @ 100°F: {details.cavityReliefTest.mawp100F || '—'}</div>
                                    <div>Seat A: {details.cavityReliefTest.seatA || '—'}</div>
                                    <div>Seat B: {details.cavityReliefTest.seatB || '—'}</div>
                                    <div>
                                      Result:{' '}
                                      {details.cavityReliefTest.result ? details.cavityReliefTest.result.toUpperCase() : '—'}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            ) : null}

                            {details?.additionalNotes ? (
                              <p className="test-log-detail-additional">
                                <span className="test-log-detail-label">Other notes</span> {details.additionalNotes}
                              </p>
                            ) : null}

                            {details ? (
                              <TestLogReportsSection
                                mode="saved"
                                testLogId={row.id}
                                reportData={{
                                  tested_on: row.tested_on,
                                  valve_id: row.valve_id,
                                  size: row.size,
                                  pressure: row.pressure,
                                  valve_type: row.valve_type,
                                  manufacturer: row.manufacturer,
                                  tester: row.tester,
                                  pass_fail: row.pass_fail,
                                  action_taken: row.action_taken,
                                  testing_details: details,
                                }}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
