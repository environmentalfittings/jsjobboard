import { supabase } from './supabase'

export const JOB_NEEDED_PART_STATUSES = ['needed', 'ordered', 'received', 'cancelled'] as const
export type JobNeededPartStatus = (typeof JOB_NEEDED_PART_STATUSES)[number]

export type JobNeededPart = {
  id: string
  valveRowId: number
  itpItemId: string
  itpItemName: string
  partName: string
  partNumber: string
  quantity: number
  supplier: string
  status: JobNeededPartStatus
  poNumber: string
  orderedDate: string | null
  expectedDate: string | null
  receivedDate: string | null
  notes: string
  requestedByName: string
  requestedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export type JobNeededPartDraft = {
  partName: string
  partNumber: string
  quantity: number
  supplier: string
  notes: string
  itpItemId?: string
  itpItemName?: string
}

export type JobNeededPartPurchasePatch = {
  status?: JobNeededPartStatus
  poNumber?: string
  supplier?: string
  orderedDate?: string | null
  expectedDate?: string | null
  receivedDate?: string | null
  notes?: string
  quantity?: number
  partName?: string
  partNumber?: string
}

type JobNeededPartRow = {
  id: string
  valve_row_id: number
  itp_item_id: string | null
  itp_item_name: string | null
  part_name: string | null
  part_number: string | null
  quantity: number | null
  supplier: string | null
  status: string | null
  po_number: string | null
  ordered_date: string | null
  expected_date: string | null
  received_date: string | null
  notes: string | null
  requested_by_name: string | null
  requested_by_user_id: string | null
  created_at: string
  updated_at: string
}

export function emptyJobNeededPartDraft(): JobNeededPartDraft {
  return {
    partName: '',
    partNumber: '',
    quantity: 1,
    supplier: '',
    notes: '',
  }
}

export function isJobNeededPartStatus(value: string | null | undefined): value is JobNeededPartStatus {
  return JOB_NEEDED_PART_STATUSES.includes(String(value ?? '') as JobNeededPartStatus)
}

export function jobNeededPartStatusLabel(status: JobNeededPartStatus): string {
  if (status === 'needed') return 'Needed'
  if (status === 'ordered') return 'Ordered'
  if (status === 'received') return 'Received'
  return 'Cancelled'
}

function mapRow(row: JobNeededPartRow): JobNeededPart {
  const status = isJobNeededPartStatus(row.status) ? row.status : 'needed'
  const qty = Number(row.quantity)
  return {
    id: row.id,
    valveRowId: Number(row.valve_row_id),
    itpItemId: String(row.itp_item_id ?? '').trim(),
    itpItemName: String(row.itp_item_name ?? '').trim(),
    partName: String(row.part_name ?? '').trim(),
    partNumber: String(row.part_number ?? '').trim(),
    quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
    supplier: String(row.supplier ?? '').trim(),
    status,
    poNumber: String(row.po_number ?? '').trim(),
    orderedDate: row.ordered_date || null,
    expectedDate: row.expected_date || null,
    receivedDate: row.received_date || null,
    notes: String(row.notes ?? '').trim(),
    requestedByName: String(row.requested_by_name ?? '').trim(),
    requestedByUserId: row.requested_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLS =
  'id,valve_row_id,itp_item_id,itp_item_name,part_name,part_number,quantity,supplier,status,po_number,ordered_date,expected_date,received_date,notes,requested_by_name,requested_by_user_id,created_at,updated_at'

function tableMissing(message: string | undefined): boolean {
  return /job_needed_parts|schema cache|does not exist/i.test(String(message ?? ''))
}

export const JOB_NEEDED_PARTS_SETUP_HINT =
  'Run supabase/migration-job-needed-parts.sql in the Supabase SQL editor, then refresh.'

export async function listJobNeededPartsForValve(
  valveRowId: number,
): Promise<{ rows: JobNeededPart[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_needed_parts')
    .select(SELECT_COLS)
    .eq('valve_row_id', valveRowId)
    .order('created_at', { ascending: true })
  if (error) {
    return {
      rows: [],
      error: tableMissing(error.message) ? JOB_NEEDED_PARTS_SETUP_HINT : error.message,
    }
  }
  return { rows: ((data ?? []) as JobNeededPartRow[]).map(mapRow), error: null }
}

export async function listAllJobNeededParts(): Promise<{ rows: JobNeededPart[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_needed_parts')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) {
    return {
      rows: [],
      error: tableMissing(error.message) ? JOB_NEEDED_PARTS_SETUP_HINT : error.message,
    }
  }
  return { rows: ((data ?? []) as JobNeededPartRow[]).map(mapRow), error: null }
}

export async function insertJobNeededPart(options: {
  valveRowId: number
  draft: JobNeededPartDraft
  requestedByName: string
  requestedByUserId: string | null
}): Promise<{ row: JobNeededPart | null; error: string | null }> {
  const partName = options.draft.partName.trim()
  if (!partName) return { row: null, error: 'Enter a part name' }
  const quantity = Math.max(1, Math.floor(Number(options.draft.quantity) || 1))
  const payload = {
    id: crypto.randomUUID(),
    valve_row_id: options.valveRowId,
    itp_item_id: String(options.draft.itpItemId ?? '').trim(),
    itp_item_name: String(options.draft.itpItemName ?? '').trim(),
    part_name: partName,
    part_number: options.draft.partNumber.trim(),
    quantity,
    supplier: options.draft.supplier.trim(),
    status: 'needed',
    po_number: '',
    ordered_date: null,
    expected_date: null,
    received_date: null,
    notes: options.draft.notes.trim(),
    requested_by_name: options.requestedByName.trim(),
    requested_by_user_id: options.requestedByUserId,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('job_needed_parts').insert(payload).select(SELECT_COLS).single()
  if (error) {
    return {
      row: null,
      error: tableMissing(error.message) ? JOB_NEEDED_PARTS_SETUP_HINT : error.message,
    }
  }
  return { row: mapRow(data as JobNeededPartRow), error: null }
}

export async function upsertJobNeededPartByItemId(options: {
  valveRowId: number
  draft: JobNeededPartDraft
  requestedByName: string
  requestedByUserId: string | null
}): Promise<{ row: JobNeededPart | null; error: string | null }> {
  const itemId = String(options.draft.itpItemId ?? '').trim()
  if (!itemId) return insertJobNeededPart(options)
  const { data, error } = await supabase
    .from('job_needed_parts')
    .select(SELECT_COLS)
    .eq('valve_row_id', options.valveRowId)
    .eq('itp_item_id', itemId)
    .maybeSingle()
  if (error) {
    return {
      row: null,
      error: tableMissing(error.message) ? JOB_NEEDED_PARTS_SETUP_HINT : error.message,
    }
  }
  if (data) {
    return updateJobNeededPart((data as JobNeededPartRow).id, {
      partName: options.draft.partName,
      partNumber: options.draft.partNumber,
      quantity: options.draft.quantity,
      notes: options.draft.notes,
      supplier: options.draft.supplier,
    })
  }
  return insertJobNeededPart(options)
}

export async function updateJobNeededPart(
  id: string,
  patch: JobNeededPartPurchasePatch,
): Promise<{ row: JobNeededPart | null; error: string | null }> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.partName != null) next.part_name = patch.partName.trim()
  if (patch.partNumber != null) next.part_number = patch.partNumber.trim()
  if (patch.quantity != null) next.quantity = Math.max(1, Math.floor(patch.quantity))
  if (patch.supplier != null) next.supplier = patch.supplier.trim()
  if (patch.status != null) next.status = patch.status
  if (patch.poNumber != null) next.po_number = patch.poNumber.trim()
  if (patch.notes != null) next.notes = patch.notes.trim()
  if (patch.orderedDate !== undefined) next.ordered_date = patch.orderedDate || null
  if (patch.expectedDate !== undefined) next.expected_date = patch.expectedDate || null
  if (patch.receivedDate !== undefined) next.received_date = patch.receivedDate || null
  if (patch.status === 'ordered' && !patch.orderedDate) {
    next.ordered_date = new Date().toISOString().slice(0, 10)
  }
  if (patch.status === 'received' && !patch.receivedDate) {
    next.received_date = new Date().toISOString().slice(0, 10)
  }
  const { data, error } = await supabase.from('job_needed_parts').update(next).eq('id', id).select(SELECT_COLS).single()
  if (error) {
    return {
      row: null,
      error: tableMissing(error.message) ? JOB_NEEDED_PARTS_SETUP_HINT : error.message,
    }
  }
  return { row: mapRow(data as JobNeededPartRow), error: null }
}

export async function deleteJobNeededPart(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('job_needed_parts').delete().eq('id', id)
  if (error) {
    return { error: tableMissing(error.message) ? JOB_NEEDED_PARTS_SETUP_HINT : error.message }
  }
  return { error: null }
}

export function summarizeNeededParts(rows: JobNeededPart[]): { needed: number; ordered: number; received: number } {
  return rows.reduce(
    (acc, row) => {
      if (row.status === 'needed') acc.needed += 1
      else if (row.status === 'ordered') acc.ordered += 1
      else if (row.status === 'received') acc.received += 1
      return acc
    },
    { needed: 0, ordered: 0, received: 0 },
  )
}

export function formatNeededPartsSummary(rows: JobNeededPart[]): string {
  const { needed, ordered, received } = summarizeNeededParts(rows)
  const parts: string[] = []
  if (needed) parts.push(`${needed} needed`)
  if (ordered) parts.push(`${ordered} ordered`)
  if (received) parts.push(`${received} received`)
  if (parts.length === 0) return 'No parts listed'
  return parts.join(' · ')
}

export function formatNeededPartNotes(notes: string): string {
  return String(notes ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' · ')
}
