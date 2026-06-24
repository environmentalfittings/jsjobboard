/** Show feedback UI in local dev, or when explicitly enabled on Vercel/preview. */
export function isFeedbackEnabled(): boolean {
  const flag = String(import.meta.env.VITE_ENABLE_FEEDBACK_BUTTON ?? '').trim().toLowerCase()
  if (flag === 'true' || flag === '1' || flag === 'yes') return true
  if (flag === 'false' || flag === '0' || flag === 'no') return false
  return import.meta.env.DEV
}
