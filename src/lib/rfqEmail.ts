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
  status?: string
  imageName?: string | null
  /** Public https URL preferred — included in the email so Outlook can open the photo. */
  imageUrl?: string | null
}

export function buildRfqEmailSubject(details: RfqEmailDetails) {
  const customer = details.customer.trim() || 'Unknown customer'
  const estimate = details.estimateNumber.trim()
  const so = details.salesOrderNumber.trim()
  const refs = [estimate ? `Est ${estimate}` : '', so ? `SO ${so}` : ''].filter(Boolean).join(' · ')
  return refs ? `Received valve — ${customer} — ${refs}` : `Received valve — ${customer}`
}

function publicImageUrl(url?: string | null) {
  const value = typeof url === 'string' ? url.trim() : ''
  if (!value) return null
  if (value.startsWith('https://') || value.startsWith('http://')) return value
  return null
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
    `Status: ${details.status || '—'}`,
  ]

  const imageUrl = publicImageUrl(details.imageUrl)
  if (imageUrl) {
    lines.push(`Picture: ${details.imageName?.trim() || 'attached / linked'}`)
    lines.push(`Picture link: ${imageUrl}`)
  } else if (details.imageName?.trim()) {
    lines.push(`Picture: ${details.imageName.trim()} (attach the downloaded file before sending)`)
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

async function imageSourceToFile(source: string, fileName: string): Promise<File | null> {
  if (source.startsWith('data:')) return dataUrlToFile(source, fileName)
  try {
    const response = await fetch(source)
    if (!response.ok) return null
    const blob = await response.blob()
    const mime = blob.type || 'image/jpeg'
    const safeName = fileName.trim() || `received-valve.${mime.includes('png') ? 'png' : 'jpg'}`
    return new File([blob], safeName, { type: mime })
  } catch {
    return null
  }
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name || 'received-valve.jpg'
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function openMailto(to: string, subject: string, body: string) {
  // Do not encode the address itself — Outlook expects mailto:user@domain
  const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = href
}

export type ComposeRfqEmailResult =
  | { ok: true; method: 'share' | 'mailto'; message: string }
  | { ok: false; message: string }

/**
 * Opens an email to RFQ with valve details and picture.
 * - iPad/Safari: Web Share can attach the photo into Mail
 * - Outlook/desktop: mailto cannot attach files, so the public picture link is
 *   put in the body and the image file is downloaded for manual attach
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

  const imageUrl = publicImageUrl(options.details.imageUrl ?? options.imageDataUrl)
  const details: RfqEmailDetails = {
    ...options.details,
    imageUrl: imageUrl ?? options.details.imageUrl,
  }

  const subject = buildRfqEmailSubject(details)
  const body = buildRfqEmailBody(details)

  let file = options.imageFile ?? null
  if (!file && options.imageDataUrl) {
    file = await imageSourceToFile(options.imageDataUrl, details.imageName ?? 'received-valve.jpg')
  }

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
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, message: 'RFQ email cancelled.' }
      }
      // Share failed — fall through to mailto + download.
    }
  }

  if (file) {
    try {
      downloadFile(file)
    } catch {
      // Download is best-effort; link in body still helps.
    }
  }

  const mailtoBody = file
    ? `${body}\n\nNote: Outlook cannot auto-attach from the browser. The photo was downloaded — attach that file before sending${
        imageUrl ? `, or open the picture link above.` : '.'
      }`
    : body

  openMailto(to, subject, mailtoBody)

  if (!file && !imageUrl) {
    return {
      ok: true,
      method: 'mailto',
      message: `Email draft opened for ${to}. No picture was on this entry — add a Picture and resend if needed.`,
    }
  }

  return {
    ok: true,
    method: 'mailto',
    message: file
      ? `Email opened for ${to}. Photo downloaded — attach it in Outlook (picture link is also in the email).`
      : `Email opened for ${to}. Picture link is included in the email.`,
  }
}
