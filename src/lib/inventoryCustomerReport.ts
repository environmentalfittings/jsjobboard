import type { InventoryRecord } from './inventory'
import type { CustomerSalesRepRow } from './customers'
import { findCustomerByName } from './customers'

export type InventoryCustomerGroup = {
  customer: string
  items: InventoryRecord[]
  salesRepEmployeeId: string | null
}

export function currentInventoryReportPeriod(now = new Date()): string {
  return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
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

function lineForItem(item: InventoryRecord): string {
  const parts = [
    item.js_inventory_id?.trim() || item.id.slice(0, 8),
    item.valve_type_label?.trim() || item.valve_type_id?.trim() || null,
    item.size?.trim() || null,
    item.pressure?.trim() || null,
    item.body_material?.trim() || null,
    item.origin?.trim() ? `Origin: ${item.origin.trim()}` : null,
    item.hf_acid ? 'HF Acid' : null,
  ].filter(Boolean)
  return parts.join(' | ')
}

export function formatInventoryCustomerReportMessage(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
}): { subject: string; body: string } {
  const customer = options.customer.trim() || 'Unassigned customer'
  const period = options.periodLabel.trim() || currentInventoryReportPeriod()
  const subject = `Monthly inventory report — ${customer} (${period})`
  const lines = options.items.map(lineForItem)
  const salesmanLine = options.salesmanName?.trim()
    ? `Salesman: ${options.salesmanName.trim()}`
    : null

  const body = [
    `Monthly Customer Inventory Report`,
    `Customer: ${customer}`,
    `Period: ${period}`,
    salesmanLine,
    `Items on hand: ${options.items.length}`,
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
export function printInventoryCustomerReport(options: {
  customer: string
  items: InventoryRecord[]
  periodLabel: string
  salesmanName?: string | null
}): { error: string | null } {
  const { subject, body } = formatInventoryCustomerReportMessage(options)
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100')
  if (!popup) return { error: 'Allow pop-ups to print the inventory report' }

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const rows = options.items
    .map((item) => {
      return `<tr>
        <td>${escape(item.js_inventory_id || '—')}</td>
        <td>${escape(item.valve_type_label || item.valve_type_id || '—')}</td>
        <td>${escape(item.size || '—')}</td>
        <td>${escape(item.pressure || '—')}</td>
        <td>${escape(item.body_material || '—')}</td>
        <td>${escape(item.origin || '—')}</td>
        <td>${item.hf_acid ? 'Yes' : '—'}</td>
        <td>${escape(item.notes || '—')}</td>
      </tr>`
    })
    .join('')

  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escape(subject)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; margin: 0; padding: 0.6in; }
    h1 { font-size: 18pt; margin: 0 0 0.2in; }
    .meta { margin: 0 0 0.35in; color: #475569; font-size: 11pt; }
    .meta p { margin: 0.1rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #cbd5e1; padding: 0.28rem 0.35rem; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    .no-print { display: flex; gap: 0.5rem; justify-content: flex-end; margin: -0.35in -0.35in 0.35in; padding: 0.5rem 0.75rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .no-print button { appearance: none; border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 0.45rem 0.85rem; font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer; }
    .no-print button.primary { background: #0f766e; border-color: #0f766e; color: #fff; }
    @media print { .no-print { display: none !important; } body { padding: 0.4in; } }
    @page { size: letter; margin: 0.5in; }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print</button>
  </div>
  <h1>Customer Inventory Report</h1>
  <div class="meta">
    <p><strong>Customer:</strong> ${escape(options.customer.trim() || 'Unassigned customer')}</p>
    <p><strong>Period:</strong> ${escape(options.periodLabel)}</p>
    ${options.salesmanName?.trim() ? `<p><strong>Salesman:</strong> ${escape(options.salesmanName.trim())}</p>` : ''}
    <p><strong>Items on hand:</strong> ${options.items.length}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>JS inventory ID</th>
        <th>Type</th>
        <th>Size</th>
        <th>Pressure</th>
        <th>Body</th>
        <th>Origin</th>
        <th>HF Acid</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>
    window.onload = function () { setTimeout(function () { window.focus(); }, 50); };
  </script>
</body>
</html>`)
  popup.document.close()
  // Keep body available for debugging copy if needed
  void body
  return { error: null }
}
