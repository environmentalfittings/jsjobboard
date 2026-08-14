import type { InventoryRecord } from './inventory'
import { buildInventoryItemUrl } from './inventory'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function display(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed || '—'
}

export type InventoryQrPrintItem = Pick<
  InventoryRecord,
  | 'id'
  | 'js_inventory_id'
  | 'customer'
  | 'customer_id_no'
  | 'size'
  | 'pressure'
  | 'hf_acid'
  | 'qr_code_data_url'
>

/** Opens a print window with selected inventory QR codes laid out for letter paper. */
export function printInventoryQrSheet(items: InventoryQrPrintItem[]): { error: string | null } {
  const printable = items.filter((item) => Boolean(item.qr_code_data_url?.trim()))
  if (!printable.length) return { error: 'Select at least one item with a QR code' }

  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100')
  if (!popup) return { error: 'Allow pop-ups to print QR codes' }

  const cards = printable
    .map((item) => {
      const title = escapeHtml(display(item.js_inventory_id))
      const customerId = escapeHtml(display(item.customer_id_no))
      const customer = escapeHtml(display(item.customer))
      const sizePressure = [item.size, item.pressure]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' · ')
      const meta = escapeHtml(sizePressure || '—')
      const url = escapeHtml(buildInventoryItemUrl(item.id))
      const qr = escapeHtml(item.qr_code_data_url || '')
      const hf = item.hf_acid ? '<span class="hf">HF Acid</span>' : ''
      return `<article class="card">
        <h2>${title}${hf}</h2>
        <p class="customer-id">Customer ID: ${customerId}</p>
        <p class="customer">${customer}</p>
        <p class="meta">${meta}</p>
        <img src="${qr}" alt="QR code for ${title}" />
        <p class="url">${url}</p>
      </article>`
    })
    .join('\n')

  const countLabel = printable.length === 1 ? '1 QR code' : `${printable.length} QR codes`

  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Customer Inventory QR codes (${escapeHtml(String(printable.length))})</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0.4in;
      font-family: Georgia, "Times New Roman", serif;
      color: #0f172a;
      background: #fff;
    }
    .sheet-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 1rem;
      margin: 0 0 0.35in;
      padding-bottom: 0.15in;
      border-bottom: 1px solid #cbd5e1;
    }
    .sheet-head h1 {
      margin: 0;
      font-size: 16pt;
      font-weight: 700;
    }
    .sheet-head p {
      margin: 0;
      font-size: 10pt;
      color: #475569;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.28in;
    }
    .card {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #94a3b8;
      border-radius: 6px;
      padding: 0.18in 0.16in 0.14in;
      text-align: center;
      background: #fff;
    }
    .card h2 {
      margin: 0;
      font-size: 13pt;
      line-height: 1.2;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 0.2rem;
    }
    .card .hf {
      display: inline-block;
      padding: 0.05rem 0.35rem;
      border: 1px solid #0f766e;
      border-radius: 3px;
      color: #0f766e;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      font-family: system-ui, sans-serif;
    }
    .card .customer,
    .card .customer-id,
    .card .meta {
      margin: 0.12rem 0 0;
      font-size: 10pt;
      color: #334155;
    }
    .card .customer-id {
      font-weight: 700;
      color: #0f172a;
    }
    .card .meta { color: #64748b; }
    .card img {
      display: block;
      width: 1.85in;
      height: 1.85in;
      margin: 0.14in auto 0.1in;
    }
    .card .url {
      margin: 0;
      font-size: 7.5pt;
      color: #64748b;
      word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .no-print {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      padding: 0.5rem 0.75rem;
      margin: -0.4in -0.4in 0.35in;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .no-print button {
      appearance: none;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      border-radius: 6px;
      padding: 0.45rem 0.85rem;
      font: 600 13px/1.2 system-ui, sans-serif;
      cursor: pointer;
    }
    .no-print button.primary {
      background: #0f766e;
      border-color: #0f766e;
      color: #fff;
    }
    @media print {
      body { padding: 0.35in; }
      .no-print { display: none !important; }
      .sheet-head { margin-bottom: 0.25in; }
      .card { border-color: #64748b; }
    }
    @page { size: letter; margin: 0.4in; }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print</button>
  </div>
  <header class="sheet-head">
    <h1>Customer Inventory QR codes</h1>
    <p>${escapeHtml(countLabel)}</p>
  </header>
  <div class="grid">
    ${cards}
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    };
  </script>
</body>
</html>`)
  popup.document.close()
  return { error: null }
}
