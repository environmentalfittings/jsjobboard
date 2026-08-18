import { ITP_LIBRARY } from './itpLibrary'

/** Ordered ITP process section (Incoming Inspection, Disassembly, Repair, …). */
export type ItpProcessSectionDef = {
  id: string
  title: string
}

export function defaultProcessSections(): ItpProcessSectionDef[] {
  return ITP_LIBRARY.map((section) => ({ id: section.id, title: section.title }))
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
        const id = row.trim()
        if (!id) continue
        parsed.push({ id, title: processSectionTitle(id) })
        continue
      }
      if (!row || typeof row !== 'object') continue
      const id = String((row as { id?: unknown }).id ?? '').trim()
      const title = String((row as { title?: unknown }).title ?? '').trim()
      if (!id) continue
      parsed.push({ id, title: title || processSectionTitle(id) })
    }
  }

  const seen = new Set<string>()
  const out: ItpProcessSectionDef[] = []
  const push = (def: ItpProcessSectionDef) => {
    if (!def.id || seen.has(def.id)) return
    seen.add(def.id)
    out.push({ id: def.id, title: def.title.trim() || processSectionTitle(def.id) })
  }

  if (parsed.length > 0) {
    parsed.forEach(push)
  } else {
    defaultProcessSections().forEach(push)
  }

  for (const secId of itemSecIds) {
    const id = String(secId ?? '').trim()
    if (!id) continue
    push({ id, title: processSectionTitle(id) })
  }

  return out
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
