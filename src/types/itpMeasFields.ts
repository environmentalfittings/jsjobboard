/** One configurable measurement / nameplate field on an ITP line. */
export type ItpMeasFieldDef = {
  id: string
  label: string
}

/** Classic Body/bonnet triple — used as the default when enabling measurements. */
export const DEFAULT_ITP_MEAS_FIELDS: ItpMeasFieldDef[] = [
  { id: 'before', label: 'Before Measurement' },
  { id: 'after', label: 'After Measurement' },
  { id: 'verify', label: 'Verification / Acceptance' },
]

export function newMeasFieldId(): string {
  return `mf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function normalizeMeasFields(raw: unknown): ItpMeasFieldDef[] {
  if (!Array.isArray(raw)) return []
  const out: ItpMeasFieldDef[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Partial<ItpMeasFieldDef>
    const label = String(o.label ?? '').trim()
    if (!label) continue
    const id = String(o.id ?? '').trim() || newMeasFieldId()
    out.push({ id, label })
  }
  return out
}
