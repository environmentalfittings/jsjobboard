import QRCode from 'qrcode'

const PRODUCTION_APP_ORIGIN = 'https://jsjobboard.vercel.app'

/** Prefer a public/prod origin so printed QR codes work when printing from localhost. */
export function resolveItpPublicOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window === 'undefined') return PRODUCTION_APP_ORIGIN
  const { origin, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return PRODUCTION_APP_ORIGIN
  return origin.replace(/\/$/, '')
}

/** Absolute URL for the ITP page of a valve row (scannable from a printed sheet). */
export function buildItpPageUrl(valveRowId: number, origin = resolveItpPublicOrigin()): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/itp/${valveRowId}`
}

export async function createItpQrDataUrl(url: string, size = 160): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  })
}
