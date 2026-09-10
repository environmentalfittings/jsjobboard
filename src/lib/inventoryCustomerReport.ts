import { jsPDF } from 'jspdf'
import { openPreviewWindow, showHtmlPreview } from './printHtml'
import type { InventoryEvent, InventoryRecord } from './inventory'
import { resolveInventoryPublicOrigin } from './inventory'
import type { CustomerSalesRepRow } from './customers'
import { findCustomerByName } from './customers'
import logoUrl from '../assets/js-logo.png'

export type InventoryCustomerGroup = {
  customer: string
  items: InventoryRecord[]
  salesRepEmployeeId: string | null
}

export type InventoryCustomerReportStats = {
  onHand: number
  partsOnHand: number
  added: number
  removed: number
  restored: number
  hfAcid: number
  newCount: number
  reconditionedCount: number
}

export type InventoryReportFilters = {
  /** Empty string = all types */
  valveType: string
  /** Empty string = all sizes */
  size: string
}

export const EMPTY_INVENTORY_REPORT_FILTERS: InventoryReportFilters = {
  valveType: '',
  size: '',
}

export type InventoryPeriodActivityRow = {
  eventId: number
  eventType: InventoryEvent['event_type']
  whenIso: string
  whenLabel: string
  jsInventoryId: string
  customerIdNo: string
  manufacturer: string
  valveType: string
  size: string
  reason: string
  poNumber: string
  byName: string
}

function inventoryTypeLabel(row: InventoryRecord): string {
  if (row.is_valve_part) {
    return (row.valve_type_label || 'Part').trim()
  }
  return (row.valve_type_label || row.valve_type_id || '').trim()
}

function inventorySizeLabel(row: InventoryRecord): string {
  return (row.size || '').trim()
}

export function filterInventoryRecordsForReport(
  items: InventoryRecord[],
  filters: InventoryReportFilters | null | undefined,
): InventoryRecord[] {
  const typeNeedle = filters?.valveType?.trim().toLowerCase() || ''
  const sizeNeedle = filters?.size?.trim().toLowerCase() || ''
  if (!typeNeedle && !sizeNeedle) return items
  return items.filter((item) => {
    if (typeNeedle && inventoryTypeLabel(item).toLowerCase() !== typeNeedle) return false
    if (sizeNeedle && inventorySizeLabel(item).toLowerCase() !== sizeNeedle) return false
    return true
  })
}

export function inventoryReportFilterOptions(items: InventoryRecord[]): {
  valveTypes: string[]
  sizes: string[]
} {
  const types = new Set<string>()
  const sizes = new Set<string>()
  for (const item of items) {
    const type = inventoryTypeLabel(item)
    const size = inventorySizeLabel(item)
    if (type) types.add(type)
    if (size) sizes.add(size)
  }
  const collator = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return {
    valveTypes: [...types].sort(collator),
    sizes: [...sizes].sort(collator),
  }
}

function formatActivityWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso || '—'
  return date.toLocaleString()
}

/**
 * Period activity for one customer (date range from `periodLabel`: month or preset range).
 * "Restored" = item was removed earlier and then **added back** to active inventory.
 */
export function buildInventoryPeriodActivity(options: {
  events: InventoryEvent[]
  customer: string
  periodLabel: string
  /** Active + removed rows used to resolve type/size/manufacturer for each event. */
  lookupRecords?: InventoryRecord[]
  filters?: InventoryReportFilters | null
}): {
  added: InventoryPeriodActivityRow[]
  removed: InventoryPeriodActivityRow[]
  restored: InventoryPeriodActivityRow[]
} {
  const customerKey = options.customer.trim().toLowerCase()
  const byId = new Map<string, InventoryRecord>()
  for (const row of options.lookupRecords ?? []) {
    byId.set(row.id, row)
  }

  const typeNeedle = options.filters?.valveType?.trim().toLowerCase() || ''
  const sizeNeedle = options.filters?.size?.trim().toLowerCase() || ''

  const rows: InventoryPeriodActivityRow[] = []
  for (const event of options.events) {
    const eventCustomer = (event.customer ?? '').trim().toLowerCase()
    if (customerKey && eventCustomer !== customerKey) continue
    if (!isInInventoryReportPeriod(event.created_at, options.periodLabel)) continue

    const record = byId.get(event.inventory_id)
    const valveType = record ? inventoryTypeLabel(record) : ''
    const size = record ? inventorySizeLabel(record) : ''
    if (typeNeedle && valveType.toLowerCase() !== typeNeedle) continue
    if (sizeNeedle && size.toLowerCase() !== sizeNeedle) continue

    rows.push({
      eventId: event.id,
      eventType: event.event_type,
      whenIso: event.created_at,
      whenLabel: formatActivityWhen(event.created_at),
      jsInventoryId: event.js_inventory_id?.trim() || record?.js_inventory_id?.trim() || '—',
      customerIdNo: event.customer_id_no?.trim() || record?.customer_id_no?.trim() || '—',
      manufacturer: record?.manufacturer_name?.trim() || '—',
      valveType: valveType || '—',
      size: size || '—',
      reason: event.reason?.trim() || '—',
      poNumber: event.po_number?.trim() || '—',
      byName: event.created_by_name?.trim() || '—',
    })
  }

  const sortAsc = (a: InventoryPeriodActivityRow, b: InventoryPeriodActivityRow) =>
    a.whenIso.localeCompare(b.whenIso)

  return {
    added: rows.filter((row) => row.eventType === 'added').sort(sortAsc),
    removed: rows.filter((row) => row.eventType === 'removed').sort(sortAsc),
    restored: rows.filter((row) => row.eventType === 'restored').sort(sortAsc),
  }
}

export function inventoryReportFiltersSummary(filters: InventoryReportFilters | null | undefined): string | null {
  const parts: string[] = []
  if (filters?.valveType?.trim()) parts.push(`Type: ${filters.valveType.trim()}`)
  if (filters?.size?.trim()) parts.push(`Size: ${filters.size.trim()}`)
  return parts.length ? parts.join(' · ') : null
}

let cachedLogoDataUrl: string | null | undefined

async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl
  try {
    const res = await fetch(logoUrl)
    if (!res.ok) throw new Error(`Logo fetch failed (${res.status})`)
    const blob = await res.blob()
    cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('Could not read logo'))
      reader.readAsDataURL(blob)
    })
  } catch {
    cachedLogoDataUrl = null
  }
  return cachedLogoDataUrl
}

export function currentInventoryReportPeriod(now = new Date()): string {
  return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function formatInventoryReportPeriod(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export const INVENTORY_REPORT_PERIOD_PRESETS = [
  'Year to date',
  'Previous year',
  'This quarter',
  'Last quarter',
] as const

export type InventoryReportPeriodPreset = (typeof INVENTORY_REPORT_PERIOD_PRESETS)[number]

export function isInventoryReportPeriodPreset(
  periodLabel: string,
): periodLabel is InventoryReportPeriodPreset {
  return (INVENTORY_REPORT_PERIOD_PRESETS as readonly string[]).includes(periodLabel.trim())
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function quarterStartMonth(monthIndex: number): number {
  return Math.floor(monthIndex / 3) * 3
}

function formatPeriodRangeText(start: Date, end: Date): string {
  return `${start.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`
}

/** Parse "September 2026" → first day of that month, or null if invalid. */
export function parseInventoryReportPeriod(
  periodLabel: string,
  now = new Date(),
): Date | null {
  const label = periodLabel.trim() || currentInventoryReportPeriod(now)
  if (isInventoryReportPeriodPreset(label)) return null
  const parsed = new Date(`1 ${label}`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1)
}

/**
 * Inclusive date range for a period label (month name, or preset like "Year to date").
 */
export function inventoryReportPeriodDateRange(
  periodLabel: string,
  now = new Date(),
): { start: Date; end: Date; label: string; rangeText: string } {
  const label = periodLabel.trim() || currentInventoryReportPeriod(now)
  const today = startOfDay(now)
  let start: Date
  let end: Date
  let displayLabel = label

  if (label === 'Year to date') {
    start = new Date(now.getFullYear(), 0, 1)
    end = today
  } else if (label === 'Previous year') {
    const year = now.getFullYear() - 1
    start = new Date(year, 0, 1)
    end = new Date(year, 11, 31)
  } else if (label === 'This quarter') {
    const qStart = quarterStartMonth(now.getMonth())
    start = new Date(now.getFullYear(), qStart, 1)
    end = new Date(now.getFullYear(), qStart + 3, 0)
  } else if (label === 'Last quarter') {
    const thisQStart = quarterStartMonth(now.getMonth())
    const lastQEnd = new Date(now.getFullYear(), thisQStart, 0)
    const lastQStartMonth = quarterStartMonth(lastQEnd.getMonth())
    start = new Date(lastQEnd.getFullYear(), lastQStartMonth, 1)
    end = lastQEnd
  } else {
    start =
      parseInventoryReportPeriod(label, now) ??
      new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    displayLabel = formatInventoryReportPeriod(start)
  }

  return {
    start: startOfDay(start),
    end: endOfDay(end),
    label: displayLabel,
    rangeText: formatPeriodRangeText(startOfDay(start), startOfDay(end)),
  }
}

/**
 * Period choices: presets first, then recent months plus months found in events.
 */
export function inventoryReportPeriodOptions(
  events: InventoryEvent[] = [],
  now = new Date(),
  monthsBack = 18,
): string[] {
  const monthLabels = new Set<string>()
  monthLabels.add(formatInventoryReportPeriod(now))

  for (let i = 1; i < monthsBack; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthLabels.add(formatInventoryReportPeriod(d))
  }

  for (const event of events) {
    if (!event.created_at?.trim()) continue
    const date = new Date(event.created_at)
    if (Number.isNaN(date.getTime())) continue
    monthLabels.add(formatInventoryReportPeriod(date))
  }

  const months = [...monthLabels].sort((a, b) => {
    const da = Date.parse(`1 ${a}`)
    const db = Date.parse(`1 ${b}`)
    if (!Number.isNaN(da) && !Number.isNaN(db)) return db - da
    return b.localeCompare(a)
  })

  return [...INVENTORY_REPORT_PERIOD_PRESETS, ...months]
}

/** True when `iso` falls within the selected report period's date range. */
export function isInInventoryReportPeriod(
  iso: string | null | undefined,
  periodLabel: string,
  now = new Date(),
): boolean {
  if (!iso?.trim()) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  const { start, end } = inventoryReportPeriodDateRange(periodLabel, now)
  const t = date.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

export function buildInventoryCustomerReportStats(options: {
  items: InventoryRecord[]
  events: InventoryEvent[]
  customer: string
  periodLabel: string
  filters?: InventoryReportFilters | null
  /** Active + removed rows so period events can be filtered by Type/Size. */
  lookupRecords?: InventoryRecord[]
}): InventoryCustomerReportStats {
  const activity = buildInventoryPeriodActivity({
    events: options.events,
    customer: options.customer,
    periodLabel: options.periodLabel,
    lookupRecords: options.lookupRecords,
    filters: options.filters,
  })

  let hfAcid = 0
  let newCount = 0
  let reconditionedCount = 0
  let partsOnHand = 0
  for (const item of options.items) {
    if (item.hf_acid) hfAcid += 1
    if (item.condition === 'new') newCount += 1
    if (item.condition === 'reconditioned') reconditionedCount += 1
    if (item.is_valve_part) partsOnHand += 1
  }

  return {
    onHand: options.items.length,
    partsOnHand,
    added: activity.added.length,
    removed: activity.removed.length,
    restored: activity.restored.length,
    hfAcid,
    newCount,
    reconditionedCount,
  }
}

export function groupInventoryByCustomer(
  rows: InventoryRecord[],
  customers: CustomerSalesRepRow[] = [],
): InventoryCustomerGroup[] {
  const map = new Map<string, InventoryRecord[]>()
  for (const row of rows) {
    const key = row.customer?.trim() || 'Unassigned customer'
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }

  return [...map.entries()]
    .map(([customer, items]) => {
      const match = findCustomerByName(customers, customer)
      return {
        customer,
        items: [...items].sort((a, b) =>
          String(a.js_inventory_id ?? '').localeCompare(String(b.js_inventory_id ?? ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        ),
        salesRepEmployeeId: match?.sales_rep_employee_id ?? null,
      }
    })
    .sort((a, b) => a.customer.localeCompare(b.customer, undefined, { sensitivity: 'base' }))
}

export type InventoryCustomerIdGroup = {
  customerIdNo: string
  items: InventoryRecord[]
  qty: number
  manufacturer: string
  valveType: string
  /** Part type(s) when the group includes valve parts; otherwise "—". */
  partType: string
  size: string
  pressure: string
  bodyMaterial: string
  operator: string
  apiTrim: string
  origin: string
  conditionSummary: string
  hfAcid: boolean
  jsInventoryIds: string[]
}

function uniqueJoined(
  items: InventoryRecord[],
  pick: (item: InventoryRecord) => string | null | undefined,
): string {
  const values = [
    ...new Set(
      items
        .map((item) => pick(item)?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  return values.length ? values.join(', ') : '—'
}

/**
 * Default report sort for Type:
 * Parts → Non-Lubricated Plug → Gate → Globe → Orbit → everything else.
 */
export function inventoryReportTypeSortRank(typeLabel: string | null | undefined): number {
  const raw = (typeLabel ?? '').trim().toLowerCase()
  if (!raw || raw === '—') return 99
  if (raw === 'part' || raw.startsWith('part ') || raw.includes(', part') || raw.startsWith('part,')) {
    return 0
  }
  if (raw.includes('part') && !raw.includes('partition')) return 0
  const compact = raw.replace(/[-_/]/g, ' ').replace(/\s+/g, ' ')
  if (
    (compact.includes('non lubricat') || compact.includes('nonlubricat')) &&
    compact.includes('plug')
  ) {
    return 1
  }
  if (compact.includes('plug') && (compact.includes('non') || compact.includes('nl'))) return 1
  if (/\bgate\b/.test(compact)) return 2
  if (/\bglobe\b/.test(compact)) return 3
  if (/\borbit/.test(compact)) return 4
  return 50
}

function inventoryReportGroupTypeRank(group: InventoryCustomerIdGroup): number {
  if (group.items.some((item) => item.is_valve_part)) return 0
  const ranks = group.valveType
    .split(',')
    .map((part) => inventoryReportTypeSortRank(part.trim()))
  return ranks.length ? Math.min(...ranks) : 99
}

function toInventoryCustomerIdGroup(
  customerIdNo: string,
  groupItems: InventoryRecord[],
): InventoryCustomerIdGroup {
  const sorted = [...groupItems].sort((a, b) => {
    const typeCmp =
      inventoryReportTypeSortRank(
        a.is_valve_part ? a.valve_type_label || 'Part' : a.valve_type_label || a.valve_type_id,
      ) -
      inventoryReportTypeSortRank(
        b.is_valve_part ? b.valve_type_label || 'Part' : b.valve_type_label || b.valve_type_id,
      )
    if (typeCmp !== 0) return typeCmp
    const partCmp = String(a.part_type ?? '').localeCompare(String(b.part_type ?? ''), undefined, {
      sensitivity: 'base',
    })
    if (partCmp !== 0) return partCmp
    return String(a.js_inventory_id ?? '').localeCompare(String(b.js_inventory_id ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
  const newCount = sorted.filter((item) => item.condition === 'new').length
  const recondCount = sorted.filter((item) => item.condition === 'reconditioned').length
  const conditionParts: string[] = []
  if (newCount) conditionParts.push(`New ×${newCount}`)
  if (recondCount) conditionParts.push(`Recond. ×${recondCount}`)
  const unmarked = sorted.length - newCount - recondCount
  if (unmarked > 0) conditionParts.push(`Other ×${unmarked}`)

  return {
    customerIdNo,
    items: sorted,
    qty: sorted.length,
    manufacturer: uniqueJoined(sorted, (item) => item.manufacturer_name),
    valveType: uniqueJoined(sorted, (item) =>
      item.is_valve_part
        ? item.valve_type_label || 'Part'
        : item.valve_type_label || item.valve_type_id,
    ),
    partType: uniqueJoined(
      sorted.filter((item) => item.is_valve_part),
      (item) => item.part_type,
    ),
    size: uniqueJoined(sorted, (item) => item.size),
    pressure: uniqueJoined(sorted, (item) => item.pressure),
    bodyMaterial: uniqueJoined(sorted, (item) => item.body_material),
    operator: uniqueJoined(sorted, (item) => item.operator),
    apiTrim: uniqueJoined(sorted, (item) => item.api_trim),
    origin: uniqueJoined(sorted, (item) => item.origin),
    conditionSummary: conditionParts.join(' · ') || '—',
    hfAcid: sorted.some((item) => item.hf_acid),
    jsInventoryIds: sorted
      .map((item) => item.js_inventory_id?.trim())
      .filter((value): value is string => Boolean(value)),
  }
}

function sortInventoryCustomerIdGroups(groups: InventoryCustomerIdGroup[]): InventoryCustomerIdGroup[] {
  return [...groups].sort((a, b) => {
    const typeCmp = inventoryReportGroupTypeRank(a) - inventoryReportGroupTypeRank(b)
    if (typeCmp !== 0) return typeCmp
    const partCmp = a.partType.localeCompare(b.partType, undefined, { sensitivity: 'base' })
    if (partCmp !== 0) return partCmp
    const aMissing = !a.customerIdNo || a.customerIdNo === '—'
    const bMissing = !b.customerIdNo || b.customerIdNo === '—'
    if (aMissing !== bMissing) return aMissing ? 1 : -1
    return a.customerIdNo.localeCompare(b.customerIdNo, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })
}

/**
 * Group on-hand rows for the report.
 * - Items with the same customer ID are combined (qty + JS IDs).
 * - Items with no customer ID stay as their own rows (never combined).
 */
export function groupInventoryByCustomerIdNo(items: InventoryRecord[]): InventoryCustomerIdGroup[] {
  const map = new Map<string, { label: string; items: InventoryRecord[] }>()
  for (const item of items) {
    const customerId = item.customer_id_no?.trim() || ''
    // No customer ID → one row per inventory item (do not combine).
    const key = customerId ? `id:${customerId.toLowerCase()}` : `solo:${item.id}`
    const label = customerId || '—'
    const existing = map.get(key)
    if (existing) existing.items.push(item)
    else map.set(key, { label, items: [item] })
  }

  return sortInventoryCustomerIdGroups(
    [...map.values()].map(({ label, items: groupItems }) =>
      toInventoryCustomerIdGroup(label, groupItems),
    ),
  )
}

/** Split report inventory into valves vs parts (separate tables). */
export function splitInventoryReportGroups(items: InventoryRecord[]): {
  valves: InventoryCustomerIdGroup[]
  parts: InventoryCustomerIdGroup[]
} {
  const valves: InventoryRecord[] = []
  const parts: InventoryRecord[] = []
  for (const item of items) {
    if (item.is_valve_part) parts.push(item)
    else valves.push(item)
  }
  return {
    valves: groupInventoryByCustomerIdNo(valves),
    parts: groupInventoryByCustomerIdNo(parts),
  }
}

function formatPeriodActivityLines(
  title: string,
  rows: InventoryPeriodActivityRow[],
  includeRemovalFields: boolean,
): string[] {
  if (!rows.length) return [`${title}: none`]
  return [
    `${title} (${rows.length}):`,
    ...rows.map((row) => {
      const base = `  ${row.whenLabel} · ${row.jsInventoryId} · ${row.valveType} ${row.size} · by ${row.byName}`
      if (!includeRemovalFields) return base
      return `${base} · PO ${row.poNumber} · Reason ${row.reason}`
    }),
  ]
}

export function formatInventoryCustomerReportMessage(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  stats?: InventoryCustomerReportStats | null
  filters?: InventoryReportFilters | null
  events?: InventoryEvent[]
  lookupRecords?: InventoryRecord[]
}): { subject: string; body: string } {
  const customer = options.customer.trim() || 'Unassigned customer'
  const period = options.periodLabel.trim() || currentInventoryReportPeriod()
  const periodRange = inventoryReportPeriodDateRange(period)
  const filterNote = inventoryReportFiltersSummary(options.filters)
  const subject = `Monthly inventory report — ${customer} (${period})`
  const { valves, parts } = splitInventoryReportGroups(options.items)
  const lines = [
    ...valves.map((group) => {
      const desc = [
        group.manufacturer !== '—' ? group.manufacturer : null,
        group.valveType !== '—' ? group.valveType : null,
        group.size !== '—' ? group.size : null,
        group.pressure !== '—' ? group.pressure : null,
        group.bodyMaterial !== '—' ? group.bodyMaterial : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const ids = group.jsInventoryIds.length ? ` [${group.jsInventoryIds.join(', ')}]` : ''
      return `Valve · Customer ID ${group.customerIdNo} · Qty ${group.qty} · ${desc || 'Inventory'}${ids}`
    }),
    ...parts.map((group) => {
      const desc = [
        group.manufacturer !== '—' ? group.manufacturer : null,
        group.partType !== '—' ? `Part type: ${group.partType}` : 'Part',
        group.size !== '—' ? group.size : null,
        group.bodyMaterial !== '—' ? group.bodyMaterial : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const ids = group.jsInventoryIds.length ? ` [${group.jsInventoryIds.join(', ')}]` : ''
      return `Part · Customer ID ${group.customerIdNo} · Qty ${group.qty} · ${desc || 'Part'}${ids}`
    }),
  ]
  const salesmanLine = options.salesmanName?.trim()
    ? `Salesman: ${options.salesmanName.trim()}`
    : null
  const stats = options.stats
  const activity =
    options.events != null
      ? buildInventoryPeriodActivity({
          events: options.events,
          customer: options.customer,
          periodLabel: period,
          lookupRecords: options.lookupRecords,
          filters: options.filters,
        })
      : null

  const body = [
    `Monthly Customer Inventory Report`,
    `Customer: ${customer}`,
    `Period: ${period}`,
    `Dates: ${periodRange.rangeText}`,
    filterNote ? `Filters: ${filterNote}` : null,
    salesmanLine,
    `Items on hand: ${options.items.length}`,
    stats
      ? `This period — Added: ${stats.added} · Removed: ${stats.removed} · Valve parts on hand: ${stats.partsOnHand}`
      : null,
    `On hand is current stock. Valves added / removed count activity only within the period dates.`,
    stats && stats.restored > 0 ? `Added back this period: ${stats.restored}` : null,
    ``,
    ...lines,
    ...(activity
      ? [
          ``,
          ...formatPeriodActivityLines('Added this period', activity.added, false),
          ``,
          ...formatPeriodActivityLines('Removed this period', activity.removed, true),
          ``,
          ...formatPeriodActivityLines('Added back this period', activity.restored, false),
        ]
      : []),
    ``,
    `Open Customer Inventory: /admin/inventory?customer=${encodeURIComponent(customer)}`,
  ]
    .filter((line) => line != null)
    .join('\n')

  return { subject, body }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function activityTableHtml(
  title: string,
  note: string,
  rows: InventoryPeriodActivityRow[],
  includeRemovalFields: boolean,
): string {
  const colCount = includeRemovalFields ? 9 : 7
  const header = includeRemovalFields
    ? `<tr>
          <th>When</th>
          <th>JS ID</th>
          <th>Customer ID</th>
          <th>Type</th>
          <th>Size</th>
          <th>Mfr</th>
          <th>By</th>
          <th>PO</th>
          <th>Reason</th>
        </tr>`
    : `<tr>
          <th>When</th>
          <th>JS ID</th>
          <th>Customer ID</th>
          <th>Type</th>
          <th>Size</th>
          <th>Mfr</th>
          <th>By</th>
        </tr>`
  const body =
    rows.length > 0
      ? rows
          .map((row) => {
            const common = `
        <td>${escapeHtml(row.whenLabel)}</td>
        <td class="id-cell">${escapeHtml(row.jsInventoryId)}</td>
        <td>${escapeHtml(row.customerIdNo)}</td>
        <td>${escapeHtml(row.valveType)}</td>
        <td>${escapeHtml(row.size)}</td>
        <td>${escapeHtml(row.manufacturer)}</td>
        <td>${escapeHtml(row.byName)}</td>`
            if (!includeRemovalFields) return `<tr>${common}</tr>`
            return `<tr>${common}
        <td>${escapeHtml(row.poNumber)}</td>
        <td>${escapeHtml(row.reason)}</td>
      </tr>`
          })
          .join('')
      : `<tr><td colspan="${colCount}">None in this period.</td></tr>`

  return `
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <p class="section-note">${escapeHtml(note)}</p>
    <table class="activity-table">
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>`
}

/** Shared printable HTML used by print + email-download. */
export async function buildInventoryCustomerReportHtml(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  events?: InventoryEvent[]
  filters?: InventoryReportFilters | null
  lookupRecords?: InventoryRecord[]
  includeToolbar?: boolean
}): Promise<{ subject: string; html: string }> {
  const stats = buildInventoryCustomerReportStats({
    items: options.items,
    events: options.events ?? [],
    customer: options.customer,
    periodLabel: options.periodLabel,
    filters: options.filters,
    lookupRecords: options.lookupRecords,
  })
  const activity = buildInventoryPeriodActivity({
    events: options.events ?? [],
    customer: options.customer,
    periodLabel: options.periodLabel,
    lookupRecords: options.lookupRecords,
    filters: options.filters,
  })
  const filterNote = inventoryReportFiltersSummary(options.filters)
  const periodRange = inventoryReportPeriodDateRange(options.periodLabel)
  const { subject } = formatInventoryCustomerReportMessage({ ...options, stats })
  const logoDataUrl = await getLogoDataUrl()
  const generatedAt = new Date().toLocaleString()
  const { valves: valveGroups, parts: partGroups } = splitInventoryReportGroups(options.items)
  const includeToolbar = options.includeToolbar !== false

  const activitySectionsHtml = `${activityTableHtml(
    'Added this period',
    'Valves newly placed into this customer’s inventory during the period, with date/time and who recorded it.',
    activity.added,
    false,
  )}
    ${activityTableHtml(
      'Removed this period',
      'Valves taken out of active inventory during the period, including who removed them and the PO or reason when recorded.',
      activity.removed,
      true,
    )}
    ${activityTableHtml(
      'Added back this period',
      'Valves previously removed that were returned to active inventory during the period.',
      activity.restored,
      false,
    )}`

  const valveRows = valveGroups
    .map((group) => {
      const ids =
        group.jsInventoryIds.length > 0
          ? escapeHtml(group.jsInventoryIds.join(', '))
          : '—'
      return `<tr>
        <td class="id-cell">${escapeHtml(group.customerIdNo)}</td>
        <td class="qty-cell">${group.qty}</td>
        <td>${escapeHtml(group.manufacturer)}</td>
        <td>${escapeHtml(group.valveType)}</td>
        <td>${escapeHtml(group.size)}</td>
        <td>${escapeHtml(group.pressure)}</td>
        <td>${escapeHtml(group.bodyMaterial)}</td>
        <td>${escapeHtml(group.origin)}</td>
        <td>${escapeHtml(group.conditionSummary)}</td>
        <td>${group.hfAcid ? 'Yes' : '—'}</td>
        <td class="ids-cell">${ids}</td>
      </tr>`
    })
    .join('')

  const partRows = partGroups
    .map((group) => {
      const ids =
        group.jsInventoryIds.length > 0
          ? escapeHtml(group.jsInventoryIds.join(', '))
          : '—'
      return `<tr>
        <td class="id-cell">${escapeHtml(group.customerIdNo)}</td>
        <td class="qty-cell">${group.qty}</td>
        <td>${escapeHtml(group.manufacturer)}</td>
        <td>${escapeHtml(group.partType)}</td>
        <td>${escapeHtml(group.size)}</td>
        <td>${escapeHtml(group.bodyMaterial)}</td>
        <td>${escapeHtml(group.origin)}</td>
        <td>${escapeHtml(group.conditionSummary)}</td>
        <td>${group.hfAcid ? 'Yes' : '—'}</td>
        <td class="ids-cell">${ids}</td>
      </tr>`
    })
    .join('')

  const logoBlock = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="JS Valve" />`
    : `<div class="logo-fallback">JS Valve</div>`

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
  <style>
    :root {
      --ink: #0f172a;
      --muted: #64748b;
      --line: #d8dee6;
      --wash: #f4f7f8;
      --brand: #0f766e;
      --brand-deep: #115e59;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      color: var(--ink);
      background: #fff;
      font: 10.5pt/1.45 "Segoe UI", system-ui, sans-serif;
    }
    .sheet { padding: 0.55in 0.6in 0.7in; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      padding: 0.55rem 0.75rem;
      background: var(--wash);
      border-bottom: 1px solid var(--line);
    }
    .toolbar button {
      appearance: none;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 6px;
      padding: 0.45rem 0.9rem;
      font: 600 13px/1.2 "Segoe UI", system-ui, sans-serif;
      cursor: pointer;
      color: var(--ink);
    }
    .toolbar button.primary {
      background: var(--brand);
      border-color: var(--brand);
      color: #fff;
    }
    .masthead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 0.85rem;
      margin-bottom: 0.9rem;
      border-bottom: 3px solid var(--brand);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      min-width: 0;
    }
    .logo {
      width: 64px;
      height: 64px;
      object-fit: contain;
      flex: 0 0 auto;
    }
    .logo-fallback {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      background: var(--brand);
      color: #fff;
      font-weight: 700;
      font-size: 11px;
      text-align: center;
      border-radius: 8px;
      line-height: 1.15;
      padding: 0.35rem;
    }
    .brand-text h1 {
      margin: 0;
      font-size: 20pt;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: var(--brand-deep);
    }
    .brand-text p {
      margin: 0.2rem 0 0;
      color: var(--muted);
      font-size: 10pt;
    }
    .meta-block {
      text-align: right;
      font-size: 9.5pt;
      color: var(--muted);
    }
    .meta-block strong { color: var(--ink); }
    .meta-block p { margin: 0.15rem 0; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.55rem;
      margin: 0 0 1rem;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.65rem 0.75rem;
      background: linear-gradient(180deg, #fff 0%, var(--wash) 100%);
    }
    .stat .label {
      display: block;
      font-size: 8pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }
    .stat .value {
      display: block;
      margin-top: 0.2rem;
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--brand-deep);
      line-height: 1.1;
    }
    .stat.muted .value { color: var(--ink); }
    .stat.alert .value { color: #b45309; }
    .substats {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      margin: 0 0 0.9rem;
      padding: 0.55rem 0.7rem;
      background: var(--wash);
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--muted);
      font-size: 9.5pt;
    }
    .substats strong { color: var(--ink); }
    .period-note {
      margin: 0 0 0.9rem;
      padding: 0.55rem 0.7rem;
      border-left: 3px solid var(--brand);
      background: #f0fdfa;
      color: var(--ink);
      font-size: 9.5pt;
    }
    .period-note p { margin: 0.2rem 0; }
    .period-note .muted { color: var(--muted); }
    .section-title {
      margin: 1.1rem 0 0.45rem;
      font-size: 11pt;
      color: var(--brand-deep);
    }
    .section-note {
      margin: -0.2rem 0 0.55rem;
      color: var(--muted);
      font-size: 9pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 0.32rem 0.4rem;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--brand-deep);
      color: #fff;
      font-weight: 600;
      font-size: 7.5pt;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    tbody tr:nth-child(even) td { background: #f8fafb; }
    td.id-cell { font-weight: 700; white-space: nowrap; }
    td.qty-cell { font-weight: 700; text-align: center; color: var(--brand-deep); }
    td.ids-cell { font-size: 7.5pt; color: var(--muted); word-break: break-word; }
    .activity-table { margin-bottom: 0.35rem; }
    .footer {
      margin-top: 0.85rem;
      padding-top: 0.55rem;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 8.5pt;
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }
    @media (max-width: 700px) {
      .sheet { padding: 1rem 0.85rem 1.5rem; }
      .masthead { flex-direction: column; align-items: flex-start; }
      .meta-block { text-align: left; }
      .stats { grid-template-columns: 1fr 1fr; }
      .toolbar button { min-height: 44px; padding: 0.65rem 1.1rem; }
    }
    @media print {
      .toolbar { display: none !important; }
      .sheet { padding: 0; }
      .stat, .substats, .period-note, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { size: letter; margin: 0.45in; }
  </style>
</head>
<body>
  ${
    includeToolbar
      ? `<div class="toolbar">
    <button type="button" onclick="closePreview()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print</button>
  </div>
  <script>
    function closePreview() {
      window.close();
      setTimeout(function () {
        if (!window.closed) history.back();
      }, 50);
    }
  </script>`
      : ''
  }
  <div class="sheet">
    <header class="masthead">
      <div class="brand">
        ${logoBlock}
        <div class="brand-text">
          <h1>Customer Inventory Report</h1>
          <p>JS Valve · Monthly inventory summary</p>
        </div>
      </div>
      <div class="meta-block">
        <p><strong>Customer:</strong> ${escapeHtml(options.customer.trim() || 'Unassigned customer')}</p>
        <p><strong>Period:</strong> ${escapeHtml(periodRange.label)}</p>
        <p><strong>Dates:</strong> ${escapeHtml(periodRange.rangeText)}</p>
        ${
          filterNote
            ? `<p><strong>Filters:</strong> ${escapeHtml(filterNote)}</p>`
            : ''
        }
        ${
          options.salesmanName?.trim()
            ? `<p><strong>Salesman:</strong> ${escapeHtml(options.salesmanName.trim())}</p>`
            : `<p><strong>Salesman:</strong> Not assigned</p>`
        }
        <p>Generated ${escapeHtml(generatedAt)}</p>
      </div>
    </header>

    <div class="period-note">
      <p><strong>Report period:</strong> ${escapeHtml(periodRange.rangeText)} (${escapeHtml(
        periodRange.label,
      )}).</p>
      <p><strong>On hand</strong> is current stock (not limited to this period). <strong>Valves added</strong> and
      <strong>removed</strong> count only activity inside these dates — so on hand can be higher if some items were
      added before the period started.</p>
      <p class="muted"><strong>Valve parts on hand</strong> is how many of the current on-hand items are marked as parts.</p>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="label">On hand</span>
        <span class="value">${stats.onHand}</span>
      </div>
      <div class="stat muted">
        <span class="label">Valve parts on hand</span>
        <span class="value">${stats.partsOnHand}</span>
      </div>
      <div class="stat">
        <span class="label">Valves added</span>
        <span class="value">${stats.added}</span>
      </div>
      <div class="stat alert">
        <span class="label">Valves removed</span>
        <span class="value">${stats.removed}</span>
      </div>
    </div>

    <div class="substats">
      <span><strong>HF Acid:</strong> ${stats.hfAcid}</span>
      <span><strong>New:</strong> ${stats.newCount}</span>
      <span><strong>Reconditioned:</strong> ${stats.reconditionedCount}</span>
      <span><strong>Period activity:</strong> ${stats.added + stats.removed + stats.restored} event${
        stats.added + stats.removed + stats.restored === 1 ? '' : 's'
      }</span>
    </div>

    ${activitySectionsHtml}

    <h2 class="section-title">Valves by customer ID</h2>
    <p class="section-note">
      Sorted by valve type: Non-Lubricated Plug, Gate, Globe, Orbit, then all other types.
      Valves that share the same customer ID are grouped with a quantity. Items without a customer ID are listed individually (not combined).
      This is current on-hand stock, not limited to the period dates above.
    </p>
    <table>
      <thead>
        <tr>
          <th>Customer ID</th>
          <th>Qty</th>
          <th>Manufacturer</th>
          <th>Type</th>
          <th>Size</th>
          <th>Pressure</th>
          <th>Body</th>
          <th>Origin</th>
          <th>Condition</th>
          <th>HF Acid</th>
          <th>JS inventory IDs</th>
        </tr>
      </thead>
      <tbody>${
        valveRows ||
        `<tr><td colspan="11">No valves on hand for this customer.</td></tr>`
      }</tbody>
    </table>

    <h2 class="section-title">Parts on hand</h2>
    <p class="section-note">
      Valve parts listed separately. Same customer ID grouping rules apply; items without a customer ID are listed individually.
    </p>
    <table>
      <thead>
        <tr>
          <th>Customer ID</th>
          <th>Qty</th>
          <th>Manufacturer</th>
          <th>Part type</th>
          <th>Size</th>
          <th>Material</th>
          <th>Origin</th>
          <th>Condition</th>
          <th>HF Acid</th>
          <th>JS inventory IDs</th>
        </tr>
      </thead>
      <tbody>${
        partRows ||
        `<tr><td colspan="10">No parts on hand for this customer.</td></tr>`
      }</tbody>
    </table>

    <div class="footer">
      <span>JS Valve Customer Inventory · ${escapeHtml(periodRange.label)} · ${escapeHtml(
        periodRange.rangeText,
      )}</span>
      <span>${stats.onHand} on hand · ${stats.partsOnHand} parts · ${stats.added} added · ${
        stats.removed
      } removed</span>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

/** Opens the printable HTML customer inventory report in preview (same layout email downloads). */
export async function printInventoryCustomerReport(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  events?: InventoryEvent[]
  filters?: InventoryReportFilters | null
  lookupRecords?: InventoryRecord[]
  /** Pass a window opened during the same tap so iPhone Safari does not block preview. */
  previewWindow?: Window | null
}): Promise<{ error: string | null }> {
  const preview =
    options.previewWindow && !options.previewWindow.closed
      ? options.previewWindow
      : openPreviewWindow()

  const { html } = await buildInventoryCustomerReportHtml({ ...options, includeToolbar: true })
  return showHtmlPreview(html, preview)
}

const MAILTO_BODY_SAFE_CHARS = 1600

function openMailto(to: string, subject: string, body: string) {
  const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = href
}

function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function safeReportFilenameStem(customer: string, periodLabel: string) {
  const base = `${customer.trim() || 'customer'}-${periodLabel.trim() || 'report'}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return `inventory-report-${base || 'customer'}`
}

function pdfDisplay(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}

function wrapPdfLines(doc: jsPDF, text: string, maxWidth: number, maxLines: number): string[] {
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  if (lines.length <= maxLines) return lines
  const clipped = lines.slice(0, maxLines)
  const last = clipped[maxLines - 1] ?? ''
  clipped[maxLines - 1] = last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 1))}…` : '…'
  return clipped
}

/** Landscape letter PDF of the monthly customer inventory report. */
export function buildInventoryCustomerReportPdf(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  events?: InventoryEvent[]
  filters?: InventoryReportFilters | null
  lookupRecords?: InventoryRecord[]
}): jsPDF {
  const stats = buildInventoryCustomerReportStats({
    items: options.items,
    events: options.events ?? [],
    customer: options.customer,
    periodLabel: options.periodLabel,
    filters: options.filters,
    lookupRecords: options.lookupRecords,
  })
  const activity = buildInventoryPeriodActivity({
    events: options.events ?? [],
    customer: options.customer,
    periodLabel: options.periodLabel,
    lookupRecords: options.lookupRecords,
    filters: options.filters,
  })
  const filterNote = inventoryReportFiltersSummary(options.filters)
  const periodRange = inventoryReportPeriodDateRange(options.periodLabel)
  const { valves: valveGroups, parts: partGroups } = splitInventoryReportGroups(options.items)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 10
  const marginY = 12
  const valveCols: { key: string; label: string; width: number; wrap?: boolean }[] = [
    { key: 'customerId', label: 'Customer ID', width: 26 },
    { key: 'qty', label: 'Qty', width: 10 },
    { key: 'manufacturer', label: 'Manufacturer', width: 28 },
    { key: 'type', label: 'Type', width: 34 },
    { key: 'size', label: 'Size', width: 14 },
    { key: 'pressure', label: 'Pressure', width: 16 },
    { key: 'body', label: 'Body', width: 20 },
    { key: 'origin', label: 'Origin', width: 22 },
    { key: 'condition', label: 'Condition', width: 24 },
    { key: 'hf', label: 'HF', width: 10 },
    { key: 'jsIds', label: 'JS inventory IDs', width: 45.4, wrap: true },
  ]
  const partCols: { key: string; label: string; width: number; wrap?: boolean }[] = [
    { key: 'customerId', label: 'Customer ID', width: 26 },
    { key: 'qty', label: 'Qty', width: 10 },
    { key: 'manufacturer', label: 'Manufacturer', width: 30 },
    { key: 'partType', label: 'Part type', width: 34 },
    { key: 'size', label: 'Size', width: 14 },
    { key: 'body', label: 'Material', width: 24 },
    { key: 'origin', label: 'Origin', width: 24 },
    { key: 'condition', label: 'Condition', width: 26 },
    { key: 'hf', label: 'HF', width: 10 },
    { key: 'jsIds', label: 'JS inventory IDs', width: 51.4, wrap: true },
  ]
  const lineH = 3.4
  const headerH = 8

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(15, 118, 110)
    doc.text('Customer Inventory Report', marginX, marginY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105)
    const meta = [
      `Customer: ${pdfDisplay(options.customer)}`,
      `Period: ${periodRange.label}`,
      `Dates: ${periodRange.rangeText}`,
      filterNote ? `Filters: ${filterNote}` : null,
      `Salesman: ${pdfDisplay(options.salesmanName)}`,
      `Generated ${new Date().toLocaleString()}`,
    ].filter((line): line is string => Boolean(line))
    let metaY = marginY
    for (const line of meta) {
      doc.text(line, pageWidth - marginX, metaY, { align: 'right' })
      metaY += 4.2
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    const statY = marginY + 18
    doc.text(
      `On hand ${stats.onHand}  ·  Parts ${stats.partsOnHand}  ·  Added ${stats.added}  ·  Removed ${stats.removed}  ·  HF Acid ${stats.hfAcid}  ·  Valve groups ${valveGroups.length}  ·  Part groups ${partGroups.length}`,
      marginX,
      statY,
    )
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `Period ${periodRange.rangeText}. Valves and parts are separate tables. Items without a customer ID are not combined.`,
      marginX,
      statY + 5,
    )
    return statY + 10
  }

  const drawInventoryTable = (
    title: string,
    cols: { key: string; label: string; width: number; wrap?: boolean }[],
    groups: InventoryCustomerIdGroup[],
    emptyMessage: string,
    valuesForGroup: (group: InventoryCustomerIdGroup) => Record<string, string>,
  ) => {
    const tableWidth = cols.reduce((sum, col) => sum + col.width, 0)

    if (y + 24 > pageHeight - 14) {
      doc.addPage()
      y = drawHeader()
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(17, 94, 89)
    doc.text(title, marginX, y + 8)
    y += 12

    doc.setFillColor(15, 94, 89)
    doc.rect(marginX, y, tableWidth, headerH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    let hx = marginX
    for (const col of cols) {
      doc.text(col.label, hx + 1.5, y + 5)
      hx += col.width
    }
    y += headerH

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(15, 23, 42)

    if (groups.length === 0) {
      doc.setFont('helvetica', 'italic')
      doc.text(emptyMessage, marginX, y + 6)
      y += 12
      return
    }

    groups.forEach((group, index) => {
      const values = valuesForGroup(group)
      const wrappedByKey: Record<string, string[]> = {}
      let rowLines = 1
      for (const col of cols) {
        if (!col.wrap) {
          wrappedByKey[col.key] = [values[col.key] ?? '—']
          continue
        }
        const lines = wrapPdfLines(doc, values[col.key] ?? '—', col.width - 2.5, 4)
        wrappedByKey[col.key] = lines
        rowLines = Math.max(rowLines, lines.length)
      }
      const rowHeight = Math.max(7, rowLines * lineH + 2.2)

      if (y + rowHeight > pageHeight - 14) {
        doc.addPage()
        y = drawHeader()
        doc.setFillColor(15, 94, 89)
        doc.rect(marginX, y, tableWidth, headerH, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(255, 255, 255)
        let restartX = marginX
        for (const col of cols) {
          doc.text(col.label, restartX + 1.5, y + 5)
          restartX += col.width
        }
        y += headerH
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(15, 23, 42)
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 251)
        doc.rect(marginX, y, tableWidth, rowHeight, 'F')
      }

      doc.setDrawColor(216, 222, 230)
      doc.setLineWidth(0.2)
      doc.rect(marginX, y, tableWidth, rowHeight)
      let x = marginX
      for (const col of cols) {
        doc.line(x, y, x, y + rowHeight)
        const lines = wrappedByKey[col.key] ?? ['—']
        let textY = y + 4.2
        for (const line of lines) {
          if (col.key === 'qty') {
            doc.text(line, x + col.width / 2, textY, { align: 'center' })
          } else {
            doc.text(line, x + 1.5, textY)
          }
          textY += lineH
        }
        x += col.width
      }
      doc.line(x, y, x, y + rowHeight)
      y += rowHeight
    })
    y += 4
  }

  const drawActivitySection = (
    title: string,
    rows: InventoryPeriodActivityRow[],
    includeRemovalFields: boolean,
  ) => {
    const activityCols = includeRemovalFields
      ? [
          { key: 'when', label: 'When', width: 38 },
          { key: 'jsId', label: 'JS ID', width: 28 },
          { key: 'type', label: 'Type', width: 28 },
          { key: 'size', label: 'Size', width: 14 },
          { key: 'by', label: 'By', width: 32 },
          { key: 'po', label: 'PO', width: 28 },
          { key: 'reason', label: 'Reason', width: 91.4, wrap: true },
        ]
      : [
          { key: 'when', label: 'When', width: 42 },
          { key: 'jsId', label: 'JS ID', width: 32 },
          { key: 'custId', label: 'Customer ID', width: 32 },
          { key: 'type', label: 'Type', width: 36 },
          { key: 'size', label: 'Size', width: 16 },
          { key: 'mfr', label: 'Mfr', width: 36 },
          { key: 'by', label: 'By', width: 65.4 },
        ]
    const actWidth = activityCols.reduce((sum, col) => sum + col.width, 0)

    if (y + 22 > pageHeight - 14) {
      doc.addPage()
      y = drawHeader()
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(17, 94, 89)
    doc.text(title, marginX, y + 8)
    y += 12

    doc.setFillColor(15, 94, 89)
    doc.rect(marginX, y, actWidth, headerH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    let hx = marginX
    for (const col of activityCols) {
      doc.text(col.label, hx + 1.5, y + 5)
      hx += col.width
    }
    y += headerH

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(15, 23, 42)

    if (!rows.length) {
      doc.setFont('helvetica', 'italic')
      doc.text('None in this period.', marginX + 1.5, y + 5)
      y += 10
      return
    }

    rows.forEach((row, index) => {
      const values: Record<string, string> = includeRemovalFields
        ? {
            when: row.whenLabel,
            jsId: row.jsInventoryId,
            type: row.valveType,
            size: row.size,
            by: row.byName,
            po: row.poNumber,
            reason: row.reason,
          }
        : {
            when: row.whenLabel,
            jsId: row.jsInventoryId,
            custId: row.customerIdNo,
            type: row.valveType,
            size: row.size,
            mfr: row.manufacturer,
            by: row.byName,
          }

      const wrappedByKey: Record<string, string[]> = {}
      let rowLines = 1
      for (const col of activityCols) {
        if (!col.wrap) {
          wrappedByKey[col.key] = [pdfDisplay(values[col.key])]
          continue
        }
        const lines = wrapPdfLines(doc, pdfDisplay(values[col.key]), col.width - 2.5, 3)
        wrappedByKey[col.key] = lines
        rowLines = Math.max(rowLines, lines.length)
      }
      const rowHeight = Math.max(7, rowLines * lineH + 2.2)

      if (y + rowHeight > pageHeight - 14) {
        doc.addPage()
        y = drawHeader()
        doc.setFillColor(15, 94, 89)
        doc.rect(marginX, y, actWidth, headerH, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(255, 255, 255)
        let restartX = marginX
        for (const col of activityCols) {
          doc.text(col.label, restartX + 1.5, y + 5)
          restartX += col.width
        }
        y += headerH
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(15, 23, 42)
      }

      if (index % 2 === 1) {
        doc.setFillColor(248, 250, 251)
        doc.rect(marginX, y, actWidth, rowHeight, 'F')
      }
      doc.setDrawColor(216, 222, 230)
      doc.setLineWidth(0.2)
      doc.rect(marginX, y, actWidth, rowHeight)
      let x = marginX
      for (const col of activityCols) {
        doc.line(x, y, x, y + rowHeight)
        let textY = y + 4.2
        for (const line of wrappedByKey[col.key] ?? ['—']) {
          doc.text(line, x + 1.5, textY)
          textY += lineH
        }
        x += col.width
      }
      doc.line(x, y, x, y + rowHeight)
      y += rowHeight
    })
    y += 4
  }

  let y = drawHeader()
  drawActivitySection('Added this period', activity.added, false)
  drawActivitySection('Removed this period', activity.removed, true)
  drawActivitySection('Added back this period', activity.restored, false)

  drawInventoryTable(
    'Valves by customer ID (current on-hand, sorted by type)',
    valveCols,
    valveGroups,
    'No valves on hand for this customer.',
    (group) => ({
      customerId: pdfDisplay(group.customerIdNo),
      qty: String(group.qty),
      manufacturer: pdfDisplay(group.manufacturer),
      type: pdfDisplay(group.valveType),
      size: pdfDisplay(group.size),
      pressure: pdfDisplay(group.pressure),
      body: pdfDisplay(group.bodyMaterial),
      origin: pdfDisplay(group.origin),
      condition: pdfDisplay(group.conditionSummary),
      hf: group.hfAcid ? 'Yes' : '—',
      jsIds: group.jsInventoryIds.length ? group.jsInventoryIds.join(', ') : '—',
    }),
  )

  drawInventoryTable(
    'Parts on hand',
    partCols,
    partGroups,
    'No parts on hand for this customer.',
    (group) => ({
      customerId: pdfDisplay(group.customerIdNo),
      qty: String(group.qty),
      manufacturer: pdfDisplay(group.manufacturer),
      partType: pdfDisplay(group.partType),
      size: pdfDisplay(group.size),
      body: pdfDisplay(group.bodyMaterial),
      origin: pdfDisplay(group.origin),
      condition: pdfDisplay(group.conditionSummary),
      hf: group.hfAcid ? 'Yes' : '—',
      jsIds: group.jsInventoryIds.length ? group.jsInventoryIds.join(', ') : '—',
    }),
  )

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `JS Valve Customer Inventory · ${periodRange.label} · ${periodRange.rangeText} · Page ${page} of ${pageCount}`,
      marginX,
      pageHeight - 6,
    )
  }

  return doc
}

/**
 * Opens Outlook/mail client to the salesman with a report summary, and downloads
 * the same HTML report used by Print (mailto cannot auto-attach files).
 */
export async function emailInventoryCustomerReport(options: {
  toEmail: string
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  events?: InventoryEvent[]
  filters?: InventoryReportFilters | null
  lookupRecords?: InventoryRecord[]
  inventoryPath?: string
}): Promise<{ error: string | null; message: string | null }> {
  const to = options.toEmail.trim()
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { error: 'Enter a valid email address for the salesman', message: null }
  }
  if (!options.items.length) {
    return { error: `No inventory items for ${options.customer}`, message: null }
  }

  const stats = buildInventoryCustomerReportStats({
    items: options.items,
    events: options.events ?? [],
    customer: options.customer,
    periodLabel: options.periodLabel,
    filters: options.filters,
    lookupRecords: options.lookupRecords,
  })
  const { subject, body: fullBody } = formatInventoryCustomerReportMessage({
    ...options,
    stats,
  })

  const stem = safeReportFilenameStem(options.customer, options.periodLabel)
  const htmlFilename = `${stem}.html`
  const { html } = await buildInventoryCustomerReportHtml({ ...options, includeToolbar: false })
  downloadBlobFile(htmlFilename, new Blob([html], { type: 'text/html;charset=utf-8' }))

  const origin = resolveInventoryPublicOrigin()
  const path =
    options.inventoryPath?.trim() ||
    `/admin/inventory?customer=${encodeURIComponent(options.customer.trim())}`
  const appLink = `${origin}${path.startsWith('/') ? path : `/${path}`}`
  const filterNote = inventoryReportFiltersSummary(options.filters)

  const emailBody = [
    fullBody.length <= MAILTO_BODY_SAFE_CHARS
      ? fullBody
      : [
          `Monthly Customer Inventory Report`,
          `Customer: ${options.customer.trim() || 'Unassigned customer'}`,
          `Period: ${options.periodLabel.trim()}`,
          `Dates: ${inventoryReportPeriodDateRange(options.periodLabel).rangeText}`,
          filterNote ? `Filters: ${filterNote}` : null,
          options.salesmanName?.trim() ? `Salesman: ${options.salesmanName.trim()}` : null,
          `Items on hand: ${options.items.length}`,
          `This period — Added: ${stats.added} · Removed: ${stats.removed} · Valve parts on hand: ${stats.partsOnHand}`,
          `On hand is current stock; added/removed are for the period dates only.`,
          ``,
          `(Full report is in the attached HTML file — open it in a browser to view or print.)`,
        ]
          .filter((line) => line != null)
          .join('\n'),
    ``,
    `Attach the downloaded report "${htmlFilename}" to this email before sending.`,
    `Open that file in a browser to view or print the same layout as Print customer report.`,
    `Open in app: ${appLink}`,
  ].join('\n')

  openMailto(to, subject, emailBody)
  return {
    error: null,
    message: `Email draft opened for ${to}. Attach "${htmlFilename}" (downloaded) before sending.`,
  }
}
