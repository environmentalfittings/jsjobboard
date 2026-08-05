import { supabase } from './supabase'
import type { ValveOutsourcedItem } from '../types'

export type ValveOutsourcedItemInput = {
  date_shipped: string | null
  expected_date_back: string | null
  netsuite_po_number: string
  vendor: string
  item_shipped: string
  work_description: string
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function normalizeRow(row: Record<string, unknown>): ValveOutsourcedItem {
  return {
    id: Number(row.id),
    valve_row_id: Number(row.valve_row_id),
    date_shipped: row.date_shipped == null ? null : String(row.date_shipped),
    expected_date_back: row.expected_date_back == null ? null : String(row.expected_date_back),
    netsuite_po_number: row.netsuite_po_number == null ? null : String(row.netsuite_po_number),
    vendor: row.vendor == null ? null : String(row.vendor),
    item_shipped: row.item_shipped == null ? null : String(row.item_shipped),
    work_description: row.work_description == null ? null : String(row.work_description),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

const SELECT_COLS =
  'id,valve_row_id,date_shipped,expected_date_back,netsuite_po_number,vendor,item_shipped,work_description,created_at,updated_at'

export function emptyOutsourcedItemInput(): ValveOutsourcedItemInput {
  return {
    date_shipped: null,
    expected_date_back: null,
    netsuite_po_number: '',
    vendor: '',
    item_shipped: '',
    work_description: '',
  }
}

export function inputFromOutsourcedItem(row: ValveOutsourcedItem): ValveOutsourcedItemInput {
  return {
    date_shipped: row.date_shipped,
    expected_date_back: row.expected_date_back,
    netsuite_po_number: row.netsuite_po_number ?? '',
    vendor: row.vendor ?? '',
    item_shipped: row.item_shipped ?? '',
    work_description: row.work_description ?? '',
  }
}

export async function listValveOutsourcedItems(valveRowId: number): Promise<ValveOutsourcedItem[]> {
  const { data, error } = await supabase
    .from('valve_outsourced_items')
    .select(SELECT_COLS)
    .eq('valve_row_id', valveRowId)
    .order('date_shipped', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>))
}

export async function createValveOutsourcedItem(
  valveRowId: number,
  input: ValveOutsourcedItemInput,
): Promise<ValveOutsourcedItem> {
  const payload = {
    valve_row_id: valveRowId,
    date_shipped: emptyToNull(input.date_shipped),
    expected_date_back: emptyToNull(input.expected_date_back),
    netsuite_po_number: emptyToNull(input.netsuite_po_number),
    vendor: emptyToNull(input.vendor),
    item_shipped: emptyToNull(input.item_shipped),
    work_description: emptyToNull(input.work_description),
  }
  const { data, error } = await supabase
    .from('valve_outsourced_items')
    .insert(payload)
    .select(SELECT_COLS)
    .single()
  if (error) throw error
  return normalizeRow(data as Record<string, unknown>)
}

export async function updateValveOutsourcedItem(
  id: number,
  input: ValveOutsourcedItemInput,
): Promise<ValveOutsourcedItem> {
  const payload = {
    date_shipped: emptyToNull(input.date_shipped),
    expected_date_back: emptyToNull(input.expected_date_back),
    netsuite_po_number: emptyToNull(input.netsuite_po_number),
    vendor: emptyToNull(input.vendor),
    item_shipped: emptyToNull(input.item_shipped),
    work_description: emptyToNull(input.work_description),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('valve_outsourced_items')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLS)
    .single()
  if (error) throw error
  return normalizeRow(data as Record<string, unknown>)
}

export async function deleteValveOutsourcedItem(id: number): Promise<void> {
  const { error } = await supabase.from('valve_outsourced_items').delete().eq('id', id)
  if (error) throw error
}
