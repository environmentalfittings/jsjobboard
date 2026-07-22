function uniqueUpperInitials(initials: string[]): string[] {
  return initials
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
}

/** Format selected tester initials for storage (e.g. "CP, CB"). */
export function formatTesterInitials(initials: string[]): string {
  return uniqueUpperInitials(initials).join(', ')
}

/**
 * Parse a stored tester string into initials.
 * Supports "CP, CB", concatenated values like "CBCP", and exact single initials.
 */
export function parseTesterInitials(raw: string | null | undefined, knownInitials: string[] = []): string[] {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return []

  const known = uniqueUpperInitials(knownInitials).sort((a, b) => b.length - a.length || a.localeCompare(b))

  if (/[,/;+]|\s+&\s+|\s+and\s+/i.test(trimmed)) {
    return uniqueUpperInitials(
      trimmed
        .split(/[,/;+]|\s+&\s+|\s+and\s+/i)
        .map((part) => part.trim())
        .filter(Boolean),
    )
  }

  const upper = trimmed.toUpperCase()
  if (known.includes(upper) || known.length === 0) {
    return [upper]
  }

  const matched: string[] = []
  let rest = upper
  while (rest) {
    const hit = known.find((initials) => rest.startsWith(initials))
    if (!hit) {
      matched.push(rest)
      break
    }
    matched.push(hit)
    rest = rest.slice(hit.length)
  }
  return uniqueUpperInitials(matched)
}
