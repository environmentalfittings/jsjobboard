const PREPARING_PREVIEW_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Preparing report…</title>
</head>
<body style="margin:0;font:16px/1.45 system-ui,-apple-system,sans-serif;padding:24px;color:#0f172a;background:#fff">
  Preparing report…
</body>
</html>`

function isMobileWebKit() {
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function navigateWindowToUrl(target: Window, url: string) {
  try {
    target.location.replace(url)
  } catch {
    target.location.href = url
  }
  try {
    target.focus()
  } catch {
    // Some mobile browsers ignore focus on a new tab.
  }
}

/**
 * Open a blank preview tab during the tap/click. iPhone Safari blocks window.open
 * after any await, so callers must use this before loading report data.
 */
export function openPreviewWindow(): Window | null {
  // Do not pass window features — iOS often treats sized popups as blocked.
  const popup = window.open('about:blank', '_blank')
  if (!popup) return null
  try {
    popup.document.open()
    popup.document.write(PREPARING_PREVIEW_HTML)
    popup.document.close()
  } catch {
    // iOS may refuse document.write on about:blank; location.replace still works later.
  }
  return popup
}

/** Put HTML into an already-opened preview tab, or open a new preview (same-tab fallback on iPhone). */
export function showHtmlPreview(
  html: string,
  preview?: Window | null,
): { error: string | null } {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const keepUrlMs = 10 * 60 * 1000
  const target = preview && !preview.closed ? preview : null

  if (target) {
    navigateWindowToUrl(target, url)
    window.setTimeout(() => URL.revokeObjectURL(url), keepUrlMs)
    return { error: null }
  }

  const popup = isMobileWebKit()
    ? window.open(url, '_blank')
    : window.open(url, '_blank', 'noopener,noreferrer,width=960,height=1100')

  if (popup) {
    window.setTimeout(() => URL.revokeObjectURL(url), keepUrlMs)
    return { error: null }
  }

  // Popup blocked (typical on iPhone if the tab was not opened in the same tap).
  window.location.assign(url)
  return { error: null }
}

/** Open HTML in a new tab for print preview (avoids blank tabs from noopener + document.write). */
export function openPrintHtml(
  html: string,
  options?: { width?: number; height?: number; preview?: Window | null },
): { error: string | null } {
  if (options?.preview) {
    return showHtmlPreview(html, options.preview)
  }
  const width = options?.width ?? 960
  const height = options?.height ?? 1100
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  // Do not pass noopener/noreferrer — modern browsers then return null from
  // window.open even when a tab opened, which previously fell through to
  // location.assign and replaced the current page (losing scroll position).
  const popup = isMobileWebKit()
    ? window.open(url, '_blank')
    : window.open(url, '_blank', `width=${width},height=${height}`)
  if (!popup) {
    URL.revokeObjectURL(url)
    // Never navigate the current page away — callers stay on their list/form.
    return { error: 'Allow pop-ups to open the print preview' }
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
  return { error: null }
}

/**
 * Print HTML via a hidden iframe so the current page (and scroll position) stay put.
 * Replaces popup-based print flows that opened multiple tabs or navigated away.
 */
export function printHtmlViaIframe(
  html: string,
  options?: { frameId?: string; title?: string },
): { error: string | null } {
  const frameId = options?.frameId ?? 'app-html-print-frame'
  const existing = document.getElementById(frameId)
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.title = options?.title ?? 'Print'
  iframe.setAttribute('aria-hidden', 'true')
  // Keep a real layout size off-screen so label/text fitting scripts still measure correctly.
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '8.5in',
    height: '11in',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    return { error: 'Could not open the print dialog' }
  }

  doc.open()
  doc.write(html)
  doc.close()

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  win.addEventListener('afterprint', cleanup)
  window.setTimeout(cleanup, 60_000)

  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
    }
  }

  const waitForImages = () => {
    const images = Array.from(doc.images)
    // Small delay so label text-fitting scripts can measure layout before print.
    const schedulePrint = () => window.setTimeout(runPrint, 120)
    if (images.length === 0 || images.every((img) => img.complete)) {
      schedulePrint()
      return
    }
    let remaining = images.length
    const done = () => {
      remaining -= 1
      if (remaining <= 0) schedulePrint()
    }
    for (const img of images) {
      if (img.complete) done()
      else {
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      }
    }
  }

  if (doc.readyState === 'complete') {
    waitForImages()
  } else {
    win.addEventListener('load', waitForImages, { once: true })
  }

  return { error: null }
}
