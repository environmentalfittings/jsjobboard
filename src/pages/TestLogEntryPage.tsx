import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { supabase } from '../lib/supabase'
import { TEST_LOG_PREFILL_KEYS } from '../lib/testLogEntryPrefill'
import type { TestLogEntry } from '../types'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeValveId(input: string) {
  const trimmed = input.trim()
  return trimmed.replace(/^R(?=\d)/i, '')
}

function isPassing(passFail: string) {
  return passFail.trim().toUpperCase().includes('PASS')
}

export function TestLogEntryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [testedOn, setTestedOn] = useState(todayIso())
  const [valveId, setValveId] = useState('')
  const [size, setSize] = useState('')
  const [pressure, setPressure] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [valveType, setValveType] = useState('')
  const [testType, setTestType] = useState('')
  const [worked, setWorked] = useState('')
  const [passFail, setPassFail] = useState('PASS')
  const [actionTaken, setActionTaken] = useState('')
  const [tester, setTester] = useState('')
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<TestLogEntry[]>([])
  const [valveSearch, setValveSearch] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [searchOptions, setSearchOptions] = useState<string[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null)
  const { showToast } = useToast()

  const canSubmit = useMemo(() => valveId.trim().length > 0 && testedOn.trim().length > 0, [valveId, testedOn])

  const jobCardPrefillBanner = useMemo(() => {
    const cust = searchParams.get(TEST_LOG_PREFILL_KEYS.customer)
    const cell = searchParams.get(TEST_LOG_PREFILL_KEYS.cell)
    const desc = searchParams.get(TEST_LOG_PREFILL_KEYS.description)
    const st = searchParams.get(TEST_LOG_PREFILL_KEYS.jobStatus)
    if (!cust && !cell && !desc && !st) return null
    return { customer: cust, cell, description: desc, jobStatus: st }
  }, [searchParams])

  const loadRows = async (searchOverride?: string) => {
    setLoadingRows(true)
    let query = supabase
      .from('test_logs')
      .select(
        'id,tested_on,valve_id,size,pressure,manufacturer,valve_type,test_type,worked,pass_fail,action_taken,tester,created_at',
      )
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
    loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const vid = searchParams.get(TEST_LOG_PREFILL_KEYS.valveId)?.trim()
    if (!vid) return

    setValveId(vid)
    setValveSearch(vid)

    const sz = searchParams.get(TEST_LOG_PREFILL_KEYS.size)
    if (sz) setSize(sz)

    const vt = searchParams.get(TEST_LOG_PREFILL_KEYS.valveType)
    if (vt) setValveType(vt)

    const tt = searchParams.get(TEST_LOG_PREFILL_KEYS.testType)
    if (tt) setTestType(tt)

    void loadRows(vid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  useEffect(() => {
    const run = async () => {
      const normalizedSearch = normalizeValveId(valveSearch)
      if (!normalizedSearch || normalizedSearch.length < 1) {
        setSearchOptions([])
        return
      }
      const { data } = await supabase
        .from('test_logs')
        .select('valve_id')
        .ilike('valve_id', `%${normalizedSearch}%`)
        .limit(12)
      const options = Array.from(new Set((data ?? []).map((row: { valve_id: string }) => row.valve_id)))
      setSearchOptions(options)
    }
    void run()
  }, [valveSearch])

  const submit = async () => {
    if (!canSubmit) return
    const normalizedValveId = normalizeValveId(valveId)
    const payload = {
      tested_on: testedOn,
      valve_id: normalizedValveId,
      size: size || null,
      pressure: pressure || null,
      manufacturer: manufacturer || null,
      valve_type: valveType || null,
      test_type: testType || null,
      worked: worked || null,
      pass_fail: passFail || null,
      action_taken: actionTaken || null,
      tester: tester || null,
    }

    setSaving(true)
    const { error } = await supabase.from('test_logs').insert(payload)
    if (error) {
      setSaving(false)
      showToast('Could not save test log entry')
      return
    }

    if (isPassing(passFail)) {
      const { data: valve } = await supabase
        .from('valves')
        .select('id,status')
        .or(`valve_id.eq.${normalizedValveId},valve_id.eq.${valveId.trim()}`)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (valve?.id) {
        const nextStatus = valve.status === 'Completed' ? 'Completed' : 'Warehouse RTS'
        await supabase.from('valves').update({ date_tested: testedOn, status: nextStatus }).eq('id', valve.id)
      }
    }

    setSaving(false)
    setValveId('')
    setSize('')
    setPressure('')
    setManufacturer('')
    setValveType('')
    setTestType('')
    setWorked('')
    setPassFail('PASS')
    setActionTaken('')
    setTester('')
    setSearchParams({}, { replace: true })
    showToast(`Test log saved for ${normalizedValveId}`)
    await loadRows()
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Test log entry</h2>
      </div>

      <section className="dashboard-panel">
        <h3>Enter tested valve</h3>
        {jobCardPrefillBanner ? (
          <div className="test-log-prefill-banner" role="status">
            <div className="test-log-prefill-banner-title">Prefilled from job card</div>
            {jobCardPrefillBanner.jobStatus ? (
              <p className="test-log-prefill-line">
                <span className="test-log-prefill-k">Shop status</span> {jobCardPrefillBanner.jobStatus}
              </p>
            ) : null}
            {jobCardPrefillBanner.customer || jobCardPrefillBanner.cell ? (
              <p className="test-log-prefill-line">
                {jobCardPrefillBanner.customer ? (
                  <>
                    <span className="test-log-prefill-k">Customer</span> {jobCardPrefillBanner.customer}
                  </>
                ) : null}
                {jobCardPrefillBanner.customer && jobCardPrefillBanner.cell ? ' · ' : null}
                {jobCardPrefillBanner.cell ? (
                  <>
                    <span className="test-log-prefill-k">Cell</span> {jobCardPrefillBanner.cell}
                  </>
                ) : null}
              </p>
            ) : null}
            {jobCardPrefillBanner.description ? (
              <p className="test-log-prefill-desc">{jobCardPrefillBanner.description}</p>
            ) : null}
          </div>
        ) : null}
        <div className="report-filters">
          <label>
            Date
            <input type="date" value={testedOn} onChange={(e) => setTestedOn(e.target.value)} />
          </label>
          <label>
            Valve ID / W.O. #
            <input type="text" value={valveId} onChange={(e) => setValveId(e.target.value)} placeholder="e.g. 5792-1" />
          </label>
          <label>
            Size
            <input type="text" value={size} onChange={(e) => setSize(e.target.value)} />
          </label>
          <label>
            Pressure
            <input type="text" value={pressure} onChange={(e) => setPressure(e.target.value)} />
          </label>
          <label>
            Manufacturer
            <input type="text" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </label>
          <label>
            Type
            <input type="text" value={valveType} onChange={(e) => setValveType(e.target.value)} />
          </label>
          <label>
            Test type
            <input type="text" value={testType} onChange={(e) => setTestType(e.target.value)} />
          </label>
          <label>
            Worked
            <input type="text" value={worked} onChange={(e) => setWorked(e.target.value)} />
          </label>
          <label>
            Pass / Fail
            <select value={passFail} onChange={(e) => setPassFail(e.target.value)}>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </label>
          <label>
            Action taken
            <input type="text" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} />
          </label>
          <label>
            Tester
            <input type="text" value={tester} onChange={(e) => setTester(e.target.value)} />
          </label>
          <button type="button" className="button-primary" disabled={!canSubmit || saving} onClick={submit}>
            {saving ? 'Saving...' : 'Save entry'}
          </button>
        </div>
      </section>

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
            {loadingRows ? 'Filtering...' : 'Apply filters'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setValveSearch('')
              setFilterStartDate('')
              setFilterEndDate('')
              void loadRows()
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
                <th>Test type</th>
                <th>Pass/Fail</th>
                <th>Tester</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedRowId === row.id
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
                      <td>{row.test_type ?? '-'}</td>
                      <td>{row.pass_fail ?? '-'}</td>
                      <td>{row.tester ?? '-'}</td>
                      <td>{row.action_taken ?? '-'}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className="test-log-detail-row">
                        <td colSpan={6}>
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
                                <span className="test-log-detail-label">Manufacturer</span>
                                <span
                                  className={
                                    row.manufacturer
                                      ? 'test-log-detail-value'
                                      : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {row.manufacturer ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Valve type</span>
                                <span
                                  className={
                                    row.valve_type ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'
                                  }
                                >
                                  {row.valve_type ?? '—'}
                                </span>
                              </div>
                              <div className="test-log-detail-item">
                                <span className="test-log-detail-label">Worked</span>
                                <span className={row.worked ? 'test-log-detail-value' : 'test-log-detail-value test-log-detail-empty'}>
                                  {row.worked ?? '—'}
                                </span>
                              </div>
                            </div>
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
