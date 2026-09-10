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

  const popup = isMobileWebKit()
    ? window.open(url, '_blank')
    : window.open(url, '_blank', `noopener,noreferrer,width=${width},height=${height}`)
  if (!popup) {
    window.location.assign(url)
    return { error: null }
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
  return { error: null }
}
