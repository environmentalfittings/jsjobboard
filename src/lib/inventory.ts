import { supabase } from './supabase'
import { loadLookupOptionsMap } from './lookupValues'

export type InventoryRecord = {
  id: string
  customer: string | null
  manufacturer_id: string | null
  manufacturer_name: string | null
  valve_type_id: string | null
  valve_type_label: string | null
  body_material: string | null
  api_trim: string | null
  size: string | null
  pressure: string | null
  operator: string | null
  customer_id_no: string | null
  notes: string | null
  js_inventory_id: string | null
  origin: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}

export type InventoryFormState = {
  jsInventoryId: string
  customer: string
  manufacturerName: string
  valveType: string
  bodyMaterial: string
  apiTrim: string
  size: string
  pressure: string
  operator: string
  customerIdNo: string
  origin: string
  notes: string
  imageUrl: string
}

export const INVENTORY_OPERATORS = ['Handwheel', 'Gear Op.', 'Air Act.', 'Electric Act.', 'Other'] as const

export const INVENTORY_SELECT =
  'id,customer,manufacturer_id,manufacturer_name,valve_type_id,body_material,api_trim,size,pressure,operator,customer_id_no,notes,js_inventory_id,origin,image_url,created_at,updated_at'

type InventoryRow = {
  id: string
  customer: string | null
  manufacturer_id: string | null
  manufacturer_name: string | null
  valve_type_id: string | null
  body_material: string | null
  api_trim: string | null
  size: string | null
  pressure: string | null
  operator: string | null
  customer_id_no: string | null
  notes: string | null
  js_inventory_id: string | null
  origin: string | null
  image_url: string | null
  created_at: string
  updated_at: string
  valve_types?: { label: string | null } | { label: string | null }[] | null
}

export function emptyInventoryForm(): InventoryFormState {
  return {
    jsInventoryId: '',
    customer: '',
    manufacturerName: '',
    valveType: '',
    bodyMaterial: '',
    apiTrim: '',
    size: '',
    pressure: '',
    operator: '',
    customerIdNo: '',
    origin: '',
    notes: '',
    imageUrl: '',
  }
}

export function inventoryToForm(row: InventoryRecord): InventoryFormState {
  return {
    jsInventoryId: row.js_inventory_id ?? '',
    customer: row.customer ?? '',
    manufacturerName: row.manufacturer_name ?? '',
    valveType: row.valve_type_label || row.valve_type_id || '',
    bodyMaterial: row.body_material ?? '',
    apiTrim: row.api_trim ?? '',
    size: row.size ?? '',
    pressure: row.pressure ?? '',
    operator: row.operator ?? '',
    customerIdNo: row.customer_id_no ?? '',
    origin: row.origin ?? '',
    notes: row.notes ?? '',
    imageUrl: row.image_url ?? '',
  }
}

function mapInventoryRow(row: InventoryRow): InventoryRecord {
  const joined = row.valve_types
  const label = Array.isArray(joined) ? joined[0]?.label : joined?.label
  return {
    id: row.id,
    customer: row.customer,
    manufacturer_id: row.manufacturer_id,
    manufacturer_name: row.manufacturer_name,
    valve_type_id: row.valve_type_id,
    valve_type_label: label ?? row.valve_type_id,
    body_material: row.body_material,
    api_trim: row.api_trim,
    size: row.size,
    pressure: row.pressure,
    operator: row.operator,
    customer_id_no: row.customer_id_no,
    notes: row.notes,
    js_inventory_id: row.js_inventory_id,
    origin: row.origin,
    image_url: row.image_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function loadInventoryRecords(): Promise<{ data: InventoryRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from('inventory')
    .select(`${INVENTORY_SELECT},valve_types(label)`)
    .order('updated_at', { ascending: false })
    .limit(2000)

  if (error) {
    // Fallback if the FK embed is unavailable.
    const fallback = await supabase
      .from('inventory')
      .select(INVENTORY_SELECT)
      .order('updated_at', { ascending: false })
      .limit(2000)
    if (fallback.error) return { data: [], error: fallback.error.message }
    return { data: ((fallback.data ?? []) as InventoryRow[]).map(mapInventoryRow), error: null }
  }

  return { data: ((data ?? []) as InventoryRow[]).map(mapInventoryRow), error: null }
}

export async function loadInventoryFormOptions(): Promise<{
  customers: string[]
  manufacturers: string[]
  valveTypes: string[]
  bodyMaterials: string[]
  sizes: string[]
  error: string | null
}> {
  const [lookups, customersRes] = await Promise.all([
    loadLookupOptionsMap(),
    supabase.from('customers').select('name').order('name').limit(2000),
  ])

  const customerNames = ((customersRes.data ?? []) as { name: string }[])
    .map((row) => row.name?.trim())
    .filter(Boolean) as string[]

  return {
    customers: customerNames,
    manufacturers: lookups.manufacturer ?? [],
    valveTypes: lookups.valve_type ?? [],
    bodyMaterials: lookups.body_material ?? [],
    sizes: lookups.valve_size ?? [],
    error: customersRes.error?.message ?? null,
  }
}

async function ensureManufacturerId(name: string): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const existing = await supabase.from('manufacturers').select('id').eq('name', trimmed).maybeSingle()
  if (existing.data?.id) return String(existing.data.id)

  const inserted = await supabase.from('manufacturers').insert({ name: trimmed }).select('id').single()
  if (inserted.data?.id) return String(inserted.data.id)

  // Unique race — fetch again.
  const again = await supabase.from('manufacturers').select('id').eq('name', trimmed).maybeSingle()
  return again.data?.id ? String(again.data.id) : null
}

async function ensureValveTypeId(label: string): Promise<string | null> {
  const trimmed = label.trim()
  if (!trimmed) return null

  // Use the shop label as the text PK so inventory matches Manage Lists valve types.
  const existing = await supabase.from('valve_types').select('id').eq('id', trimmed).maybeSingle()
  if (existing.data?.id) return String(existing.data.id)

  const byLabel = await supabase.from('valve_types').select('id').eq('label', trimmed).limit(1).maybeSingle()
  if (byLabel.data?.id) return String(byLabel.data.id)

  const inserted = await supabase
    .from('valve_types')
    .insert({ id: trimmed, label: trimmed, sort_order: 0 })
    .select('id')
    .single()
  if (inserted.data?.id) return String(inserted.data.id)

  // If insert fails (e.g. permissions), keep the FK null and still save the row.
  return null
}

function formToPayload(form: InventoryFormState, manufacturerId: string | null, valveTypeId: string | null) {
  return {
    js_inventory_id: form.jsInventoryId.trim() || null,
    customer: form.customer.trim() || null,
    manufacturer_id: manufacturerId,
    manufacturer_name: form.manufacturerName.trim() || null,
    valve_type_id: valveTypeId,
    body_material: form.bodyMaterial.trim() || null,
    api_trim: form.apiTrim.trim() || null,
    size: form.size.trim() || null,
    pressure: form.pressure.trim() || null,
    operator: form.operator.trim() || null,
    customer_id_no: form.customerIdNo.trim() || null,
    origin: form.origin.trim() || null,
    notes: form.notes.trim() || null,
    image_url: form.imageUrl.trim() || null,
  }
}

function friendlyInventoryError(message: string | undefined): string {
  if (!message) return 'Could not save inventory item'
  if (message.includes('js_inventory_id') || message.includes('23505')) {
    return 'That JS inventory ID is already in use'
  }
  if (message.includes('permission') || message.includes('policy') || message.includes('RLS')) {
    return 'Run migration-inventory-rls.sql in Supabase, then try again'
  }
  return message
}

export async function createInventoryRecord(
  form: InventoryFormState,
): Promise<{ data: InventoryRecord | null; error: string | null }> {
  const [manufacturerId, valveTypeId] = await Promise.all([
    ensureManufacturerId(form.manufacturerName),
    ensureValveTypeId(form.valveType),
  ])
  const payload = formToPayload(form, manufacturerId, valveTypeId)
  const { data, error } = await supabase.from('inventory').insert(payload).select(INVENTORY_SELECT).single()
  if (error || !data) return { data: null, error: friendlyInventoryError(error?.message) }
  return { data: mapInventoryRow(data as InventoryRow), error: null }
}

export async function updateInventoryRecord(
  id: string,
  form: InventoryFormState,
): Promise<{ data: InventoryRecord | null; error: string | null }> {
  const [manufacturerId, valveTypeId] = await Promise.all([
    ensureManufacturerId(form.manufacturerName),
    ensureValveTypeId(form.valveType),
  ])
  const payload = formToPayload(form, manufacturerId, valveTypeId)
  const { data, error } = await supabase
    .from('inventory')
    .update(payload)
    .eq('id', id)
    .select(INVENTORY_SELECT)
    .single()
  if (error || !data) return { data: null, error: friendlyInventoryError(error?.message) }
  return { data: mapInventoryRow(data as InventoryRow), error: null }
}

export async function deleteInventoryRecord(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('inventory').delete().eq('id', id)
  if (error) return { error: friendlyInventoryError(error.message) }
  return { error: null }
}

export function inventoryMatchesSearch(row: InventoryRecord, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    row.js_inventory_id,
    row.customer,
    row.manufacturer_name,
    row.valve_type_label,
    row.valve_type_id,
    row.body_material,
    row.api_trim,
    row.size,
    row.pressure,
    row.operator,
    row.customer_id_no,
    row.origin,
    row.notes,
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
  return haystack.includes(q)
}
