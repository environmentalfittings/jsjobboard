/** Strip leading R from legacy valve IDs (e.g. R5792-1 → 5792-1). */
export function normalizeValveId(input: string) {
  const trimmed = input.trim()
  return trimmed.replace(/^R(?=\d)/i, '')
}
