export const ITP_SHOP_AREAS = [
  { value: 'teardown', label: 'Teardown' },
  { value: 'machine_shop', label: 'Machine Shop' },
  { value: 'welding', label: 'Welding' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'actuation', label: 'Actuation' },
  { value: 'prv', label: 'PRV' },
  { value: 'testing', label: 'Testing' },
  { value: 'painting', label: 'Painting' },
  { value: 'qa_qc', label: 'QA/QC' },
] as const

export type ItpBuiltInShopArea = (typeof ITP_SHOP_AREAS)[number]['value']
/** Shop station id — built-in values plus admin-added custom sections. */
export type ItpShopArea = string

export type ItpShopAreaDef = {
  value: string
  label: string
}

export function defaultShopAreas(): ItpShopAreaDef[] {
  return ITP_SHOP_AREAS.map((area) => ({ value: area.value, label: area.label }))
}

export function isItpShopArea(value: string): value is ItpBuiltInShopArea {
  return ITP_SHOP_AREAS.some((area) => area.value === value)
}

function humanizeAreaValue(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function shopAreaSlug(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || `section_${Date.now().toString(36)}`
}

export function uniqueShopAreaValue(label: string, existing: ItpShopAreaDef[]): string {
  const base = shopAreaSlug(label)
  if (!existing.some((area) => area.value === base)) return base
  let n = 2
  while (existing.some((area) => area.value === `${base}_${n}`)) n += 1
  return `${base}_${n}`
}

export function itpShopAreaLabel(
  area: ItpShopArea | string | null | undefined,
  areas?: ItpShopAreaDef[],
): string {
  const value = String(area ?? '').trim()
  if (!value) return '—'
  const fromList = areas?.find((row) => row.value === value)
  if (fromList) return fromList.label
  const builtin = ITP_SHOP_AREAS.find((row) => row.value === value)
  return builtin?.label ?? humanizeAreaValue(value)
}

export function normalizeShopAreas(raw: unknown, itemAreas: string[] = []): ItpShopAreaDef[] {
  const parsed: ItpShopAreaDef[] = []
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (typeof row === 'string') {
        const value = row.trim()
        if (!value) continue
        parsed.push({ value, label: itpShopAreaLabel(value) })
        continue
      }
      if (!row || typeof row !== 'object') continue
      const value = String((row as { value?: unknown }).value ?? '').trim()
      const label = String((row as { label?: unknown }).label ?? '').trim()
      if (!value) continue
      parsed.push({ value, label: label || itpShopAreaLabel(value) })
    }
  }

  const seen = new Set<string>()
  const out: ItpShopAreaDef[] = []
  const push = (def: ItpShopAreaDef) => {
    if (!def.value || seen.has(def.value)) return
    seen.add(def.value)
    out.push({ value: def.value, label: def.label.trim() || itpShopAreaLabel(def.value) })
  }

  if (parsed.length > 0) {
    parsed.forEach(push)
  } else {
    defaultShopAreas().forEach(push)
  }

  for (const area of itemAreas) {
    const value = String(area ?? '').trim()
    if (!value) continue
    push({ value, label: itpShopAreaLabel(value) })
  }

  return out
}

export function moveShopAreaTo(
  areas: ItpShopAreaDef[],
  fromValue: string,
  toValue: string,
): ItpShopAreaDef[] {
  if (!fromValue || fromValue === toValue) return areas
  const from = areas.findIndex((area) => area.value === fromValue)
  if (from < 0) return areas
  const next = areas.slice()
  const [moved] = next.splice(from, 1)
  const insertAt = next.findIndex((area) => area.value === toValue)
  if (insertAt < 0) {
    next.push(moved)
    return next
  }
  next.splice(insertAt, 0, moved)
  return next
}

export function moveShopArea(
  areas: ItpShopAreaDef[],
  value: string,
  direction: -1 | 1,
): ItpShopAreaDef[] {
  const index = areas.findIndex((area) => area.value === value)
  const swapWith = index + direction
  if (index < 0 || swapWith < 0 || swapWith >= areas.length) return areas
  const next = areas.slice()
  const current = next[index]
  next[index] = next[swapWith]
  next[swapWith] = current
  return next
}
