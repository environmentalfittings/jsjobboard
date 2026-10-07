import { useEffect, useState } from 'react'
import { createItpQrDataUrl } from '../lib/itpQrCode'

export function ItpLoginQr({
  url,
  valveLabel,
  sample = false,
}: {
  url: string
  valveLabel: string
  sample?: boolean
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void createItpQrDataUrl(url, 176)
      .then((next) => {
        if (!cancelled) setDataUrl(next)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!dataUrl) return null

  return (
    <div className="itp-login-qr">
      <img className="itp-login-qr-img" src={dataUrl} alt={`QR code to log in to traveler ${valveLabel}`} />
      <div className="itp-login-qr-caption">
        <strong>{sample ? 'Scan to log in (sample)' : 'Scan to log in'}</strong>
        <span>Opens this traveler after shop login</span>
      </div>
    </div>
  )
}
