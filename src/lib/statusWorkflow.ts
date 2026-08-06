/**
 * Forward shop workflow for rework detection.
 * Cards may skip stages; moving to a lower stage index is a backward/rework move.
 * Neutral statuses (waiting/hold/outsourced/terminal scrap) do not count as forward or reverse.
 */

export const FORWARD_WORKFLOW_STAGES = [
  {
    key: 'pull',
    label: 'Pull / incoming',
    statuses: [
      'Pull from Customer Yard',
      'Pull from Warehouse',
      'Pull from JS Yard',
      'Coming in from Vendor',
      'Coming in from Customer',
      'Not Arrived',
      'Arrived - Not Started',
    ],
  },
  { key: 'teardown', label: 'Teardown', statuses: ['Teardown', 'PRV Teardown'] },
  { key: 'machine_1', label: 'Machine 1', statuses: ['Machine 1'] },
  { key: 'welding', label: 'Welding', statuses: ['Welding'] },
  { key: 'machine_2', label: 'Machine 2', statuses: ['Machine 2', 'Water Jet', 'Grinding'] },
  { key: 'fitting', label: 'Fitting', statuses: ['Fitting'] },
  { key: 'assembly', label: 'Assembly', statuses: ['Assembly', 'PRV Assembly'] },
  { key: 'adaption', label: 'Adaption', statuses: ['Adaption'] },
  { key: 'actuation', label: 'Actuation', statuses: ['Actuation'] },
  { key: 'testing', label: 'Testing', statuses: ['Testing'] },
  { key: 'painting', label: 'Painting', statuses: ['Painting'] },
  { key: 'warehouse_rts', label: 'Warehouse RTS', statuses: ['Warehouse RTS'] },
  { key: 'completed', label: 'Completed', statuses: ['Completed'] },
] as const

/** Waiting / hold / outsourced / scrap — entering or leaving these is not rework by itself. */
export const NEUTRAL_WORKFLOW_STATUSES = new Set<string>([
  'Waiting on Parts',
  'Waiting on Customer',
  'Waiting on Salesman',
  'Outsourced',
  'On Hold',
  'Replaced',
  'Junked',
])

const statusToStageIndex = new Map<string, number>()
FORWARD_WORKFLOW_STAGES.forEach((stage, index) => {
  for (const status of stage.statuses) statusToStageIndex.set(status, index)
})

export function workflowStageIndex(status: string | null | undefined): number | null {
  if (!status) return null
  if (NEUTRAL_WORKFLOW_STATUSES.has(status)) return null
  return statusToStageIndex.has(status) ? (statusToStageIndex.get(status) as number) : null
}

export function workflowStageLabel(status: string | null | undefined): string {
  const idx = workflowStageIndex(status)
  if (idx == null) return status?.trim() || '—'
  return FORWARD_WORKFLOW_STAGES[idx]?.label ?? status ?? '—'
}

/** True when moving from a later workflow stage back to an earlier one. */
export function isBackwardStatusMove(
  fromStatus: string | null | undefined,
  toStatus: string | null | undefined,
): boolean {
  if (!fromStatus || !toStatus || fromStatus === toStatus) return false
  const from = workflowStageIndex(fromStatus)
  const to = workflowStageIndex(toStatus)
  if (from == null || to == null) return false
  return to < from
}
