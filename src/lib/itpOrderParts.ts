import type { ItpLibraryItemSel } from '../types/itpLibraryPlan'

export const ORDER_REPLACEMENT_PARTS_ITEM_ID = 'parts_order'

export const ORDER_PART_KIND_IDS = {
  studs: 'parts_order:studs',
  slips: 'parts_order:slips',
  softGoods: 'parts_order:soft_goods',
} as const

export const ORDER_PART_KIND_NAMES: Record<string, string> = {
  [ORDER_PART_KIND_IDS.studs]: 'Studs / bolting',
  [ORDER_PART_KIND_IDS.slips]: 'Slips',
  [ORDER_PART_KIND_IDS.softGoods]: 'Soft goods',
}

/**
 * Twinseal Order replacement parts — matches Field Service traveler layout
 * and seeds the Needs Parts list with these three lines.
 */
export const TWINSEAL_ORDER_PART_SUB_REQS = ['Studs', 'Slips', 'Soft Goods'] as const

export const TWINSEAL_NEEDED_PART_SEEDS: ReadonlyArray<{
  kindId: string
  partName: string
  itpItemName: string
}> = [
  {
    kindId: ORDER_PART_KIND_IDS.studs,
    partName: 'Studs',
    itpItemName: 'Studs',
  },
  {
    kindId: ORDER_PART_KIND_IDS.slips,
    partName: 'Slips',
    itpItemName: ORDER_PART_KIND_NAMES[ORDER_PART_KIND_IDS.slips],
  },
  {
    kindId: ORDER_PART_KIND_IDS.softGoods,
    partName: 'Soft Goods',
    itpItemName: 'Soft Goods',
  },
]

export function isTwinsealValveType(valveType: string | null | undefined): boolean {
  return /twinseal|durco/i.test(String(valveType ?? '').trim())
}

export function twinsealNeededPartDrafts(): Array<{
  partName: string
  partNumber: string
  quantity: number
  supplier: string
  notes: string
  itpItemId: string
  itpItemName: string
}> {
  return TWINSEAL_NEEDED_PART_SEEDS.map((seed) => ({
    partName: seed.partName,
    partNumber: '',
    quantity: 1,
    supplier: '',
    notes: '',
    itpItemId: seed.kindId,
    itpItemName: seed.itpItemName,
  }))
}

export function isOrderReplacementPartsItem(itemId: string | null | undefined): boolean {
  return itemId === ORDER_REPLACEMENT_PARTS_ITEM_ID
}

export function isOrderReplacementPartsKind(itemId: string | null | undefined): boolean {
  const id = String(itemId ?? '')
  return id === ORDER_REPLACEMENT_PARTS_ITEM_ID || id.startsWith('parts_order:')
}

export function isOrderStudsKind(itemId: string | null | undefined): boolean {
  const id = String(itemId ?? '')
  return id === ORDER_PART_KIND_IDS.studs || id.startsWith(`${ORDER_PART_KIND_IDS.studs}:`)
}

function newOrderReplacementPartsSel(): ItpLibraryItemSel {
  return {
    included: true,
    holdPoint: false,
    beforeMeas: false,
    afterMeas: false,
    measVerify: false,
    subReqs: [],
    notes: '',
    requirePicture: false,
    pictureLabel: '',
    minPhotos: 1,
    maxPhotos: 4,
    measFields: [],
    requireNameplate: false,
    blockNext: false,
    sectionId: 'disassembly',
    shopArea: '',
    sortIndex: null,
    addToTraveler: true,
    travelerEntry: null,
    resourceDocs: [],
  }
}

function withTwinsealOrderPartSubReqs(prev: ItpLibraryItemSel): ItpLibraryItemSel {
  const have = new Set(prev.subReqs.map((row) => row.trim().toLowerCase()))
  const missing = TWINSEAL_ORDER_PART_SUB_REQS.filter((label) => !have.has(label.toLowerCase()))
  if (missing.length === 0 && prev.addToTraveler) return prev
  return {
    ...prev,
    addToTraveler: true,
    subReqs: [...prev.subReqs, ...missing],
  }
}

/** Include the Order replacement parts traveler step on plans/templates that do not have it yet. */
export function ensureOrderReplacementPartsSel(
  sel: Record<string, ItpLibraryItemSel>,
  options?: { valveType?: string | null },
): Record<string, ItpLibraryItemSel> {
  const twinseal = isTwinsealValveType(options?.valveType)
  const prev = sel[ORDER_REPLACEMENT_PARTS_ITEM_ID]
  if (!prev) {
    const created = newOrderReplacementPartsSel()
    return {
      ...sel,
      [ORDER_REPLACEMENT_PARTS_ITEM_ID]: twinseal
        ? withTwinsealOrderPartSubReqs(created)
        : created,
    }
  }
  let next = prev
  if (prev.included !== false && !prev.addToTraveler) {
    next = { ...next, addToTraveler: true }
  } else if (prev.included === false && !prev.addToTraveler) {
    next = { ...next, addToTraveler: true }
  }
  if (twinseal && next.included !== false) {
    next = withTwinsealOrderPartSubReqs(next)
  }
  if (next === prev) return sel
  return { ...sel, [ORDER_REPLACEMENT_PARTS_ITEM_ID]: next }
}
