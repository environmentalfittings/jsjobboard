import type { InventoryEvent, InventoryRecord } from './inventory'
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
  added: number
  removed: number
  restored: number
  hfAcid: number
  newCount: number
  reconditionedCount: number
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

/** True when `iso` falls in the same calendar month/year as `periodLabel` (e.g. "August 2026"). */
export function isInInventoryReportPeriod(iso: string | null | undefined, periodLabel: string, now = new Date()): boolean {
  if (!iso?.trim()) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  const label = periodLabel.trim() || currentInventoryReportPeriod(now)
  const eventLabel = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return eventLabel === label
}

export function buildInventoryCustomerReportStats(options: {
  items: InventoryRecord[]
  events: InventoryEvent[]
  customer: string
  periodLabel: string
}): InventoryCustomerReportStats {
  const customerKey = options.customer.trim().toLowerCase()
  const periodEvents = options.events.filter((event) => {
    const eventCustomer = (event.customer ?? '').trim().toLowerCase()
    if (customerKey && eventCustomer !== customerKey) return false
    return isInInventoryReportPeriod(event.created_at, options.periodLabel)
  })

  let added = 0
  let removed = 0
  let restored = 0
  for (const event of periodEvents) {
    if (event.event_type === 'added') added += 1
    else if (event.event_type === 'removed') removed += 1
    else if (event.event_type === 'restored') restored += 1
  }

  let hfAcid = 0
  let newCount = 0
  let reconditionedCount = 0
  for (const item of options.items) {
    if (item.hf_acid) hfAcid += 1
    if (item.condition === 'new') newCount += 1
    if (item.condition === 'reconditioned') reconditionedCount += 1
  }

  return {
    onHand: options.items.length,
    added,
    removed,
    restored,
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

export function groupInventoryByCustomerIdNo(items: InventoryRecord[]): InventoryCustomerIdGroup[] {
  const map = new Map<string, InventoryRecord[]>()
  for (const item of items) {
    const key = item.customer_id_no?.trim() || 'No customer ID'
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }

  return [...map.entries()]
    .map(([customerIdNo, groupItems]) => {
      const sorted = [...groupItems].sort((a, b) =>
        String(a.js_inventory_id ?? '').localeCompare(String(b.js_inventory_id ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      )
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
        valveType: uniqueJoined(sorted, (item) => item.valve_type_label || item.valve_type_id),
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
    })
    .sort((a, b) => {
      if (a.customerIdNo === 'No customer ID') return 1
      if (b.customerIdNo === 'No customer ID') return -1
      return a.customerIdNo.localeCompare(b.customerIdNo, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })
}

export function formatInventoryCustomerReportMessage(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  stats?: InventoryCustomerReportStats | null
}): { subject: string; body: string } {
  const customer = options.customer.trim() || 'Unassigned customer'
  const period = options.periodLabel.trim() || currentInventoryReportPeriod()
  const subject = `Monthly inventory report — ${customer} (${period})`
  const groups = groupInventoryByCustomerIdNo(options.items)
  const lines = groups.map((group) => {
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
    return `Customer ID ${group.customerIdNo} · Qty ${group.qty} · ${desc || 'Inventory'}${ids}`
  })
  const salesmanLine = options.salesmanName?.trim()
    ? `Salesman: ${options.salesmanName.trim()}`
    : null
  const stats = options.stats

  const body = [
    `Monthly Customer Inventory Report`,
    `Customer: ${customer}`,
    `Period: ${period}`,
    salesmanLine,
    `Items on hand: ${options.items.length}`,
    `Customer ID groups: ${groups.length}`,
    stats
      ? `This period — Added: ${stats.added} · Removed: ${stats.removed} · Restored: ${stats.restored}`
      : null,
    ``,
    ...lines,
    ``,
    `Open Customer Inventory: /admin/inventory?customer=${encodeURIComponent(customer)}`,
  ]
    .filter((line) => line != null)
    .join('\n')

  return { subject, body }
}

/** Opens a printable HTML preview of one customer's inventory report. */
export async function printInventoryCustomerReport(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
  events?: InventoryEvent[]
}): Promise<{ error: string | null }> {
  // Do not use noopener/noreferrer — Chrome then returns null (or a window we cannot write into).
  const popup = window.open('about:blank', '_blank', 'width=960,height=1100')
  if (!popup) return { error: 'Allow pop-ups to print the inventory report' }

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const stats = buildInventoryCustomerReportStats({
    items: options.items,
    events: options.events ?? [],
    customer: options.customer,
    periodLabel: options.periodLabel,
  })
  const { subject } = formatInventoryCustomerReportMessage({ ...options, stats })
  const logoDataUrl = await getLogoDataUrl()
  const generatedAt = new Date().toLocaleString()
  const idGroups = groupInventoryByCustomerIdNo(options.items)

  const rows = idGroups
    .map((group) => {
      const ids =
        group.jsInventoryIds.length > 0
          ? escape(group.jsInventoryIds.join(', '))
          : '—'
      return `<tr>
        <td class="id-cell">${escape(group.customerIdNo)}</td>
        <td class="qty-cell">${group.qty}</td>
        <td>${escape(group.manufacturer)}</td>
        <td>${escape(group.valveType)}</td>
        <td>${escape(group.size)}</td>
        <td>${escape(group.pressure)}</td>
        <td>${escape(group.bodyMaterial)}</td>
        <td>${escape(group.origin)}</td>
        <td>${escape(group.conditionSummary)}</td>
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
  <title>${escape(subject)}</title>
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
    .section-title {
      margin: 0 0 0.45rem;
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
    @media print {
      .toolbar { display: none !important; }
      .sheet { padding: 0; }
      .stat, .substats, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @page { size: letter; margin: 0.45in; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print</button>
  </div>
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
        <p><strong>Customer:</strong> ${escape(options.customer.trim() || 'Unassigned customer')}</p>
        <p><strong>Period:</strong> ${escape(options.periodLabel)}</p>
        ${
          options.salesmanName?.trim()
            ? `<p><strong>Salesman:</strong> ${escape(options.salesmanName.trim())}</p>`
            : `<p><strong>Salesman:</strong> Not assigned</p>`
        }
        <p>Generated ${escape(generatedAt)}</p>
      </div>
    </header>

    <div class="stats">
      <div class="stat">
        <span class="label">On hand</span>
        <span class="value">${stats.onHand}</span>
      </div>
      <div class="stat">
        <span class="label">Valves added</span>
        <span class="value">${stats.added}</span>
      </div>
      <div class="stat alert">
        <span class="label">Valves removed</span>
        <span class="value">${stats.removed}</span>
      </div>
      <div class="stat muted">
        <span class="label">Restored</span>
        <span class="value">${stats.restored}</span>
      </div>
    </div>

    <div class="substats">
      <span><strong>Customer ID groups:</strong> ${idGroups.length}</span>
      <span><strong>HF Acid:</strong> ${stats.hfAcid}</span>
      <span><strong>New:</strong> ${stats.newCount}</span>
      <span><strong>Reconditioned:</strong> ${stats.reconditionedCount}</span>
      <span><strong>Period activity:</strong> ${stats.added + stats.removed + stats.restored} event${
        stats.added + stats.removed + stats.restored === 1 ? '' : 's'
      }</span>
    </div>

    <h2 class="section-title">Inventory by customer ID</h2>
    <p class="section-note">
      Valves that share the same customer ID (for example all ½″ Durcos under one ID) are grouped with a quantity.
      Individual JS inventory IDs are listed in the last column.
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
        rows ||
        `<tr><td colspan="11">No active inventory items for this customer.</td></tr>`
      }</tbody>
    </table>

    <div class="footer">
      <span>JS Valve Customer Inventory · ${escape(options.periodLabel)}</span>
      <span>${stats.onHand} on hand · ${idGroups.length} customer ID group${
        idGroups.length === 1 ? '' : 's'
      } · ${stats.added} added · ${stats.removed} removed</span>
    </div>
  </div>
</body>
</html>`

  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  return { error: null }
}
