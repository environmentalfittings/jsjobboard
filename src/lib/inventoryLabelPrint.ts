import type { InventoryRecord } from './inventory'
import { formatInventoryLocationLabel } from './inventory'
import { openPrintHtml } from './printHtml'
import {
  VALVE_TICKET_CARD_HEIGHT_IN,
  VALVE_TICKET_CARD_WIDTH_IN,
} from './valveTicketPrint'

/** Inset so borders are not clipped by printer non-printable area. */
const CARD_PRINT_INSET_IN = 0.1
const CARD_CONTENT_WIDTH_IN = VALVE_TICKET_CARD_WIDTH_IN - CARD_PRINT_INSET_IN * 2
const CARD_CONTENT_HEIGHT_IN = VALVE_TICKET_CARD_HEIGHT_IN - CARD_PRINT_INSET_IN * 2
const CARD_PRINT_PAGE_WIDTH_IN = VALVE_TICKET_CARD_WIDTH_IN - 0.02
const CARD_PRINT_PAGE_HEIGHT_IN = VALVE_TICKET_CARD_HEIGHT_IN - 0.02

export type InventoryLabelPrintItem = Pick<
  InventoryRecord,
  | 'js_inventory_id'
  | 'customer'
  | 'customer_id_no'
  | 'size'
  | 'pressure'
  | 'manufacturer_name'
  | 'valve_type_label'
  | 'origin'
  | 'hf_acid'
  | 'qr_code_data_url'
>

export type InventoryLabelCardModel = {
  inventoryId: string
  customerId: string
  size: string
  pressure: string
  description: string
  location: string
  customer: string
  hfAcid: boolean
  qrDataUrl: string
}

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

function hasValue(value: string) {
  return value.trim() !== '' && value.trim() !== '—'
}

function idFontSizePt(inventoryId: string): number {
  const len = inventoryId.length
  if (len <= 10) return 15
  if (len <= 12) return 13
  return 11
}

function formatInventoryDescription(item: InventoryLabelPrintItem): string {
  const parts = [item.manufacturer_name?.trim(), item.valve_type_label?.trim()].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return ''
}

export function buildInventoryLabelCardModel(item: InventoryLabelPrintItem): InventoryLabelCardModel {
  return {
    inventoryId: display(item.js_inventory_id),
    customerId: display(item.customer_id_no),
    size: display(item.size),
    pressure: display(item.pressure),
    description: formatInventoryDescription(item),
    location: formatInventoryLocationLabel(item.origin),
    customer: display(item.customer),
    hfAcid: Boolean(item.hf_acid),
    qrDataUrl: item.qr_code_data_url?.trim() || '',
  }
}

function buildInventoryLabelCardMarkup(
  card: InventoryLabelCardModel,
  options?: { idTextId?: string; customerTextId?: string },
): string {
  const idTextId = options?.idTextId ? ` id="${options.idTextId}"` : ''
  const customerTextId = options?.customerTextId ? ` id="${options.customerTextId}"` : ''
  const hfBadge = card.hfAcid ? '<span class="hf-badge">HF Acid</span>' : ''
  const qrMarkup = card.qrDataUrl
    ? `<img class="qr-image" src="${escapeHtml(card.qrDataUrl)}" alt="Inventory QR code" />`
    : '<span class="qr-missing">No QR</span>'

  const descriptionLine = hasValue(card.description)
    ? `<p class="label-spec-secondary">${escapeHtml(card.description)}</p>`
    : ''
  const locationLine = hasValue(card.location)
    ? `<p class="label-location">${escapeHtml(card.location)}</p>`
    : ''

  return `<article class="label" role="presentation">
        <div class="label-brand">Customer inventory</div>
        <div class="label-main">
          <div class="label-qr-wrap">${qrMarkup}</div>
          <div class="label-meta">
            <div class="label-id-row">
              <span class="label-id"${idTextId} style="font-size: ${idFontSizePt(card.inventoryId)}pt">${escapeHtml(card.inventoryId)}</span>
              ${hfBadge}
            </div>
            <p class="label-customer-valve-id">Customer valve ID ${escapeHtml(card.customerId)}</p>
            <p class="label-spec-primary">Size ${escapeHtml(card.size)} · Class ${escapeHtml(card.pressure)}</p>
            ${descriptionLine}
            ${locationLine}
          </div>
        </div>
        <div class="label-footer">
          <p class="label-customer"${customerTextId}>${escapeHtml(card.customer)}</p>
        </div>
      </article>`
}

function buildInventoryLabelPageMarkup(card: InventoryLabelCardModel, index: number): string {
  return `<section class="page" aria-label="Inventory label ${index + 1}">
      <div class="preview-wrap">
        <div class="label-shell">
          ${buildInventoryLabelCardMarkup(card, {
            idTextId: `inv-id-text-${index}`,
            customerTextId: `inv-customer-text-${index}`,
          })}
        </div>
      </div>
    </section>`
}

export function buildInventoryLabelPrintHtml(
  items: InventoryLabelPrintItem[],
  options?: { autoPrint?: boolean },
): string {
  const autoPrint = options?.autoPrint ?? false
  const printable = items.filter((item) => Boolean(item.qr_code_data_url?.trim()))
  const cards = printable.map((item, index) =>
    buildInventoryLabelPageMarkup(buildInventoryLabelCardModel(item), index),
  )
  const titleId = escapeHtml(printable[0]?.js_inventory_id?.trim() || 'Inventory label')
  const countLabel = printable.length === 1 ? '1 label' : `${printable.length} labels`

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Inventory Label ${titleId}</title>
    <style>
      * { box-sizing: border-box; }

      @page {
        size: ${VALVE_TICKET_CARD_WIDTH_IN}in ${VALVE_TICKET_CARD_HEIGHT_IN}in;
        margin: 0;
      }

      html, body {
        margin: 0;
        padding: 0;
        color: #0f172a;
        font-family: "Segoe UI", Arial, Helvetica, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .toolbar {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #d1d5db;
      }

      .toolbar button {
        font: inherit;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid #2563eb;
        background: #2563eb;
        color: #fff;
        cursor: pointer;
      }

      .hint {
        font-size: 12px;
        color: #4b5563;
        margin: 0 0 12px;
        max-width: 5in;
        line-height: 1.4;
      }

      .page {
        width: ${CARD_PRINT_PAGE_WIDTH_IN}in;
        height: ${CARD_PRINT_PAGE_HEIGHT_IN}in;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
      }

      .page:last-child {
        page-break-after: auto;
        break-after: auto;
      }

      .preview-wrap {
        width: ${CARD_PRINT_PAGE_WIDTH_IN}in;
        height: ${CARD_PRINT_PAGE_HEIGHT_IN}in;
        padding: ${CARD_PRINT_INSET_IN}in;
        overflow: hidden;
      }

      .label-shell {
        width: 100%;
        height: 100%;
      }

      .label {
        width: 100%;
        height: 100%;
        border: 1.5px solid #334155;
        border-radius: 0.08in;
        background: #fff;
        display: flex;
        flex-direction: column;
        padding: 0.06in 0.08in 0.07in;
        overflow: hidden;
      }

      .label-brand {
        flex: 0 0 auto;
        width: 100%;
        margin: 0 0 0.05in;
        padding-bottom: 0.035in;
        border-bottom: 2px solid #0f766e;
        font-size: 7pt;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #0f766e;
        line-height: 1.1;
        text-align: center;
      }

      .label-main {
        flex: 1 1 auto;
        display: flex;
        align-items: flex-start;
        gap: 0.07in;
        width: 100%;
        min-height: 0;
      }

      .label-qr-wrap {
        flex: 0 0 1.38in;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .qr-image {
        display: block;
        width: 1.38in;
        height: 1.38in;
        object-fit: contain;
      }

      .qr-missing {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.38in;
        height: 1.38in;
        border: 1px dashed #94a3b8;
        border-radius: 0.06in;
        font-size: 9pt;
        color: #64748b;
      }

      .label-meta {
        flex: 1 1 0;
        min-width: 0;
        padding-top: 0.02in;
        text-align: left;
      }

      .label-id-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.05in;
        margin-bottom: 0.04in;
      }

      .label-customer-valve-id {
        margin: 0 0 0.05in;
        font-size: 9pt;
        font-weight: 800;
        line-height: 1.15;
        color: #0f172a;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
      }

      .label-id {
        font-weight: 800;
        letter-spacing: 0.01em;
        line-height: 1.05;
        white-space: nowrap;
        transform-origin: left center;
      }

      .hf-badge {
        display: inline-block;
        padding: 0.012in 0.06in;
        border: 1px solid #0f766e;
        border-radius: 999px;
        font-size: 6.5pt;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #0f766e;
        line-height: 1.2;
      }

      .label-spec-primary,
      .label-spec-secondary,
      .label-location {
        margin: 0 0 0.035in;
        line-height: 1.2;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
      }

      .label-spec-primary {
        font-size: 9pt;
        font-weight: 700;
        color: #0f172a;
      }

      .label-spec-secondary {
        font-size: 8.5pt;
        font-weight: 600;
        color: #334155;
      }

      .label-location {
        font-size: 8.5pt;
        font-weight: 700;
        color: #0f766e;
        margin-bottom: 0;
      }

      .label-footer {
        flex: 0 0 auto;
        width: 100%;
        margin-top: auto;
        padding-top: 0.045in;
        border-top: 1px solid #cbd5e1;
        text-align: center;
      }

      .label-customer {
        margin: 0;
        font-size: 11.5pt;
        font-weight: 800;
        line-height: 1.12;
        color: #0f172a;
        transform-origin: center top;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
      }

      @media screen {
        body {
          background: #e5e7eb;
          min-height: 100vh;
          padding: 16px;
        }

        .page {
          width: auto;
          height: auto;
          margin: 0 auto 16px;
        }

        .preview-wrap {
          width: auto;
          height: auto;
          padding: 12px;
          display: flex;
          justify-content: center;
        }

        .label-shell {
          width: ${CARD_CONTENT_WIDTH_IN}in;
          height: ${CARD_CONTENT_HEIGHT_IN}in;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.15);
        }
      }

      @media print {
        .toolbar,
        .hint {
          display: none !important;
        }

        html, body {
          width: ${CARD_PRINT_PAGE_WIDTH_IN}in !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #fff;
        }

        .page {
          width: ${CARD_PRINT_PAGE_WIDTH_IN}in !important;
          height: ${CARD_PRINT_PAGE_HEIGHT_IN}in !important;
          max-height: ${CARD_PRINT_PAGE_HEIGHT_IN}in !important;
          margin: 0 !important;
          overflow: hidden !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .preview-wrap {
          width: ${CARD_PRINT_PAGE_WIDTH_IN}in !important;
          height: ${CARD_PRINT_PAGE_HEIGHT_IN}in !important;
          max-height: ${CARD_PRINT_PAGE_HEIGHT_IN}in !important;
          padding: ${CARD_PRINT_INSET_IN}in !important;
          margin: 0 !important;
          overflow: hidden !important;
        }

        .label-shell,
        .label {
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print</button>
    </div>
    <p class="hint">
      Inventory label for ${VALVE_TICKET_CARD_WIDTH_IN}&Prime;&nbsp;&times;&nbsp;${VALVE_TICKET_CARD_HEIGHT_IN}&Prime; stock
      (${escapeHtml(countLabel)}).
      Choose paper size <strong>${VALVE_TICKET_CARD_WIDTH_IN}&Prime;&nbsp;&times;&nbsp;${VALVE_TICKET_CARD_HEIGHT_IN}&Prime;</strong>
      and scale <strong>100%</strong>.
    </p>
    ${cards.join('\n')}
    <script>
      (function fitLabelText() {
        function fit(el, minScale) {
          if (!el) return;
          el.style.transform = 'none';
          var parent = el.parentElement;
          if (!parent) return;
          var avail = parent.clientWidth - 4;
          if (avail <= 0 || el.scrollWidth <= avail) return;
          var scale = Math.max(minScale, avail / el.scrollWidth);
          el.style.transform = 'scale(' + scale.toFixed(3) + ')';
        }

        document.querySelectorAll('.label-id').forEach(function (el) { fit(el, 0.72); });
        document.querySelectorAll('.label-customer').forEach(function (el) {
          el.style.transform = 'none';
          var footer = el.parentElement;
          if (!footer) return;
          var maxH = footer.clientHeight - 4;
          if (maxH <= 0 || el.scrollHeight <= maxH) return;
          var scale = Math.max(0.75, maxH / el.scrollHeight);
          el.style.transform = 'scale(' + scale.toFixed(3) + ')';
          el.style.transformOrigin = 'center top';
        });
      })();
      ${
        autoPrint
          ? `window.addEventListener('load', function () {
        requestAnimationFrame(function () {
          setTimeout(function () { window.focus(); window.print(); }, 50);
        });
      });`
          : ''
      }
    </script>
  </body>
</html>`
}

/** Opens a print preview for inventory labels on 3.5" × 3" card stock. */
export function printInventoryLabelSheet(
  items: InventoryLabelPrintItem[],
  options?: { autoPrint?: boolean },
): { error: string | null } {
  const printable = items.filter((item) => Boolean(item.qr_code_data_url?.trim()))
  if (!printable.length) return { error: 'Select at least one item with a QR code' }

  const html = buildInventoryLabelPrintHtml(printable, { autoPrint: options?.autoPrint ?? true })
  return openPrintHtml(html, { width: 720, height: 900 })
}
