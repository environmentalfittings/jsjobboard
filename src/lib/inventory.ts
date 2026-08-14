import QRCode from 'qrcode'
import { supabase } from './supabase'
import { loadLookupOptionsMap } from './lookupValues'
import { API_TRIMS, PRESSURE_CLASSES } from '../constants/jobLookups'
import { attachmentPublicUrl, VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'

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
  hf_acid: boolean
  image_url: string | null
  valve_image_url: string | null
  tag_image_url: string | null
  qr_code_data_url: string | null
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
  originOther: string
  notes: string
  hfAcid: boolean
}

export type InventoryPhotoDraft = {
  file: File | null
  previewUrl: string | null
  existingUrl: string | null
}

export const INVENTORY_OPERATORS = ['Handwheel', 'Gear Op.', 'Air Act.', 'Electric Act.', 'Other'] as const
export const INVENTORY_ORIGINS = ['JS Warehouse', 'JS Yard', 'JS Cage', 'other'] as const
export const INVENTORY_MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const JS_INVENTORY_ID_PREFIX = 'JS-INV-'
export const JS_INVENTORY_ID_START = 1001

export type InventoryOriginOption = (typeof INVENTORY_ORIGINS)[number]

export function formatJsInventoryId(sequence: number): string {
  return `${JS_INVENTORY_ID_PREFIX}${sequence}`
}

export function parseJsInventorySequence(raw: string | null | undefined): number | null {
  const value = String(raw ?? '').trim().toUpperCase()
  const match = new RegExp(`^${JS_INVENTORY_ID_PREFIX}(\\d+)$`, 'i').exec(value)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

/** Next unused JS-INV-#### based on existing rows (starts at 1001). */
export async function allocateNextJsInventoryId(): Promise<{ id: string; error: string | null }> {
  const { data, error } = await supabase.from('inventory').select('js_inventory_id').limit(5000)
  if (error) return { id: formatJsInventoryId(JS_INVENTORY_ID_START), error: error.message }

  let max = JS_INVENTORY_ID_START - 1
  for (const row of data ?? []) {
    const sequence = parseJsInventorySequence((row as { js_inventory_id?: string | null }).js_inventory_id)
    if (sequence != null && sequence > max) max = sequence
  }
  return { id: formatJsInventoryId(max + 1), error: null }
}

/** Split a stored origin into dropdown value + optional custom text for "other". */
export function splitInventoryOrigin(raw: string | null | undefined): {
  origin: string
  originOther: string
} {
  const value = String(raw ?? '').trim()
  if (!value) return { origin: '', originOther: '' }
  if ((INVENTORY_ORIGINS as readonly string[]).includes(value) && value !== 'other') {
    return { origin: value, originOther: '' }
  }
  if (value === 'other') return { origin: 'other', originOther: '' }
  return { origin: 'other', originOther: value }
}

export function resolveInventoryOrigin(origin: string, originOther: string): string {
  const selected = origin.trim()
  if (!selected) return ''
  if (selected === 'other') return originOther.trim() || 'other'
  return selected
}

const PRODUCTION_APP_ORIGIN = 'https://jsjobboard.vercel.app'

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
  valve_image_url?: string | null
  tag_image_url?: string | null
  qr_code_data_url?: string | null
  hf_acid?: boolean | null
  created_at: string
  updated_at: string
  valve_types?: { label: string | null } | { label: string | null }[] | null
}

type PackedMedia = {
  valveImageUrl?: string | null
  tagImageUrl?: string | null
  qrCodeDataUrl?: string | null
  hfAcid?: boolean
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
    originOther: '',
    notes: '',
    hfAcid: false,
  }
}

export function emptyPhotoDraft(existingUrl: string | null = null): InventoryPhotoDraft {
  return { file: null, previewUrl: existingUrl, existingUrl }
}

function unpackMedia(raw: string | null | undefined): PackedMedia {
  const value = String(raw ?? '').trim()
  if (!value) return {}
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      return {
        valveImageUrl:
          (typeof parsed.valveImageUrl === 'string' && parsed.valveImageUrl) ||
          (typeof parsed.v === 'string' && parsed.v) ||
          null,
        tagImageUrl:
          (typeof parsed.tagImageUrl === 'string' && parsed.tagImageUrl) ||
          (typeof parsed.t === 'string' && parsed.t) ||
          null,
        qrCodeDataUrl:
          (typeof parsed.qrCodeDataUrl === 'string' && parsed.qrCodeDataUrl) ||
          (typeof parsed.q === 'string' && parsed.q) ||
          null,
        hfAcid: parsed.hfAcid === true || parsed.hf_acid === true,
      }
    } catch {
      return { valveImageUrl: value }
    }
  }
  return { valveImageUrl: value }
}

function packMedia(media: PackedMedia): string | null {
  const valveImageUrl = media.valveImageUrl?.trim() || null
  const tagImageUrl = media.tagImageUrl?.trim() || null
  const qrCodeDataUrl = media.qrCodeDataUrl?.trim() || null
  const hfAcid = Boolean(media.hfAcid)
  if (!valveImageUrl && !tagImageUrl && !qrCodeDataUrl && !hfAcid) return null
  return JSON.stringify({ valveImageUrl, tagImageUrl, qrCodeDataUrl, hfAcid })
}

export function inventoryToForm(row: InventoryRecord): InventoryFormState {
  const originParts = splitInventoryOrigin(row.origin)
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
    origin: originParts.origin,
    originOther: originParts.originOther,
    notes: row.notes ?? '',
    hfAcid: Boolean(row.hf_acid),
  }
}

function mapInventoryRow(row: InventoryRow): InventoryRecord {
  const joined = row.valve_types
  const label = Array.isArray(joined) ? joined[0]?.label : joined?.label
  const packed = unpackMedia(row.image_url)
  const valveImageUrl = row.valve_image_url?.trim() || packed.valveImageUrl || null
  const tagImageUrl = row.tag_image_url?.trim() || packed.tagImageUrl || null
  const qrCodeDataUrl = row.qr_code_data_url?.trim() || packed.qrCodeDataUrl || null
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
    hf_acid: row.hf_acid === true || packed.hfAcid === true,
    image_url: row.image_url,
    valve_image_url: valveImageUrl,
    tag_image_url: tagImageUrl,
    qr_code_data_url: qrCodeDataUrl,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function loadInventoryRecords(): Promise<{ data: InventoryRecord[]; error: string | null }> {
  const withExtras = await supabase
    .from('inventory')
    .select(`${INVENTORY_SELECT},valve_image_url,tag_image_url,qr_code_data_url,hf_acid,valve_types(label)`)
    .order('updated_at', { ascending: false })
    .limit(2000)

  if (!withExtras.error) {
    return { data: ((withExtras.data ?? []) as InventoryRow[]).map(mapInventoryRow), error: null }
  }

  const withPhotos = await supabase
    .from('inventory')
    .select(`${INVENTORY_SELECT},valve_image_url,tag_image_url,qr_code_data_url,valve_types(label)`)
    .order('updated_at', { ascending: false })
    .limit(2000)

  if (!withPhotos.error) {
    return { data: ((withPhotos.data ?? []) as InventoryRow[]).map(mapInventoryRow), error: null }
  }

  const { data, error } = await supabase
    .from('inventory')
    .select(`${INVENTORY_SELECT},valve_types(label)`)
    .order('updated_at', { ascending: false })
    .limit(2000)

  if (error) {
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
  apiTrims: string[]
  sizes: string[]
  pressureClasses: string[]
  error: string | null
}> {
  const [lookups, customersRes] = await Promise.all([
    loadLookupOptionsMap(),
    supabase.from('customers').select('name').order('name').limit(2000),
  ])

  const customerNames = ((customersRes.data ?? []) as { name: string }[])
    .map((row) => row.name?.trim())
    .filter(Boolean) as string[]

  const pressureFromLookup = lookups.pressure_class ?? []
  const pressureClasses = pressureFromLookup.length
    ? pressureFromLookup
    : [...PRESSURE_CLASSES]

  const apiTrimFromLookup = lookups.api_trim ?? []
  const apiTrims = apiTrimFromLookup.length ? apiTrimFromLookup : [...API_TRIMS]

  return {
    customers: customerNames,
    manufacturers: lookups.manufacturer ?? [],
    valveTypes: lookups.valve_type ?? [],
    bodyMaterials: lookups.body_material ?? [],
    apiTrims,
    sizes: lookups.valve_size ?? [],
    pressureClasses,
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

  const again = await supabase.from('manufacturers').select('id').eq('name', trimmed).maybeSingle()
  return again.data?.id ? String(again.data.id) : null
}

async function ensureValveTypeId(label: string): Promise<string | null> {
  const trimmed = label.trim()
  if (!trimmed) return null

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
    origin: resolveInventoryOrigin(form.origin, form.originOther) || null,
    notes: form.notes.trim() || null,
    hf_acid: Boolean(form.hfAcid),
  }
}

function friendlyInventoryError(message: string | undefined): string {
  if (!message) return 'Could not save customer inventory item'
  if (message.includes('js_inventory_id') || message.includes('23505')) {
    return 'That JS inventory ID is already in use'
  }
  if (message.includes('permission') || message.includes('policy') || message.includes('RLS')) {
    return 'Run migration-inventory-rls.sql in Supabase, then try again'
  }
  return message
}

function extFromFile(file: File): string {
  const name = file.name
  if (!name.includes('.')) {
    if (file.type === 'image/png') return '.png'
    if (file.type === 'image/webp') return '.webp'
    return '.jpg'
  }
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : '.jpg'
}

export function validateInventoryPhoto(file: File): string | null {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(file.name)) {
    return 'Please choose an image file'
  }
  if (file.size > INVENTORY_MAX_IMAGE_BYTES) {
    return 'Image is too large (max 8 MB)'
  }
  return null
}

export async function uploadInventoryPhoto(
  inventoryId: string,
  kind: 'valve' | 'tag',
  file: File,
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  const validation = validateInventoryPhoto(file)
  if (validation) return { url: null, path: null, error: validation }

  const path = `inventory/${inventoryId}/${kind}-${crypto.randomUUID()}${extFromFile(file)}`
  const { error } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) return { url: null, path: null, error: error.message || 'Photo upload failed' }
  return { url: attachmentPublicUrl(path), path, error: null }
}

export function resolveInventoryPublicOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window === 'undefined') return PRODUCTION_APP_ORIGIN
  const { origin, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return PRODUCTION_APP_ORIGIN
  return origin.replace(/\/$/, '')
}

export function buildInventoryItemUrl(inventoryId: string, origin = resolveInventoryPublicOrigin()): string {
  return `${origin.replace(/\/$/, '')}/admin/inventory?item=${encodeURIComponent(inventoryId)}`
}

export async function createInventoryQrDataUrl(inventoryId: string, size = 280): Promise<string> {
  return QRCode.toDataURL(buildInventoryItemUrl(inventoryId), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

async function writeInventoryRow(
  mode: 'insert' | 'update',
  id: string,
  payload: Record<string, unknown>,
): Promise<{ data: InventoryRecord | null; error: string | null }> {
  const withExtras = {
    ...payload,
    valve_image_url: payload.valve_image_url ?? null,
    tag_image_url: payload.tag_image_url ?? null,
    qr_code_data_url: payload.qr_code_data_url ?? null,
  }

  const run = async (body: Record<string, unknown>) => {
    if (mode === 'insert') {
      return supabase.from('inventory').insert({ id, ...body }).select(INVENTORY_SELECT).single()
    }
    return supabase.from('inventory').update(body).eq('id', id).select(INVENTORY_SELECT).single()
  }

  const primary = await run(withExtras)
  if (!primary.error && primary.data) return { data: mapInventoryRow(primary.data as InventoryRow), error: null }

  let lastError = primary.error?.message

  if (lastError && /hf_acid/i.test(lastError)) {
    const withoutHf: Record<string, unknown> = { ...withExtras }
    delete withoutHf.hf_acid
    const retry = await run(withoutHf)
    if (!retry.error && retry.data) return { data: mapInventoryRow(retry.data as InventoryRow), error: null }
    lastError = retry.error?.message || lastError
  }

  if (lastError && /valve_image_url|tag_image_url|qr_code_data_url/i.test(lastError)) {
    const packedOnly: Record<string, unknown> = { ...payload }
    delete packedOnly.valve_image_url
    delete packedOnly.tag_image_url
    delete packedOnly.qr_code_data_url
    delete packedOnly.hf_acid
    const fallback = await run(packedOnly)
    if (!fallback.error && fallback.data) return { data: mapInventoryRow(fallback.data as InventoryRow), error: null }
    lastError = fallback.error?.message || lastError
  }

  return { data: null, error: friendlyInventoryError(lastError) }
}

export async function createInventoryRecord(
  form: InventoryFormState,
  photos: { valve: File; tag: File },
): Promise<{ data: InventoryRecord | null; error: string | null }> {
  const id = crypto.randomUUID()
  const [manufacturerId, valveTypeId, valveUpload, tagUpload, allocated] = await Promise.all([
    ensureManufacturerId(form.manufacturerName),
    ensureValveTypeId(form.valveType),
    uploadInventoryPhoto(id, 'valve', photos.valve),
    uploadInventoryPhoto(id, 'tag', photos.tag),
    allocateNextJsInventoryId(),
  ])

  if (valveUpload.error || !valveUpload.url) {
    if (tagUpload.path) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([tagUpload.path])
    return { data: null, error: valveUpload.error || 'Valve photo upload failed' }
  }
  if (tagUpload.error || !tagUpload.url) {
    if (valveUpload.path) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([valveUpload.path])
    return { data: null, error: tagUpload.error || 'Tag photo upload failed' }
  }

  let qrCodeDataUrl: string
  try {
    qrCodeDataUrl = await createInventoryQrDataUrl(id)
  } catch {
    if (valveUpload.path) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([valveUpload.path])
    if (tagUpload.path) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([tagUpload.path])
    return { data: null, error: 'Could not generate QR code' }
  }

  const cleanupUploads = async () => {
    if (valveUpload.path) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([valveUpload.path])
    if (tagUpload.path) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([tagUpload.path])
  }

  // Prefer freshly allocated ID; fall back to form value only if allocation failed oddly.
  let jsInventoryId = allocated.id || form.jsInventoryId.trim()
  if (!jsInventoryId) {
    await cleanupUploads()
    return { data: null, error: 'Could not assign a JS inventory ID' }
  }

  const base = formToPayload({ ...form, jsInventoryId }, manufacturerId, valveTypeId)
  const mediaPayload = {
    image_url: packMedia({
      valveImageUrl: valveUpload.url,
      tagImageUrl: tagUpload.url,
      qrCodeDataUrl,
      hfAcid: form.hfAcid,
    }),
    valve_image_url: valveUpload.url,
    tag_image_url: tagUpload.url,
    qr_code_data_url: qrCodeDataUrl,
  }

  // Retry a few times if another user grabbed the same sequence concurrently.
  let lastError: string | null = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = {
      ...base,
      js_inventory_id: jsInventoryId,
      ...mediaPayload,
    }
    const result = await writeInventoryRow('insert', id, payload)
    if (!result.error && result.data) return result

    lastError = result.error
    const isDuplicate =
      Boolean(result.error?.includes('already in use')) ||
      Boolean(result.error?.includes('23505')) ||
      Boolean(result.error?.includes('js_inventory_id'))
    if (!isDuplicate) {
      await cleanupUploads()
      return result
    }

    const next = await allocateNextJsInventoryId()
    jsInventoryId = next.id
  }

  await cleanupUploads()
  return { data: null, error: lastError || 'Could not assign a unique JS inventory ID' }
}

export async function updateInventoryRecord(
  id: string,
  form: InventoryFormState,
  photos: {
    valve: InventoryPhotoDraft
    tag: InventoryPhotoDraft
    existing: InventoryRecord
  },
): Promise<{ data: InventoryRecord | null; error: string | null }> {
  const valveUrl = photos.valve.existingUrl
  const tagUrl = photos.tag.existingUrl
  if (!photos.valve.file && !valveUrl) return { data: null, error: 'A picture of the valve is required' }
  if (!photos.tag.file && !tagUrl) return { data: null, error: 'A picture of the tag is required' }

  const [manufacturerId, valveTypeId] = await Promise.all([
    ensureManufacturerId(form.manufacturerName),
    ensureValveTypeId(form.valveType),
  ])

  let nextValveUrl = valveUrl
  let nextTagUrl = tagUrl
  const uploadedPaths: string[] = []

  if (photos.valve.file) {
    const uploaded = await uploadInventoryPhoto(id, 'valve', photos.valve.file)
    if (uploaded.error || !uploaded.url) return { data: null, error: uploaded.error || 'Valve photo upload failed' }
    nextValveUrl = uploaded.url
    if (uploaded.path) uploadedPaths.push(uploaded.path)
  }
  if (photos.tag.file) {
    const uploaded = await uploadInventoryPhoto(id, 'tag', photos.tag.file)
    if (uploaded.error || !uploaded.url) {
      if (uploadedPaths.length) await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove(uploadedPaths)
      return { data: null, error: uploaded.error || 'Tag photo upload failed' }
    }
    nextTagUrl = uploaded.url
    if (uploaded.path) uploadedPaths.push(uploaded.path)
  }

  const qrCodeDataUrl =
    photos.existing.qr_code_data_url?.trim() || (await createInventoryQrDataUrl(id))

  const base = formToPayload(form, manufacturerId, valveTypeId)
  const payload = {
    ...base,
    image_url: packMedia({
      valveImageUrl: nextValveUrl,
      tagImageUrl: nextTagUrl,
      qrCodeDataUrl,
      hfAcid: form.hfAcid,
    }),
    valve_image_url: nextValveUrl,
    tag_image_url: nextTagUrl,
    qr_code_data_url: qrCodeDataUrl,
  }

  const result = await writeInventoryRow('update', id, payload)
  if (result.error && uploadedPaths.length) {
    await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove(uploadedPaths)
  }
  return result
}

export async function deleteInventoryRecord(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('inventory').delete().eq('id', id)
  if (error) return { error: friendlyInventoryError(error.message) }
  // Best-effort cleanup of storage folder objects is skipped (paths are UUID-unique).
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
    row.hf_acid ? 'hf acid' : '',
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .join(' ')
  return haystack.includes(q)
}
