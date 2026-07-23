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
import { useEmployees } from '../../hooks/useEmployees'
import { loadActiveTestGauges, filterChartRecorderGauges, filterPressureTestGauges } from '../../lib/testGaugeRegistry'
import { isFourHourChartTestSelected, normalizeTestProcedures, mapJobTestTypeToProcedures, jobTestTypeLooksLikeMedia } from '../../lib/testLogProcedure'
import { parseJobTestTypes } from '../../lib/jobTestTypes'
import { applyTestMediaPrefill } from '../../lib/testLogMedia'
import { normalizeTestTimeLabel } from '../../lib/testLogTime'
import { TEST_PROCEDURE_REQUIREMENTS } from '../../constants/jobLookups'
import { loadLookupOptionsMap } from '../../lib/lookupValues'
import { TEST_LOG_PREFILL_KEYS } from '../../lib/testLogEntryPrefill'
import { fetchValveForTestLog, searchValveIdsForTestLog } from '../../lib/testLogValveLookup'
import { formatTesterInitials, parseTesterInitials } from '../../lib/testLogTester'
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
  parseTestLogTestingDetails,
  type TestLogTestingDetails,
} from '../../types/testLog'
import type { TestGauge } from '../../types/testGauge'
import type { TestLogEntry } from '../../types'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isPassing(passFail: string) {
  return passFail.trim().toUpperCase().includes('PASS')
}

function applyValvePrefill(
  prefill: Awaited<ReturnType<typeof fetchValveForTestLog>>,
  mediaOptions: string[],
  procedureOptions: string[],
  setters: {
    setSize: (v: string) => void
    setPressure: (v: string) => void
    setBodyMaterial: (v: string) => void
    setValveType: (v: string) => void
    setSeatType: (v: SeatTypeKind) => void
    applyTestMedia: (media: ReturnType<typeof applyTestMediaPrefill>) => void
    applyTestProcedures: (procedures: ReturnType<typeof mapJobTestTypeToProcedures>) => void
  },
) {
  if (!prefill) return
  setters.setSize(prefill.size ?? '')
  setters.setPressure(prefill.pressure ?? '')
  setters.setBodyMaterial(prefill.bodyMaterial ?? '')
  const canonicalType = canonicalizeValveType(prefill.valveType)
  setters.setValveType(canonicalType)
  if (canonicalType) setters.setSeatType(defaultSeatTypeForValve(canonicalType))

  if (!prefill.testType?.trim()) return

  const procedures = mapJobTestTypeToProcedures(
    prefill.testType,
    procedureOptions.length ? procedureOptions : [...TEST_PROCEDURE_REQUIREMENTS],
  )
  if (procedures.testProcedures.length) {
    setters.applyTestProcedures(procedures)
  }

  // Only prefill media when the job value includes a real media token (legacy jobs).
  const mediaPart = parseJobTestTypes(prefill.testType).find((part) =>
    jobTestTypeLooksLikeMedia(part, mediaOptions),
  )
  if (mediaPart) {
    setters.applyTestMedia(applyTestMediaPrefill(mediaPart, mediaOptions))
  }
}

type TestLogEntryFormProps = {
  onSaved: (valveId: string) => void
  detailsColumnReady?: boolean | null
  /** When set, form loads this row for update instead of insert. */
  editingEntry?: TestLogEntry | null
  onCancelEdit?: () => void
}

export function TestLogEntryForm({
  onSaved,
  detailsColumnReady = null,
  editingEntry = null,
  onCancelEdit,
}: TestLogEntryFormProps) {
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
  const [chartRecorderOptions, setChartRecorderOptions] = useState<TestGauge[]>([])
  const [gaugeOptions, setGaugeOptions] = useState<TestGauge[]>([])
  const [pendingReportFiles, setPendingReportFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [valveIdOptions, setValveIdOptions] = useState<string[]>([])
  const [valveLookupStatus, setValveLookupStatus] = useState<'idle' | 'loading' | 'found' | 'missing'>('idle')
  const [entryStarted, setEntryStarted] = useState(false)
  const [loadingEntry, setLoadingEntry] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const lastPrefilledValveId = useRef<string | null>(null)
  const autoOpenedFromUrl = useRef(false)
  const skipStandardsSyncRef = useRef(false)
  const formTopRef = useRef<HTMLElement | null>(null)
  const { showToast } = useToast()
  const { employees, loading: employeesLoading } = useEmployees()
  const isEditing = editingId != null

  const testerOptions = useMemo(() => {
    const active = employees
      .filter((employee) => employee.is_active && employee.is_tester && employee.initials.trim())
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }))
    return active
  }, [employees])

  const knownTesterInitials = useMemo(
    () => testerOptions.map((employee) => employee.initials),
    [testerOptions],
  )

  const selectedTesters = useMemo(
    () => parseTesterInitials(tester, knownTesterInitials),
    [tester, knownTesterInitials],
  )

  const orphanTesterInitials = useMemo(
    () =>
      selectedTesters.filter(
        (initials) => !testerOptions.some((employee) => employee.initials.toUpperCase() === initials),
      ),
    [selectedTesters, testerOptions],
  )

  const availableTesterOptions = useMemo(
    () =>
      testerOptions.filter(
        (employee) => !selectedTesters.includes(employee.initials.toUpperCase()),
      ),
    [testerOptions, selectedTesters],
  )

  const toggleTester = (initials: string, checked: boolean) => {
    const key = initials.trim().toUpperCase()
    if (!key) return
    const next = checked
      ? [...selectedTesters, key]
      : selectedTesters.filter((value) => value !== key)
    setTester(formatTesterInitials(next))
  }

  const addTester = (initials: string) => {
    const key = initials.trim().toUpperCase()
    if (!key || selectedTesters.includes(key)) return
    setTester(formatTesterInitials([...selectedTesters, key]))
  }

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
      tester: formatTesterInitials(parseTesterInitials(tester, knownTesterInitials)) || null,
      pass_fail: overallPassFail || null,
      action_taken: deriveActionTaken(testing),
      testing_details: testing,
    }),
    [testedOn, valveId, size, pressure, valveType, tester, knownTesterInitials, overallPassFail, testing],
  )
  const canSubmit =
    valveId.trim().length > 0 &&
    testedOn.trim().length > 0 &&
    formatTesterInitials(parseTesterInitials(tester, knownTesterInitials)).length > 0

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
    const tt = searchParams.get(TEST_LOG_PREFILL_KEYS.testType)
    if (!cust && !cell && !desc && !st && !tt) return null
    return { customer: cust, cell, description: desc, jobStatus: st, testType: tt }
  }, [searchParams])

  useEffect(() => {
    void (async () => {
      const map = await loadLookupOptionsMap()
      setTestMediaOptions(map.test_media ?? [])
      setTestProcedureOptions(normalizeTestProcedures(map.test_procedure ?? []))
      setBodyMaterialOptions(map.body_material ?? [])

      try {
        const gauges = await loadActiveTestGauges()
        setGaugeOptions(filterPressureTestGauges(gauges))
        setChartRecorderOptions(filterChartRecorderGauges(gauges))
      } catch {
        setGaugeOptions([])
        setChartRecorderOptions([])
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
    if (!tt?.trim()) return

    const procedureOptions = testProcedureOptions.length
      ? testProcedureOptions
      : [...TEST_PROCEDURE_REQUIREMENTS]
    const procedures = mapJobTestTypeToProcedures(tt, procedureOptions)
    if (procedures.testProcedures.length) {
      setTesting((prev) => ({
        ...prev,
        testProcedures: procedures.testProcedures,
        testProcedureOther: procedures.testProcedureOther,
      }))
    }

    const mediaPart = parseJobTestTypes(tt).find((part) => jobTestTypeLooksLikeMedia(part, testMediaOptions))
    if (mediaPart) {
      const media = applyTestMediaPrefill(mediaPart, testMediaOptions)
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
      applyValvePrefill(prefill, testMediaOptions, testProcedureOptions, {
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
        applyTestProcedures: (procedures) =>
          setTesting((prev) => ({
            ...prev,
            testProcedures: procedures.testProcedures,
            testProcedureOther: procedures.testProcedureOther,
            heliumTest: {
              ...prev.heliumTest,
              enabled:
                prev.heliumTest.enabled ||
                procedures.testProcedures.some((value) => /helium/i.test(value)),
            },
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
  }, [searchParams, entryStarted, testMediaOptions.length, testProcedureOptions.length])

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
    setEditingId(null)
    autoOpenedFromUrl.current = false
    skipStandardsSyncRef.current = false
    setSearchParams({}, { replace: true })
  }

  const loadEditingEntry = async (entry: TestLogEntry) => {
    skipStandardsSyncRef.current = true
    setLoadingEntry(true)
    setEditingId(entry.id)
    setTestedOn(String(entry.tested_on ?? '').slice(0, 10) || todayIso())
    setValveId(entry.valve_id)
    setSize(entry.size ?? '')
    setPressure(entry.pressure ?? '')
    setValveType(canonicalizeValveType(entry.valve_type) || entry.valve_type || '')
    setTester(entry.tester ?? '')
    setPendingReportFiles([])

    const details = parseTestLogTestingDetails(entry.testing_details) ?? emptyTestLogTestingDetails()
    setTesting(details)

    const tsp = details.testStandardParams
    if (tsp?.testMedium) setTestMediumKind(tsp.testMedium)
    if (tsp?.seatType) setSeatType(tsp.seatType)
    else if (entry.valve_type) setSeatType(defaultSeatTypeForValve(canonicalizeValveType(entry.valve_type) || entry.valve_type))

    if (tsp?.phaseResults?.length) {
      const next: Record<string, TestPhaseResult> = {}
      for (const phase of tsp.phaseResults) {
        next[phase.id] = {
          id: phase.id,
          passFail: phase.passFail ?? '',
          notes: phase.notes ?? '',
          medium: phase.medium,
          actualPressure: phase.actualPressure,
        }
      }
      setPhaseState(next)
      setEnabledOptionalPhaseIds(tsp.phaseResults.map((phase) => phase.id))
    } else {
      setPhaseState({})
      setEnabledOptionalPhaseIds([])
    }

    const prefill = await fetchValveForTestLog(entry.valve_id)
    if (prefill) {
      setValveRowId(prefill.valveRowId)
      if (!entry.size && prefill.size) setSize(prefill.size)
      if (!entry.pressure && prefill.pressure) setPressure(prefill.pressure)
      if (prefill.bodyMaterial) {
        setBodyMaterial(prefill.bodyMaterial)
        setBodyMaterialLoadedFromJob(true)
      } else {
        setBodyMaterial('')
        setBodyMaterialLoadedFromJob(false)
      }
      setValveTypeLoadedFromJob(Boolean(prefill.valveType?.trim()))
      setValveLookupStatus('found')
      lastPrefilledValveId.current = prefill.valveId
    } else {
      setValveRowId(null)
      setBodyMaterial('')
      setBodyMaterialLoadedFromJob(false)
      setValveTypeLoadedFromJob(false)
      setValveLookupStatus('missing')
    }

    setEntryStarted(true)
    setLoadingEntry(false)
    window.setTimeout(() => {
      skipStandardsSyncRef.current = false
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  useEffect(() => {
    if (!editingEntry) return
    void loadEditingEntry(editingEntry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEntry?.id])

  const submit = async () => {
    const testerValue = formatTesterInitials(parseTesterInitials(tester, knownTesterInitials))
    if (!valveId.trim() || !testedOn.trim()) {
      showToast('Valve ID and date are required')
      return
    }
    if (!testerValue) {
      showToast('Select at least one tester before saving')
      return
    }
    if (detailsColumnReady === false) {
      showToast(`Run ${TEST_LOG_DETAILS_MIGRATION} in Supabase before saving`)
      return
    }
    const normalizedValveId = normalizeValveId(valveId)
    const passFail = overallPassFail || null
    const savedAt = new Date().toISOString()
    const testingWithStamp: TestLogTestingDetails = {
      ...testing,
      savedAt,
    }
    const payload = {
      tested_on: testedOn,
      valve_id: normalizedValveId,
      size: size || null,
      pressure: pressure || null,
      manufacturer: null,
      valve_type: valveType || null,
      test_type: deriveLegacyTestType(testingWithStamp),
      worked: deriveLegacyWorked(testingWithStamp),
      pass_fail: passFail,
      action_taken: deriveActionTaken(testingWithStamp),
      tester: testerValue,
      testing_details: testingWithStamp,
    }

    setSaving(true)
    let savedId = editingId

    if (isEditing && editingId != null) {
      const { error } = await supabase.from('test_logs').update(payload).eq('id', editingId)
      if (error) {
        setSaving(false)
        showToast(
          isMissingTestingDetailsError(error.message)
            ? `Run ${TEST_LOG_DETAILS_MIGRATION} in Supabase`
            : 'Could not update test log entry',
        )
        return
      }
    } else {
      const { data: savedRow, error } = await supabase.from('test_logs').insert(payload).select('id,created_at').single()
      if (error || !savedRow?.id) {
        setSaving(false)
        showToast(
          isMissingTestingDetailsError(error?.message)
            ? `Run ${TEST_LOG_DETAILS_MIGRATION} in Supabase`
            : 'Could not save test log entry',
        )
        return
      }
      savedId = savedRow.id
    }

    if (pendingReportFiles.length && savedId != null) {
      let uploaded = 0
      for (const file of pendingReportFiles) {
        const { error: uploadError } = await uploadTestLogReport(savedId, file, 'upload')
        if (!uploadError) uploaded += 1
      }
      if (uploaded < pendingReportFiles.length) {
        showToast(`Entry saved; ${uploaded} of ${pendingReportFiles.length} report(s) uploaded`)
      }
    }

    // Always stamp shop date_tested from the log date so closed cards still show "Tested …".
    // Passing tests also move open jobs to Warehouse RTS (Completed stays Completed).
    {
      const { data: valve } = await supabase
        .from('valves')
        .select('id,status')
        .or(`valve_id.eq.${normalizedValveId},valve_id.eq.${valveId.trim()}`)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (valve?.id) {
        const patch: { date_tested: string; status?: string } = { date_tested: testedOn }
        if (passFail && isPassing(passFail) && valve.status !== 'Completed') {
          patch.status = 'Warehouse RTS'
        }
        await supabase.from('valves').update(patch).eq('id', valve.id)
      }
    }

    setSaving(false)
    const wasEdit = isEditing
    await resetForm()
    onCancelEdit?.()
    const savedLabel = new Date(savedAt).toLocaleString()
    showToast(
      wasEdit
        ? `Test log updated for ${normalizedValveId} · ${savedLabel}`
        : `Test log saved for ${normalizedValveId} · ${savedLabel}`,
    )
    onSaved(normalizedValveId)
  }

  const patchTesting = (patch: Partial<TestLogTestingDetails>) => {
    setTesting((prev) => {
      const next = { ...prev, ...patch }
      if ('testProcedures' in patch || 'testProcedureOther' in patch) {
        if (!isFourHourChartTestSelected(next)) {
          next.shellTest = { ...next.shellTest, chartRecorderId: '', chartRecorderNumber: '' }
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
    if (skipStandardsSyncRef.current) return
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
          ? normalizeTestTimeLabel(
              formatHoldTimeSeconds(
                parseInt(
                  testParamsBundle.phases.find((p) => p.id.includes('shell') || p.id === 'sp160-phase2')!.holdTime,
                  10,
                ) || 60,
              ),
            ) || prev.shellTest.time
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
    <section className="dashboard-panel test-log-entry-panel" ref={formTopRef} id="test-log-entry-form">
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
            <h3>
              {isEditing ? 'Edit test log' : 'Test log'} — {normalizeValveId(valveId) || valveId.trim()}
            </h3>
            <div className="test-log-entry-active-header-actions">
              {isEditing ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    void resetForm()
                    onCancelEdit?.()
                  }}
                >
                  Cancel edit
                </button>
              ) : (
                <button type="button" className="button-secondary" onClick={() => void resetForm()}>
                  Change valve
                </button>
              )}
            </div>
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
              {jobCardPrefillBanner.testType ? (
                <p className="test-log-prefill-line">
                  <span className="test-log-prefill-k">Test requirements</span> {jobCardPrefillBanner.testType}
                </p>
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
          </div>

          <fieldset className="test-log-tester-select test-log-fieldset">
            <legend>
              Tester(s) <span className="test-log-required-mark">*</span>
            </legend>
            {employeesLoading ? (
              <p className="test-log-tester-loading">Loading employees…</p>
            ) : (
              <>
                <div className="test-log-tester-chips" aria-live="polite">
                  {selectedTesters.length === 0 ? (
                    <span className="test-log-tester-empty">Required — select at least one tester</span>
                  ) : (
                    selectedTesters.map((initials) => {
                      const employee = testerOptions.find(
                        (row) => row.initials.toUpperCase() === initials,
                      )
                      const orphan = orphanTesterInitials.includes(initials)
                      return (
                        <button
                          key={initials}
                          type="button"
                          className="test-log-tester-chip-btn"
                          onClick={() => toggleTester(initials, false)}
                          title="Remove tester"
                        >
                          {employee ? `${employee.full_name} (${initials})` : orphan ? `${initials} (saved)` : initials}
                          <span aria-hidden>×</span>
                        </button>
                      )
                    })
                  )}
                </div>
                <label className="test-log-tester-add">
                  Add tester
                  <select
                    value=""
                    disabled={availableTesterOptions.length === 0}
                    onChange={(e) => {
                      addTester(e.target.value)
                      e.target.value = ''
                    }}
                  >
                    <option value="">
                      {testerOptions.length === 0
                        ? 'No testers designated yet'
                        : availableTesterOptions.length === 0
                          ? 'All designated testers selected'
                          : 'Select tester…'}
                    </option>
                    {availableTesterOptions.map((employee) => (
                      <option key={employee.id} value={employee.initials.toUpperCase()}>
                        {employee.full_name} ({employee.initials.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </label>
                {testerOptions.length === 0 ? (
                  <p className="test-log-tester-hint">
                    Mark people as testers under Admin → Employees, then they will appear here.
                  </p>
                ) : null}
              </>
            )}
          </fieldset>

          {valveLookupStatus === 'found' ? (
            <p className="status-breakdown-note test-log-valve-lookup-note">
              Loaded size, pressure, type, and test requirements from the job board.
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

        {isEditing && editingId != null ? (
          <TestLogReportsSection
            mode="saved"
            testLogId={editingId}
            reportData={reportData}
          />
        ) : (
          <TestLogReportsSection
            mode="draft"
            reportData={reportData}
            pendingFiles={pendingReportFiles}
            onPendingFilesChange={setPendingReportFiles}
          />
        )}

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
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save entry'}
          </button>
        </div>
          </div>
        </>
      )}
    </section>
  )
}
