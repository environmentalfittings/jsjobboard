import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from './ToastNotification'
import { ItpPlanPartsGrid } from './ItpPlanPartsGrid'
import {
  applyInspectOutcomeChange,
  applyOptionalReworkToggle,
  ItpPlanPartOperationCards,
} from './itp/ItpPlanPartOperationCards'
import { ItpPlanStepCard } from './ItpPlanStepCard'
import {
  buildPartOperationStepNumbers,
  getActiveItpPlanStepIds,
  getItpPlanStepDef,
  ITP_MANDATORY_STEP,
  ITP_OVERALL_VALVE_STEPS,
  itpStepRequiresSignOff,
  type ItpOverallStepId,
  type ItpPartOperationId,
} from '../constants/itpProcessSteps'
import { getValvePartProfile } from '../constants/itpValveParts'
import { loadItpProcessPlan, saveItpProcessPlan } from '../lib/itpPlanStorage'
import type { ItpOptionalReworkOp, ItpPartInspectOutcome } from '../lib/itpPartWorkflow'
import type { ItpPlanStepState, ItpProcessPlanPayload } from '../types/itpPlan'
import {
  countActivePartOperations,
  createItpPlanValvePart,
  emptyItpPlanStepState,
  ensureStemMachine1State,
  normalizeItpProcessPlan,
} from '../types/itpPlan'
import { createItpCustomOverallStep, isCustomOverallStepId } from '../constants/itpProcessSteps'
import type { Valve } from '../types'

type ItpPlanEditorProps = {
  valve: Valve
  onClose: () => void
  readOnly?: boolean
}

function SnapshotRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="itp-plan-snapshot-row">
      <span className="itp-plan-snapshot-label">{label}</span>
      <span className="itp-plan-snapshot-value">{(value ?? '').trim() || '—'}</span>
    </div>
  )
}

export function ItpPlanEditor({ valve, onClose, readOnly = false }: ItpPlanEditorProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [signingKey, setSigningKey] = useState<string | null>(null)
  const [signOffDrafts, setSignOffDrafts] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<ItpProcessPlanPayload | null>(null)
  const [hasLegacyInspection, setHasLegacyInspection] = useState(false)
  const [newPartName, setNewPartName] = useState('')
  const [newOverallCondition, setNewOverallCondition] = useState('')

  const selectedSet = useMemo(() => new Set(plan?.selectedSteps ?? []), [plan?.selectedSteps])
  const selectedCustomSet = useMemo(
    () => new Set(plan?.selectedCustomOverallSteps ?? []),
    [plan?.selectedCustomOverallSteps],
  )
  const activeStepIds = useMemo(
    () =>
      plan
        ? getActiveItpPlanStepIds(
            plan.selectedSteps,
            plan.customOverallSteps,
            plan.selectedCustomOverallSteps,
          )
        : [ITP_MANDATORY_STEP.id],
    [plan],
  )
  const partsProfile = useMemo(
    () => getValvePartProfile(plan?.valvePartsProfileId ?? 'generic'),
    [plan?.valvePartsProfileId],
  )
  const partOperationCount = useMemo(
    () => (plan ? countActivePartOperations(plan.valveParts) : 0),
    [plan],
  )
  const partStepNumbers = useMemo(
    () => (plan ? buildPartOperationStepNumbers(plan.valveParts, activeStepIds.length) : new Map<string, number>()),
    [plan, activeStepIds],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await loadItpProcessPlan(valve)
      setPlan(normalizeItpProcessPlan(result.plan, valve))
      setHasLegacyInspection(result.hasLegacyInspection)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load ITP')
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [showToast, valve])

  useEffect(() => {
    void load()
  }, [load])

  const updatePlan = (updater: (prev: ItpProcessPlanPayload) => ItpProcessPlanPayload) => {
    setPlan((prev) => (prev ? normalizeItpProcessPlan(updater(prev), valve) : prev))
  }

  const updateStepDetail = (stepId: string, patch: Partial<ItpPlanStepState>) => {
    updatePlan((prev) => {
      const current = prev.stepDetails[stepId] ?? emptyItpPlanStepState()
      return {
        ...prev,
        stepDetails: {
          ...prev.stepDetails,
          [stepId]: { ...current, ...patch },
        },
      }
    })
  }

  const toggleOverallStep = (stepId: ItpOverallStepId) => {
    updatePlan((prev) => {
      const next = new Set(prev.selectedSteps)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return { ...prev, selectedSteps: [...next] }
    })
  }

  const updatePartOperationDetail = (
    partId: string,
    operationId: ItpPartOperationId,
    patch: Partial<ItpPlanStepState>,
  ) => {
    updatePlan((prev) => ({
      ...prev,
      valveParts: prev.valveParts.map((part) => {
        if (part.id !== partId) return part
        const current = part.operationDetails[operationId] ?? emptyItpPlanStepState()
        return {
          ...part,
          operationDetails: {
            ...part.operationDetails,
            [operationId]: { ...current, ...patch },
          },
        }
      }),
    }))
  }

  const updateInspectOutcome = (partId: string, outcome: Exclude<ItpPartInspectOutcome, ''>) => {
    updatePlan((prev) => ({
      ...prev,
      valveParts: prev.valveParts.map((part) =>
        part.id === partId ? applyInspectOutcomeChange(part, outcome) : part,
      ),
    }))
  }

  const toggleOptionalRework = (partId: string, opId: ItpOptionalReworkOp) => {
    updatePlan((prev) => ({
      ...prev,
      valveParts: prev.valveParts.map((part) =>
        part.id === partId ? applyOptionalReworkToggle(part, opId) : part,
      ),
    }))
  }

  const toggleCustomOverallStep = (stepId: string) => {
    updatePlan((prev) => {
      const next = new Set(prev.selectedCustomOverallSteps)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return { ...prev, selectedCustomOverallSteps: [...next] }
    })
  }

  const selectAllOverall = () => {
    updatePlan((prev) => ({
      ...prev,
      selectedSteps: ITP_OVERALL_VALVE_STEPS.map((s) => s.id),
      selectedCustomOverallSteps: prev.customOverallSteps.map((s) => s.id),
    }))
  }

  const clearOverallSteps = () => {
    updatePlan((prev) => ({ ...prev, selectedSteps: [], selectedCustomOverallSteps: [] }))
  }

  const addCustomOverallCondition = () => {
    const label = newOverallCondition.trim()
    if (!label) {
      showToast('Enter a condition name first.')
      return
    }
    const step = createItpCustomOverallStep(label)
    updatePlan((prev) => ({
      ...prev,
      customOverallSteps: [...prev.customOverallSteps, step],
      selectedCustomOverallSteps: [...prev.selectedCustomOverallSteps, step.id],
    }))
    setNewOverallCondition('')
    showToast(`Added condition: ${label}`)
  }

  const removeCustomOverallCondition = (stepId: string) => {
    updatePlan((prev) => {
      const stepDetails = { ...prev.stepDetails }
      delete stepDetails[stepId]
      return {
        ...prev,
        customOverallSteps: prev.customOverallSteps.filter((s) => s.id !== stepId),
        selectedCustomOverallSteps: prev.selectedCustomOverallSteps.filter((id) => id !== stepId),
        stepDetails,
      }
    })
  }

  const addCustomPart = () => {
    const label = newPartName.trim()
    if (!label) {
      showToast('Enter a part name first.')
      return
    }
    const id = `custom_${crypto.randomUUID()}`
    updatePlan((prev) => ({
      ...prev,
      valveParts: [...prev.valveParts, createItpPlanValvePart({ id, label, isCustom: true })],
    }))
    setNewPartName('')
    showToast(`Added part: ${label}`)
  }

  const removeCustomPart = (partId: string) => {
    updatePlan((prev) => ({
      ...prev,
      valveParts: prev.valveParts.filter((part) => part.id !== partId),
    }))
  }

  const persistPlan = async (nextPlan: ItpProcessPlanPayload, message: string) => {
    const normalized = normalizeItpProcessPlan(nextPlan, valve)
    await saveItpProcessPlan(valve, normalized)
    setPlan(normalized)
    showToast(message)
  }

  const save = async () => {
    if (readOnly || !plan) return
    setSaving(true)
    try {
      await persistPlan(plan, 'ITP saved')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save ITP')
    } finally {
      setSaving(false)
    }
  }

  const signOffOverallStep = async (stepId: string) => {
    if (!plan) return
    const key = stepId
    const initials = (signOffDrafts[key] ?? plan.stepDetails[stepId]?.signOff?.techInitials ?? '')
      .trim()
      .slice(0, 6)
      .toUpperCase()
    if (!initials) {
      showToast('Enter technician initials before sign-off.')
      return
    }
    setSigningKey(key)
    try {
      const nextPlan = normalizeItpProcessPlan(
        {
          ...plan,
          stepDetails: {
            ...plan.stepDetails,
            [stepId]: {
              ...(plan.stepDetails[stepId] ?? emptyItpPlanStepState()),
              signOff: { techInitials: initials, signedAt: new Date().toISOString() },
            },
          },
        },
        valve,
      )
      await persistPlan(
        nextPlan,
        `${getItpPlanStepDef(stepId, plan.customOverallSteps).label} signed off`,
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save sign-off')
    } finally {
      setSigningKey(null)
    }
  }

  const signOffPartOperation = async (
    partId: string,
    operationId: ItpPartOperationId,
    role: 'tech' | 'qc',
  ) => {
    if (!plan) return
    const key = `${role}:${partId}:${operationId}`
    const part = plan.valveParts.find((p) => p.id === partId)
    const rawExisting = part?.operationDetails[operationId]
    const existing =
      partId === 'stem' && operationId === 'machine_1'
        ? ensureStemMachine1State(rawExisting)
        : (rawExisting ?? emptyItpPlanStepState())

    if (role === 'qc' && !existing.signOff) {
      showToast('Technician must sign off before QA/QC can verify.')
      return
    }

    const initials = (signOffDrafts[key] ?? (role === 'tech' ? existing.signOff?.techInitials : existing.qcSignOff?.techInitials) ?? '')
      .trim()
      .slice(0, 6)
      .toUpperCase()
    if (!initials) {
      showToast(role === 'tech' ? 'Enter technician initials before sign-off.' : 'Enter QA/QC initials before verification.')
      return
    }

    setSigningKey(key)
    try {
      const nextPlan = normalizeItpProcessPlan(
        {
          ...plan,
          valveParts: plan.valveParts.map((p) => {
            if (p.id !== partId) return p
            const detail =
              partId === 'stem' && operationId === 'machine_1'
                ? ensureStemMachine1State(p.operationDetails[operationId])
                : (p.operationDetails[operationId] ?? emptyItpPlanStepState())
            const signOff = { techInitials: initials, signedAt: new Date().toISOString() }
            return {
              ...p,
              operationDetails: {
                ...p.operationDetails,
                [operationId]: {
                  ...detail,
                  ...(role === 'tech' ? { signOff } : { qcSignOff: signOff }),
                },
              },
            }
          }),
        },
        valve,
      )
      const label =
        role === 'qc'
          ? 'QA/QC verified'
          : operationId === 'acceptable'
            ? 'Part accepted'
            : 'Technician signed off'
      await persistPlan(nextPlan, label)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save sign-off')
    } finally {
      setSigningKey(null)
    }
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <p className="placeholder-copy">Loading ITP…</p>
      </section>
    )
  }

  if (!plan) {
    return (
      <section className="dashboard-page">
        <p className="placeholder-copy">Could not load ITP.</p>
      </section>
    )
  }

  let stepCounter = 0

  return (
    <section className="dashboard-page itp-plan-page">
      <div className="dashboard-title-row">
        <div>
          <h2 className="dashboard-title">ITP — {valve.valve_id}</h2>
          <p className="placeholder-copy itp-plan-subtitle">
            Overall valve steps apply to the whole job. Assign machine, weld, and inspect work to individual parts below.
            Detailed inspection checklists live on the{' '}
            <Link to={`/traveler/${encodeURIComponent(valve.valve_id)}/inspection`}>Traveler inspection</Link> page.
          </p>
        </div>
        <div className="technicians-page-actions">
          {!readOnly ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => void save()}
              disabled={saving || readOnly || Boolean(signingKey)}
            >
              {saving ? 'Saving…' : 'Save ITP'}
            </button>
          ) : null}
          <button type="button" className="button-secondary" onClick={onClose} disabled={saving || readOnly || Boolean(signingKey)}>
            Close
          </button>
        </div>
      </div>

      {readOnly ? (
        <p className="placeholder-copy">View only — ask an Admin or Manager to change the ITP.</p>
      ) : null}

      {hasLegacyInspection ? (
        <div className="itp-plan-legacy-banner">
          This job has an older detailed inspection checklist. It is now on the{' '}
          <Link to={`/traveler/${encodeURIComponent(valve.valve_id)}/inspection`}>Traveler inspection</Link> page.
        </div>
      ) : null}

      <section className="dashboard-panel itp-plan-panel itp-plan-checkbox-panel">
        <div className="itp-plan-steps-head">
          <div>
            <h3>Overall valve operations</h3>
            <p className="modal-save-hint-subtle">
              Assembly, test, paint, and shipping apply to the whole valve. <strong>Traveler started</strong> is always
              step 1. Add custom conditions (actuator, special handling, etc.) as needed.
            </p>
          </div>
          <div className="itp-plan-steps-actions">
            <button type="button" className="button-secondary admin-list-btn" onClick={selectAllOverall} disabled={saving || readOnly}>
              Select all
            </button>
            <button type="button" className="button-secondary admin-list-btn" onClick={clearOverallSteps} disabled={saving || readOnly}>
              Clear
            </button>
          </div>
        </div>
        <div className="itp-plan-checkbox-bar">
          <span className="itp-plan-checkbox-pill itp-plan-checkbox-pill--required">{ITP_MANDATORY_STEP.label}</span>
          {ITP_OVERALL_VALVE_STEPS.map((step) => (
            <label key={step.id} className="itp-plan-checkbox-pill">
              <input
                type="checkbox"
                checked={selectedSet.has(step.id as ItpOverallStepId)}
                onChange={() => toggleOverallStep(step.id as ItpOverallStepId)}
                disabled={saving || readOnly}
              />
              <span>{step.label}</span>
            </label>
          ))}
          {plan.customOverallSteps.map((step) => (
            <label key={step.id} className="itp-plan-checkbox-pill itp-plan-checkbox-pill--custom-overall">
              <input
                type="checkbox"
                checked={selectedCustomSet.has(step.id)}
                onChange={() => toggleCustomOverallStep(step.id)}
                disabled={saving || readOnly}
              />
              <span>{step.label}</span>
              <button
                type="button"
                className="itp-plan-custom-overall-remove"
                onClick={(e) => {
                  e.preventDefault()
                  removeCustomOverallCondition(step.id)
                }}
                disabled={saving || readOnly}
                title="Remove condition"
                aria-label={`Remove ${step.label}`}
              >
                ×
              </button>
            </label>
          ))}
        </div>
        <div className="itp-plan-add-part-row itp-plan-add-overall-row">
          <input
            type="text"
            className="itp-plan-add-part-input"
            value={newOverallCondition}
            onChange={(e) => setNewOverallCondition(e.target.value)}
            placeholder="Other condition (e.g. Actuator, Special handling)…"
            disabled={saving || readOnly}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomOverallCondition()
              }
            }}
          />
          <button type="button" className="button-secondary" onClick={addCustomOverallCondition} disabled={saving || readOnly}>
            + Add condition
          </button>
        </div>
        <p className="itp-plan-step-count">
          {activeStepIds.length} overall step{activeStepIds.length === 1 ? '' : 's'}
          {partOperationCount > 0 ? ` · ${partOperationCount} part operation${partOperationCount === 1 ? '' : 's'}` : ''}
        </p>
      </section>

      <section className="dashboard-panel itp-plan-panel itp-plan-parts-panel">
        <div className="itp-plan-steps-head">
          <div>
            <h3>Valve parts — {partsProfile.label}</h3>
            <p className="modal-save-hint-subtle">
              For each part, choose <strong>Inspect</strong> or <strong>N/A</strong>. After inspection, mark the part
              acceptable or rework required — machine / weld steps unlock only when rework is needed.
            </p>
          </div>
        </div>

        <ItpPlanPartsGrid
          valveRowId={valve.id}
          partsProfileId={plan.valvePartsProfileId}
          parts={plan.valveParts}
          saving={saving}
          plan={plan}
          onChange={(valveParts) => updatePlan((prev) => ({ ...prev, valveParts }))}
          onPersist={persistPlan}
          onRemoveCustomPart={removeCustomPart}
          showToast={showToast}
          renderPartSteps={(part) => (
            <ItpPlanPartOperationCards
              part={part}
              stepNumbers={partStepNumbers}
              saving={saving}
              signingKey={signingKey}
              signOffDrafts={signOffDrafts}
              onSignOffDraftsChange={setSignOffDrafts}
              onPartOperationDetail={(operationId, patch) =>
                updatePartOperationDetail(part.id, operationId, patch)
              }
              onPartSignOff={(operationId, role) => void signOffPartOperation(part.id, operationId, role)}
              onInspectOutcomeChange={(outcome) => updateInspectOutcome(part.id, outcome)}
              onToggleOptionalRework={(opId) => toggleOptionalRework(part.id, opId)}
            />
          )}
        />

        <div className="itp-plan-add-part-row">
          <input
            type="text"
            className="itp-plan-add-part-input"
            value={newPartName}
            onChange={(e) => setNewPartName(e.target.value)}
            placeholder="Other part name…"
            disabled={saving || readOnly}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomPart()
              }
            }}
          />
          <button type="button" className="button-secondary" onClick={addCustomPart} disabled={saving || readOnly}>
            + Add part
          </button>
        </div>
      </section>

      <div className="itp-plan-body">
        <section className="dashboard-panel itp-plan-panel itp-plan-snapshot-panel">
          <h3>From job card</h3>
          <div className="itp-plan-snapshot-grid">
            <SnapshotRow label="Customer" value={plan.valveSnapshot.customer} />
            <SnapshotRow label="Size" value={plan.valveSnapshot.size} />
            <SnapshotRow label="Pressure class" value={plan.valveSnapshot.pressureClass} />
            <SnapshotRow label="Valve type" value={plan.valveSnapshot.valveType} />
            <SnapshotRow label="Job type" value={plan.valveSnapshot.jobType} />
            <SnapshotRow label="Finish cell" value={plan.valveSnapshot.cell} />
            <SnapshotRow label="Test type" value={plan.valveSnapshot.testType} />
            <SnapshotRow label="Due date" value={plan.valveSnapshot.dueDate} />
          </div>
        </section>

        <section className="itp-plan-populated">
          <h3 className="itp-plan-populated-title">ITP steps</h3>

          <div className="itp-plan-section-label">Overall valve</div>
          <div className="itp-plan-step-cards">
            {activeStepIds.map((stepId) => {
              stepCounter += 1
              const def = getItpPlanStepDef(stepId, plan.customOverallSteps)
              const detail = plan.stepDetails[stepId] ?? emptyItpPlanStepState()
              const key = stepId
              const isCustom = isCustomOverallStepId(stepId)
              return (
                <ItpPlanStepCard
                  key={stepId}
                  stepNumber={stepCounter}
                  title={def.label}
                  hint={isCustom ? 'Custom overall valve condition' : def.hint}
                  alwaysIncluded={def.alwaysIncluded}
                  requiresSignOff={itpStepRequiresSignOff(stepId)}
                  detail={detail}
                  saving={saving}
                  signing={signingKey === key}
                  initials={signOffDrafts[key] ?? detail.signOff?.techInitials ?? ''}
                  onInitialsChange={(value) => setSignOffDrafts((prev) => ({ ...prev, [key]: value }))}
                  onInstructionsChange={(value) => updateStepDetail(stepId, { workInstructions: value })}
                  onSignOff={() => void signOffOverallStep(stepId)}
                />
              )
            })}
          </div>

          {partOperationCount > 0 ? (
            <p className="modal-save-hint-subtle itp-plan-populated-hint">
              Part-specific steps ({partOperationCount}) are shown inline under each part above.
            </p>
          ) : (
            <p className="modal-save-hint-subtle itp-plan-populated-hint">
              Select operations on valve parts above to add part-specific steps (machine, weld, inspect, N/A, etc.).
            </p>
          )}

          <section className="dashboard-panel itp-plan-panel itp-plan-notes-panel">
            <h3>Plan notes</h3>
            <textarea
              className="modal-textarea"
              rows={5}
              value={plan.notes}
              onChange={(e) => setPlan((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
              placeholder="Special instructions, hold points, customer requirements…"
              disabled={saving || readOnly || Boolean(signingKey)}
            />
          </section>
        </section>
      </div>
    </section>
  )
}
