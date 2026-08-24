/**
 * Bixolon mPrint / Web Print SDK local bridge.
 *
 * The app listens on 127.0.0.1:18080. The site POSTs POS-printer JSON
 * (printBitmap) to {base}/{LogicalPrinterName}.bxl.
 *
 * Works best when mPrint / Web Print SDK is open with the SPP-R200III
 * registered (often "Printer1"). On iPad Safari, if localhost is blocked,
 * open the job board inside the mPrint / Web Print SDK in-app browser.
 */

export const BIXOLON_MPRINT_PRINTER_STORAGE_KEY = 'bixolon-mprint-printer-name'
export const BIXOLON_MPRINT_DEFAULT_PRINTER = 'Printer1'

/** Candidate local SDK base URLs (path is case-sensitive). */
export const BIXOLON_LOCAL_SDK_BASES = [
  'https://127.0.0.1:18080/WebPrintSDK/',
  'https://127.0.0.1:18080/mPrintBrowser/',
  'https://127.0.0.1:18080/mPrintServer/',
  'http://127.0.0.1:18080/WebPrintSDK/',
  'http://127.0.0.1:18080/mPrintBrowser/',
  'http://127.0.0.1:18080/mPrintServer/',
] as const

export type BixolonMPrintResult = {
  baseUrl: string
  printerName: string
  result: string
}

function buildPosPrintBitmapPayload(imageDataUrls: string[], widthDots: number): string {
  const functions: Record<string, Record<string, unknown[]>> = {}
  let n = 0
  const add = (name: string, args: unknown[]) => {
    functions[`func${n}`] = { [name]: args }
    n += 1
  }

  add('checkPrinterStatus', [])
  for (const dataUrl of imageDataUrls) {
    // width, alignment (1=center), dither (1=on) — matches Bixolon samples
    add('printBitmap', [dataUrl, widthDots, 1, 1])
  }

  return JSON.stringify({ id: 1, functions })
}

async function postPrintRequest(
  baseUrl: string,
  printerName: string,
  strSubmit: string,
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const url = `${baseUrl}${encodeURIComponent(printerName)}.bxl`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: strSubmit,
    })
    if (res.status === 404) {
      return { ok: false, error: `No printers (404) at ${url}` }
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} from ${url}` }
    }
    const text = await res.text()
    let result = text
    try {
      const parsed = JSON.parse(text) as { Result?: string }
      if (typeof parsed.Result === 'string') result = parsed.Result
    } catch {
      /* keep raw text */
    }
    const lower = result.toLowerCase()
    if (
      lower.includes('ready') ||
      lower.includes('progress') ||
      lower.includes('success') ||
      lower.includes('complete') ||
      lower.includes('print')
    ) {
      return { ok: true, result }
    }
    if (lower.includes('duplicated')) {
      return { ok: false, error: `Duplicate request: ${result}` }
    }
    // Some SDK builds return empty/odd success payloads; treat 200 as success.
    if (!result.trim()) return { ok: true, result: 'ok' }
    return { ok: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export function getStoredMPrintPrinterName(): string {
  try {
    const v = localStorage.getItem(BIXOLON_MPRINT_PRINTER_STORAGE_KEY)?.trim()
    return v || BIXOLON_MPRINT_DEFAULT_PRINTER
  } catch {
    return BIXOLON_MPRINT_DEFAULT_PRINTER
  }
}

export function storeMPrintPrinterName(name: string): void {
  const trimmed = name.trim() || BIXOLON_MPRINT_DEFAULT_PRINTER
  try {
    localStorage.setItem(BIXOLON_MPRINT_PRINTER_STORAGE_KEY, trimmed)
  } catch {
    /* ignore */
  }
}

/**
 * Send label PNG data URL(s) to the local Bixolon mPrint / Web Print SDK bridge.
 */
export async function printLabelPngsViaMPrint(
  imageDataUrls: string[],
  options: {
    printerName?: string
    widthDots?: number
    bases?: readonly string[]
  } = {},
): Promise<BixolonMPrintResult> {
  if (!imageDataUrls.length) {
    throw new Error('No label image to print')
  }

  const printerName = (options.printerName ?? getStoredMPrintPrinterName()).trim() || BIXOLON_MPRINT_DEFAULT_PRINTER
  storeMPrintPrinterName(printerName)

  const widthDots = options.widthDots ?? 384
  const bases = options.bases ?? BIXOLON_LOCAL_SDK_BASES
  const payload = buildPosPrintBitmapPayload(imageDataUrls, widthDots)

  const errors: string[] = []
  for (const baseUrl of bases) {
    const attempt = await postPrintRequest(baseUrl, printerName, payload)
    if (attempt.ok) {
      return { baseUrl, printerName, result: attempt.result }
    }
    errors.push(`${baseUrl}: ${attempt.error}`)
  }

  throw new Error(
    [
      `Could not reach Bixolon mPrint / Web Print SDK for printer "${printerName}".`,
      'Open mPrint (or Web Print SDK), register the SPP-R200III with that logical name, leave the app running, then try again.',
      'If Safari blocks localhost, open this site inside the mPrint / Web Print SDK browser.',
      errors.slice(0, 3).join(' · '),
    ].join(' '),
  )
}
