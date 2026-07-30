import { useMemo, useState, type ReactNode } from 'react'
import {
  RELIEF_VALVE_MEDIA,
  RELIEF_VALVE_PASS_TOLERANCE_PERCENT,
  RELIEF_VALVE_PRETEST_KINDS,
  applyReliefValveEvaluations,
  canStartReliefRetest,
  ensureReliefAttempts,
  evaluateReliefValveRun,
  formatReliefValveAverage,
  formatReliefValveSize,
  resolveReliefValveMedia,
  startReliefRetest,
  type ReliefValveRunFields,
  type ReliefValveTestFields,
} from '../../lib/reliefValveTest'
import { supabase } from '../../lib/supabase'
import type { TestGauge } from '../../types/testGauge'
import type { Employee } from '../../types/employees'
import { TestGaugeSelect } from './TestGaugeSelect'
import { TestLogTesterSelect } from './TestLogTesterSelect'

type ReliefValveFieldsProps = {
  value: ReliefValveTestFields
  sizeOptions: string[]
  gaugeOptions: TestGauge[]
  testerOptions: Array<Pick<Employee, 'id' | 'full_name' | 'initials'>>
  testersLoading?: boolean
  valveRowId?: number | null
  onChange: (next: ReliefValveTestFields) => void
  /** Called after size/pressure/media are written to the job-board valve row. */
  onJobRecordUpdated?: (next: { size: string; pressure: string; testType: string | null }) => void
}

function mediaToJobTestType(fields: ReliefValveTestFields): string | null {
  const media = resolveReliefValveMedia(fields)
  if (!media) return null
  if (/steam/i.test(media)) return 'PRV Steam'
  if (/air|gas/i.test(media)) return 'PRV Air'
  if (/liquid|water/i.test(media)) return 'PRV Water'
  return media
}

type RunSectionProps = {
  title: string
  hint: string
  runKey: 'pretest' | 'final'
  run: ReliefValveRunFields
  attemptIndex: number
  attemptCount: number
  readOnly?: boolean
  showRetest?: boolean
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>
  gaugeOptions: TestGauge[]
  testerOptions: Array<Pick<Employee, 'id' | 'full_name' | 'initials'>>
  testersLoading?: boolean
  gaugeSelectId: string
  resultName: string
  onPatchRun: (partial: Partial<ReliefValveRunFields>) => void
  onRetest?: () => void
  children?: ReactNode
}

function ReliefValveRunSection({
  title,
  hint,
  runKey,
  run,
  attemptIndex,
  attemptCount,
  readOnly = false,
  showRetest = false,
  header,
  gaugeOptions,
  testerOptions,
  testersLoading = false,
  gaugeSelectId,
  resultName,
  onPatchRun,
  onRetest,
  children,
}: RunSectionProps) {
  const evaluation = useMemo(() => evaluateReliefValveRun(run, header), [run, header])
  const popAverageLabel = formatReliefValveAverage(evaluation.pop.average)
  const setLabel = formatReliefValveAverage(evaluation.pop.setPressure)
  const maxPopLabel = formatReliefValveAverage(evaluation.pop.maxPassPressure)
  const reseatAverageLabel = formatReliefValveAverage(evaluation.reseat.reseatAverage)
  const reseatMinLabel = formatReliefValveAverage(evaluation.reseat.minPass)
  const reseatMaxLabel = formatReliefValveAverage(evaluation.reseat.maxPass)
  const popAvgForReseatLabel = formatReliefValveAverage(evaluation.reseat.popAverage)
  const reseatTol = evaluation.reseat.tolerancePercent
  const popCountLabel =
    evaluation.pop.enteredCount > 0
      ? evaluation.pop.complete
        ? '3 of 3'
        : `${evaluation.pop.enteredCount} of 3`
      : null
  const reseatCountLabel =
    evaluation.reseat.reseatEnteredCount > 0
      ? evaluation.reseat.reseatComplete
        ? '3 of 3'
        : `${evaluation.reseat.reseatEnteredCount} of 3`
      : null

  const attemptTitle =
    attemptCount > 1
      ? `${title} · Attempt ${attemptIndex + 1}${attemptIndex > 0 ? ' (re-test)' : ''}`
      : title

  return (
    <section
      className={`test-log-relief-run test-log-relief-run--${runKey}${
        readOnly ? ' test-log-relief-run--readonly' : ''
      }${run.result === 'fail' ? ' test-log-relief-run--failed' : ''}${
        run.result === 'pass' ? ' test-log-relief-run--passed' : ''
      }`}
    >
      <div className="test-log-relief-run-heading">
        <h4>
          {attemptTitle}
          {run.result === 'fail' ? <span className="test-log-relief-attempt-badge fail">Failed</span> : null}
          {run.result === 'pass' ? <span className="test-log-relief-attempt-badge pass">Passed</span> : null}
          {readOnly ? <span className="test-log-relief-attempt-badge saved">Kept on record</span> : null}
        </h4>
        <p>{readOnly ? 'Previous attempt kept for history.' : hint}</p>
      </div>

      {children}

      <div className="test-log-relief-run-tester">
        <TestLogTesterSelect
          label={`${title} tester(s)`}
          value={run.tester}
          options={testerOptions}
          loading={testersLoading}
          required={!readOnly}
          disabled={readOnly}
          emptyHint={
            readOnly ? 'No tester recorded' : `Required — select tester(s) for the ${title.toLowerCase()}`
          }
          onChange={(tester) => onPatchRun({ tester })}
        />
      </div>

      <div className="test-log-relief-gauge">
        <TestGaugeSelect
          id={gaugeSelectId}
          options={gaugeOptions}
          value={{ gaugeId: run.gaugeId, gauge: run.gauge }}
          onChange={(gauge) => {
            if (!readOnly) onPatchRun(gauge)
          }}
        />
      </div>

      <div className="test-log-relief-set-pressure-tests">
        <div className="test-log-relief-set-pressure-heading">
          <h5>Pop / set pressure tests</h5>
          <p>
            Pass when the three-pop average is from set pressure up to +{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}%
            (never below set).
          </p>
          <div className="test-log-relief-criteria" aria-live="polite">
            <span className="test-log-relief-criteria-label">Pass criteria</span>
            {setLabel && maxPopLabel ? (
              <strong className="test-log-relief-criteria-value">
                {setLabel} – {maxPopLabel} PSI
              </strong>
            ) : (
              <strong className="test-log-relief-criteria-value test-log-relief-criteria-value--pending">
                Enter set pressure above
              </strong>
            )}
            {setLabel && maxPopLabel ? (
              <span className="test-log-relief-criteria-detail">
                Based on set pressure {setLabel} PSI (+{RELIEF_VALVE_PASS_TOLERANCE_PERCENT}% max)
              </span>
            ) : null}
          </div>
        </div>

        {(['test1', 'test2', 'test3'] as const).map((field, index) => (
          <label key={field}>
            Pop {index + 1} {!readOnly ? <span className="test-log-required-mark">*</span> : null}
            <input
              type="text"
              inputMode="decimal"
              value={run[field]}
              onChange={(e) => onPatchRun({ [field]: e.target.value })}
              placeholder="PSI"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </label>
        ))}

        <div
          className={`test-log-relief-average${
            evaluation.pop.result === 'pass'
              ? ' test-log-relief-average-pass'
              : evaluation.pop.result === 'fail'
                ? ' test-log-relief-average-fail'
                : ''
          }`}
          aria-live="polite"
        >
          <span className="test-log-relief-average-label">
            {evaluation.pop.complete ? 'Pop average' : 'Pop average (running)'}
            {popCountLabel ? ` · ${popCountLabel}` : ''}
          </span>
          <strong className="test-log-relief-average-value">
            {popAverageLabel ? `${popAverageLabel} PSI` : '—'}
          </strong>
          {setLabel && maxPopLabel ? (
            <span className="test-log-relief-average-band">
              Must be {setLabel}–{maxPopLabel} PSI
            </span>
          ) : null}
          <span
            className={`test-log-relief-average-delta${
              evaluation.pop.result === 'pass'
                ? ' test-log-relief-average-delta-match'
                : evaluation.pop.result === 'fail'
                  ? ' test-log-relief-average-delta-under'
                  : ''
            }`}
          >
            {evaluation.pop.summary}
          </span>
        </div>
      </div>

      <div className="test-log-relief-set-pressure-tests test-log-relief-reseat-tests">
        <div className="test-log-relief-set-pressure-heading">
          <h5>Reseat pressure tests</h5>
          <p>
            Compared to pop average — Steam within 6%, Air/Gas within 10%. Liquid has no pass/fail (target within
            10%).
          </p>
          <div className="test-log-relief-criteria" aria-live="polite">
            <span className="test-log-relief-criteria-label">
              {evaluation.reseat.enforced === false && reseatTol != null ? 'Target criteria' : 'Pass criteria'}
            </span>
            {reseatMinLabel && reseatMaxLabel && popAvgForReseatLabel ? (
              <strong className="test-log-relief-criteria-value">
                {reseatMinLabel} – {reseatMaxLabel} PSI
              </strong>
            ) : (
              <strong className="test-log-relief-criteria-value test-log-relief-criteria-value--pending">
                {reseatTol != null
                  ? `Waiting on first pop (±${reseatTol}%)`
                  : 'Select media, then enter pop tests'}
              </strong>
            )}
            {reseatMinLabel && reseatMaxLabel && popAvgForReseatLabel && reseatTol != null ? (
              <span className="test-log-relief-criteria-detail">
                ±{reseatTol}% of pop average {popAvgForReseatLabel} PSI
                {!evaluation.reseat.popComplete
                  ? ` (updates with each pop · ${evaluation.reseat.popEnteredCount} of 3)`
                  : ''}
                {evaluation.reseat.enforced === false ? ' (advisory only)' : ''}
              </span>
            ) : popAvgForReseatLabel ? (
              <span className="test-log-relief-criteria-detail">
                Pop average {popAvgForReseatLabel} PSI — enter reseat readings
              </span>
            ) : (
              <span className="test-log-relief-criteria-detail">Band moves with each pop reading</span>
            )}
          </div>
        </div>

        {(['reseat1', 'reseat2', 'reseat3'] as const).map((field, index) => (
          <label key={field}>
            Reseat {index + 1} {!readOnly ? <span className="test-log-required-mark">*</span> : null}
            <input
              type="text"
              inputMode="decimal"
              value={run[field]}
              onChange={(e) => onPatchRun({ [field]: e.target.value })}
              placeholder="PSI"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </label>
        ))}

        <div
          className={`test-log-relief-average${
            evaluation.reseat.result === 'pass'
              ? ' test-log-relief-average-pass'
              : evaluation.reseat.result === 'fail'
                ? ' test-log-relief-average-fail'
                : evaluation.reseat.result === 'na'
                  ? ' test-log-relief-average-advisory'
                  : ''
          }`}
          aria-live="polite"
        >
          <span className="test-log-relief-average-label">
            {evaluation.reseat.reseatComplete ? 'Reseat average' : 'Reseat average (running)'}
            {reseatCountLabel ? ` · ${reseatCountLabel}` : ''}
          </span>
          <strong className="test-log-relief-average-value">
            {reseatAverageLabel ? `${reseatAverageLabel} PSI` : '—'}
          </strong>
          {reseatMinLabel && reseatMaxLabel ? (
            <span className="test-log-relief-average-band">
              Must be {reseatMinLabel}–{reseatMaxLabel} PSI
            </span>
          ) : null}
          <span
            className={`test-log-relief-average-delta${
              evaluation.reseat.result === 'pass'
                ? ' test-log-relief-average-delta-match'
                : evaluation.reseat.result === 'fail'
                  ? ' test-log-relief-average-delta-under'
                  : ''
            }`}
          >
            {evaluation.reseat.summary}
          </span>
        </div>
      </div>

      <fieldset className="test-pressure-result-fieldset test-log-relief-result">
        <legend>
          {title} result {!readOnly ? <span className="test-log-required-mark">*</span> : null}
        </legend>
        <p className="test-log-relief-result-hint">{evaluation.summary}</p>
        <label className="test-pressure-result-option">
          <input type="radio" name={resultName} checked={run.result === 'pass'} readOnly disabled />
          Pass
        </label>
        <label className="test-pressure-result-option">
          <input type="radio" name={resultName} checked={run.result === 'fail'} readOnly disabled />
          Fail
        </label>
      </fieldset>

      {run.result === 'fail' ? (
        <label className="test-log-relief-fail-reason">
          Fail reason {!readOnly ? <span className="test-log-required-mark">*</span> : null}
          <input
            type="text"
            value={run.reason}
            onChange={(e) => onPatchRun({ reason: e.target.value })}
            placeholder="Describe why the test failed"
            readOnly={readOnly}
            disabled={readOnly}
          />
        </label>
      ) : null}

      {showRetest && onRetest ? (
        <div className="test-log-relief-retest-actions">
          <button type="button" className="test-log-relief-retest-btn" onClick={onRetest}>
            Re-test {title.toLowerCase()}
          </button>
          <p className="test-log-relief-retest-hint">
            Keeps this failed attempt on the record and opens a new blank attempt underneath.
          </p>
        </div>
      ) : null}
    </section>
  )
}

type AttemptGroupProps = {
  kind: 'pretest' | 'final'
  title: string
  hint: string
  attempts: ReliefValveRunFields[]
  header: Pick<ReliefValveTestFields, 'setPressure' | 'media'>
  gaugeOptions: TestGauge[]
  testerOptions: Array<Pick<Employee, 'id' | 'full_name' | 'initials'>>
  testersLoading?: boolean
  onChangeAttempts: (attempts: ReliefValveRunFields[]) => void
  childrenForFirst?: ReactNode
}

function ReliefValveAttemptGroup({
  kind,
  title,
  hint,
  attempts,
  header,
  gaugeOptions,
  testerOptions,
  testersLoading,
  onChangeAttempts,
  childrenForFirst,
}: AttemptGroupProps) {
  const list = ensureReliefAttempts(attempts)

  const patchAttempt = (index: number, partial: Partial<ReliefValveRunFields>) => {
    const next = list.map((run, i) => (i === index ? { ...run, ...partial } : run))
    onChangeAttempts(next)
  }

  return (
    <>
      {list.map((run, index) => {
        const isLatest = index === list.length - 1
        const readOnly = !isLatest
        return (
          <ReliefValveRunSection
            key={`${kind}-${index}`}
            title={title}
            hint={hint}
            runKey={kind}
            run={run}
            attemptIndex={index}
            attemptCount={list.length}
            readOnly={readOnly}
            showRetest={isLatest && canStartReliefRetest(list)}
            header={header}
            gaugeOptions={gaugeOptions}
            testerOptions={testerOptions}
            testersLoading={testersLoading}
            gaugeSelectId={`relief-valve-${kind}-gauge-${index}`}
            resultName={`relief-valve-${kind}-result-${index}`}
            onPatchRun={(partial) => patchAttempt(index, partial)}
            onRetest={() => onChangeAttempts(startReliefRetest(list))}
          >
            {index === 0 ? childrenForFirst : null}
          </ReliefValveRunSection>
        )
      })}
    </>
  )
}

export function ReliefValveFields({
  value,
  sizeOptions,
  gaugeOptions,
  testerOptions,
  testersLoading = false,
  valveRowId = null,
  onChange,
  onJobRecordUpdated,
}: ReliefValveFieldsProps) {
  const showMediaOther = value.media.trim().toLowerCase() === 'other'
  const [savingJobRecord, setSavingJobRecord] = useState(false)
  const [jobRecordMessage, setJobRecordMessage] = useState<string | null>(null)
  const header = useMemo(
    () => ({ setPressure: value.setPressure, media: value.media }),
    [value.setPressure, value.media],
  )

  const patch = (partial: Partial<ReliefValveTestFields>) => {
    const next = applyReliefValveEvaluations({ ...value, ...partial })
    onChange(next)
    setJobRecordMessage(null)
  }

  const sizeSelect = (current: string) => {
    const options = [...sizeOptions]
    if (current && !options.some((opt) => opt.toLowerCase() === current.toLowerCase())) {
      options.unshift(current)
    }
    return options
  }

  const formattedSize = formatReliefValveSize(value)
  const canUpdateJobRecord = Boolean(
    valveRowId && formattedSize && value.setPressure.trim() && resolveReliefValveMedia(value),
  )

  const updateJobRecord = async () => {
    if (!valveRowId) {
      setJobRecordMessage('Open this log from a job board valve so the record can be updated.')
      return
    }
    if (!formattedSize) {
      setJobRecordMessage('Select inlet and outlet size before updating the job record.')
      return
    }
    if (!value.setPressure.trim()) {
      setJobRecordMessage('Enter set pressure before updating the job record.')
      return
    }
    const testType = mediaToJobTestType(value)
    if (!testType) {
      setJobRecordMessage('Select media before updating the job record.')
      return
    }

    setSavingJobRecord(true)
    setJobRecordMessage(null)
    const patchPayload: { size: string; pressure: string; test_type: string } = {
      size: formattedSize,
      pressure: value.setPressure.trim(),
      test_type: testType,
    }
    const { error } = await supabase.from('valves').update(patchPayload).eq('id', valveRowId)
    setSavingJobRecord(false)

    if (error) {
      setJobRecordMessage(error.message || 'Could not update the job record.')
      return
    }

    onJobRecordUpdated?.({
      size: patchPayload.size,
      pressure: patchPayload.pressure,
      testType: patchPayload.test_type,
    })
    setJobRecordMessage('Job record updated — size, set pressure, and media saved across the app.')
  }

  return (
    <div className="test-log-relief-fields">
      <p className="test-log-relief-record-note">
        One record per valve — optional pretest plus a required final test. If a run fails, use Re-test to keep the
        failed attempt and document the next one on the same record.
      </p>

      <label>
        Inlet size <span className="test-log-required-mark">*</span>
        <select value={value.inletSize} onChange={(e) => patch({ inletSize: e.target.value })}>
          <option value="">— Select inlet size —</option>
          {sizeSelect(value.inletSize).map((size) => (
            <option key={`inlet-${size}`} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label>
        Outlet size <span className="test-log-required-mark">*</span>
        <select value={value.outletSize} onChange={(e) => patch({ outletSize: e.target.value })}>
          <option value="">— Select outlet size —</option>
          {sizeSelect(value.outletSize).map((size) => (
            <option key={`outlet-${size}`} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label>
        Set pressure <span className="test-log-required-mark">*</span>
        <input
          type="text"
          inputMode="decimal"
          value={value.setPressure}
          onChange={(e) => patch({ setPressure: e.target.value })}
          placeholder="e.g. 150"
        />
      </label>

      <label>
        Media <span className="test-log-required-mark">*</span>
        <select value={value.media} onChange={(e) => patch({ media: e.target.value, mediaOther: '' })}>
          <option value="">— Select media —</option>
          {RELIEF_VALVE_MEDIA.map((media) => (
            <option key={media} value={media}>
              {media}
            </option>
          ))}
        </select>
      </label>

      {showMediaOther ? (
        <label>
          Other media <span className="test-log-required-mark">*</span>
          <input
            type="text"
            value={value.mediaOther}
            onChange={(e) => patch({ mediaOther: e.target.value })}
            placeholder="Describe media"
          />
        </label>
      ) : null}

      <div className="test-log-relief-update-record">
        <div className="test-log-relief-update-record-copy">
          <strong>Update job record</strong>
          <p>
            Save inlet/outlet size, set pressure, and media to the valve on the job board so Status board, List,
            and other screens stay in sync.
          </p>
          {formattedSize || value.setPressure.trim() || resolveReliefValveMedia(value) ? (
            <p className="test-log-relief-update-record-preview">
              Will write:{' '}
              {[
                formattedSize ? `Size ${formattedSize}` : null,
                value.setPressure.trim() ? `Set ${value.setPressure.trim()} PSI` : null,
                mediaToJobTestType(value) ? `Media ${mediaToJobTestType(value)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="test-log-relief-update-record-btn"
          disabled={savingJobRecord || !canUpdateJobRecord}
          onClick={() => void updateJobRecord()}
        >
          {savingJobRecord ? 'Updating…' : 'Update record'}
        </button>
        {jobRecordMessage ? (
          <p
            className={`test-log-relief-update-record-status${
              jobRecordMessage.startsWith('Job record updated')
                ? ' test-log-relief-update-record-status--ok'
                : ' test-log-relief-update-record-status--warn'
            }`}
            role="status"
          >
            {jobRecordMessage}
          </p>
        ) : null}
        {!valveRowId ? (
          <p className="test-log-relief-update-record-status test-log-relief-update-record-status--warn">
            No linked job row yet — look up the valve ID from the job board first.
          </p>
        ) : null}
      </div>

      <label className="test-log-relief-include-pretest">
        <input
          type="checkbox"
          checked={value.includePretest}
          onChange={(e) =>
            patch({
              includePretest: e.target.checked,
              pretestKind: e.target.checked ? value.pretestKind || 'Pretest' : value.pretestKind,
              pretestAttempts: e.target.checked
                ? ensureReliefAttempts(value.pretestAttempts)
                : value.pretestAttempts,
            })
          }
        />
        Include pretest (as-found)
      </label>

      {value.includePretest ? (
        <ReliefValveAttemptGroup
          kind="pretest"
          title="Pretest"
          hint="As-found / pretest readings before or during repair."
          attempts={value.pretestAttempts}
          header={header}
          gaugeOptions={gaugeOptions}
          testerOptions={testerOptions}
          testersLoading={testersLoading}
          onChangeAttempts={(pretestAttempts) => patch({ pretestAttempts })}
          childrenForFirst={
            <fieldset className="test-log-relief-test-type">
              <legend>
                Pretest type <span className="test-log-required-mark">*</span>
              </legend>
              <div className="test-log-relief-test-type-options">
                {RELIEF_VALVE_PRETEST_KINDS.map((kind) => (
                  <label key={kind} className="test-log-inline-radio">
                    <input
                      type="radio"
                      name="relief-valve-pretest-kind"
                      checked={value.pretestKind === kind}
                      onChange={() => patch({ pretestKind: kind })}
                    />
                    {kind}
                  </label>
                ))}
              </div>
            </fieldset>
          }
        />
      ) : null}

      <ReliefValveAttemptGroup
        kind="final"
        title="Final test"
        hint="Required as-left / final pop and reseat for this valve."
        attempts={value.finalAttempts}
        header={header}
        gaugeOptions={gaugeOptions}
        testerOptions={testerOptions}
        testersLoading={testersLoading}
        onChangeAttempts={(finalAttempts) => patch({ finalAttempts })}
      />
    </div>
  )
}
