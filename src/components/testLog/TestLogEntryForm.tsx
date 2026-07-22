import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdditionalTestingSection } from './AdditionalTestingSection'
import { TestRequirementsSelect } from './TestRequirementsSelect'
import { TestPressureBlock } from './TestPressureBlock'
import { TestLogReportsSection } from './TestLogReportsSection'
import { BodyMaterialSelect } from './BodyMaterialSelect'
import { ValveTypeSelect } from './ValveTypeSelect'
import { RequiredTestParametersPanel } from './RequiredTestParametersPanel'
import { useToast } from '../ToastNotification'
import { loadActiveTestGauges } from '../../lib/testGaugeRegistry'
import { isFourHourChartTestSelected, normalizeTestProcedures } from '../../lib/testLogProcedure'
import { applyTestMediaPrefill } from '../../lib/testLogMedia'
import { loadLookupOptionsMap } from '../../lib/lookupValues'
import { TEST_LOG_PREFILL_KEYS } from '../../lib/testLogEntryPrefill'
import { fetchValveForTestLog, searchValveIdsForTestLog } from '../../lib/testLogValveLookup'
import { canonicalizeValveType } from '../../lib/testLogValveType'
import { supabase } from '../../lib/supabase'
import { normalizeValveId } from '../../lib/valveId'
import { uploadTestLogReport } from '../../lib/testLogReports'
import { isMissingTestingDetailsError, TEST_LOG_DETAILS_MIGRATION } from '../../lib/testLogSchema'
import { buildTestStandardParams, type TestPhaseResult } from '../../lib/testStandardParams'
import {
  defaultSeatTypeForValve,
  formatHoldTimeSeconds,
  getTestParameters,
  mapProceduresToStandards,
  parseNpsFromSize,
  parsePressureClassFromLabel,
  type SeatTypeKind,
  type TestMediumKind,
  type ValveDataForTest,
} from '../../utils/testStandards'
import {
  deriveActionTaken,
  deriveLegacyTestType,
  deriveLegacyWorked,
  deriveOverallPassFail,
  emptyTestLogTestingDetails,
  type TestLogTestingDetails,
} from '../../types/testLog'
import type { TestGauge } from '../../types/testGauge'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isPassing(passFail: string) {
  return passFail.trim().toUpperCase().includes('PASS')
}

function applyValvePrefill(
  prefill: Awaited<ReturnType<typeof fetchValveForTestLog>>,
  mediaOptions: string[],
  setters: {
    setSize: (v: string) => void
    setPressure: (v: string) => void
    setBodyMaterial: (v: string) => void
    setValveType: (v: string) => void
    setSeatType: (v: SeatTypeKind) => void
    applyTestMedia: (media: ReturnType<typeof applyTestMediaPrefill>) => void
  },
) {
  if (!prefill) return
  setters.setSize(prefill.size ?? '')
  setters.setPressure(prefill.pressure ?? '')
  setters.setBodyMaterial(prefill.bodyMaterial ?? '')
  const canonicalType = canonicalizeValveType(prefill.valveType)
  setters.setValveType(canonicalType)
  if (canonicalType) setters.setSeatType(defaultSeatTypeForValve(canonicalType))
  if (prefill.testType) setters.applyTestMedia(applyTestMediaPrefill(prefill.testType, mediaOptions))
}

type TestLogEntryFormProps = {
  onSaved: (valveId: string) => void
  detailsColumnReady?: boolean | null
}

export function TestLogEntryForm({ onSaved, detailsColumnReady = null }: TestLogEntryFormProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [testedOn, setTestedOn] = useState(todayIso())
  const [valveId, setValveId] = useState('')
  const [size, setSize] = useState('')
  const [pressure, setPressure] = useState('')
  const [bodyMaterial, setBodyMaterial] = useState('')
  const [bodyMaterialLoadedFromJob, setBodyMaterialLoadedFromJob] = useState(false)
  const [valveRowId, setValveRowId] = useState<number | null>(null)
  const [bodyMaterialOptions, setBodyMaterialOptions] = useState<string[]>([])
  const [valveType, setValveType] = useState('')
  const [valveTypeLoadedFromJob, setValveTypeLoadedFromJob] = useState(false)
  const [testMediumKind, setTestMediumKind] = useState<TestMediumKind>('liquid')
  const [seatType, setSeatType] = useState<SeatTypeKind>('soft-resilient')
  const [phaseState, setPhaseState] = useState<Record<string, TestPhaseResult>>({})
  const [enabledOptionalPhaseIds, setEnabledOptionalPhaseIds] = useState<string[]>([])
  const [tester, setTester] = useState('')
  const [testing, setTesting] = useState<TestLogTestingDetails>(() => emptyTestLogTestingDetails())
  const [testMediaOptions, setTestMediaOptions] = useState<string[]>([])
  const [testProcedureOptions, setTestProcedureOptions] = useState<string[]>([])
  const [chartRecorderOptions, setChartRecorderOptions] = useState<string[]>([])
  const [gaugeOptions, setGaugeOptions] = useState<TestGauge[]>([])
  const [pendingReportFiles, setPendingReportFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [valveIdOptions, setValveIdOptions] = useState<string[]>([])
  const [valveLookupStatus, setValveLookupStatus] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle')
  const [entryStarted, setEntryStarted] = useState(false)
  const [loadingEntry, setLoadingEntry] = useState(false)
  const lastPrefilledValveId = useRef<string | null>(null)
  const autoOpenedFromUrl = useRef(false)
  const { showToast } = useToast()

  const overallPassFail = useMemo(() => deriveOverallPassFail(testing), [testing])
  const fourHourChartSelected = useMemo(() => isFourHourChartTestSelected(testing), [testing])
  const reportData = useMemo(
    () => ({
      tested_on: testedOn,
      valve_id: normalizeValveId(valveId) || valveId.trim(),
      size: size || null,
      pressure: pressure || null,
      valve_type: valveType || null,
      manufacturer: null,
      tester: tester || null,
      pass_fail: overallPassFail || null,
      action_taken: deriveActionTaken(testing),
      testing_details: testing,
    }),
    [testedOn, valveId, size, pressure, valveType, tester, overallPassFail, testing],
  )
  const canSubmit = valveId.trim().length > 0 && testedOn.trim().length > 0

  const checkedStandards = useMemo(
    () => mapProceduresToStandards(testing.testProcedures),
    [testing.testProcedures],
  )

  const testParamsBundle = useMemo(() => {
    const nps = parseNpsFromSize(size)
    const pressureClass = parsePressureClassFromLabel(pressure)
    if (nps === null || pressureClass === null) return null
    const context: ValveDataForTest = {
      nps,
      pressureClass,
      bodyMaterial,
      valveType,
      seatType,
    }
    return getTestParameters(context, checkedStandards)
  }, [size, pressure, bodyMaterial, valveType, seatType, checkedStandards])

  const valveContext = useMemo((): ValveDataForTest | null => {
    const nps = parseNpsFromSize(size)
    const pressureClass = parsePressureClassFromLabel(pressure)
    if (nps === null || pressureClass === null || !bodyMaterial.trim()) return null
    return { nps, pressureClass, bodyMaterial, valveType, seatType }
  }, [size, pressure, bodyMaterial, valveType, seatType])

  const jobCardPrefillBanner = useMemo(() => {
    const cust = searchParams.get(TEST_LOG_PREFILL_KEYS.customer)
    const cell = searchParams.get(TEST_LOG_PREFILL_KEYS.cell)
    const desc = searchParams.get(TEST_LOG_PREFILL_KEYS.description)
    const st = searchParams.get(TEST_LOG_PREFILL_KEYS.jobStatus)
    if (!cust && !cell && !desc && !st) return null
    return { customer: cust, cell, description: desc, jobStatus: st }
  }, [searchParams])

  useEffect(() => {
    void (async () => {
      const map = await loadLookupOptionsMap()
      setTestMediaOptions(map.test_media ?? [])
      setTestProcedureOptions(normalizeTestProcedures(map.test_procedure ?? []))
      setChartRecorderOptions(map.chart_recorder ?? [])
      setBodyMaterialOptions(map.body_material ?? [])

      try {
        const gauges = await loadActiveTestGauges()
        setGaugeOptions(gauges)
      } catch {
        setGaugeOptions([])
      }
    })()
  }, [])

  const applyUrlPrefillOverrides = () => {
    const sz = searchParams.get(TEST_LOG_PREFILL_KEYS.size)
    if (sz) setSize(sz)
    const pr = searchParams.get(TEST_LOG_PREFILL_KEYS.pressure)
    if (pr) setPressure(pr)
    const vt = searchParams.get(TEST_LOG_PREFILL_KEYS.valveType)
    if (vt) setValveType(canonicalizeValveType(vt))
    const tt = searchParams.get(TEST_LOG_PREFILL_KEYS.testType)
    if (tt && testMediaOptions.length) {
      const media = applyTestMediaPrefill(tt, testMediaOptions)
      setTesting((prev) => ({
        ...prev,
        lowTest: { ...prev.lowTest, ...media },
        highTest: { ...prev.highTest, ...media },
        shellTest: { ...prev.shellTest, ...media },
      }))
    }
  }

  const openEntry = async (inputId?: string) => {
    const trimmed = (inputId ?? valveId).trim()
    if (!trimmed) {
      showToast('Enter a valve ID first')
      return
    }

    setLoadingEntry(true)
    setValveLookupStatus('loading')

    const [options, prefill] = await Promise.all([
      searchValveIdsForTestLog(trimmed),
      fetchValveForTestLog(trimmed),
    ])
    setValveIdOptions(options)

    const resolvedId = prefill?.valveId ?? normalizeValveId(trimmed) ?? trimmed
    setValveId(resolvedId)

    if (prefill) {
      applyValvePrefill(prefill, testMediaOptions, {
        setSize,
        setPressure,
        setBodyMaterial,
        setValveType,
        setSeatType,
        applyTestMedia: (media) =>
          setTesting((prev) => ({
            ...prev,
            lowTest: { ...prev.lowTest, ...media },
            highTest: { ...prev.highTest, ...media },
            shellTest: { ...prev.shellTest, ...media },
          })),
      })
      setValveRowId(prefill.valveRowId)
      setBodyMaterialLoadedFromJob(Boolean(prefill.bodyMaterial?.trim()))
      setValveTypeLoadedFromJob(Boolean(prefill.valveType?.trim()))
      setValveLookupStatus('found')
      lastPrefilledValveId.current = prefill.valveId
    } else {
      setValveLookupStatus('missing')
    }

    applyUrlPrefillOverrides()
    setEntryStarted(true)
    setLoadingEntry(false)
  }

  useEffect(() => {
    const vid = searchParams.get(TEST_LOG_PREFILL_KEYS.valveId)?.trim()
    if (!vid || autoOpenedFromUrl.current || entryStarted) return

    setValveId(vid)
    autoOpenedFromUrl.current = true
    void openEntry(vid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, entryStarted, testMediaOptions.length])

  useEffect(() => {
    if (entryStarted) return
    const trimmed = valveId.trim()
    if (!trimmed) {
      setValveIdOptions([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const options = await searchValveIdsForTestLog(trimmed)
        if (!cancelled) setValveIdOptions(options)
      })()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [valveId, entryStarted])

  const resetForm = async () => {
    setValveId('')
    setSize('')
    setPressure('')
    setBodyMaterial('')
    setBodyMaterialLoadedFromJob(false)
    setValveRowId(null)
    setValveType('')
    setValveTypeLoadedFromJob(false)
    setTestMediumKind('liquid')
    setSeatType('soft-resilient')
    setPhaseState({})
    setEnabledOptionalPhaseIds([])
    setTester('')
    setTesting(emptyTestLogTestingDetails())
    setPendingReportFiles([])
    lastPrefilledValveId.current = null
    setValveLookupStatus('idle')
    setEntryStarted(false)
    setLoadingEntry(false)
    autoOpenedFromUrl.current = false
    setSearchParams({}, { replace: true })
  }

  const submit = async () => {
    if (!canSubmit) return
    if (detailsColumnReady === false) {
      showToast(`Run ${TEST_LOG_DETAILS_MIGRATION} in Supabase before saving`)
      return
    }
    const normalizedValveId = normalizeValveId(valveId)
    const passFail = overallPassFail || null
    const payload = {
      tested_on: testedOn,
      valve_id: normalizedValveId,
      size: size || null,
      pressure: pressure || null,
      manufacturer: null,
      valve_type: valveType || null,
      test_type: deriveLegacyTestType(testing),
      worked: deriveLegacyWorked(testing),
      pass_fail: passFail,
      action_taken: deriveActionTaken(testing),
      tester: tester || null,
      testing_details: testing,
    }

    setSaving(true)
    const { data: savedRow, error } = await supabase.from('test_logs').insert(payload).select('id').single()
    if (error || !savedRow?.id) {
      setSaving(false)
      showToast(
        isMissingTestingDetailsError(error?.message)
          ? `Run ${TEST_LOG_DETAILS_MIGRATION} in Supabase`
          : 'Could not save test log entry',
      )
      return
    }

    if (pendingReportFiles.length) {
      let uploaded = 0
      for (const file of pendingReportFiles) {
        const { error: uploadError } = await uploadTestLogReport(savedRow.id, file, 'upload')
        if (!uploadError) uploaded += 1
      }
      if (uploaded < pendingReportFiles.length) {
        showToast(`Entry saved; ${uploaded} of ${pendingReportFiles.length} report(s) uploaded`)
      }
    }

    if (passFail && isPassing(passFail)) {
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
    await resetForm()
    showToast(`Test log saved for ${normalizedValveId}`)
    onSaved(normalizedValveId)
  }

  const patchTesting = (patch: Partial<TestLogTestingDetails>) => {
    setTesting((prev) => {
      const next = { ...prev, ...patch }
      if ('testProcedures' in patch || 'testProcedureOther' in patch) {
        if (!isFourHourChartTestSelected(next)) {
          next.shellTest = { ...next.shellTest, chartRecorderNumber: '' }
        }
      }
      return next
    })
  }

  const patchPhase = (phaseId: string, patch: Partial<TestPhaseResult>) => {
    setPhaseState((prev) => {
      const existing = prev[phaseId]
      return {
        ...prev,
        [phaseId]: {
          id: phaseId,
          passFail: existing?.passFail ?? '',
          notes: existing?.notes ?? '',
          medium: existing?.medium,
          actualPressure: existing?.actualPressure,
          ...patch,
        },
      }
    })
  }

  useEffect(() => {
    if (!entryStarted || !testParamsBundle?.summary) return

    const phaseResults = Object.values(phaseState)
    const audit = buildTestStandardParams(
      testParamsBundle,
      testMediumKind,
      seatType,
      checkedStandards,
      phaseResults,
    )
    const summary = testParamsBundle.summary

    setTesting((prev) => ({
      ...prev,
      testStandardParams: audit,
      shellTest: {
        ...prev.shellTest,
        pressure: summary.shellTestPressure ? `${summary.shellTestPressure} PSI` : prev.shellTest.pressure,
        time: testParamsBundle.phases.find((p) => p.id.includes('shell') || p.id === 'sp160-phase2')
          ? formatHoldTimeSeconds(
              parseInt(
                testParamsBundle.phases.find((p) => p.id.includes('shell') || p.id === 'sp160-phase2')!.holdTime,
                10,
              ) || 60,
            )
          : prev.shellTest.time,
      },
      highTest: {
        ...prev.highTest,
        pressure: summary.hpSeatTestPressure ? `${summary.hpSeatTestPressure} PSI` : prev.highTest.pressure,
      },
      lowTest: {
        ...prev.lowTest,
        pressure: phaseState['api598-lp-seat']?.actualPressure || phaseState['sp160-phase5']?.actualPressure || '80 PSI',
      },
    }))
  }, [entryStarted, testParamsBundle, testMediumKind, seatType, checkedStandards, phaseState])

  return (
    <section className="dashboard-panel test-log-entry-panel">
      {!entryStarted ? (
        <div className="test-log-entry-start">
          <div className="test-log-entry-start-copy">
            <h3 className="test-log-entry-start-title">Enter test valve</h3>
            <p className="test-log-entry-start-note">
              Enter the valve ID or work order number, then open the test form.
            </p>
          </div>
          <div className="test-log-entry-start-row">
            <label className="test-log-entry-start-field">
              Valve ID / W.O. #
              <input
                type="text"
                value={valveId}
                onChange={(e) => setValveId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void openEntry()
                  }
                }}
                placeholder="e.g. 5792-1"
                list="test-log-entry-valve-options"
                autoComplete="off"
                disabled={loadingEntry}
              />
              <datalist id="test-log-entry-valve-options">
                {valveIdOptions.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              className="button-primary test-log-entry-start-button"
              disabled={!valveId.trim() || loadingEntry}
              onClick={() => void openEntry()}
            >
              {loadingEntry ? 'Loading…' : 'Enter test valve'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="test-log-entry-active-header">
            <h3>Test log — {normalizeValveId(valveId) || valveId.trim()}</h3>
            <button type="button" className="button-secondary" onClick={() => void resetForm()}>
              Change valve
            </button>
          </div>

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

          <div className="test-log-valve-row">
            <label>
              Date
              <input type="date" value={testedOn} onChange={(e) => setTestedOn(e.target.value)} />
            </label>
            <label>
              Valve ID / W.O. #
              <input type="text" value={valveId} readOnly aria-readonly />
            </label>
            <label>
              Size
              <input type="text" value={size} onChange={(e) => setSize(e.target.value)} />
            </label>
            <label>
              Pressure class
              <input type="text" value={pressure} onChange={(e) => setPressure(e.target.value)} />
            </label>
            <BodyMaterialSelect
              value={bodyMaterial}
              loadedFromJob={bodyMaterialLoadedFromJob}
              valveRowId={valveRowId}
              options={bodyMaterialOptions}
              onChange={(material) => {
                setBodyMaterial(material)
                if (material.trim()) setBodyMaterialLoadedFromJob(false)
              }}
              onSaved={() => showToast('Body material saved to job record')}
            />
            <ValveTypeSelect
              value={valveType}
              loadedFromJob={valveTypeLoadedFromJob}
              valveRowId={valveRowId}
              onChange={(type) => {
                setValveType(type)
                if (type) {
                  setValveTypeLoadedFromJob(false)
                  setSeatType(defaultSeatTypeForValve(type))
                }
              }}
              onSaved={() => showToast('Valve type saved to job record')}
            />
            <label>
              Tester
              <input type="text" value={tester} onChange={(e) => setTester(e.target.value)} />
            </label>
          </div>

          {valveLookupStatus === 'found' ? (
            <p className="status-breakdown-note test-log-valve-lookup-note">
              Loaded size, pressure, and type from the job board.
            </p>
          ) : valveLookupStatus === 'missing' ? (
            <p className="status-breakdown-note test-log-valve-lookup-note test-log-valve-lookup-missing">
              No matching job on the board — enter details manually or check the valve ID.
            </p>
          ) : null}

          <div className="test-log-testing-section">
        <h4 className="test-log-testing-title">Testing</h4>

        <div className="test-log-testing-header">
          <TestRequirementsSelect
            options={testProcedureOptions}
            value={{
              testProcedures: testing.testProcedures,
              testProcedureOther: testing.testProcedureOther,
            }}
            onChange={(procedure) => patchTesting(procedure)}
          />
        </div>

        <RequiredTestParametersPanel
          valveId={normalizeValveId(valveId) || valveId.trim()}
          size={size}
          pressureClass={pressure}
          bodyMaterial={bodyMaterial}
          bundle={testParamsBundle}
          seatType={seatType}
          onSeatTypeChange={setSeatType}
          phaseState={phaseState}
          enabledOptionalPhaseIds={enabledOptionalPhaseIds}
          onPhaseChange={patchPhase}
          onToggleOptionalPhase={(phaseId, enabled) =>
            setEnabledOptionalPhaseIds((prev) =>
              enabled ? [...prev, phaseId] : prev.filter((id) => id !== phaseId),
            )
          }
          valveContext={valveContext}
        />

        {fourHourChartSelected ? (
          <p className="status-breakdown-note test-log-four-hour-hint">
            4-Hour Chart Test applies to the <strong>Shell pressure test</strong> — select the chart recorder there.
          </p>
        ) : null}

        <div className="test-pressure-grid">
          <TestPressureBlock
            title="Low Pressure Test"
            accent="low"
            value={testing.lowTest}
            testMediaOptions={testMediaOptions}
            gaugeOptions={gaugeOptions}
            onChange={(lowTest) => patchTesting({ lowTest })}
          />
          <TestPressureBlock
            title="High Pressure Test"
            accent="high"
            value={testing.highTest}
            testMediaOptions={testMediaOptions}
            gaugeOptions={gaugeOptions}
            onChange={(highTest) => patchTesting({ highTest })}
          />
          <TestPressureBlock
            title="Shell Pressure Test"
            accent="shell"
            value={testing.shellTest}
            testMediaOptions={testMediaOptions}
            gaugeOptions={gaugeOptions}
            showChartRecorder={fourHourChartSelected}
            chartRecorderOptions={chartRecorderOptions}
            onChange={(shellTest) => patchTesting({ shellTest })}
          />
        </div>

        <AdditionalTestingSection
          testing={testing}
          testMediaOptions={testMediaOptions}
          gaugeOptions={gaugeOptions}
          onChange={patchTesting}
        />

        <TestLogReportsSection
          mode="draft"
          reportData={reportData}
          pendingFiles={pendingReportFiles}
          onPendingFilesChange={setPendingReportFiles}
        />

        <div className="test-log-form-footer">
          <div className="test-log-overall-result" aria-live="polite">
            Overall result:{' '}
            <strong className={overallPassFail === 'FAIL' ? 'test-log-overall-fail' : ''}>
              {overallPassFail || '— set Pass/Fail on each test'}
            </strong>
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!canSubmit || saving || detailsColumnReady === false}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
          </div>
        </>
      )}
    </section>
  )
}
