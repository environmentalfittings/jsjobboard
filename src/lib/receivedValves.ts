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
  imageDataUrl: string | null
  imageName: string | null
  createdAt: string
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
  imageDataUrl: string | null
  imageName: string | null
}

export const RECEIVED_VALVES_STORAGE_KEY = 'js-job-board-received-valves-v1'
export const RECEIVED_VALVE_MAX_IMAGE_BYTES = 2 * 1024 * 1024

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
    imageDataUrl: null,
    imageName: null,
  }
}

export function loadReceivedValveRows(): ReceivedValveRecord[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(RECEIVED_VALVES_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((row) => row && typeof row === 'object') as ReceivedValveRecord[]
  } catch {
    return []
  }
}

export function saveReceivedValveRows(rows: ReceivedValveRecord[]): { ok: true } | { ok: false; error: string } {
  try {
    window.localStorage.setItem(RECEIVED_VALVES_STORAGE_KEY, JSON.stringify(rows))
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Storage write failed',
    }
  }
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
