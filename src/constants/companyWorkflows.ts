import { FINISH_CELLS } from './jobLookups'
import {
  DONE_STATUSES,
  INCOMING_STATUSES,
  IN_SHOP_STATUSES,
  PHASES,
  STATUS_ORDER,
  TERMINAL_STATUSES,
  TESTING_STATUSES,
  WAITING_STATUSES,
} from './statuses'

export type CompanyWorkflowKey = 'js-valve' | 'vsi'

export type CompanyWorkflowPhase = {
  key: string
  title: string
  className: string
  statuses: ReadonlySet<string>
}

export type CompanyWorkflowProfile = {
  key: CompanyWorkflowKey
  label: string
  /** Shop status dropdown / board order. */
  statusOrder: readonly string[]
  /** Work-cell style buckets: JS finish cells, or VSI departments RV/CV/UL. */
  workCells: readonly string[]
  /** UI label for the work-cell field. */
  workCellLabel: string
  phases: readonly CompanyWorkflowPhase[]
  incomingStatuses: ReadonlySet<string>
  inShopStatuses: ReadonlySet<string>
  testingStatuses: ReadonlySet<string>
  waitingStatuses: ReadonlySet<string>
  doneStatuses: ReadonlySet<string>
  terminalStatuses: ReadonlySet<string>
}

/** VSI shop stages (partner company workflow). */
export const VSI_STATUS_ORDER = [
  'Incoming',
  'Receiving',
  'Test/Failure Analysis',
  'New Valve',
  'Pre-Test',
  'Tear Down',
  'Inspection',
  'Machining',
  'Out for repair/testing',
  'Staging Area',
  'Assembly',
  'Final Test',
  'Tagging',
  'QC',
  'Shipping',
  'Hold',
  'Quarantine',
] as const

/** VSI product-line departments (analogous to JS finish cells). */
export const VSI_DEPARTMENTS = ['RV', 'CV', 'UL'] as const

const VSI_INCOMING = new Set<string>(['Incoming', 'Receiving', 'New Valve'])
const VSI_IN_SHOP = new Set<string>([
  'Tear Down',
  'Inspection',
  'Machining',
  'Assembly',
  'Tagging',
  'QC',
])
const VSI_TESTING = new Set<string>([
  'Test/Failure Analysis',
  'Pre-Test',
  'Final Test',
  'Out for repair/testing',
])
const VSI_WAITING = new Set<string>(['Staging Area', 'Hold', 'Quarantine'])
const VSI_DONE = new Set<string>(['Shipping'])
const VSI_TERMINAL = new Set<string>(['Shipping'])

export const JS_VALVE_WORKFLOW: CompanyWorkflowProfile = {
  key: 'js-valve',
  label: 'JS Valve',
  statusOrder: STATUS_ORDER,
  workCells: FINISH_CELLS,
  workCellLabel: 'Finish cell',
  phases: PHASES.map((phase) => ({
    key: phase.key,
    title: phase.title,
    className: phase.className,
    statuses: phase.statuses,
  })),
  incomingStatuses: INCOMING_STATUSES,
  inShopStatuses: IN_SHOP_STATUSES,
  testingStatuses: TESTING_STATUSES,
  waitingStatuses: WAITING_STATUSES,
  doneStatuses: DONE_STATUSES,
  terminalStatuses: TERMINAL_STATUSES,
}

export const VSI_WORKFLOW: CompanyWorkflowProfile = {
  key: 'vsi',
  label: 'VSI',
  statusOrder: VSI_STATUS_ORDER,
  workCells: VSI_DEPARTMENTS,
  workCellLabel: 'Department',
  phases: [
    { key: 'incoming', title: 'Incoming', className: 'incoming', statuses: VSI_INCOMING },
    { key: 'in-shop', title: 'In-shop Work', className: 'in-shop', statuses: VSI_IN_SHOP },
    { key: 'testing', title: 'Testing', className: 'testing', statuses: VSI_TESTING },
    { key: 'waiting', title: 'Waiting/Hold', className: 'waiting', statuses: VSI_WAITING },
    { key: 'done', title: 'Done', className: 'done', statuses: VSI_DONE },
  ],
  incomingStatuses: VSI_INCOMING,
  inShopStatuses: VSI_IN_SHOP,
  testingStatuses: VSI_TESTING,
  waitingStatuses: VSI_WAITING,
  doneStatuses: VSI_DONE,
  terminalStatuses: VSI_TERMINAL,
}

const PROFILES: Record<CompanyWorkflowKey, CompanyWorkflowProfile> = {
  'js-valve': JS_VALVE_WORKFLOW,
  vsi: VSI_WORKFLOW,
}

/** Resolve workflow from organization slug / name / local id. */
export function companyWorkflowKeyFromOrganization(input: {
  slug?: string | null
  name?: string | null
  id?: string | null
} | null | undefined): CompanyWorkflowKey {
  const slug = String(input?.slug ?? '')
    .trim()
    .toLowerCase()
  const name = String(input?.name ?? '')
    .trim()
    .toLowerCase()
  const id = String(input?.id ?? '')
    .trim()
    .toLowerCase()
  if (
    slug === 'vsi' ||
    slug.includes('vsi') ||
    name === 'vsi' ||
    name.includes('vsi') ||
    id.includes('vsi') ||
    id === 'local-org-partner' ||
    slug === 'partner-shop'
  ) {
    return 'vsi'
  }
  return 'js-valve'
}

export function getCompanyWorkflow(
  keyOrOrg?: CompanyWorkflowKey | { slug?: string | null; name?: string | null; id?: string | null } | null,
): CompanyWorkflowProfile {
  if (!keyOrOrg) return JS_VALVE_WORKFLOW
  if (typeof keyOrOrg === 'string') return PROFILES[keyOrOrg] ?? JS_VALVE_WORKFLOW
  return PROFILES[companyWorkflowKeyFromOrganization(keyOrOrg)] ?? JS_VALVE_WORKFLOW
}

/** Badge coloring across both company vocabularies. */
export function statusToneForAnyCompany(status: string): 'incoming' | 'in-shop' | 'testing' | 'waiting' | 'done' | 'default' {
  for (const profile of Object.values(PROFILES)) {
    if (profile.incomingStatuses.has(status)) return 'incoming'
    if (profile.inShopStatuses.has(status)) return 'in-shop'
    if (profile.testingStatuses.has(status)) return 'testing'
    if (profile.waitingStatuses.has(status)) return 'waiting'
    if (profile.doneStatuses.has(status)) return 'done'
  }
  return 'default'
}
