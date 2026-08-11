import { attachmentPublicUrl, VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'
import { supabase } from './supabase'

export const RECEIVED_VALVE_STATUSES = [
  'waiting_on_salesman',
  'waiting_on_customer',
  'quoted',
  'converted',
  'lost',
] as const

export type ReceivedValveStatus = (typeof RECEIVED_VALVE_STATUSES)[number]

export const RECEIVED_VALVE_STATUS_LABELS: Record<ReceivedValveStatus, string> = {
  waiting_on_salesman: 'Waiting on Salesman',
  waiting_on_customer: 'Waiting on Customer',
  quoted: 'Quoted',
  converted: 'Converted',
  lost: 'Lost',
}

export const DEFAULT_RECEIVED_VALVE_STATUS: ReceivedValveStatus = 'waiting_on_salesman'

export function isReceivedValveStatus(value: unknown): value is ReceivedValveStatus {
  return typeof value === 'string' && (RECEIVED_VALVE_STATUSES as readonly string[]).includes(value)
}

export function normalizeReceivedValveStatus(value: unknown): ReceivedValveStatus {
  return isReceivedValveStatus(value) ? value : DEFAULT_RECEIVED_VALVE_STATUS
}

export function receivedValveStatusLabel(status: ReceivedValveStatus) {
  return RECEIVED_VALVE_STATUS_LABELS[status]
}

export type ReceivedValveRecord = {
  id: string
  receivedDate: string
  customer: string
  description: string
  teardownInspectionDate: string
  warehouseCheckInDate: string
  estimateNumber: string
  salesOrderNumber: string
  workOrderPrinted: boolean
  status: ReceivedValveStatus
  /** Public image URL (or legacy local data URL during migration). */
  imageDataUrl: string | null
  imageStoragePath: string | null
  imageName: string | null
  /** ISO timestamp when an RFQ email was composed for this entry (optional / legacy-safe). */
  sentToRfqAt: string | null
  createdAt: string
}

/** Active log entries shown on the Dashboard (Converted / Lost are excluded). */
export function isActiveReceivedValve(row: Pick<ReceivedValveRecord, 'status'>) {
  return row.status !== 'converted' && row.status !== 'lost'
}

/** Statuses that leave the Dashboard but remain in Reports. */
export function isArchivedReceivedValveStatus(status: ReceivedValveStatus) {
  return status === 'converted' || status === 'lost'
}

export type ReceivedValveFormState = {
  receivedDate: string
  customer: string
  description: string
  teardownInspectionDate: string
  warehouseCheckInDate: string
  estimateNumber: string
  salesOrderNumber: string
  workOrderPrinted: 'yes' | 'no'
  status: ReceivedValveStatus
  sendToRfq: boolean
  imageDataUrl: string | null
  imageName: string | null
}

export const RECEIVED_VALVES_STORAGE_KEY = 'js-job-board-received-valves-v1'
export const RECEIVED_VALVES_MIGRATED_KEY = 'js-job-board-received-valves-migrated-v1'
/** Max size for the original camera/gallery file before compression. */
export const RECEIVED_VALVE_MAX_IMAGE_BYTES = 20 * 1024 * 1024
/** Target size after client-side JPEG compression. */
export const RECEIVED_VALVE_TARGET_IMAGE_BYTES = 1.5 * 1024 * 1024
const RECEIVED_VALVE_MAX_IMAGE_EDGE = 1600

type ReceivedValveDbRow = {
  id: string
  received_date: string | null
  customer: string | null
  description: string | null
  teardown_inspection_date: string | null
  warehouse_check_in_date: string | null
  estimate_number: string | null
  sales_order_number: string | null
  work_order_printed: boolean | null
  status: string | null
  image_url: string | null
  image_storage_path: string | null
  image_name: string | null
  sent_to_rfq_at: string | null
  created_at: string | null
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function emptyReceivedValveForm(): ReceivedValveFormState {
  return {
    receivedDate: todayIsoDate(),
    customer: '',
    description: '',
    teardownInspectionDate: '',
    warehouseCheckInDate: '',
    estimateNumber: '',
    salesOrderNumber: '',
    workOrderPrinted: 'no',
    status: DEFAULT_RECEIVED_VALVE_STATUS,
    sendToRfq: false,
    imageDataUrl: null,
    imageName: null,
  }
}

function emptyToNullDate(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function dbRowToRecord(row: ReceivedValveDbRow): ReceivedValveRecord {
  return {
    id: row.id,
    receivedDate: row.received_date ?? '',
    customer: row.customer ?? '',
    description: row.description ?? '',
    teardownInspectionDate: row.teardown_inspection_date ?? '',
    warehouseCheckInDate: row.warehouse_check_in_date ?? '',
    estimateNumber: row.estimate_number ?? '',
    salesOrderNumber: row.sales_order_number ?? '',
    workOrderPrinted: Boolean(row.work_order_printed),
    status: normalizeReceivedValveStatus(row.status),
    imageDataUrl: row.image_url,
    imageStoragePath: row.image_storage_path,
    imageName: row.image_name,
    sentToRfqAt: row.sent_to_rfq_at,
    createdAt: row.created_at ?? '',
  }
}

function recordToDbInsert(row: ReceivedValveRecord, userId: string | null) {
  return {
    id: row.id,
    received_date: emptyToNullDate(row.receivedDate) ?? todayIsoDate(),
    customer: row.customer,
    description: row.description,
    teardown_inspection_date: emptyToNullDate(row.teardownInspectionDate),
    warehouse_check_in_date: emptyToNullDate(row.warehouseCheckInDate),
    estimate_number: row.estimateNumber,
    sales_order_number: row.salesOrderNumber,
    work_order_printed: row.workOrderPrinted,
    status: row.status,
    image_url: row.imageDataUrl,
    image_storage_path: row.imageStoragePath,
    image_name: row.imageName,
    sent_to_rfq_at: row.sentToRfqAt,
    created_by_user_id: userId,
    created_at: row.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function normalizeLocalRow(row: unknown): ReceivedValveRecord | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Partial<ReceivedValveRecord>
  if (typeof r.id !== 'string' || !r.id) return null
  return {
    id: r.id,
    receivedDate: typeof r.receivedDate === 'string' ? r.receivedDate : '',
    customer: typeof r.customer === 'string' ? r.customer : '',
    description: typeof r.description === 'string' ? r.description : '',
    teardownInspectionDate: typeof r.teardownInspectionDate === 'string' ? r.teardownInspectionDate : '',
    warehouseCheckInDate: typeof r.warehouseCheckInDate === 'string' ? r.warehouseCheckInDate : '',
    estimateNumber: typeof r.estimateNumber === 'string' ? r.estimateNumber : '',
    salesOrderNumber: typeof r.salesOrderNumber === 'string' ? r.salesOrderNumber : '',
    workOrderPrinted: Boolean(r.workOrderPrinted),
    status: normalizeReceivedValveStatus(r.status),
    imageDataUrl: typeof r.imageDataUrl === 'string' ? r.imageDataUrl : null,
    imageStoragePath: typeof r.imageStoragePath === 'string' ? r.imageStoragePath : null,
    imageName: typeof r.imageName === 'string' ? r.imageName : null,
    sentToRfqAt: typeof r.sentToRfqAt === 'string' ? r.sentToRfqAt : null,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
  }
}

/** Legacy browser-only rows (pre shared DB). */
export function loadLocalReceivedValveRows(): ReceivedValveRecord[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(RECEIVED_VALVES_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeLocalRow).filter((row): row is ReceivedValveRecord => Boolean(row))
  } catch {
    return []
  }
}

export function clearLocalReceivedValveRows() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(RECEIVED_VALVES_STORAGE_KEY)
  window.localStorage.setItem(RECEIVED_VALVES_MIGRATED_KEY, '1')
}

export function sortReceivedValveRows(rows: ReceivedValveRecord[]): ReceivedValveRecord[] {
  return [...rows].sort((a, b) => {
    const dateCompare = (b.receivedDate ?? '').localeCompare(a.receivedDate ?? '')
    if (dateCompare !== 0) return dateCompare
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

function isLikelyImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name)
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this image. Try taking the photo again as JPEG.'))
    }
    img.src = url
  })
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

function jpegFileName(originalName: string) {
  const base = originalName.replace(/\.[^.]+$/, '').trim() || 'received-valve'
  return `${base}.jpg`
}

/**
 * Accepts large iPad/phone photos (up to 20 MB), then compresses to a JPEG
 * suitable for storage and RFQ email sharing.
 */
export async function prepareReceivedValveImage(
  file: File,
): Promise<{ ok: true; file: File; dataUrl: string } | { ok: false; error: string }> {
  if (!isLikelyImageFile(file)) {
    return { ok: false, error: 'Please select an image file' }
  }
  if (file.size > RECEIVED_VALVE_MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image is too large (max 20 MB)' }
  }

  // Already a small JPEG — keep as-is.
  if (file.type === 'image/jpeg' && file.size <= RECEIVED_VALVE_TARGET_IMAGE_BYTES) {
    try {
      const dataUrl = await readFileAsDataUrl(file)
      return { ok: true, file, dataUrl }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not read image file' }
    }
  }

  try {
    const img = await loadImageFromFile(file)
    const scale = Math.min(1, RECEIVED_VALVE_MAX_IMAGE_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height, 1))
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale))
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false, error: 'Could not process image' }
    ctx.drawImage(img, 0, 0, width, height)

    let quality = 0.85
    let blob: Blob | null = null
    for (let attempt = 0; attempt < 6; attempt += 1) {
      blob = await canvasToJpegBlob(canvas, quality)
      if (!blob) break
      if (blob.size <= RECEIVED_VALVE_TARGET_IMAGE_BYTES || quality <= 0.45) break
      quality -= 0.1
    }
    if (!blob) return { ok: false, error: 'Could not compress image' }

    const outFile = new File([blob], jpegFileName(file.name), { type: 'image/jpeg' })
    const dataUrl = await readFileAsDataUrl(outFile)
    return { ok: true, file: outFile, dataUrl }
  } catch (error) {
    // If the browser cannot decode (e.g. some HEIC), fall back when the original is still under the hard cap.
    if (file.size <= RECEIVED_VALVE_MAX_IMAGE_BYTES && file.type.startsWith('image/')) {
      try {
        const dataUrl = await readFileAsDataUrl(file)
        return { ok: true, file, dataUrl }
      } catch {
        // continue to error below
      }
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not process image',
    }
  }
}

function extFromName(name: string) {
  if (!name.includes('.')) return '.jpg'
  const ext = name.slice(name.lastIndexOf('.'))
  return ext.length <= 12 ? ext : '.jpg'
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) return null
    const mime = match[1] || 'image/jpeg'
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  } catch {
    return null
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function uploadReceivedValveImage(
  entryId: string,
  file: File,
): Promise<{ ok: true; url: string; storagePath: string } | { ok: false; error: string }> {
  if (file.size > RECEIVED_VALVE_MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image is too large (max 20 MB)' }
  }
  const path = `received-valves/${entryId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (error) return { ok: false, error: error.message || 'Image upload failed' }
  return { ok: true, url: attachmentPublicUrl(path), storagePath: path }
}

export async function uploadReceivedValveImageFromDataUrl(
  entryId: string,
  dataUrl: string,
  fileName: string | null,
): Promise<{ ok: true; url: string; storagePath: string } | { ok: false; error: string }> {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return { ok: false, error: 'Could not read saved image' }
  const name = fileName?.trim() || 'received-valve.jpg'
  const file = new File([blob], name, { type: blob.type || 'image/jpeg' })
  return uploadReceivedValveImage(entryId, file)
}

async function removeStoragePath(path: string | null | undefined) {
  if (!path) return
  await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([path])
}

const RECEIVED_VALVE_SELECT =
  'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,status,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at'

export async function fetchReceivedValveRows(): Promise<
  { ok: true; rows: ReceivedValveRecord[] } | { ok: false; error: string; missingTable?: boolean }
> {
  const { data, error } = await supabase
    .from('received_valves')
    .select(RECEIVED_VALVE_SELECT)
    .order('received_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    // Older DBs may not have status yet — retry without it and default the field.
    if (/column .*status.* does not exist/i.test(error.message) || error.code === '42703') {
      const legacy = await supabase
        .from('received_valves')
        .select(
          'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at',
        )
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (legacy.error) {
        return { ok: false, error: legacy.error.message || 'Could not load received valves' }
      }
      return {
        ok: true,
        rows: ((legacy.data ?? []) as ReceivedValveDbRow[]).map((row) =>
          dbRowToRecord({ ...row, status: DEFAULT_RECEIVED_VALVE_STATUS }),
        ),
      }
    }

    const missingTable =
      /relation .*received_valves.* does not exist/i.test(error.message) ||
      error.code === '42P01' ||
      error.code === 'PGRST205'
    return { ok: false, error: error.message || 'Could not load received valves', missingTable }
  }

  return {
    ok: true,
    rows: ((data ?? []) as ReceivedValveDbRow[]).map(dbRowToRecord),
  }
}

export async function insertReceivedValve(
  row: ReceivedValveRecord,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId()
  const { error } = await supabase.from('received_valves').insert(recordToDbInsert(row, userId))
  if (error) return { ok: false, error: error.message || 'Could not save received valve' }
  return { ok: true }
}

export async function updateReceivedValve(
  id: string,
  patch: Partial<
    Pick<ReceivedValveRecord, 'sentToRfqAt' | 'imageDataUrl' | 'imageStoragePath' | 'imageName' | 'status'>
  >,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('sentToRfqAt' in patch) payload.sent_to_rfq_at = patch.sentToRfqAt
  if ('imageDataUrl' in patch) payload.image_url = patch.imageDataUrl
  if ('imageStoragePath' in patch) payload.image_storage_path = patch.imageStoragePath
  if ('imageName' in patch) payload.image_name = patch.imageName
  if ('status' in patch && patch.status) payload.status = patch.status

  const { error } = await supabase.from('received_valves').update(payload).eq('id', id)
  if (error) return { ok: false, error: error.message || 'Could not update received valve' }
  return { ok: true }
}

export async function deleteReceivedValve(
  row: ReceivedValveRecord,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('received_valves').delete().eq('id', row.id)
  if (error) return { ok: false, error: error.message || 'Could not delete received valve' }
  await removeStoragePath(row.imageStoragePath)
  return { ok: true }
}

/**
 * One-time (per browser) push of legacy localStorage rows into Supabase so older
 * iPad/desktop entries become visible to everyone.
 */
export async function migrateLocalReceivedValvesToSupabase(): Promise<{
  migrated: number
  error?: string
}> {
  if (typeof window === 'undefined') return { migrated: 0 }
  if (window.localStorage.getItem(RECEIVED_VALVES_MIGRATED_KEY) === '1') {
    return { migrated: 0 }
  }

  const localRows = loadLocalReceivedValveRows()
  if (!localRows.length) {
    window.localStorage.setItem(RECEIVED_VALVES_MIGRATED_KEY, '1')
    return { migrated: 0 }
  }

  const remote = await fetchReceivedValveRows()
  if (!remote.ok) {
    return { migrated: 0, error: remote.error }
  }

  const existingIds = new Set(remote.rows.map((row) => row.id))
  const userId = await currentUserId()
  let migrated = 0

  for (const local of localRows) {
    if (existingIds.has(local.id)) continue

    let imageUrl = local.imageDataUrl
    let imageStoragePath = local.imageStoragePath
    if (imageUrl && imageUrl.startsWith('data:')) {
      const uploaded = await uploadReceivedValveImageFromDataUrl(local.id, imageUrl, local.imageName)
      if (uploaded.ok) {
        imageUrl = uploaded.url
        imageStoragePath = uploaded.storagePath
      } else {
        // Keep the data URL in image_url as a last resort so the row is not lost.
        imageStoragePath = null
      }
    }

    const payload = recordToDbInsert(
      {
        ...local,
        imageDataUrl: imageUrl,
        imageStoragePath,
      },
      userId,
    )

    const { error } = await supabase.from('received_valves').upsert(payload, { onConflict: 'id' })
    if (error) {
      return { migrated, error: error.message || 'Migration failed' }
    }
    migrated += 1
  }

  clearLocalReceivedValveRows()
  return { migrated }
}

/** Load shared rows, migrating any leftover browser-local entries first. */
export async function loadReceivedValveRowsShared(): Promise<
  { ok: true; rows: ReceivedValveRecord[]; migrated: number } | { ok: false; error: string; missingTable?: boolean }
> {
  const migration = await migrateLocalReceivedValvesToSupabase()
  const remote = await fetchReceivedValveRows()
  if (!remote.ok) {
    // Fall back to local rows so the iPad that saved them still sees them before SQL is run.
    const local = loadLocalReceivedValveRows()
    if (local.length) {
      return { ok: true, rows: sortReceivedValveRows(local), migrated: 0 }
    }
    return remote
  }
  return { ok: true, rows: remote.rows, migrated: migration.migrated }
}
