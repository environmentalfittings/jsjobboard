/** RFQ inbox for receiving-log emails. Override with VITE_RFQ_EMAIL. */
export function getRfqEmail() {
  return String(import.meta.env.VITE_RFQ_EMAIL ?? 'rfq@jsvalve.com').trim() || 'rfq@jsvalve.com'
}

export type RfqEmailDetails = {
  receivedDate: string
  customer: string
  description: string
  teardownInspectionDate: string
  warehouseCheckInDate: string
  estimateNumber: string
  salesOrderNumber: string
  workOrderPrinted: boolean
  imageName?: string | null
}

export function buildRfqEmailSubject(details: RfqEmailDetails) {
  const customer = details.customer.trim() || 'Unknown customer'
  const estimate = details.estimateNumber.trim()
  const so = details.salesOrderNumber.trim()
  const refs = [estimate ? `Est ${estimate}` : '', so ? `SO ${so}` : ''].filter(Boolean).join(' · ')
  return refs ? `Received valve — ${customer} — ${refs}` : `Received valve — ${customer}`
}

export function buildRfqEmailBody(details: RfqEmailDetails) {
  const lines = [
    'A new valve was logged on the Receiving Log.',
    '',
    `Date received: ${details.receivedDate || '—'}`,
    `Customer: ${details.customer || '—'}`,
    `Description: ${details.description || '—'}`,
    `Teardown inspection date: ${details.teardownInspectionDate || '—'}`,
    `Warehouse check in date: ${details.warehouseCheckInDate || '—'}`,
    `Estimate number: ${details.estimateNumber || '—'}`,
    `Sales order number: ${details.salesOrderNumber || '—'}`,
    `Work order printed: ${details.workOrderPrinted ? 'Yes' : 'No'}`,
  ]
  if (details.imageName) {
    lines.push(`Picture: ${details.imageName} (attached when sharing via Mail)`)
  } else {
    lines.push('Picture: none')
  }
  lines.push('', '— JS Job Board Receiving Log')
  return lines.join('\n')
}

export function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  try {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) return null
    const mime = match[1] || 'image/jpeg'
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const safeName = fileName.trim() || `received-valve.${mime.includes('png') ? 'png' : 'jpg'}`
    return new File([bytes], safeName, { type: mime })
  } catch {
    return null
  }
}

function openMailto(to: string, subject: string, body: string) {
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = href
}

export type ComposeRfqEmailResult =
  | { ok: true; method: 'share' | 'mailto'; message: string }
  | { ok: false; message: string }

/**
 * Opens an email to RFQ with valve details.
 * Prefers the Web Share API (iPad/Safari can attach the photo and send via Mail).
 * Falls back to mailto: (body only — most desktop mail clients cannot attach via URL).
 */
export async function composeRfqEmail(options: {
  to?: string
  details: RfqEmailDetails
  imageFile?: File | null
  imageDataUrl?: string | null
}): Promise<ComposeRfqEmailResult> {
  const to = (options.to ?? getRfqEmail()).trim()
  if (!to) {
    return { ok: false, message: 'RFQ email is not configured (set VITE_RFQ_EMAIL).' }
  }

  const subject = buildRfqEmailSubject(options.details)
  const body = buildRfqEmailBody(options.details)

  let file = options.imageFile ?? null
  if (!file && options.imageDataUrl) {
    file = dataUrlToFile(options.imageDataUrl, options.details.imageName ?? 'received-valve.jpg')
  }

  // Prefer Web Share when a photo can be attached (iPad Mail). Otherwise use mailto.
  const canShareWithPhoto =
    Boolean(file) &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file as File] })

  if (canShareWithPhoto && file) {
    try {
      await navigator.share({
        title: subject,
        text: `To: ${to}\n\n${subject}\n\n${body}`,
        files: [file],
      })
      return {
        ok: true,
        method: 'share',
        message: `Share sheet opened — choose Mail to send to ${to} with the photo attached.`,
      }
    } catch (error) {
      // User cancelled share — don't fall through to mailto spam.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, message: 'RFQ email cancelled.' }
      }
      // Share failed for another reason — try mailto.
    }
  }

  const mailtoBody = file
    ? `${body}\n\nNote: Attach the valve photo (${options.details.imageName ?? 'image'}) from your device before sending.`
    : body
  openMailto(to, subject, mailtoBody)
  return {
    ok: true,
    method: 'mailto',
    message: file
      ? `Email draft opened for ${to}. Attach the photo before sending if it is not included.`
      : `Email draft opened for ${to}.`,
  }
}
