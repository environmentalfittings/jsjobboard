/**
 * Bixolon SPP-R200III — inventory QR label printer profile.
 *
 * Media is 58 mm wide, but the printable area is only ~48 mm (384 dots at 203 DPI).
 * Do not size artwork to the full paper width or the right edge will clip.
 *
 * Tune LABEL_HEIGHT_MM (and related sizes) when physical label stock length changes.
 */

export const BIXOLON_SPP_R200III = {
  name: 'Bixolon SPP-R200III',
  /** Print resolution */
  dpi: 203,
  /** Physical paper / media width */
  mediaWidthMm: 58,
  /** Maximum printable width (not the full media width) */
  printableWidthMm: 48,
  /**
   * Printable width in dots at 203 DPI.
   * Spec: 48 mm ≈ 384 dots (48 / 25.4 × 203 ≈ 383.6 → 384).
   */
  printableWidthDots: 384,
  /**
   * Label / feed length in mm. Change this to match your physical label stock.
   * The print page and canvas use this height; content is laid out inside the margins.
   */
  labelHeightMm: 50,
  /** Insets within the 48 mm printable area */
  marginsMm: {
    top: 2,
    right: 2,
    bottom: 2,
    left: 2,
  },
  /**
   * Target QR size on the label (mm). Capped automatically so it fits
   * printable width minus left/right margins and still leaves room for text below.
   */
  qrSizeMm: 32,
} as const

export type BixolonSppR200IIISettings = typeof BIXOLON_SPP_R200III

export type BixolonLabelPrintOverrides = {
  labelHeightMm?: number
  qrSizeMm?: number
  marginsMm?: Partial<(typeof BIXOLON_SPP_R200III)['marginsMm']>
}

export function mmToDots(mm: number, dpi: number = BIXOLON_SPP_R200III.dpi): number {
  return Math.round((mm / 25.4) * dpi)
}

export function dotsToMm(dots: number, dpi: number = BIXOLON_SPP_R200III.dpi): number {
  return (dots / dpi) * 25.4
}

/** Prefer inches in @page / print CSS — some drivers treat bare “mm” numbers as inches. */
export function mmToInches(mm: number): number {
  return mm / 25.4
}

export function formatInches(mm: number, digits = 4): string {
  return mmToInches(mm).toFixed(digits)
}

export function resolveBixolonLabelSettings(
  overrides: BixolonLabelPrintOverrides = {},
): {
  dpi: number
  mediaWidthMm: number
  printableWidthMm: number
  printableWidthDots: number
  labelHeightMm: number
  labelHeightDots: number
  mediaWidthIn: string
  printableWidthIn: string
  labelHeightIn: string
  marginsMm: { top: number; right: number; bottom: number; left: number }
  marginsDots: { top: number; right: number; bottom: number; left: number }
  qrSizeMm: number
  qrSizeDots: number
  contentWidthDots: number
} {
  const dpi = BIXOLON_SPP_R200III.dpi
  const printableWidthDots = BIXOLON_SPP_R200III.printableWidthDots
  const marginsMm = {
    ...BIXOLON_SPP_R200III.marginsMm,
    ...overrides.marginsMm,
  }
  const marginsDots = {
    top: mmToDots(marginsMm.top, dpi),
    right: mmToDots(marginsMm.right, dpi),
    bottom: mmToDots(marginsMm.bottom, dpi),
    left: mmToDots(marginsMm.left, dpi),
  }
  const contentWidthDots = Math.max(
    1,
    printableWidthDots - marginsDots.left - marginsDots.right,
  )
  const labelHeightMm = overrides.labelHeightMm ?? BIXOLON_SPP_R200III.labelHeightMm
  const labelHeightDots = mmToDots(labelHeightMm, dpi)
  const requestedQrMm = overrides.qrSizeMm ?? BIXOLON_SPP_R200III.qrSizeMm
  const qrSizeDots = Math.min(mmToDots(requestedQrMm, dpi), contentWidthDots)
  const qrSizeMm = dotsToMm(qrSizeDots, dpi)

  return {
    dpi,
    mediaWidthMm: BIXOLON_SPP_R200III.mediaWidthMm,
    printableWidthMm: BIXOLON_SPP_R200III.printableWidthMm,
    printableWidthDots,
    labelHeightMm,
    labelHeightDots,
    mediaWidthIn: formatInches(BIXOLON_SPP_R200III.mediaWidthMm),
    printableWidthIn: formatInches(BIXOLON_SPP_R200III.printableWidthMm),
    labelHeightIn: formatInches(labelHeightMm),
    marginsMm,
    marginsDots,
    qrSizeMm,
    qrSizeDots,
    contentWidthDots,
  }
}
