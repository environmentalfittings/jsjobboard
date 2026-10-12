import { getActiveItpPlanStepIds } from '../constants/itpProcessSteps'
import type { UserRole } from '../pages/LoginPage'
import {
  emptyItpPlanStepState,
  normalizeItpProcessPlan,
  type ItpPlanStepSignOff,
  type ItpPlanStepState,
} from '../types/itpPlan'
import {
  normalizeItpLibraryPlan,
  type ItpLibraryPlanPayload,
  type ItpQcChangeLogEntry,
} from '../types/itpLibraryPlan'
import type { Valve } from '../types'
import { saveItpLibraryPlan } from './itpLibraryStorage'
import { saveItpProcessPlan } from './itpPlanStorage'
import {
  diffItpScopeChanges,
  loadCurrentUserQualityTeamLevel,
  snapshotItpScope,
} from './qualityTeam'
import { normalizeAppRole } from './roles'
import { supabase } from './supabase'
import { extractLibraryPlanFromItpData, extractProcessPlanFromItpData } from './valveItpStorage'

const QC_PROCESS_STEP_IDS = ['final_qc', 'shipping'] as const

export type ItpShipmentQcResult = {
  libraryAccepted: boolean
  travelerSigned: boolean
  alreadyComplete: boolean
  skippedNoPlan: boolean
  error: string | null
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
  }
  const compact = name.replace(/[^A-Za-z0-9]/g, '')
  return compact.slice(0, 3).toUpperCase() || 'QC'
}

function acceptedByLevelForShipment(options: {
  qualityTeamLevel: string
  role: UserRole | null | undefined
}): string | null {
  if (options.qualityTeamLevel && options.qualityTeamLevel !== 'none') return options.qualityTeamLevel
  const role = options.role ? normalizeAppRole(options.role) : null
  if (role === 'admin') return 'admin'
  if (role === 'manager') return 'supervisor'
  return null
}

function buildAcceptedLibraryPlan(
  source: ItpLibraryPlanPayload,
  options: {
    acceptedByUserId: string | null
    acceptedByName: string
    acceptedByLevel: string | null
  },
): ItpLibraryPlanPayload {
  const now = new Date().toISOString()
  const qc = source.qcReview
  const acceptEntry: ItpQcChangeLogEntry = {
    id: crypto.randomUUID(),
    at: now,
    byUserId: options.acceptedByUserId,
    byName: options.acceptedByName,
    byLevel: options.acceptedByLevel,
    note: 'Accepted from dashboard Final QC Approval',
    summary: 'Accepted from Final QC Approval',
  }
  const previousSnapshot = qc.acceptedScope
  const nextSnapshot = snapshotItpScope(source)
  const lastRevisionChanges =
    previousSnapshot && previousSnapshot.length > 0 ? diffItpScopeChanges(previousSnapshot, source) : []
  return {
    ...source,
    qcReview: {
      ...qc,
      status: 'accepted',
      generatedAt: qc.generatedAt ?? now,
      acceptedAt: now,
      acceptedByUserId: options.acceptedByUserId,
      acceptedByName: options.acceptedByName,
      acceptedByLevel: options.acceptedByLevel,
      changeLog: [...(qc.changeLog ?? []), acceptEntry],
      acceptedScope: nextSnapshot,
      lastRevisionChanges: lastRevisionChanges.length > 0 ? lastRevisionChanges : null,
    },
  }
}

function applyMissingSignOffs(detail: ItpPlanStepState, signOff: ItpPlanStepSignOff): {
  next: ItpPlanStepState
  changed: boolean
} {
  const next = { ...detail }
  let changed = false
  if (!next.signOff) {
    next.signOff = signOff
    changed = true
  }
  if (!next.qcSignOff) {
    next.qcSignOff = signOff
    changed = true
  }
  return { next, changed }
}

/**
 * Completes ITP QC sign-off when Warehouse RTS / Shipping Final QC Approval (or Shipped) is used.
 * Accepts an existing library ITP; does not create a new template ITP.
 * Signs traveler process-plan Final QC / Shipping steps when those steps already exist.
 */
export async function completeItpQcSignOffForShipment(options: {
  valve: Valve
  acceptedByUserId: string | null
  acceptedByName: string
  role?: UserRole | null
}): Promise<ItpShipmentQcResult> {
  const acceptedByName = options.acceptedByName.trim() || 'Quality Team'
  const acceptedByUserId = options.acceptedByUserId?.trim() || null

  try {
    const { data, error } = await supabase
      .from('valve_itp')
      .select('content,itp_data')
      .eq('valve_row_id', options.valve.id)
      .maybeSingle()
    if (error) {
      return {
        libraryAccepted: false,
        travelerSigned: false,
        alreadyComplete: false,
        skippedNoPlan: false,
        error: error.message,
      }
    }

    const fromJsonb = data?.itp_data
    const rawContent = String(data?.content ?? '').trim()
    const fromContent = rawContent ? tryParseJson(rawContent) : null
    const storedLibrary =
      extractLibraryPlanFromItpData(fromJsonb) ?? extractLibraryPlanFromItpData(fromContent)
    const storedProcess =
      extractProcessPlanFromItpData(fromJsonb) ?? extractProcessPlanFromItpData(fromContent)

    if (!storedLibrary && !storedProcess) {
      return {
        libraryAccepted: false,
        travelerSigned: false,
        alreadyComplete: false,
        skippedNoPlan: true,
        error: null,
      }
    }

    const qualityTeamLevel = await loadCurrentUserQualityTeamLevel({
      userId: acceptedByUserId,
      username: acceptedByName,
    })
    const acceptedByLevel = acceptedByLevelForShipment({
      qualityTeamLevel,
      role: options.role,
    })

    let libraryAccepted = false
    let libraryAlreadyAccepted = false
    if (storedLibrary) {
      const plan = normalizeItpLibraryPlan(
        { ...storedLibrary, valveSnapshot: storedLibrary.valveSnapshot },
        options.valve,
      )
      if (plan.qcReview.status === 'accepted') {
        libraryAlreadyAccepted = true
      } else {
        await saveItpLibraryPlan(
          options.valve,
          buildAcceptedLibraryPlan(plan, {
            acceptedByUserId,
            acceptedByName,
            acceptedByLevel,
          }),
        )
        libraryAccepted = true
      }
    }

    let travelerSigned = false
    let travelerAlreadySigned = false
    if (storedProcess) {
      const plan = normalizeItpProcessPlan(storedProcess, options.valve)
      const active = new Set(
        getActiveItpPlanStepIds(plan.selectedSteps, plan.customOverallSteps, plan.selectedCustomOverallSteps),
      )
      const now = new Date().toISOString()
      const signOff: ItpPlanStepSignOff = {
        techInitials: initialsFromDisplayName(acceptedByName),
        signedAt: now,
      }
      const stepDetails = { ...plan.stepDetails }
      let changed = false
      let hadTargetStep = false
      for (const stepId of QC_PROCESS_STEP_IDS) {
        if (!active.has(stepId)) continue
        hadTargetStep = true
        const current = stepDetails[stepId] ?? emptyItpPlanStepState()
        const applied = applyMissingSignOffs(current, signOff)
        if (applied.changed) {
          stepDetails[stepId] = applied.next
          changed = true
        }
      }
      if (changed) {
        await saveItpProcessPlan(options.valve, { ...plan, stepDetails })
        travelerSigned = true
      } else if (hadTargetStep) {
        travelerAlreadySigned = true
      }
    }

    const alreadyComplete =
      !libraryAccepted &&
      !travelerSigned &&
      (libraryAlreadyAccepted || travelerAlreadySigned)

    return {
      libraryAccepted,
      travelerSigned,
      alreadyComplete,
      skippedNoPlan: !libraryAccepted && !travelerSigned && !alreadyComplete,
      error: null,
    }
  } catch (error) {
    return {
      libraryAccepted: false,
      travelerSigned: false,
      alreadyComplete: false,
      skippedNoPlan: false,
      error: error instanceof Error ? error.message : 'Could not complete ITP QC sign-off',
    }
  }
}

export function itpQcSignOffToastSuffix(result: ItpShipmentQcResult): string | null {
  if (result.error) return `ITP QC sign-off failed: ${result.error}`
  if (result.libraryAccepted || result.travelerSigned) return 'ITP QC signed off'
  return null
}
