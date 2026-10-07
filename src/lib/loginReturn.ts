/** Safe in-app path after shop login (QR scans, deep links). */
export function isSafeAppReturnPath(path: string | null | undefined): path is string {
  const value = String(path ?? '').trim()
  if (!value.startsWith('/')) return false
  if (value.startsWith('//') || value.startsWith('/\\')) return false
  if (value.includes('://') || value.includes('\\')) return false
  if (value.startsWith('/login') || value.startsWith('/customer-login')) return false
  return true
}

export function loginPathWithReturn(returnPath: string): string {
  if (!isSafeAppReturnPath(returnPath)) return '/login'
  return `/login?next=${encodeURIComponent(returnPath)}`
}

export function readLoginReturnPath(search = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  const next = new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('next')
  return isSafeAppReturnPath(next) ? next : null
}
