/** Client-side ITP move-gate bypass (session only). Password is intentional shop-floor unlock. */
export const ITP_GATE_BYPASS_PASSWORD = 'Ovation'

const STORAGE_KEY = 'jsjb:itp-gate-bypass-ids'

function readBypassIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    )
  } catch {
    return new Set()
  }
}

function writeBypassIds(ids: Set<number>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Ignore quota / private-mode failures; in-memory grant still works for this page load via callers.
  }
}

export function loadItpGateBypassIds(): Set<number> {
  return readBypassIds()
}

export function isItpGateBypassed(valveRowId: number): boolean {
  return readBypassIds().has(valveRowId)
}

export function grantItpGateBypass(valveRowId: number) {
  const ids = readBypassIds()
  ids.add(valveRowId)
  writeBypassIds(ids)
}

export function requestItpGateBypass(valveRowId: number): {
  ok: boolean
  reason?: 'cancelled' | 'wrong' | 'already'
} {
  if (isItpGateBypassed(valveRowId)) return { ok: true, reason: 'already' }
  const entered = window.prompt('Enter password to bypass ITP requirements for moving this card')
  if (entered == null) return { ok: false, reason: 'cancelled' }
  if (entered.trim() !== ITP_GATE_BYPASS_PASSWORD) return { ok: false, reason: 'wrong' }
  grantItpGateBypass(valveRowId)
  return { ok: true }
}
