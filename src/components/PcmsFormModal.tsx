import { useEffect, useState, type ReactNode } from 'react'
import { useToast } from './ToastNotification'
import {
  clearSavedPcmsForm,
  loadPcmsFormForValve,
  PCMS_CONDITION_OPTIONS,
  PCMS_PART_NAMES,
  PCMS_RECOMMENDATION_OPTIONS,
  PCMS_WORK_OPTIONS,
  pcmsFormFromValve,
  savePcmsForm,
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

function Field({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={`pcms-field${wide ? ' pcms-field--wide' : ''}`}>
      <span>{label}</span>
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
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as YesNoNaValue)}>
      <option value="">—</option>
      <option value="yes">YES</option>
      <option value="no">NO</option>
      {allowNa ? <option value="na">N/A</option> : null}
    </select>
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
  const [tab, setTab] = useState<TabId>('relief')
  const [form, setForm] = useState<PcmsFormState>(() => loadPcmsFormForValve(valve))

  useEffect(() => {
    setForm(loadPcmsFormForValve(valve))
    setTab('relief')
  }, [valve.id])

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

  const persist = () => {
    savePcmsForm(valve.id, form)
    showToast('PCMS draft saved on this device')
  }

  const print = () => {
    savePcmsForm(valve.id, form)
    const { error } = openPcmsFormPrint(form, { valveId: valve.valve_id })
    if (error) showToast(error)
  }

  const resetFromCard = () => {
    if (!window.confirm('Replace the form with job-card defaults? Unsaved edits in this draft will be lost.')) {
      return
    }
    clearSavedPcmsForm(valve.id)
    setForm(pcmsFormFromValve(valve))
    showToast('PCMS reset from job card')
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel pcms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcms-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
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

        <div className="pcms-modal-body">
          {tab === 'relief' ? (
            <div className="pcms-grid">
              <Field label="Report date">
                <input type="date" value={form.reportDate} onChange={(e) => patch({ reportDate: e.target.value })} />
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
              <Field label="Fluid state">
                <input type="text" value={form.fluidState} onChange={(e) => patch({ fluidState: e.target.value })} />
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
              <Field label="Test medium">
                <input type="text" value={form.testMedium} onChange={(e) => patch({ testMedium: e.target.value })} />
              </Field>
              <Field label="Governing code">
                <input
                  type="text"
                  value={form.governingCode}
                  onChange={(e) => patch({ governingCode: e.target.value })}
                />
              </Field>
              <Field label="Shop No">
                <input type="text" value={form.shopNo} onChange={(e) => patch({ shopNo: e.target.value })} />
              </Field>
              <Field label="Max test pressure (psi)">
                <input
                  type="text"
                  value={form.maxTestPressure}
                  onChange={(e) => patch({ maxTestPressure: e.target.value })}
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
                <input type="text" value={form.freeHeight} onChange={(e) => patch({ freeHeight: e.target.value })} />
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
              <Field label="CDTP (psi)">
                <input type="text" value={form.cdtp} onChange={(e) => patch({ cdtp: e.target.value })} />
              </Field>
              <Field label="Set pressure (psi)">
                <input
                  type="text"
                  value={form.setPressure}
                  onChange={(e) => patch({ setPressure: e.target.value })}
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
              <Field label="Inlet size (in)">
                <input type="text" value={form.inletSize} onChange={(e) => patch({ inletSize: e.target.value })} />
              </Field>
              <Field label="Inlet rating (psi)">
                <input
                  type="text"
                  value={form.inletRating}
                  onChange={(e) => patch({ inletRating: e.target.value })}
                />
              </Field>
              <Field label="Inlet type">
                <input type="text" value={form.inletType} onChange={(e) => patch({ inletType: e.target.value })} />
              </Field>
              <Field label="Outlet size (in)">
                <input type="text" value={form.outletSize} onChange={(e) => patch({ outletSize: e.target.value })} />
              </Field>
              <Field label="Outlet rating (psi)">
                <input
                  type="text"
                  value={form.outletRating}
                  onChange={(e) => patch({ outletRating: e.target.value })}
                />
              </Field>
              <Field label="Outlet type">
                <input type="text" value={form.outletType} onChange={(e) => patch({ outletType: e.target.value })} />
              </Field>
            </div>
          ) : null}

          {tab === 'pretest' ? (
            <div className="pcms-grid">
              <div className="pcms-check-row pcms-field--wide">
                <label>
                  <input
                    type="checkbox"
                    checked={form.visualDirty}
                    onChange={(e) => patch({ visualDirty: e.target.checked })}
                  />{' '}
                  Dirty
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.visualSealsIntact}
                    onChange={(e) => patch({ visualSealsIntact: e.target.checked })}
                  />{' '}
                  Seals intact
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.visualDisassembled}
                    onChange={(e) => patch({ visualDisassembled: e.target.checked })}
                  />{' '}
                  Disassembled
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.visualBrokenSpring}
                    onChange={(e) => patch({ visualBrokenSpring: e.target.checked })}
                  />{' '}
                  Broken spring
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.visualPlugged}
                    onChange={(e) => patch({ visualPlugged: e.target.checked })}
                  />{' '}
                  Plugged
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.noPopLeakedTooBad}
                    onChange={(e) => patch({ noPopLeakedTooBad: e.target.checked })}
                  />{' '}
                  Leaked too bad to pop
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.noPopStuck}
                    onChange={(e) => patch({ noPopStuck: e.target.checked })}
                  />{' '}
                  Stuck
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.tightAfterReseat}
                    onChange={(e) => patch({ tightAfterReseat: e.target.checked })}
                  />{' '}
                  Tight after reseat
                </label>
              </div>
              <Field label="Plugged %">
                <input
                  type="text"
                  value={form.visualPluggedPct}
                  onChange={(e) => patch({ visualPluggedPct: e.target.value })}
                />
              </Field>
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
                <input type="text" value={form.blowdown} onChange={(e) => patch({ blowdown: e.target.value })} />
              </Field>
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
              <label className="pcms-field">
                <span>
                  <input
                    type="checkbox"
                    checked={form.passFailOverride}
                    onChange={(e) => patch({ passFailOverride: e.target.checked })}
                  />{' '}
                  Pass/fail override
                </span>
                <input
                  type="text"
                  placeholder="Result"
                  value={form.passFailResult}
                  onChange={(e) => patch({ passFailResult: e.target.value })}
                />
              </label>
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
          ) : null}

          {tab === 'parts' ? (
            <div className="pcms-parts-wrap">
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
              <label className="pcms-field pcms-field--wide">
                <span>Parts comments</span>
                <textarea
                  rows={2}
                  value={form.partsComments}
                  onChange={(e) => patch({ partsComments: e.target.value })}
                />
              </label>
            </div>
          ) : null}

          {tab === 'final' ? (
            <div className="pcms-grid">
              <div className="pcms-check-row pcms-field--wide">
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaSpringFreeHeight}
                    onChange={(e) => patch({ qaSpringFreeHeight: e.target.checked })}
                  />{' '}
                  Measured spring free height
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaDiskSinglePiece}
                    onChange={(e) => patch({ qaDiskSinglePiece: e.target.checked })}
                  />{' '}
                  Disk (single piece)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaOpenTopAdjustingBolt}
                    onChange={(e) => patch({ qaOpenTopAdjustingBolt: e.target.checked })}
                  />{' '}
                  Open top adjusting bolt
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaSpringNoVerified}
                    onChange={(e) => patch({ qaSpringNoVerified: e.target.checked })}
                  />{' '}
                  Spring no. verified
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaCautionTag}
                    onChange={(e) => patch({ qaCautionTag: e.target.checked })}
                  />{' '}
                  Caution tag affixed
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaLeadSeals}
                    onChange={(e) => patch({ qaLeadSeals: e.target.checked })}
                  />{' '}
                  Lead seals &amp; tag affixed
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.qaCodeStamp}
                    onChange={(e) => patch({ qaCodeStamp: e.target.checked })}
                  />{' '}
                  Code stamp verified
                </label>
              </div>
              <Field label="Final set (psi)">
                <input type="text" value={form.finalSet} onChange={(e) => patch({ finalSet: e.target.value })} />
              </Field>
              <Field label="Final CDTP (psi)">
                <input type="text" value={form.finalCdtp} onChange={(e) => patch({ finalCdtp: e.target.value })} />
              </Field>
              <Field label="Final back (psi)">
                <input type="text" value={form.finalBack} onChange={(e) => patch({ finalBack: e.target.value })} />
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
                <input type="text" value={form.controlNo} onChange={(e) => patch({ controlNo: e.target.value })} />
              </Field>
              <Field label="Work performed (summary)" wide>
                <textarea
                  rows={2}
                  value={form.workPerformedNotes}
                  onChange={(e) => patch({ workPerformedNotes: e.target.value })}
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
              <Field label="Final comments" wide>
                <textarea
                  rows={3}
                  value={form.finalComments}
                  onChange={(e) => patch({ finalComments: e.target.value })}
                />
              </Field>
            </div>
          ) : null}

          {tab === 'field' ? (
            <div className="pcms-grid">
              <p className="pcms-field--wide status-breakdown-note">
                Field examiner / Area or RTS engineer section from RV-1958 page 3.
              </p>
              <Field label="Removal checked by">
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
              <label className="pcms-field">
                <span>
                  <input
                    type="checkbox"
                    checked={form.inletPipingClear}
                    onChange={(e) => patch({ inletPipingClear: e.target.checked })}
                  />{' '}
                  Inlet piping clear
                </span>
                <input
                  type="text"
                  placeholder="% ID plugged"
                  value={form.inletPipingPluggedPct}
                  onChange={(e) => patch({ inletPipingPluggedPct: e.target.value })}
                />
              </label>
              <label className="pcms-field">
                <span>
                  <input
                    type="checkbox"
                    checked={form.outletPipingClear}
                    onChange={(e) => patch({ outletPipingClear: e.target.checked })}
                  />{' '}
                  Outlet piping clear
                </span>
                <input
                  type="text"
                  placeholder="% ID plugged"
                  value={form.outletPipingPluggedPct}
                  onChange={(e) => patch({ outletPipingPluggedPct: e.target.value })}
                />
              </label>
              <Field label="Install checked by">
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
              <Field label="SAP tag matches asset #">
                <YesNoNa
                  value={form.sapTagMatchesAsset}
                  onChange={(v) => patch({ sapTagMatchesAsset: v === 'na' ? '' : v })}
                />
              </Field>
              <Field label="Data plate set matches form">
                <YesNoNa
                  value={form.dataPlateMatchesForm}
                  onChange={(v) => patch({ dataPlateMatchesForm: v === 'na' ? '' : v })}
                />
              </Field>
              <Field label="Data plate matches PTP / P&ID">
                <YesNoNa
                  value={form.dataPlateMatchesPtp}
                  onChange={(v) => patch({ dataPlateMatchesPtp: v === 'na' ? '' : v })}
                />
              </Field>
              <Field label="Proper field location">
                <YesNoNa
                  value={form.properLocation}
                  onChange={(v) => patch({ properLocation: v === 'na' ? '' : v })}
                />
              </Field>
              <Field label="No blinds / obstructions">
                <YesNoNa
                  value={form.noObstructions}
                  onChange={(v) => patch({ noObstructions: v === 'na' ? '' : v })}
                />
              </Field>
              <Field label="Bonnet vents OK">
                <YesNoNa value={form.bonnetVentsOk} onChange={(v) => patch({ bonnetVentsOk: v })} allowNa />
              </Field>
              <Field label="Drain holes OK">
                <YesNoNa value={form.drainHolesOk} onChange={(v) => patch({ drainHolesOk: v })} allowNa />
              </Field>
              <Field label="MOC #">
                <input type="text" value={form.mocNumber} onChange={(e) => patch({ mocNumber: e.target.value })} />
              </Field>
              <Field label="Field comments" wide>
                <textarea
                  rows={3}
                  value={form.fieldComments}
                  onChange={(e) => patch({ fieldComments: e.target.value })}
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="modal-actions pcms-modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="button-secondary" onClick={resetFromCard}>
            Reset from job card
          </button>
          <button type="button" className="button-secondary" onClick={persist}>
            Save draft
          </button>
          <button type="button" className="button-primary" onClick={print}>
            Print PCMS
          </button>
        </div>
      </div>
    </div>
  )
}
