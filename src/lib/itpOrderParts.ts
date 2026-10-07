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

/** Include the Order replacement parts traveler step on plans/templates that do not have it yet. */
export function ensureOrderReplacementPartsSel(
  sel: Record<string, ItpLibraryItemSel>,
): Record<string, ItpLibraryItemSel> {
  const prev = sel[ORDER_REPLACEMENT_PARTS_ITEM_ID]
  if (!prev) {
    return {
      ...sel,
      [ORDER_REPLACEMENT_PARTS_ITEM_ID]: newOrderReplacementPartsSel(),
    }
  }
  if (prev.included === false) {
    return prev.addToTraveler ? sel : { ...sel, [ORDER_REPLACEMENT_PARTS_ITEM_ID]: { ...prev, addToTraveler: true } }
  }
  if (prev.addToTraveler) return sel
  return {
    ...sel,
    [ORDER_REPLACEMENT_PARTS_ITEM_ID]: { ...prev, addToTraveler: true },
  }
}
