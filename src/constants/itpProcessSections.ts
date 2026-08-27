import { ITP_LIBRARY } from './itpLibrary'

/** Ordered ITP process section (Incoming Inspection, Disassembly, Repair, …). */
export type ItpProcessSectionDef = {
  id: string
  title: string
}

/** Numbered process flow — these stay as heading sections on the ITP. */
export const ITP_CORE_PROCESS_SECTION_IDS = [
  'receipt',
  'disassembly',
  'inspection',
  'ndt',
  'repair',
  'assembly',
  'testing',
  'final',
] as const

export type ItpCoreProcessSectionId = (typeof ITP_CORE_PROCESS_SECTION_IDS)[number]

/**
 * Valve-specific / specialty catalogs are not their own ITP headings.
 * Their items fall under a numbered process section instead.
 */
export const ITP_SPECIALTY_SECTION_HOME: Record<string, ItpCoreProcessSectionId> = {
  hfservice: 'inspection',
  slabgate: 'inspection',
  wedgeplug: 'inspection',
  controlvlv: 'testing',
  reliefsafety: 'testing',
  actuatorsec: 'assembly',
  mfgsec: 'repair',
}

export function isCoreProcessSectionId(id: string | null | undefined): boolean {
  const value = String(id ?? '').trim()
  return (ITP_CORE_PROCESS_SECTION_IDS as readonly string[]).includes(value)
}

export function isSpecialtyProcessSectionId(id: string | null | undefined): boolean {
  const value = String(id ?? '').trim()
  return Boolean(value) && value in ITP_SPECIALTY_SECTION_HOME
}

/** Map specialty section ids onto numbered process sections; leave core/custom ids alone. */
export function resolveLibrarySectionId(secId: string | null | undefined): string {
  const value = String(secId ?? '').trim()
  if (!value) return value
  return ITP_SPECIALTY_SECTION_HOME[value] ?? value
}

export function defaultProcessSections(): ItpProcessSectionDef[] {
  return ITP_LIBRARY.filter((section) => isCoreProcessSectionId(section.id)).map((section) => ({
    id: section.id,
    title: section.title,
  }))
}

function humanizeSectionId(id: string): string {
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function processSectionSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || `section_${Date.now().toString(36)}`
}

export function uniqueProcessSectionId(title: string, existing: ItpProcessSectionDef[]): string {
  const base = processSectionSlug(title)
  if (!existing.some((section) => section.id === base)) return base
  let n = 2
  while (existing.some((section) => section.id === `${base}_${n}`)) n += 1
  return `${base}_${n}`
}

export function processSectionTitle(
  id: string | null | undefined,
  sections?: ItpProcessSectionDef[],
): string {
  const value = String(id ?? '').trim()
  if (!value) return '—'
  const fromList = sections?.find((row) => row.id === value)
  if (fromList) return fromList.title
  const builtin = ITP_LIBRARY.find((row) => row.id === value)
  return builtin?.title ?? humanizeSectionId(value)
}

export function normalizeProcessSections(
  raw: unknown,
  itemSecIds: string[] = [],
): ItpProcessSectionDef[] {
  const parsed: ItpProcessSectionDef[] = []
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (typeof row === 'string') {
        const id = resolveLibrarySectionId(row)
        if (!id || isSpecialtyProcessSectionId(row)) continue
        parsed.push({ id, title: processSectionTitle(id) })
        continue
      }
      if (!row || typeof row !== 'object') continue
      const rawId = String((row as { id?: unknown }).id ?? '').trim()
      if (!rawId || isSpecialtyProcessSectionId(rawId)) continue
      const id = resolveLibrarySectionId(rawId)
      if (!id) continue
      const title = String((row as { title?: unknown }).title ?? '').trim()
      parsed.push({ id, title: title || processSectionTitle(id) })
    }
  }

  const seen = new Set<string>()
  const out: ItpProcessSectionDef[] = []
  const push = (def: ItpProcessSectionDef) => {
    const id = resolveLibrarySectionId(def.id)
    if (!id || isSpecialtyProcessSectionId(def.id) || seen.has(id)) return
    seen.add(id)
    out.push({ id, title: def.title.trim() || processSectionTitle(id) })
  }

  if (parsed.length > 0) {
    parsed.forEach(push)
  } else {
    defaultProcessSections().forEach(push)
  }

  for (const secId of itemSecIds) {
    const id = resolveLibrarySectionId(secId)
    if (!id) continue
    push({ id, title: processSectionTitle(id) })
  }

  // Always keep the numbered core sections available, even if a saved list omitted one.
  for (const core of defaultProcessSections()) {
    push(core)
  }

  // Prefer core process order, then any custom sections.
  const coreOrder = new Map(ITP_CORE_PROCESS_SECTION_IDS.map((id, index) => [id, index]))
  return out.sort((a, b) => {
    const orderA = coreOrder.get(a.id as ItpCoreProcessSectionId)
    const orderB = coreOrder.get(b.id as ItpCoreProcessSectionId)
    if (orderA != null && orderB != null) return orderA - orderB
    if (orderA != null) return -1
    if (orderB != null) return 1
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })
}

export function moveProcessSectionTo(
  sections: ItpProcessSectionDef[],
  fromId: string,
  toId: string,
): ItpProcessSectionDef[] {
  if (!fromId || fromId === toId) return sections
  const from = sections.findIndex((section) => section.id === fromId)
  if (from < 0) return sections
  const next = sections.slice()
  const [moved] = next.splice(from, 1)
  const insertAt = next.findIndex((section) => section.id === toId)
  if (insertAt < 0) {
    next.push(moved)
    return next
  }
  next.splice(insertAt, 0, moved)
  return next
}

export function moveProcessSection(
  sections: ItpProcessSectionDef[],
  id: string,
  direction: -1 | 1,
): ItpProcessSectionDef[] {
  const index = sections.findIndex((section) => section.id === id)
  const swapWith = index + direction
  if (index < 0 || swapWith < 0 || swapWith >= sections.length) return sections
  const next = sections.slice()
  const current = next[index]
  next[index] = next[swapWith]
  next[swapWith] = current
  return next
}
