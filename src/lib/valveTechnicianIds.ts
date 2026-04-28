import type { Valve } from '../types'

export function parseAssignedTechnicianIds(raw: unknown): number[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0)
  }
  return []
}

export function technicianIdsForValve(valve: Valve): number[] {
  return parseAssignedTechnicianIds(valve.assigned_technician_ids)
}
