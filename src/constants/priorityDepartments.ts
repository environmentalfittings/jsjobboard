import { INCOMING_STATUSES } from './statuses'

/**
 * Shop departments for daily priority handouts.
 * Finish cell / Fitting are broken out by work cell; others span all cells.
 */
export type PriorityDepartmentId =
  | 'receiving'
  | 'teardown'
  | 'machine-shop'
  | 'welding'
  | 'finish-cell'
  | 'fitting'
  | 'actuation'
  | 'testing'
  | 'painting'
  | 'shipping'
  | 'waiting-hold'
  | 'waiting-on-parts'
  | 'replaced-junked'
  | 'customer-sales-completed'

export type PriorityDepartment = {
  id: PriorityDepartmentId
  label: string
  /** Shop statuses included in this department. */
  statuses: readonly string[]
  /** When true, handouts can be filtered/broken out by finish cell. */
  breakOutByCell: boolean
}

export const PRIORITY_DEPARTMENTS: readonly PriorityDepartment[] = [
  {
    id: 'receiving',
    label: 'Receiving',
    statuses: [...INCOMING_STATUSES],
    breakOutByCell: false,
  },
  {
    id: 'teardown',
    label: 'Teardown',
    statuses: ['Teardown'],
    breakOutByCell: false,
  },
  {
    id: 'machine-shop',
    label: 'Machine shop',
    statuses: ['Machine 1', 'Machine 2', 'Water Jet', 'Grinding'],
    breakOutByCell: false,
  },
  {
    id: 'welding',
    label: 'Welding',
    statuses: ['Welding'],
    breakOutByCell: false,
  },
  {
    id: 'finish-cell',
    label: 'Finish cell',
    statuses: ['Assembly'],
    breakOutByCell: true,
  },
  {
    id: 'fitting',
    label: 'Fitting',
    statuses: ['Fitting'],
    breakOutByCell: true,
  },
  {
    id: 'actuation',
    label: 'Actuation',
    statuses: ['Adaption'],
    breakOutByCell: false,
  },
  {
    id: 'testing',
    label: 'Testing',
    statuses: ['Testing'],
    breakOutByCell: false,
  },
  {
    id: 'painting',
    label: 'Painting',
    statuses: ['Painting'],
    breakOutByCell: false,
  },
  {
    id: 'shipping',
    label: 'Shipping',
    // No separate "Shipped" shop status — Warehouse RTS is ready-to-ship / shipping.
    statuses: ['Warehouse RTS'],
    breakOutByCell: false,
  },
  {
    id: 'waiting-hold',
    label: 'Waiting/Hold',
    statuses: ['Not Arrived', 'On Hold'],
    breakOutByCell: false,
  },
  {
    id: 'waiting-on-parts',
    label: 'Waiting on Parts',
    statuses: ['Waiting on Parts', 'Outsourced'],
    breakOutByCell: false,
  },
  {
    id: 'replaced-junked',
    label: 'Replaced / Junked',
    statuses: ['Replaced', 'Junked'],
    breakOutByCell: false,
  },
  {
    id: 'customer-sales-completed',
    label: 'Waiting on Customer / Salesman / Completed',
    statuses: ['Waiting on Customer', 'Waiting on Salesman', 'Completed'],
    breakOutByCell: false,
  },
] as const

export function getPriorityDepartment(id: string | null | undefined): PriorityDepartment | null {
  if (!id) return null
  return PRIORITY_DEPARTMENTS.find((d) => d.id === id) ?? null
}

export function statusesForDepartments(departmentIds: readonly string[]): string[] {
  const set = new Set<string>()
  for (const id of departmentIds) {
    const dept = getPriorityDepartment(id)
    if (!dept) continue
    for (const status of dept.statuses) set.add(status)
  }
  return [...set]
}

export function parsePriorityDepartmentId(value: string | null | undefined): PriorityDepartmentId {
  const match = getPriorityDepartment(value)
  return match?.id ?? 'teardown'
}

export function parsePriorityDepartmentIds(value: string | null | undefined): PriorityDepartmentId[] {
  if (!value?.trim()) return ['teardown']
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean)
  const ids = parts
    .map((p) => getPriorityDepartment(p)?.id)
    .filter((id): id is PriorityDepartmentId => Boolean(id))
  return ids.length ? ids : ['teardown']
}
