import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from './ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import {
  clearPcmsFormFromDatabase,
  loadPcmsFormForValve,
  loadPcmsFormForValveAsync,
  PCMS_CONDITION_OPTIONS,
  PCMS_PART_NAMES,
  PCMS_RECOMMENDATION_OPTIONS,
  PCMS_WORK_OPTIONS,
  pcmsFormFromValve,
  savePcmsFormToDatabase,
  type PcmsFormState,
  type PcmsPartName,
} from '../lib/pcmsForm'
import { openPcmsFormPrint } from '../lib/pcmsFormPrint'
import type { Valve } from '../types'

type TabId = 'relief' | 'pretest' | 'parts' | 'final' | 'field'

const TABS: { id: TabId; label: string }[] = [
  { id: 'relief', label: 'Relief valve data' },
  { id: 'pretest', label: 'Pretest' },
  { id: 'parts', label: 'Parts' },
  { id: 'final', label: 'Final test' },
  { id: 'field', label: 'Field checklist' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pcms-section">
      <header className="pcms-section-hdr">
        <h4>{title}</h4>
      </header>
      <div className="pcms-section-body">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
  wide,
  hint,
}: {
  label: string
  children: ReactNode
  wide?: boolean
  hint?: string
}) {
  return (
    <label className={`pcms-field${wide ? ' pcms-field--wide' : ''}`}>
      <span className="pcms-field-label">
        {label}
        {hint ? <em className="pcms-field-hint">{hint}</em> : null}
      </span>
      {children}
    </label>
  )
}

type YesNo = '' | 'yes' | 'no'
type YesNoNaValue = YesNo | 'na'

function YesNoNa({
  value,
  onChange,
  allowNa,
}: {
  value: YesNoNaValue
  onChange: (v: YesNoNaValue) => void
  allowNa?: boolean
}) {
  const options: { value: YesNoNaValue; label: string }[] = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ]
  if (allowNa) options.push({ value: 'na', label: 'N/A' })

  return (
    <div className="pcms-choice" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`pcms-choice-btn${value === opt.value ? ' is-selected' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(value === opt.value ? '' : opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function CheckChip({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      className={`pcms-chip${checked ? ' is-selected' : ''}`}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="pcms-chip-mark" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

export function PcmsFormModal({
  valve,
  onClose,
}: {
  valve: Valve
  onClose: () => void
}) {
  const { showToast } = useToast()
  const { user, username } = useAuth()
  const [tab, setTab] = useState<TabId>('relief')
  const [form, setForm] = useState<PcmsFormState>(() => loadPcmsFormForValve(valve))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setTab('relief')
    setForm(loadPcmsFormForValve(valve))
    void loadPcmsFormForValveAsync(valve).then((result) => {
      if (cancelled) return
      setForm(result.form)
      setLoading(false)
      if (result.missingTable) {
        showToast(
          'PCMS shared save is not set up yet. Run supabase/migration-pcms-forms.sql in the Supabase SQL Editor.',
        )
      } else if (result.error && result.source === 'card') {
        showToast(`Could not load shared PCMS draft: ${result.error}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [showToast, valve])

  const patch = (partial: Partial<PcmsFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  const patchPart = (name: PcmsPartName, key: keyof PcmsFormState['parts'][PcmsPartName], value: string) => {
    setForm((prev) => ({
      ...prev,
      parts: {
        ...prev.parts,
        [name]: { ...prev.parts[name], [key]: value },
      },
    }))
  }

  const persist = async () => {
    setSaving(true)
    const result = await savePcmsFormToDatabase(valve.id, form, {
      userId: user?.id ?? null,
      userName: username,
    })
    setSaving(false)
    if (result.missingTable) {
      showToast(
        'Database table missing. Run supabase/migration-pcms-forms.sql in the Supabase SQL Editor, then try again.',
      )
      return false
    }
    if (result.error) {
      showToast(`Could not save PCMS: ${result.error}`)
      return false
    }
    showToast('PCMS draft saved to the job (shared for all logins)')
    return true
  }

  const print = async () => {
    const saved = await persist()
    if (!saved) return
    const { error } = openPcmsFormPrint(form, { valveId: valve.valve_id })
    if (error) showToast(error)
  }

  const resetFromCard = async () => {
    if (!window.confirm('Replace the form with job-card defaults? The shared saved draft for this job will be cleared.')) {
      return
    }
    setSaving(true)
    const result = await clearPcmsFormFromDatabase(valve.id)
    setSaving(false)
    setForm(pcmsFormFromValve(valve))
    if (result.missingTable) {
      showToast('Form reset on this screen. Run migration-pcms-forms.sql to clear shared drafts in the database.')
      return
    }
    if (result.error) {
      showToast(`Form reset on this screen, but could not clear shared draft: ${result.error}`)
      return
    }
    showToast('PCMS reset from job card')
  }

  return createPortal(
    <div
      className="modal-overlay pcms-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-card pcms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcms-modal-title"
      >
        <div className="modal-header-with-close pcms-modal-header">
          <div className="modal-header-text">
            <h3 id="pcms-modal-title">PCMS — RV-1958</h3>
            <p className="pcms-modal-sub">
              {valve.valve_id}
              {valve.customer ? ` · ${valve.customer}` : ''}
              {' · '}
              Prefills from the job card; edit anything before print.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="pcms-tabs" role="tablist" aria-label="PCMS sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`pcms-tab${tab === item.id ? ' is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="pcms-modal-body" aria-busy={loading}>
          {tab === 'relief' ? (
            <div className="pcms-stack">
              <Section title="Identification">
                <div className="pcms-grid">
                  <Field label="Report date">
                    <input
                      type="date"
                      value={form.reportDate}
                      onChange={(e) => patch({ reportDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Test / repair date">
                    <input
                      type="date"
                      value={form.testRepairDate}
                      onChange={(e) => patch({ testRepairDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Description" wide>
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </Field>
                  <Field label="Asset No">
                    <input type="text" value={form.assetNo} onChange={(e) => patch({ assetNo: e.target.value })} />
                  </Field>
                  <Field label="Serial No">
                    <input type="text" value={form.serialNo} onChange={(e) => patch({ serialNo: e.target.value })} />
                  </Field>
                  <Field label="Manufacturer">
                    <input
                      type="text"
                      value={form.manufacturer}
                      onChange={(e) => patch({ manufacturer: e.target.value })}
                    />
                  </Field>
                  <Field label="Model No">
                    <input type="text" value={form.modelNo} onChange={(e) => patch({ modelNo: e.target.value })} />
                  </Field>
                  <Field label="Shop No">
                    <input type="text" value={form.shopNo} onChange={(e) => patch({ shopNo: e.target.value })} />
                  </Field>
                  <Field label="Governing code">
                    <input
                      type="text"
                      value={form.governingCode}
                      onChange={(e) => patch({ governingCode: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Valve data">
                <div className="pcms-grid">
                  <Field label="Fluid state">
                    <input
                      type="text"
                      value={form.fluidState}
                      onChange={(e) => patch({ fluidState: e.target.value })}
                    />
                  </Field>
                  <Field label="Test medium">
                    <input
                      type="text"
                      value={form.testMedium}
                      onChange={(e) => patch({ testMedium: e.target.value })}
                    />
                  </Field>
                  <Field label="Max test pressure (psi)">
                    <input
                      type="text"
                      value={form.maxTestPressure}
                      onChange={(e) => patch({ maxTestPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Set pressure (psi)">
                    <input
                      type="text"
                      value={form.setPressure}
                      onChange={(e) => patch({ setPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="CDTP (psi)">
                    <input type="text" value={form.cdtp} onChange={(e) => patch({ cdtp: e.target.value })} />
                  </Field>
                  <Field label="Orifice designation">
                    <input
                      type="text"
                      value={form.orificeDesignation}
                      onChange={(e) => patch({ orificeDesignation: e.target.value })}
                    />
                  </Field>
                  <Field label="Orifice size">
                    <input
                      type="text"
                      value={form.orificeSize}
                      onChange={(e) => patch({ orificeSize: e.target.value })}
                    />
                  </Field>
                  <Field label="Spring number">
                    <input
                      type="text"
                      value={form.springNumber}
                      onChange={(e) => patch({ springNumber: e.target.value })}
                    />
                  </Field>
                  <Field label="Free height">
                    <input
                      type="text"
                      value={form.freeHeight}
                      onChange={(e) => patch({ freeHeight: e.target.value })}
                    />
                  </Field>
                  <Field label="Spring range from">
                    <input
                      type="text"
                      value={form.springRangeFrom}
                      onChange={(e) => patch({ springRangeFrom: e.target.value })}
                    />
                  </Field>
                  <Field label="Spring range to">
                    <input
                      type="text"
                      value={form.springRangeTo}
                      onChange={(e) => patch({ springRangeTo: e.target.value })}
                    />
                  </Field>
                  <Field label="Required capacity">
                    <input
                      type="text"
                      value={form.requiredCapacity}
                      onChange={(e) => patch({ requiredCapacity: e.target.value })}
                    />
                  </Field>
                  <Field label="Calculated capacity">
                    <input
                      type="text"
                      value={form.calculatedCapacity}
                      onChange={(e) => patch({ calculatedCapacity: e.target.value })}
                    />
                  </Field>
                  <Field label="Rated capacity">
                    <input
                      type="text"
                      value={form.ratedCapacity}
                      onChange={(e) => patch({ ratedCapacity: e.target.value })}
                    />
                  </Field>
                  <Field label="SIB constant (psi)">
                    <input
                      type="text"
                      value={form.backPressureConstant}
                      onChange={(e) => patch({ backPressureConstant: e.target.value })}
                    />
                  </Field>
                  <Field label="SIB variable (psi)">
                    <input
                      type="text"
                      value={form.backPressureVariable}
                      onChange={(e) => patch({ backPressureVariable: e.target.value })}
                    />
                  </Field>
                  <Field label="Built-up back (psi)">
                    <input
                      type="text"
                      value={form.builtUpBackPressure}
                      onChange={(e) => patch({ builtUpBackPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Relieving temperature">
                    <input
                      type="text"
                      value={form.relievingTemperature}
                      onChange={(e) => patch({ relievingTemperature: e.target.value })}
                    />
                  </Field>
                  <Field label="Nozzle ring set">
                    <input
                      type="text"
                      value={form.nozzleRingSet}
                      onChange={(e) => patch({ nozzleRingSet: e.target.value })}
                    />
                  </Field>
                  <Field label="Guide ring set">
                    <input
                      type="text"
                      value={form.guideRingSet}
                      onChange={(e) => patch({ guideRingSet: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Inlet / outlet">
                <div className="pcms-grid pcms-grid--3">
                  <Field label="Inlet size (in)">
                    <input
                      type="text"
                      value={form.inletSize}
                      onChange={(e) => patch({ inletSize: e.target.value })}
                    />
                  </Field>
                  <Field label="Inlet rating (psi)">
                    <input
                      type="text"
                      value={form.inletRating}
                      onChange={(e) => patch({ inletRating: e.target.value })}
                    />
                  </Field>
                  <Field label="Inlet type">
                    <input
                      type="text"
                      value={form.inletType}
                      onChange={(e) => patch({ inletType: e.target.value })}
                    />
                  </Field>
                  <Field label="Outlet size (in)">
                    <input
                      type="text"
                      value={form.outletSize}
                      onChange={(e) => patch({ outletSize: e.target.value })}
                    />
                  </Field>
                  <Field label="Outlet rating (psi)">
                    <input
                      type="text"
                      value={form.outletRating}
                      onChange={(e) => patch({ outletRating: e.target.value })}
                    />
                  </Field>
                  <Field label="Outlet type">
                    <input
                      type="text"
                      value={form.outletType}
                      onChange={(e) => patch({ outletType: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          ) : null}

          {tab === 'pretest' ? (
            <div className="pcms-stack">
              <Section title="Visual inspection">
                <div className="pcms-chip-row">
                  <CheckChip
                    checked={form.visualDirty}
                    onChange={(v) => patch({ visualDirty: v })}
                    label="Dirty"
                  />
                  <CheckChip
                    checked={form.visualSealsIntact}
                    onChange={(v) => patch({ visualSealsIntact: v })}
                    label="Seals intact"
                  />
                  <CheckChip
                    checked={form.visualDisassembled}
                    onChange={(v) => patch({ visualDisassembled: v })}
                    label="Disassembled"
                  />
                  <CheckChip
                    checked={form.visualBrokenSpring}
                    onChange={(v) => patch({ visualBrokenSpring: v })}
                    label="Broken spring"
                  />
                  <CheckChip
                    checked={form.visualPlugged}
                    onChange={(v) => patch({ visualPlugged: v })}
                    label="Plugged"
                  />
                </div>
                <div className="pcms-grid" style={{ marginTop: 12 }}>
                  <Field label="Plugged %">
                    <input
                      type="text"
                      value={form.visualPluggedPct}
                      onChange={(e) => patch({ visualPluggedPct: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Pop result">
                <div className="pcms-grid">
                  <Field label="Valve CDTP (psi)">
                    <input
                      type="text"
                      value={form.valveCdtpPressure}
                      onChange={(e) => patch({ valveCdtpPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Initial pop (psi)">
                    <input
                      type="text"
                      value={form.initialPopPressure}
                      onChange={(e) => patch({ initialPopPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Repop (psi)">
                    <input
                      type="text"
                      value={form.repopPressure}
                      onChange={(e) => patch({ repopPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Leak pressure (psi)">
                    <input
                      type="text"
                      value={form.leakPressure}
                      onChange={(e) => patch({ leakPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Reseat (psi)">
                    <input
                      type="text"
                      value={form.reseatPressure}
                      onChange={(e) => patch({ reseatPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Lift">
                    <input type="text" value={form.lift} onChange={(e) => patch({ lift: e.target.value })} />
                  </Field>
                  <Field label="Blowdown">
                    <input
                      type="text"
                      value={form.blowdown}
                      onChange={(e) => patch({ blowdown: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="No pop / seal tight">
                <div className="pcms-chip-row">
                  <CheckChip
                    checked={form.noPopLeakedTooBad}
                    onChange={(v) => patch({ noPopLeakedTooBad: v })}
                    label="Leaked too bad to pop"
                  />
                  <CheckChip
                    checked={form.noPopStuck}
                    onChange={(v) => patch({ noPopStuck: v })}
                    label="Stuck"
                  />
                  <CheckChip
                    checked={form.tightAfterReseat}
                    onChange={(v) => patch({ tightAfterReseat: v })}
                    label="Tight after reseat"
                  />
                  <CheckChip
                    checked={form.passFailOverride}
                    onChange={(v) => patch({ passFailOverride: v })}
                    label="Pass/fail override"
                  />
                </div>
                <div className="pcms-grid" style={{ marginTop: 12 }}>
                  <Field label="Seal tight pressure (psi)">
                    <input
                      type="text"
                      value={form.sealTightPressure}
                      onChange={(e) => patch({ sealTightPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Seal tight leak rate">
                    <input
                      type="text"
                      value={form.sealTightLeakRate}
                      onChange={(e) => patch({ sealTightLeakRate: e.target.value })}
                    />
                  </Field>
                  <Field label="Override result">
                    <input
                      type="text"
                      value={form.passFailResult}
                      onChange={(e) => patch({ passFailResult: e.target.value })}
                    />
                  </Field>
                  <Field label="Override reason">
                    <input
                      type="text"
                      value={form.passFailReason}
                      onChange={(e) => patch({ passFailReason: e.target.value })}
                    />
                  </Field>
                  <Field label="Comments" wide>
                    <textarea
                      rows={3}
                      value={form.pretestComments}
                      onChange={(e) => patch({ pretestComments: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          ) : null}

          {tab === 'parts' ? (
            <div className="pcms-stack">
              <Section title="Parts condition &amp; work">
                <div className="pcms-parts-scroll">
                  <table className="pcms-parts-table">
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th>Primary condition</th>
                        <th>Secondary condition</th>
                        <th>Work performed</th>
                        <th>Recommendation</th>
                        <th>Prior recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PCMS_PART_NAMES.map((name) => (
                        <tr key={name}>
                          <th scope="row">{name}</th>
                          <td>
                            <select
                              value={form.parts[name].primaryCondition}
                              onChange={(e) => patchPart(name, 'primaryCondition', e.target.value)}
                            >
                              <option value="">—</option>
                              {PCMS_CONDITION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={form.parts[name].secondaryCondition}
                              onChange={(e) => patchPart(name, 'secondaryCondition', e.target.value)}
                            >
                              <option value="">—</option>
                              {PCMS_CONDITION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={form.parts[name].workPerformed}
                              onChange={(e) => patchPart(name, 'workPerformed', e.target.value)}
                            >
                              <option value="">—</option>
                              {PCMS_WORK_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              value={form.parts[name].recommendation}
                              onChange={(e) => patchPart(name, 'recommendation', e.target.value)}
                            >
                              <option value="">—</option>
                              {PCMS_RECOMMENDATION_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={form.parts[name].priorRecommendation}
                              onChange={(e) => patchPart(name, 'priorRecommendation', e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pcms-grid" style={{ marginTop: 12 }}>
                  <Field label="Parts comments" wide>
                    <textarea
                      rows={2}
                      value={form.partsComments}
                      onChange={(e) => patch({ partsComments: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          ) : null}

          {tab === 'final' ? (
            <div className="pcms-stack">
              <Section title="QA / QC">
                <div className="pcms-chip-row">
                  <CheckChip
                    checked={form.qaSpringFreeHeight}
                    onChange={(v) => patch({ qaSpringFreeHeight: v })}
                    label="Measured spring free height"
                  />
                  <CheckChip
                    checked={form.qaDiskSinglePiece}
                    onChange={(v) => patch({ qaDiskSinglePiece: v })}
                    label="Disk (single piece)"
                  />
                  <CheckChip
                    checked={form.qaOpenTopAdjustingBolt}
                    onChange={(v) => patch({ qaOpenTopAdjustingBolt: v })}
                    label="Open top adjusting bolt"
                  />
                  <CheckChip
                    checked={form.qaSpringNoVerified}
                    onChange={(v) => patch({ qaSpringNoVerified: v })}
                    label="Spring no. verified"
                  />
                  <CheckChip
                    checked={form.qaCautionTag}
                    onChange={(v) => patch({ qaCautionTag: v })}
                    label="Caution tag affixed"
                  />
                  <CheckChip
                    checked={form.qaLeadSeals}
                    onChange={(v) => patch({ qaLeadSeals: v })}
                    label="Lead seals & tag affixed"
                  />
                  <CheckChip
                    checked={form.qaCodeStamp}
                    onChange={(v) => patch({ qaCodeStamp: v })}
                    label="Code stamp verified"
                  />
                </div>
              </Section>

              <Section title="Final settings">
                <div className="pcms-grid">
                  <Field label="Final set (psi)">
                    <input
                      type="text"
                      value={form.finalSet}
                      onChange={(e) => patch({ finalSet: e.target.value })}
                    />
                  </Field>
                  <Field label="Final CDTP (psi)">
                    <input
                      type="text"
                      value={form.finalCdtp}
                      onChange={(e) => patch({ finalCdtp: e.target.value })}
                    />
                  </Field>
                  <Field label="Final back (psi)">
                    <input
                      type="text"
                      value={form.finalBack}
                      onChange={(e) => patch({ finalBack: e.target.value })}
                    />
                  </Field>
                  <Field label="Final reseat (psi)">
                    <input
                      type="text"
                      value={form.finalReseat}
                      onChange={(e) => patch({ finalReseat: e.target.value })}
                    />
                  </Field>
                  <Field label="Vacuum (psi)">
                    <input
                      type="text"
                      value={form.finalVacuum}
                      onChange={(e) => patch({ finalVacuum: e.target.value })}
                    />
                  </Field>
                  <Field label="Nozzle ring setting">
                    <input
                      type="text"
                      value={form.finalNozzleRing}
                      onChange={(e) => patch({ finalNozzleRing: e.target.value })}
                    />
                  </Field>
                  <Field label="Guide ring setting">
                    <input
                      type="text"
                      value={form.finalGuideRing}
                      onChange={(e) => patch({ finalGuideRing: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Test info &amp; shop">
                <div className="pcms-grid">
                  <Field label="Seat test pressure (psi)">
                    <input
                      type="text"
                      value={form.seatTestPressure}
                      onChange={(e) => patch({ seatTestPressure: e.target.value })}
                    />
                  </Field>
                  <Field label="Test medium">
                    <input
                      type="text"
                      value={form.finalTestMedium}
                      onChange={(e) => patch({ finalTestMedium: e.target.value })}
                    />
                  </Field>
                  <Field label="Gauge serial no">
                    <input
                      type="text"
                      value={form.gaugeSerialNo}
                      onChange={(e) => patch({ gaugeSerialNo: e.target.value })}
                    />
                  </Field>
                  <Field label="Leak rate">
                    <input
                      type="text"
                      value={form.finalLeakRate}
                      onChange={(e) => patch({ finalLeakRate: e.target.value })}
                    />
                  </Field>
                  <Field label="Gauge calibration date">
                    <input
                      type="date"
                      value={form.gaugeCalibrationDate}
                      onChange={(e) => patch({ gaugeCalibrationDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Valve repair shop">
                    <input
                      type="text"
                      value={form.valveRepairShop}
                      onChange={(e) => patch({ valveRepairShop: e.target.value })}
                    />
                  </Field>
                  <Field label="Representative">
                    <input
                      type="text"
                      value={form.representative}
                      onChange={(e) => patch({ representative: e.target.value })}
                    />
                  </Field>
                  <Field label="Control no">
                    <input
                      type="text"
                      value={form.controlNo}
                      onChange={(e) => patch({ controlNo: e.target.value })}
                    />
                  </Field>
                  <Field label="Recommendation">
                    <select
                      value={form.recommendation}
                      onChange={(e) => patch({ recommendation: e.target.value })}
                    >
                      <option value="">—</option>
                      {PCMS_RECOMMENDATION_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Work performed (summary)" wide>
                    <textarea
                      rows={2}
                      value={form.workPerformedNotes}
                      onChange={(e) => patch({ workPerformedNotes: e.target.value })}
                    />
                  </Field>
                  <Field label="Final comments" wide>
                    <textarea
                      rows={3}
                      value={form.finalComments}
                      onChange={(e) => patch({ finalComments: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          ) : null}

          {tab === 'field' ? (
            <div className="pcms-stack">
              <p className="pcms-intro">
                Field examiner / Area or RTS engineer section from RV-1958 page 3.
              </p>

              <Section title="PRV removal">
                <div className="pcms-grid">
                  <Field label="Name of person performing visual checks" wide>
                    <input
                      type="text"
                      value={form.removalPerson}
                      onChange={(e) => patch({ removalPerson: e.target.value })}
                    />
                  </Field>
                  <Field label="PRV removal date">
                    <input
                      type="date"
                      value={form.removalDate}
                      onChange={(e) => patch({ removalDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Inlet piping">
                    <div className="pcms-inline-choice">
                      <CheckChip
                        checked={form.inletPipingClear}
                        onChange={(v) => patch({ inletPipingClear: v })}
                        label="Clear"
                      />
                      <input
                        type="text"
                        placeholder="% ID plugged"
                        value={form.inletPipingPluggedPct}
                        onChange={(e) => patch({ inletPipingPluggedPct: e.target.value })}
                      />
                    </div>
                  </Field>
                  <Field label="Outlet piping">
                    <div className="pcms-inline-choice">
                      <CheckChip
                        checked={form.outletPipingClear}
                        onChange={(v) => patch({ outletPipingClear: v })}
                        label="Clear"
                      />
                      <input
                        type="text"
                        placeholder="% ID plugged"
                        value={form.outletPipingPluggedPct}
                        onChange={(e) => patch({ outletPipingPluggedPct: e.target.value })}
                      />
                    </div>
                  </Field>
                </div>
              </Section>

              <Section title="PRV installation">
                <div className="pcms-grid">
                  <Field label="Name of person performing visual checks" wide>
                    <input
                      type="text"
                      value={form.installPerson}
                      onChange={(e) => patch({ installPerson: e.target.value })}
                    />
                  </Field>
                  <Field label="PRV installation date">
                    <input
                      type="date"
                      value={form.installDate}
                      onChange={(e) => patch({ installDate: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="pcms-qa-list">
                  <div className="pcms-qa-row">
                    <span>Does the SAP tag# match the ASSET# at the top of this form?</span>
                    <YesNoNa
                      value={form.sapTagMatchesAsset}
                      onChange={(v) => patch({ sapTagMatchesAsset: v === 'na' ? '' : v })}
                    />
                  </div>
                  <div className="pcms-qa-row">
                    <span>Does the set pressure on the PRV Data Plate match the top of this form?</span>
                    <YesNoNa
                      value={form.dataPlateMatchesForm}
                      onChange={(v) => patch({ dataPlateMatchesForm: v === 'na' ? '' : v })}
                    />
                  </div>
                  <div className="pcms-qa-row">
                    <span>Does the Data Plate match the PTP and the P&amp;ID?</span>
                    <YesNoNa
                      value={form.dataPlateMatchesPtp}
                      onChange={(v) => patch({ dataPlateMatchesPtp: v === 'na' ? '' : v })}
                    />
                  </div>
                  <div className="pcms-qa-row">
                    <span>Is the PRV in the proper location in the field?</span>
                    <YesNoNa
                      value={form.properLocation}
                      onChange={(v) => patch({ properLocation: v === 'na' ? '' : v })}
                    />
                  </div>
                  <div className="pcms-qa-row">
                    <span>No blinds, closed valves, or piping obstructions present?</span>
                    <YesNoNa
                      value={form.noObstructions}
                      onChange={(v) => patch({ noObstructions: v === 'na' ? '' : v })}
                    />
                  </div>
                  <div className="pcms-qa-row">
                    <span>Bonnet vents open with protective elbow pointing down?</span>
                    <YesNoNa value={form.bonnetVentsOk} onChange={(v) => patch({ bonnetVentsOk: v })} allowNa />
                  </div>
                  <div className="pcms-qa-row">
                    <span>Drain holes free of corrosion and not plugged?</span>
                    <YesNoNa value={form.drainHolesOk} onChange={(v) => patch({ drainHolesOk: v })} allowNa />
                  </div>
                </div>
                <div className="pcms-grid" style={{ marginTop: 12 }}>
                  <Field label="MOC #">
                    <input
                      type="text"
                      value={form.mocNumber}
                      onChange={(e) => patch({ mocNumber: e.target.value })}
                    />
                  </Field>
                  <Field label="Field comments" wide>
                    <textarea
                      rows={3}
                      value={form.fieldComments}
                      onChange={(e) => patch({ fieldComments: e.target.value })}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          ) : null}
        </div>

        <div className="pcms-modal-actions">
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void resetFromCard()}
            disabled={loading || saving}
          >
            Reset from job card
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void persist()}
            disabled={loading || saving}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            className="button-primary pcms-print-btn"
            onClick={() => void print()}
            disabled={loading || saving}
          >
            Print PCMS
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
