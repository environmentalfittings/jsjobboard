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

export type ItpShopArea = (typeof ITP_SHOP_AREAS)[number]['value']

export function isItpShopArea(value: string): value is ItpShopArea {
  return ITP_SHOP_AREAS.some((a) => a.value === value)
}

export function itpShopAreaLabel(area: ItpShopArea | string | null | undefined): string {
  const found = ITP_SHOP_AREAS.find((a) => a.value === area)
  return found?.label ?? String(area ?? '—')
}
