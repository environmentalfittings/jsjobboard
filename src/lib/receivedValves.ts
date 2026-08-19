import { attachmentPublicUrl, VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'
import {
  legacyFieldsFromReceivedValveImages,
  mergeReceivedValveImages,
  receivedValveImagesToJson,
  type ReceivedValveImage,
  type ReceivedValvePhotoDraft,
} from './receivedValveImages'
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

export type { ReceivedValveImage, ReceivedValvePhotoDraft } from './receivedValveImages'
export { MAX_RECEIVED_VALVE_PHOTOS, draftsFromReceivedValveImages } from './receivedValveImages'

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
  notes: string
  images: ReceivedValveImage[]
  /** First picture URL (legacy column kept in sync). */
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
  notes: string
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
  notes: string | null
  image_url: string | null
  image_storage_path: string | null
  image_name: string | null
  images: unknown
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
    notes: '',
  }
}

function emptyToNullDate(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function dbRowToRecord(row: ReceivedValveDbRow): ReceivedValveRecord {
  const images = mergeReceivedValveImages(row.images, row)
  const legacy = legacyFieldsFromReceivedValveImages(images)
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
    notes: row.notes ?? '',
    images,
    imageDataUrl: legacy.imageDataUrl,
    imageStoragePath: legacy.imageStoragePath,
    imageName: legacy.imageName,
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
    notes: row.notes,
    images: receivedValveImagesToJson(row.images),
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
  const images = Array.isArray(r.images)
    ? mergeReceivedValveImages(r.images, {
        image_url: typeof r.imageDataUrl === 'string' ? r.imageDataUrl : null,
        image_storage_path: typeof r.imageStoragePath === 'string' ? r.imageStoragePath : null,
        image_name: typeof r.imageName === 'string' ? r.imageName : null,
      })
    : mergeReceivedValveImages([], {
        image_url: typeof r.imageDataUrl === 'string' ? r.imageDataUrl : null,
        image_storage_path: typeof r.imageStoragePath === 'string' ? r.imageStoragePath : null,
        image_name: typeof r.imageName === 'string' ? r.imageName : null,
      })
  const legacy = legacyFieldsFromReceivedValveImages(images)
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
    notes: typeof r.notes === 'string' ? r.notes : '',
    images,
    imageDataUrl: legacy.imageDataUrl,
    imageStoragePath: legacy.imageStoragePath,
    imageName: legacy.imageName,
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
    // Keep Converted / Lost at the bottom of the list.
    const aArchived = isArchivedReceivedValveStatus(a.status) ? 1 : 0
    const bArchived = isArchivedReceivedValveStatus(b.status) ? 1 : 0
    if (aArchived !== bArchived) return aArchived - bArchived

    const dateCompare = (b.receivedDate ?? '').localeCompare(a.receivedDate ?? '')
    if (dateCompare !== 0) return dateCompare
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

export type ReceivedValveSortKey =
  | 'receivedDate'
  | 'customer'
  | 'description'
  | 'teardownInspectionDate'
  | 'warehouseCheckInDate'
  | 'estimateNumber'
  | 'salesOrderNumber'
  | 'workOrderPrinted'
  | 'status'
  | 'rfq'
  | 'notes'

export function sortReceivedValveRowsBy(
  rows: ReceivedValveRecord[],
  sortKey: ReceivedValveSortKey,
  sortDirection: 'asc' | 'desc',
): ReceivedValveRecord[] {
  const dir = sortDirection === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const aArchived = isArchivedReceivedValveStatus(a.status) ? 1 : 0
    const bArchived = isArchivedReceivedValveStatus(b.status) ? 1 : 0
    if (aArchived !== bArchived) return aArchived - bArchived

    const av = receivedValveSortValue(a, sortKey)
    const bv = receivedValveSortValue(b, sortKey)
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  })
}

function receivedValveSortValue(row: ReceivedValveRecord, key: ReceivedValveSortKey): string {
  switch (key) {
    case 'receivedDate':
      return row.receivedDate || ''
    case 'customer':
      return row.customer.toLowerCase()
    case 'description':
      return row.description.toLowerCase()
    case 'teardownInspectionDate':
      return row.teardownInspectionDate || ''
    case 'warehouseCheckInDate':
      return row.warehouseCheckInDate || ''
    case 'estimateNumber':
      return row.estimateNumber.toLowerCase()
    case 'salesOrderNumber':
      return row.salesOrderNumber.toLowerCase()
    case 'workOrderPrinted':
      return row.workOrderPrinted ? 'yes' : 'no'
    case 'status':
      return receivedValveStatusLabel(row.status).toLowerCase()
    case 'rfq':
      return row.sentToRfqAt ? 'sent' : 'not_sent'
    case 'notes':
      return row.notes.toLowerCase()
    default:
      return ''
  }
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

async function removeStoragePaths(paths: string[]) {
  const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (!unique.length) return
  await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove(unique)
}

export async function finalizeReceivedValvePhotoDrafts(
  entryId: string,
  drafts: ReceivedValvePhotoDraft[],
  pathsToDelete: string[],
): Promise<{ images: ReceivedValveImage[]; error: string | null }> {
  const images: ReceivedValveImage[] = []

  for (const draft of drafts) {
    if (draft.file) {
      const uploaded = await uploadReceivedValveImage(entryId, draft.file)
      if (!uploaded.ok) return { images: [], error: uploaded.error }
      images.push({
        storage_path: uploaded.storagePath,
        url: uploaded.url,
        file_name: draft.name,
      })
      continue
    }

    if (draft.url.trim()) {
      images.push({
        storage_path: draft.storagePath?.trim() || '',
        url: draft.url,
        file_name: draft.name,
      })
    }
  }

  await removeStoragePaths(pathsToDelete)
  return { images, error: null }
}

export function receivedValveRecordWithImages(
  row: ReceivedValveRecord,
  images: ReceivedValveImage[],
): ReceivedValveRecord {
  const legacy = legacyFieldsFromReceivedValveImages(images)
  return {
    ...row,
    images,
    imageDataUrl: legacy.imageDataUrl,
    imageStoragePath: legacy.imageStoragePath,
    imageName: legacy.imageName,
  }
}

const RECEIVED_VALVE_SELECT =
  'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,status,notes,images,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at'

const RECEIVED_VALVE_SELECT_NO_IMAGES =
  'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,status,notes,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at'

const RECEIVED_VALVE_SELECT_NO_NOTES =
  'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,status,images,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at'

const RECEIVED_VALVE_SELECT_NO_NOTES_NO_IMAGES =
  'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,status,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at'

const RECEIVED_VALVE_SELECT_LEGACY =
  'id,received_date,customer,description,teardown_inspection_date,warehouse_check_in_date,estimate_number,sales_order_number,work_order_printed,image_url,image_storage_path,image_name,sent_to_rfq_at,created_at'

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return /column .*(status|notes|images).* does not exist/i.test(error.message ?? '') || error.code === '42703'
}

function isMissingImagesColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return /column .*images.* does not exist/i.test(error.message ?? '')
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false
  return (
    /relation .*received_valves.* does not exist/i.test(error.message ?? '') ||
    error.code === '42P01' ||
    error.code === 'PGRST205'
  )
}

export async function fetchReceivedValveRows(): Promise<
  { ok: true; rows: ReceivedValveRecord[] } | { ok: false; error: string; missingTable?: boolean }
> {
  const primary = await supabase
    .from('received_valves')
    .select(RECEIVED_VALVE_SELECT)
    .order('received_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!primary.error) {
    return {
      ok: true,
      rows: ((primary.data ?? []) as ReceivedValveDbRow[]).map(dbRowToRecord),
    }
  }

  if (isMissingImagesColumnError(primary.error)) {
    const withoutImages = await supabase
      .from('received_valves')
      .select(RECEIVED_VALVE_SELECT_NO_IMAGES)
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (!withoutImages.error) {
      return {
        ok: true,
        rows: ((withoutImages.data ?? []) as ReceivedValveDbRow[]).map((row) =>
          dbRowToRecord({ ...row, images: [] }),
        ),
      }
    }
  }

  // Notes column missing — keep status so Converted/Lost still persist in the UI.
  if (isMissingColumnError(primary.error)) {
    const withStatus = await supabase
      .from('received_valves')
      .select(RECEIVED_VALVE_SELECT_NO_NOTES)
      .order('received_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (!withStatus.error) {
      return {
        ok: true,
        rows: ((withStatus.data ?? []) as ReceivedValveDbRow[]).map((row) =>
          dbRowToRecord({ ...row, notes: row.notes ?? '' }),
        ),
      }
    }

    if (isMissingImagesColumnError(withStatus.error)) {
      const withoutImages = await supabase
        .from('received_valves')
        .select(RECEIVED_VALVE_SELECT_NO_NOTES_NO_IMAGES)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!withoutImages.error) {
        return {
          ok: true,
          rows: ((withoutImages.data ?? []) as ReceivedValveDbRow[]).map((row) =>
            dbRowToRecord({ ...row, notes: '', images: [] }),
          ),
        }
      }
    }

    // Status column also missing — last-resort legacy shape.
    if (isMissingColumnError(withStatus.error)) {
      const legacy = await supabase
        .from('received_valves')
        .select(RECEIVED_VALVE_SELECT_LEGACY)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (!legacy.error) {
        return {
          ok: true,
          rows: ((legacy.data ?? []) as ReceivedValveDbRow[]).map((row) =>
            dbRowToRecord({ ...row, status: DEFAULT_RECEIVED_VALVE_STATUS, notes: '' }),
          ),
        }
      }

      if (isMissingTableError(legacy.error)) {
        return {
          ok: false,
          error: legacy.error.message || 'Could not load received valves',
          missingTable: true,
        }
      }
      return { ok: false, error: legacy.error?.message || withStatus.error.message || primary.error.message }
    }

    if (isMissingTableError(withStatus.error)) {
      return {
        ok: false,
        error: withStatus.error.message || 'Could not load received valves',
        missingTable: true,
      }
    }
    return { ok: false, error: withStatus.error.message || primary.error.message }
  }

  if (isMissingTableError(primary.error)) {
    return {
      ok: false,
      error: primary.error.message || 'Could not load received valves',
      missingTable: true,
    }
  }

  return { ok: false, error: primary.error.message || 'Could not load received valves' }
}

export async function insertReceivedValve(
  row: ReceivedValveRecord,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId()
  let payload: Record<string, unknown> = recordToDbInsert(row, userId)
  let { error } = await supabase.from('received_valves').insert(payload)
  if (error && isMissingImagesColumnError(error)) {
    const legacyPayload = { ...payload }
    delete legacyPayload.images
    ;({ error } = await supabase.from('received_valves').insert(legacyPayload))
  }
  if (error) return { ok: false, error: error.message || 'Could not save received valve' }
  return { ok: true }
}

export type ReceivedValveUpdatePatch = Partial<
  Pick<
    ReceivedValveRecord,
    | 'receivedDate'
    | 'customer'
    | 'description'
    | 'teardownInspectionDate'
    | 'warehouseCheckInDate'
    | 'estimateNumber'
    | 'salesOrderNumber'
    | 'workOrderPrinted'
    | 'status'
    | 'notes'
    | 'sentToRfqAt'
    | 'images'
    | 'imageDataUrl'
    | 'imageStoragePath'
    | 'imageName'
  >
>

export async function updateReceivedValve(
  id: string,
  patch: ReceivedValveUpdatePatch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('receivedDate' in patch) payload.received_date = emptyToNullDate(patch.receivedDate ?? '') ?? todayIsoDate()
  if ('customer' in patch) payload.customer = (patch.customer ?? '').trim()
  if ('description' in patch) payload.description = (patch.description ?? '').trim()
  if ('teardownInspectionDate' in patch) {
    payload.teardown_inspection_date = emptyToNullDate(patch.teardownInspectionDate ?? '')
  }
  if ('warehouseCheckInDate' in patch) {
    payload.warehouse_check_in_date = emptyToNullDate(patch.warehouseCheckInDate ?? '')
  }
  if ('estimateNumber' in patch) payload.estimate_number = (patch.estimateNumber ?? '').trim()
  if ('salesOrderNumber' in patch) payload.sales_order_number = (patch.salesOrderNumber ?? '').trim()
  if ('workOrderPrinted' in patch) payload.work_order_printed = Boolean(patch.workOrderPrinted)
  if ('status' in patch && patch.status) payload.status = patch.status
  if ('notes' in patch) payload.notes = patch.notes ?? ''
  if ('sentToRfqAt' in patch) payload.sent_to_rfq_at = patch.sentToRfqAt
  if ('images' in patch) payload.images = receivedValveImagesToJson(patch.images ?? [])
  if ('imageDataUrl' in patch) payload.image_url = patch.imageDataUrl
  if ('imageStoragePath' in patch) payload.image_storage_path = patch.imageStoragePath
  if ('imageName' in patch) payload.image_name = patch.imageName

  let { error } = await supabase.from('received_valves').update(payload).eq('id', id)
  if (error && 'images' in payload && isMissingImagesColumnError(error)) {
    const legacyPayload = { ...payload }
    delete legacyPayload.images
    ;({ error } = await supabase.from('received_valves').update(legacyPayload).eq('id', id))
  }
  if (error) return { ok: false, error: error.message || 'Could not update received valve' }
  return { ok: true }
}

export async function deleteReceivedValve(
  row: ReceivedValveRecord,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('received_valves').delete().eq('id', row.id)
  if (error) return { ok: false, error: error.message || 'Could not delete received valve' }
  await removeStoragePaths(row.images.map((image) => image.storage_path))
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
    let images = local.images
    if (imageUrl && imageUrl.startsWith('data:')) {
      const uploaded = await uploadReceivedValveImageFromDataUrl(local.id, imageUrl, local.imageName)
      if (uploaded.ok) {
        imageUrl = uploaded.url
        imageStoragePath = uploaded.storagePath
        images = [
          {
            storage_path: uploaded.storagePath,
            url: uploaded.url,
            file_name: local.imageName?.trim() || 'Photo',
          },
        ]
      } else {
        // Keep the data URL in image_url as a last resort so the row is not lost.
        imageStoragePath = null
      }
    }

    const migratedRow = receivedValveRecordWithImages(
      {
        ...local,
        imageDataUrl: imageUrl,
        imageStoragePath,
        images: images.length ? images : local.images,
      },
      images.length ? images : local.images,
    )

    const payload = recordToDbInsert(migratedRow, userId)

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
