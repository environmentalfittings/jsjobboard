function uniqueTrimmed(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
}

/** Join selected job test types for storage on `valves.test_type`. */
export function formatJobTestTypes(values: string[]): string {
  return uniqueTrimmed(values).join(', ')
}

/** Split a stored `test_type` string into individual selections. */
export function parseJobTestTypes(raw: string | null | undefined, knownOptions: string[] = []): string[] {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return []

  if (/[,;]|·/.test(trimmed)) {
    return uniqueTrimmed(trimmed.split(/[,;]|·/))
  }

  const known = uniqueTrimmed(knownOptions).sort((a, b) => b.length - a.length || a.localeCompare(b))
  if (!known.length || known.includes(trimmed)) {
    return [trimmed]
  }

  return [trimmed]
}
