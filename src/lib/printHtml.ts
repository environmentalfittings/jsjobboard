/** Open HTML in a new tab for print preview (avoids blank tabs from noopener + document.write). */
export function openPrintHtml(
  html: string,
  options?: { width?: number; height?: number },
): { error: string | null } {
  const width = options?.width ?? 960
  const height = options?.height ?? 1100
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const popup = window.open(url, '_blank', `noopener,noreferrer,width=${width},height=${height}`)
  if (!popup) {
    URL.revokeObjectURL(url)
    return { error: 'Allow pop-ups to open the print preview' }
  }

  // Revoke after the tab has a chance to load the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { error: null }
}
