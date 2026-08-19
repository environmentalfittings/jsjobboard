/** RFQ inbox for receiving-log emails. Override with VITE_RFQ_EMAIL. */
export const DEFAULT_RFQ_EMAIL = 'RFQ@jsvalve.com'

export type RfqEmailImage = {
  url: string
  file_name: string
}

export function getRfqEmail() {
  return String(import.meta.env.VITE_RFQ_EMAIL ?? DEFAULT_RFQ_EMAIL).trim() || DEFAULT_RFQ_EMAIL
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
  notes?: string
  imageName?: string | null
  /** Public https URL preferred — included in the email so Outlook can open the photo. */
  imageUrl?: string | null
  /** Up to 4 pictures for this received valve. */
  images?: RfqEmailImage[] | null
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

export function buildRfqEmailBody(details: RfqEmailDetails, toEmail?: string) {
  const lines = [
    ...(toEmail ? [`To: ${toEmail}`, ''] : []),
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
    `Notes: ${details.notes?.trim() || '—'}`,
  ]

  const pictureLines: string[] = []
  const images = (details.images ?? [])
    .map((image) => ({
      url: publicImageUrl(image.url),
      file_name: image.file_name?.trim() || 'Photo',
    }))
    .filter((image): image is { url: string; file_name: string } => Boolean(image.url))

  if (images.length) {
    images.forEach((image, index) => {
      pictureLines.push(`Picture ${index + 1}: ${image.file_name}`)
      pictureLines.push(`Picture ${index + 1} link: ${image.url}`)
    })
  } else {
    const imageUrl = publicImageUrl(details.imageUrl)
    if (imageUrl) {
      pictureLines.push(`Picture: ${details.imageName?.trim() || 'attached / linked'}`)
      pictureLines.push(`Picture link: ${imageUrl}`)
    } else if (details.imageName?.trim()) {
      pictureLines.push(`Picture: ${details.imageName.trim()} (attach the downloaded file before sending)`)
    } else {
      pictureLines.push('Picture: none')
    }
  }

  lines.push(...pictureLines)

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

/** Web Share with files is useful on iPad/phone Mail; on Windows it opens the Share dialog instead of Outlook. */
function shouldUseNativeShareForPhoto() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    // iPadOS 13+ can report as MacIntel with touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  return isIOS || isAndroid
}

export type ComposeRfqEmailResult =
  | { ok: true; method: 'share' | 'mailto'; message: string }
  | { ok: false; message: string }

/**
 * Opens an email to RFQ with valve details and picture.
 * - iPad/phone: Web Share can attach the photo into Mail
 * - Windows/desktop: opens the mail client via mailto (Outlook), with picture link
 *   in the body and a downloaded photo file to attach if needed
 */
export async function composeRfqEmail(options: {
  to?: string
  details: RfqEmailDetails
  imageFile?: File | null
  imageFiles?: File[] | null
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
  const body = buildRfqEmailBody(details, to)

  const files: File[] = []
  if (options.imageFiles?.length) {
    files.push(...options.imageFiles)
  } else if (options.imageFile) {
    files.push(options.imageFile)
  } else if (options.imageDataUrl) {
    const file = await imageSourceToFile(options.imageDataUrl, details.imageName ?? 'received-valve.jpg')
    if (file) files.push(file)
  } else if (details.images?.length) {
    for (const [index, image] of details.images.entries()) {
      const file = await imageSourceToFile(image.url, image.file_name || `received-valve-${index + 1}.jpg`)
      if (file) files.push(file)
    }
  }

  const firstFile = files[0] ?? null
  const canShareWithPhoto =
    shouldUseNativeShareForPhoto() &&
    Boolean(firstFile) &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [firstFile as File] })

  if (canShareWithPhoto && firstFile) {
    try {
      await navigator.share({
        title: subject,
        text: `To: ${to}\n\n${subject}\n\n${body}`,
        files: [firstFile],
      })
      return {
        ok: true,
        method: 'share',
        message:
          files.length > 1
            ? `Share sheet opened — choose Mail to send to ${to}. The first photo is attached; ${files.length - 1} more were downloaded for manual attach.`
            : `Share sheet opened — choose Mail to send to ${to} with the photo attached.`,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, message: 'RFQ email cancelled.' }
      }
      // Share failed — fall through to mailto + download.
    }
  }

  if (files.length) {
    for (const file of files) {
      try {
        downloadFile(file)
      } catch {
        // Download is best-effort; links in body still help.
      }
    }
  }

  const mailtoBody =
    files.length > 0
      ? `${body}\n\nNote: Outlook cannot auto-attach from the browser. ${files.length} photo file(s) were downloaded — attach them before sending${
          details.images?.length || imageUrl ? ', or open the picture link(s) above.' : '.'
        }`
      : body

  openMailto(to, subject, mailtoBody)

  const hasLinks = Boolean(details.images?.length || imageUrl)
  if (!files.length && !hasLinks) {
    return {
      ok: true,
      method: 'mailto',
      message: `Email draft opened for ${to}. No picture was on this entry — add a Picture and resend if needed.`,
    }
  }

  return {
    ok: true,
    method: 'mailto',
    message: files.length
      ? `Email opened for ${to}. ${files.length} photo file(s) downloaded — attach them in Outlook (picture link(s) are also in the email).`
      : `Email opened for ${to}. Picture link(s) are included in the email.`,
  }
}
