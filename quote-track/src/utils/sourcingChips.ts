import type { Quote } from '../types'

export interface SourcingChips {
  itemsSourced: number
  itemsPartial: number
  vendorsOut: number
  noVendorsYet: boolean
  attachmentCount: number
}

function lineItemSourced(item: import('../types').LineItem): boolean {
  if (!item.selectedVendorId) return false
  const v = item.vendorQuotes.find((x) => x.id === item.selectedVendorId)
  return v?.status === 'price_received'
}

function lineItemPartial(item: import('../types').LineItem): boolean {
  const hasPrice = item.vendorQuotes.some(
    (v) => v.status === 'price_received' || v.unitPrice != null,
  )
  return hasPrice && !item.selectedVendorId
}

export function computeSourcingChips(q: Quote): SourcingChips {
  let vendorsOut = 0
  for (const li of q.lineItems) {
    vendorsOut += li.vendorQuotes.filter((v) => v.status === 'rfq_sent').length
  }
  const totalVendorRows = q.lineItems.reduce((n, li) => n + li.vendorQuotes.length, 0)
  const itemsSourced = q.lineItems.filter(lineItemSourced).length
  const itemsPartial = q.lineItems.filter(lineItemPartial).length
  const noVendorsYet = q.lineItems.length > 0 && totalVendorRows === 0
  const attachmentCount = q.attachments.length

  return {
    itemsSourced,
    itemsPartial,
    vendorsOut,
    noVendorsYet,
    attachmentCount,
  }
}

export function chipsToLabels(c: SourcingChips): string[] {
  const out: string[] = []
  if (c.itemsSourced) out.push(`${c.itemsSourced} item${c.itemsSourced === 1 ? '' : 's'} sourced`)
  if (c.itemsPartial) out.push(`${c.itemsPartial} partial`)
  if (c.vendorsOut) out.push(`${c.vendorsOut} vendor${c.vendorsOut === 1 ? '' : 's'} out`)
  if (c.noVendorsYet) out.push('No vendors yet')
  if (c.attachmentCount) out.push(`📎 ${c.attachmentCount}`)
  return out
}
