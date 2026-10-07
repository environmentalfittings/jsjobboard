/** Steps that tell the shop to follow OEM / IOM / approved procedure documents. */
export function stepUsesOemOrProcedure(name: string | null | undefined): boolean {
  return /approved procedure|\biom\b|oem instructions?|per (the )?oem\b|manufacturer.{0,24}instructions?/i.test(
    String(name ?? ''),
  )
}
