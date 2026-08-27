import { IN_SHOP_STATUSES, STATUS_ORDER, TESTING_STATUSES } from './statuses'

/**
 * Shop stations for ITP assignment — same labels as job-card statuses
 * (Teardown, Machine 1, Machine 2, …) so floor work matches the board.
 * Derived from STATUS_ORDER so new in-shop / testing statuses show up automatically.
 */
function orderedCardStations(): readonly string[] {
  const wanted = new Set<string>([...IN_SHOP_STATUSES, ...TESTING_STATUSES])
  return STATUS_ORDER.filter((status) => wanted.has(status))
}

export const ITP_SHOP_AREAS = orderedCardStations().map((status) => ({
  value: status,
  label: status,
}))

/** Older slug values → card status labels (templates / catalogs saved before this change). */
const LEGACY_SHOP_AREA_TO_STATUS: Record<string, string> = {
  teardown: 'Teardown',
  machine_shop: 'Machine 1',
  welding: 'Welding',
  assembly: 'Assembly',
  actuation: 'Actuation',
  prv: 'PRV Teardown',
  testing: 'Testing',
  painting: 'Painting',
  qa_qc: 'Testing',
}

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

/** Normalize legacy slug or status label to the card-status station value. */
export function normalizeShopAreaValue(area: string | null | undefined): string {
  const value = String(area ?? '').trim()
  if (!value) return ''
  const legacy = LEGACY_SHOP_AREA_TO_STATUS[value.toLowerCase()]
  if (legacy) return legacy
  const builtin = ITP_SHOP_AREAS.find(
    (row) => row.value.toLowerCase() === value.toLowerCase() || row.label.toLowerCase() === value.toLowerCase(),
  )
  return builtin?.value ?? value
}

export function isItpShopArea(value: string): value is ItpBuiltInShopArea {
  const normalized = normalizeShopAreaValue(value)
  return ITP_SHOP_AREAS.some((area) => area.value === normalized)
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
  const trimmed = label.trim()
  // Prefer storing card-status labels as the value when they match.
  const asStatus = normalizeShopAreaValue(trimmed)
  if (ITP_SHOP_AREAS.some((area) => area.value === asStatus)) {
    if (!existing.some((area) => area.value.toLowerCase() === asStatus.toLowerCase())) return asStatus
  }
  // Custom stations use the human label (same style as job-card statuses).
  if (!existing.some((area) => area.value.toLowerCase() === trimmed.toLowerCase())) return trimmed
  const base = shopAreaSlug(trimmed)
  if (!existing.some((area) => area.value === base)) return base
  let n = 2
  while (existing.some((area) => area.value === `${base}_${n}`)) n += 1
  return `${base}_${n}`
}

/** Add a station if missing (by value or label). Returns the same array when already present. */
export function ensureShopAreaDef(areas: ItpShopAreaDef[], label: string): ItpShopAreaDef[] {
  const trimmed = label.trim()
  if (!trimmed) return areas
  const normalized = normalizeShopAreaValue(trimmed)
  if (
    areas.some(
      (area) =>
        area.value.toLowerCase() === trimmed.toLowerCase() ||
        area.label.toLowerCase() === trimmed.toLowerCase() ||
        area.value.toLowerCase() === normalized.toLowerCase() ||
        area.label.toLowerCase() === normalized.toLowerCase(),
    )
  ) {
    return areas
  }
  const value = uniqueShopAreaValue(trimmed, areas)
  return [...areas, { value, label: trimmed }]
}

export function itpShopAreaLabel(
  area: ItpShopArea | string | null | undefined,
  areas?: ItpShopAreaDef[],
): string {
  const value = String(area ?? '').trim()
  if (!value) return '—'
  const normalized = normalizeShopAreaValue(value)
  const fromList = areas?.find(
    (row) => row.value === value || row.value === normalized || row.label === normalized,
  )
  if (fromList) return fromList.label
  const builtin = ITP_SHOP_AREAS.find((row) => row.value === normalized)
  return builtin?.label ?? humanizeAreaValue(value)
}

export function normalizeShopAreas(raw: unknown, itemAreas: string[] = []): ItpShopAreaDef[] {
  const parsed: ItpShopAreaDef[] = []
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (typeof row === 'string') {
        const value = normalizeShopAreaValue(row)
        if (!value) continue
        parsed.push({ value, label: itpShopAreaLabel(value) })
        continue
      }
      if (!row || typeof row !== 'object') continue
      const value = normalizeShopAreaValue(String((row as { value?: unknown }).value ?? ''))
      const label = String((row as { label?: unknown }).label ?? '').trim()
      if (!value) continue
      parsed.push({ value, label: label || itpShopAreaLabel(value) })
    }
  }

  const seen = new Set<string>()
  const out: ItpShopAreaDef[] = []
  const push = (def: ItpShopAreaDef) => {
    const value = normalizeShopAreaValue(def.value)
    if (!value || seen.has(value.toLowerCase())) return
    seen.add(value.toLowerCase())
    out.push({ value, label: def.label.trim() || itpShopAreaLabel(value) })
  }

  // Always keep job-board floor stations, then admin/custom + item-assigned extras.
  defaultShopAreas().forEach(push)
  parsed.forEach(push)

  for (const area of itemAreas) {
    const value = normalizeShopAreaValue(area)
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
