import type { ItpPayload } from '../types/itp'
import { ITP_SCHEMA_VERSION } from '../types/itp'
import type { ItpProcessPlanPayload } from '../types/itpPlan'
import { isItpProcessPlanPayload } from '../types/itpPlan'

type ValveItpBundle = {
  bundle: true
  inspection?: ItpPayload
  processPlan?: ItpProcessPlanPayload
}

function isItpBundle(value: unknown): value is ValveItpBundle {
  return Boolean(value && typeof value === 'object' && (value as ValveItpBundle).bundle === true)
}

export function isItpInspectionPayload(value: unknown): value is ItpPayload {
  if (!value || typeof value !== 'object') return false
  const o = value as Partial<ItpPayload>
  return o.v === ITP_SCHEMA_VERSION && Array.isArray(o.tabs)
}

export function extractInspectionFromItpData(stored: unknown): unknown {
  if (isItpBundle(stored)) return stored.inspection ?? null
  if (isItpProcessPlanPayload(stored)) return null
  if (isItpInspectionPayload(stored)) return stored
  return stored
}

export function extractProcessPlanFromItpData(stored: unknown): ItpProcessPlanPayload | null {
  if (isItpBundle(stored)) return stored.processPlan ?? null
  if (isItpProcessPlanPayload(stored)) return stored
  return null
}

export function hasItpInspectionData(stored: unknown, legacyContent?: string): boolean {
  const inspection = extractInspectionFromItpData(stored)
  if (isItpInspectionPayload(inspection)) return true
  const raw = String(legacyContent ?? '').trim()
  return Boolean(raw && raw.startsWith('{') && raw.includes('"tabs"'))
}

/** Persist inspection + process plan together without overwriting either. */
export function buildItpDataForSave(params: {
  existing: unknown
  inspection?: ItpPayload
  processPlan?: ItpProcessPlanPayload
}): Record<string, unknown> {
  const inspection =
    params.inspection ??
    (() => {
      const fromExisting = extractInspectionFromItpData(params.existing)
      return isItpInspectionPayload(fromExisting) ? fromExisting : undefined
    })()

  const processPlan = params.processPlan ?? extractProcessPlanFromItpData(params.existing) ?? undefined

  if (inspection && processPlan) {
    return { bundle: true, inspection, processPlan }
  }
  if (processPlan) return processPlan as unknown as Record<string, unknown>
  if (inspection) return inspection as unknown as Record<string, unknown>
  return {}
}
