const FLAG_TRUE = new Set(['true', '1', 'yes'])
const FLAG_FALSE = new Set(['false', '0', 'no'])

function betaHostnames(): string[] {
  const hosts = new Set(['jsjobboard.vercel.app', 'localhost', '127.0.0.1'])
  const publicUrl = String(import.meta.env.VITE_APP_PUBLIC_URL ?? '').trim()
  if (publicUrl) {
    try {
      hosts.add(new URL(publicUrl).hostname.toLowerCase())
    } catch {
      /* ignore invalid URL */
    }
  }
  return [...hosts]
}

/**
 * Feedback UI is on for local dev and the beta Vercel app by default.
 * Set VITE_ENABLE_FEEDBACK_BUTTON=false before go-live to hide it everywhere.
 */
export function isFeedbackEnabled(): boolean {
  const flag = String(import.meta.env.VITE_ENABLE_FEEDBACK_BUTTON ?? '').trim().toLowerCase()
  if (FLAG_TRUE.has(flag)) return true
  if (FLAG_FALSE.has(flag)) return false
  if (import.meta.env.DEV) return true
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (betaHostnames().includes(host)) return true
  }
  return false
}
