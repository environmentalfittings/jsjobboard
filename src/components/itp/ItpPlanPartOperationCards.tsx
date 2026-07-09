import { ItpStemMachine1Card } from './ItpStemMachine1Card'
import { ItpPartInspectCard } from './ItpPartInspectCard'
import { ItpPartAcceptableCard } from './ItpPartAcceptableCard'
import { ItpPlanStepCard } from '../ItpPlanStepCard'
import { ITP_PART_OPERATIONS, type ItpPartOperationId } from '../../constants/itpProcessSteps'
import {
  getVisiblePartOperations,
  isInspectSigned,
  type ItpOptionalReworkOp,
  type ItpPartInspectOutcome,
} from '../../lib/itpPartWorkflow'
import type { ItpPlanStepState, ItpPlanValvePart } from '../../types/itpPlan'
import { emptyItpPlanStepState, ensureStemMachine1State } from '../../types/itpPlan'
import { syncPartSelectedOperations } from '../../lib/itpPartWorkflow'

const OPTIONAL_REWORK_OPS: { id: ItpOptionalReworkOp; label: string }[] = [
  { id: 'pt', label: 'PT' },
  { id: 'grind', label: 'Grind' },
]

type ItpPlanPartOperationCardsProps = {
  part: ItpPlanValvePart
  stepNumbers: Map<string, number>
  saving: boolean
  signingKey: string | null
  signOffDrafts: Record<string, string>
  onSignOffDraftsChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  onPartOperationDetail: (operationId: ItpPartOperationId, patch: Partial<ItpPlanStepState>) => void
  onPartSignOff: (operationId: ItpPartOperationId, role: 'tech' | 'qc') => void
  onInspectOutcomeChange: (outcome: Exclude<ItpPartInspectOutcome, ''>) => void
  onToggleOptionalRework: (opId: ItpOptionalReworkOp) => void
}

export function ItpPlanPartOperationCards({
  part,
  stepNumbers,
  saving,
  signingKey,
  signOffDrafts,
  onSignOffDraftsChange,
  onPartOperationDetail,
  onPartSignOff,
  onInspectOutcomeChange,
  onToggleOptionalRework,
}: ItpPlanPartOperationCardsProps) {
  const visibleOps = getVisiblePartOperations(part)
  if (visibleOps.length === 0) return null

  const inspectSigned = isInspectSigned(part)
  const showOptionalReworkBar = part.inspectOutcome === 'rework' && inspectSigned

  return (
    <div className="itp-plan-part-inline-steps">
      {showOptionalReworkBar ? (
        <div className="itp-plan-optional-rework-bar">
          <span className="itp-plan-optional-rework-label">Optional rework</span>
          {OPTIONAL_REWORK_OPS.map((op) => {
            const active = part.optionalReworkOps.includes(op.id)
            return (
              <button
                key={op.id}
                type="button"
                className={`itp-plan-op-chip itp-plan-op-chip--small${active ? ' itp-plan-op-chip--on' : ''}`}
                aria-pressed={active}
                onClick={() => onToggleOptionalRework(op.id)}
                disabled={saving}
              >
                {op.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {part.inspectOutcome === 'rework' && !inspectSigned ? (
        <p className="itp-plan-rework-wait-hint">Sign off inspection to unlock machine 1, weld, and machine 2.</p>
      ) : null}

      <div className="itp-plan-step-cards">
        {visibleOps.map((opId) => {
          const op = ITP_PART_OPERATIONS.find((row) => row.id === opId)!
          const rawDetail = part.operationDetails[opId] ?? emptyItpPlanStepState()
          const detail =
            part.id === 'stem' && opId === 'machine_1' ? ensureStemMachine1State(rawDetail) : rawDetail
          const stepNumber = stepNumbers.get(`${part.id}:${opId}`)
          const techKey = `tech:${part.id}:${opId}`
          const qcKey = `qc:${part.id}:${opId}`

          if (part.id === 'stem' && opId === 'machine_1') {
            return (
              <ItpStemMachine1Card
                key={`${part.id}-${opId}`}
                stepNumber={stepNumber}
                detail={detail}
                saving={saving}
                signingTech={signingKey === techKey}
                signingQc={signingKey === qcKey}
                techInitials={signOffDrafts[techKey] ?? detail.signOff?.techInitials ?? ''}
                qcInitials={signOffDrafts[qcKey] ?? detail.qcSignOff?.techInitials ?? ''}
                onTechInitialsChange={(value) =>
                  onSignOffDraftsChange((prev) => ({ ...prev, [techKey]: value }))
                }
                onQcInitialsChange={(value) => onSignOffDraftsChange((prev) => ({ ...prev, [qcKey]: value }))}
                onDetailChange={(patch) => onPartOperationDetail(opId, patch)}
                onMeasurementsChange={(patch) =>
                  onPartOperationDetail(opId, {
                    stemMeasurements: { ...detail.stemMeasurements!, ...patch },
                  })
                }
                onTechSignOff={() => onPartSignOff(opId, 'tech')}
                onQcSignOff={() => onPartSignOff(opId, 'qc')}
              />
            )
          }

          if (opId === 'inspect') {
            return (
              <ItpPartInspectCard
                key={`${part.id}-${opId}`}
                stepNumber={stepNumber}
                title={op.label}
                subtitle={part.label}
                hint={op.hint}
                inspectOutcome={part.inspectOutcome}
                detail={detail}
                saving={saving}
                signing={signingKey === techKey}
                techInitials={signOffDrafts[techKey] ?? detail.signOff?.techInitials ?? ''}
                onTechInitialsChange={(value) =>
                  onSignOffDraftsChange((prev) => ({ ...prev, [techKey]: value }))
                }
                onInstructionsChange={(value) => onPartOperationDetail(opId, { workInstructions: value })}
                onInspectionNotesChange={(value) => onPartOperationDetail(opId, { inspectionNotes: value })}
                onInspectOutcomeChange={onInspectOutcomeChange}
                onOtherChange={(patch) => onPartOperationDetail(opId, patch)}
                onTechSignOff={() => onPartSignOff(opId, 'tech')}
              />
            )
          }

          if (opId === 'acceptable') {
            return (
              <div key={`${part.id}-${opId}`} className={!inspectSigned ? 'itp-plan-followup--locked' : ''}>
                {!inspectSigned ? (
                  <p className="itp-plan-followup-lock-hint">Complete inspection sign-off to accept this part.</p>
                ) : null}
                <ItpPartAcceptableCard
                  stepNumber={stepNumber}
                  title={op.label}
                  subtitle={part.label}
                  hint={op.hint}
                  detail={detail}
                  saving={saving || !inspectSigned}
                  signing={signingKey === techKey}
                  techInitials={signOffDrafts[techKey] ?? detail.signOff?.techInitials ?? ''}
                  onTechInitialsChange={(value) =>
                    onSignOffDraftsChange((prev) => ({ ...prev, [techKey]: value }))
                  }
                  onInstructionsChange={(value) => onPartOperationDetail(opId, { workInstructions: value })}
                  onAcceptanceNotesChange={(value) => onPartOperationDetail(opId, { inspectionNotes: value })}
                  onOtherChange={(patch) => onPartOperationDetail(opId, patch)}
                  onTechSignOff={() => onPartSignOff(opId, 'tech')}
                />
              </div>
            )
          }

          return (
            <ItpPlanStepCard
              key={`${part.id}-${opId}`}
              stepNumber={stepNumber}
              title={op.label}
              subtitle={part.label}
              hint={op.hint}
              requiresSignOff={false}
              showOther
              detail={detail}
              saving={saving}
              signing={false}
              initials=""
              onInitialsChange={() => {}}
              onInstructionsChange={(value) => onPartOperationDetail(opId, { workInstructions: value })}
              onOtherChange={(patch) => onPartOperationDetail(opId, patch)}
              onSignOff={() => {}}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Update part workflow and sync selectedOperations. */
export function applyInspectOutcomeChange(
  part: ItpPlanValvePart,
  outcome: Exclude<ItpPartInspectOutcome, ''>,
): ItpPlanValvePart {
  const next: ItpPlanValvePart = {
    ...part,
    inspectOutcome: outcome,
    optionalReworkOps: outcome === 'rework' ? part.optionalReworkOps : [],
  }
  return { ...next, selectedOperations: syncPartSelectedOperations(next) }
}

export function applyOptionalReworkToggle(part: ItpPlanValvePart, opId: ItpOptionalReworkOp): ItpPlanValvePart {
  const has = part.optionalReworkOps.includes(opId)
  const optionalReworkOps = has
    ? part.optionalReworkOps.filter((id) => id !== opId)
    : [...part.optionalReworkOps, opId]
  const next = { ...part, optionalReworkOps }
  return { ...next, selectedOperations: syncPartSelectedOperations(next) }
}
