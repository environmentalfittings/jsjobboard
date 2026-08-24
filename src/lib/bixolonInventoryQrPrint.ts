import type { InventoryRecord } from './inventory'
import {
  BIXOLON_SPP_R200III,
  dotsToMm,
  formatInches,
  mmToDots,
  resolveBixolonLabelSettings,
  type BixolonLabelPrintOverrides,
} from '../constants/bixolonSppR200III'
import { buildBixolonLabelEscPos } from './bixolonEscPos'

export type InventoryBixolonLabelItem = Pick<
  InventoryRecord,
  'id' | 'js_inventory_id' | 'customer' | 'customer_id_no' | 'qr_code_data_url' | 'hf_acid'
>

export type BixolonPrintResult = {
  method: 'usb' | 'html'
  message: string
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  let cursorY = y
  let lines = 0

  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, centerX, cursorY)
      lines += 1
      if (lines >= maxLines) return cursorY + lineHeight
      line = word
      cursorY += lineHeight
    } else {
      line = test
    }
  }

  if (line && lines < maxLines) {
    ctx.fillText(line, centerX, cursorY)
    cursorY += lineHeight
  }

  return cursorY
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load QR image'))
    img.src = src
  })
}

/**
 * Rasterize one inventory QR label at Bixolon printable width (384 dots @ 203 DPI).
 *
 * Layout (centered): QR → JS ID → Customer ID → customer name.
 * Height fits content (capped by labelHeightMm).
 */
export function renderBixolonInventoryLabelCanvas(
  item: InventoryBixolonLabelItem,
  qrImage: HTMLImageElement,
  overrides: BixolonLabelPrintOverrides = {},
): HTMLCanvasElement {
  const settings = resolveBixolonLabelSettings(overrides)
  const { printableWidthDots, labelHeightDots, marginsDots, qrSizeDots, contentWidthDots, dpi } =
    settings

  const jsId = (item.js_inventory_id ?? '').trim() || 'JS inventory'
  const customerId = (item.customer_id_no ?? '').trim() || '—'
  const customer = (item.customer ?? '').trim()

  const idLineHeight = 30
  const metaLineHeight = 20
  const afterQrGap = 10
  const textBlockHeight =
    idLineHeight * 2 + metaLineHeight + (customer ? metaLineHeight * 2 : metaLineHeight) + 8

  let qrPx = Math.min(qrSizeDots, contentWidthDots)
  const maxQrByHeight =
    labelHeightDots - marginsDots.top - marginsDots.bottom - afterQrGap - textBlockHeight
  qrPx = Math.min(qrPx, Math.max(64, maxQrByHeight))

  const contentHeightDots =
    marginsDots.top + qrPx + afterQrGap + textBlockHeight + marginsDots.bottom
  const heightDots = Math.min(labelHeightDots, Math.max(contentHeightDots, mmToDots(32, dpi)))

  const canvas = document.createElement('canvas')
  canvas.width = printableWidthDots
  canvas.height = heightDots
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare label image')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'center'

  const centerX = Math.round(printableWidthDots / 2)
  const maxTextWidth = contentWidthDots

  let y = marginsDots.top
  if (qrPx > 0) {
    const qrX = Math.round(marginsDots.left + (contentWidthDots - qrPx) / 2)
    ctx.drawImage(qrImage, qrX, y, qrPx, qrPx)
    y += qrPx + afterQrGap
  }

  ctx.font = 'bold 26px Arial, Helvetica, sans-serif'
  y = wrapCenteredText(ctx, jsId, centerX, y, maxTextWidth, idLineHeight, 2)
  y += 4

  ctx.font = '16px Arial, Helvetica, sans-serif'
  y = wrapCenteredText(ctx, `Customer ID: ${customerId}`, centerX, y, maxTextWidth, metaLineHeight, 2)
  y += 2

  if (customer) {
    ctx.font = '16px Arial, Helvetica, sans-serif'
    wrapCenteredText(ctx, customer, centerX, y, maxTextWidth, metaLineHeight, 2)
  }

  return canvas
}

async function renderLabelCanvas(
  item: InventoryBixolonLabelItem,
  overrides: BixolonLabelPrintOverrides,
): Promise<HTMLCanvasElement> {
  const qrSrc = item.qr_code_data_url?.trim()
  if (!qrSrc) throw new Error('This item does not have a QR code yet')
  const qrImage = await loadImage(qrSrc)
  return renderBixolonInventoryLabelCanvas(item, qrImage, overrides)
}

/**
 * Browser print dialog often defaults the Bixolon driver to **58 × 3276 mm**
 * (many feet of roll). CSS cannot override that driver paper size, so we open a
 * helper window with instructions + optional .prn download instead of auto-printing.
 */
function openBixolonPrintHelper(canvases: HTMLCanvasElement[]): void {
  const printWidthIn = formatInches(BIXOLON_SPP_R200III.printableWidthMm)
  const mediaWidthIn = formatInches(BIXOLON_SPP_R200III.mediaWidthMm)
  const pageHeightMm = Math.max(...canvases.map((canvas) => dotsToMm(canvas.height)))
  const pageHeightIn = formatInches(pageHeightMm)

  const previews = canvases
    .map((canvas, index) => {
      const heightMm = dotsToMm(canvas.height)
      const heightIn = formatInches(heightMm)
      return `<img class="preview-label" src="${canvas.toDataURL('image/png')}" alt="Label ${index + 1}" style="width:${printWidthIn}in;height:${heightIn}in" />`
    })
    .join('')

  const popup = window.open('about:blank', '_blank', 'width=520,height=780')
  if (!popup) {
    throw new Error('Allow pop-ups to open the Bixolon print helper')
  }

  const escPosJobs = canvases.map((canvas) => buildBixolonLabelEscPos(canvas))
  const combined = new Uint8Array(escPosJobs.reduce((sum, job) => sum + job.length, 0))
  let offset = 0
  for (const job of escPosJobs) {
    combined.set(job, offset)
    offset += job.length
  }
  let binary = ''
  for (let i = 0; i < combined.length; i += 1) binary += String.fromCharCode(combined[i]!)
  const escPosBase64 = btoa(binary)

  popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bixolon label print</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.45 system-ui, sans-serif;
      color: #0f172a;
      background: #f8fafc;
    }
    .wrap { max-width: 28rem; margin: 0 auto; padding: 1rem; }
    .warn {
      background: #fff7ed;
      border: 1px solid #fdba74;
      border-radius: 10px;
      padding: 0.85rem 1rem;
      margin-bottom: 1rem;
    }
    .warn strong { color: #9a3412; }
    ol { margin: 0.5rem 0 0; padding-left: 1.25rem; }
    li { margin: 0.35rem 0; }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
    button {
      appearance: none;
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #0f172a;
      border-radius: 8px;
      padding: 0.55rem 0.9rem;
      font: 600 13px/1.2 system-ui, sans-serif;
      cursor: pointer;
    }
    button.primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
    .preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }
    .preview-label {
      display: block;
      border: 1px dashed #cbd5e1;
      image-rendering: pixelated;
    }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .preview { border: 0; padding: 0; }
      .preview-label { border: 0; }
      @page { size: ${mediaWidthIn}in ${pageHeightIn}in; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="warn no-print">
      <strong>Long feed (several feet) = driver paper size 58×3276.</strong>
      Windows Print Test Page can work while still using that huge page size for app prints.
      <ol>
        <li>Windows → Printers &amp; scanners → <span class="mono">BIXOLON SPP-R200III</span> →
          <strong>Printing preferences</strong> → <strong>Paper</strong>.</li>
        <li>Paper type: <strong>Receipt</strong> (not Ticket).</li>
        <li>Click <span class="mono">…</span> next to paper size → add
          <span class="mono">58 × 50 mm</span> (name it <span class="mono">JS-INV Label</span>) → Save.</li>
        <li>Select <span class="mono">JS-INV Label</span> as the paper size → OK / Apply.</li>
        <li>Then tap <strong>Print to Windows Bixolon</strong> and choose that paper size in Chrome
          (margins None, scale 100%).</li>
      </ol>
      <p style="margin:0.75rem 0 0">
        For a true one-label feed without driver setup, pair Bluetooth and use
        <strong>Print via Bluetooth (COM)</strong>, or <strong>Download .prn</strong>.
      </p>
    </div>
    <div class="actions no-print">
      <button type="button" class="primary" id="print-btn">Print to Windows Bixolon</button>
      <button type="button" id="bluetooth-btn">Print via Bluetooth (COM)</button>
      <button type="button" id="usb-btn">Print via USB (WebUSB)</button>
      <button type="button" id="download-btn">Download .prn (one label)</button>
      <button type="button" id="serial-btn">Show all COM ports</button>
      <button type="button" id="close-btn">Close</button>
    </div>
    <p class="no-print" id="status" style="color:#475569;min-height:1.25rem;margin:0 0 0.75rem">
      Do not print until paper size is a short custom size (not 58×3276).
    </p>
    <div class="preview">${previews}</div>
  </div>
  <script>
    var escPosBase64 = ${JSON.stringify(escPosBase64)};
    function setStatus(text) {
      var el = document.getElementById('status');
      if (el) el.textContent = text || '';
    }
    function escPosBytes() {
      var binary = atob(escPosBase64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    document.getElementById('print-btn').onclick = function () {
      var ok = window.confirm(
        'Stop — this will feed several feet if the Bixolon paper size is still 58×3276.\\n\\n' +
        'First set Printing preferences → Paper:\\n' +
        '• Type: Receipt\\n' +
        '• Add custom size 58 × 50 mm (JS-INV Label)\\n' +
        '• Select that size\\n\\n' +
        'Have you already set a short paper size?'
      );
      if (!ok) {
        setStatus('Set short paper size in Bixolon Printing preferences first (not 58×3276).');
        return;
      }
      setStatus('Chrome print — pick BIXOLON, paper JS-INV Label (or 58×50), 100% scale, no margins.');
      window.print();
    };
    document.getElementById('close-btn').onclick = function () { window.close(); };
    document.getElementById('download-btn').onclick = function () {
      var bytes = escPosBytes();
      var blob = new Blob([bytes], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'inventory-label-bixolon.prn';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      setStatus('Downloaded inventory-label-bixolon.prn — send with Bixolon utility or copy to the printer COM port.');
    };
    async function sendOverUsb() {
      setStatus('Select the BIXOLON USB device…');
      try {
        if (!('usb' in navigator)) {
          setStatus('WebUSB not available. Use Chrome, or Print via Bluetooth / Download .prn.');
          alert('WebUSB not available in this browser. Use Google Chrome.');
          return;
        }
        var device = await navigator.usb.requestDevice({
          filters: [{ vendorId: 0x1504 }, { vendorId: 0x0419 }],
        });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        var claimed = -1;
        var outEp = -1;
        var ifaces = (device.configuration && device.configuration.interfaces) || [];
        for (var i = 0; i < ifaces.length; i++) {
          var iface = ifaces[i];
          for (var a = 0; a < iface.alternates.length; a++) {
            var alt = iface.alternates[a];
            var bulkOut = alt.endpoints.find(function (ep) {
              return ep.direction === 'out' && ep.type === 'bulk';
            });
            if (!bulkOut) continue;
            try {
              await device.claimInterface(iface.interfaceNumber);
              if (alt.alternateSetting !== 0) {
                await device.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting);
              }
              claimed = iface.interfaceNumber;
              outEp = bulkOut.endpointNumber;
              break;
            } catch (e) { /* try next */ }
          }
          if (outEp >= 0) break;
        }
        if (claimed < 0 || outEp < 0) {
          try { await device.close(); } catch (e) {}
          var blocked =
            'USB is plugged in, but the Windows printer driver is blocking raw access. ' +
            'Use Print via Bluetooth (pair SPP-R200III, pick the Bluetooth COM port), or Download .prn. ' +
            'Seeing the printer under Printers & scanners does not make it appear in Serial.';
          setStatus(blocked);
          alert(blocked);
          return;
        }
        var bytes = escPosBytes();
        for (var offset = 0; offset < bytes.length; offset += 512) {
          await device.transferOut(outEp, bytes.subarray(offset, Math.min(offset + 512, bytes.length)));
        }
        await device.close();
        setStatus('Sent one-label job over USB.');
      } catch (err) {
        var msg = (err && err.message) ? err.message : 'Could not send over USB';
        if (/cancel|denied|No device selected/i.test(msg)) {
          msg =
            'Chrome did not get a USB device (list was empty or cancelled). ' +
            'The Windows printer driver usually hides the Bixolon from WebUSB. ' +
            'Fix: pair SPP-R200III in Windows Bluetooth, then Print via Bluetooth and pick the COM port — ' +
            'or Download .prn and send with a Bixolon utility.';
        }
        setStatus(msg);
        alert(msg);
      }
    }
    async function sendOverSerial(bluetoothOnly) {
      setStatus(bluetoothOnly
        ? 'Select the Bluetooth COM port (not the Windows printer name)…'
        : 'Select any COM / serial port…');
      try {
        if (!('serial' in navigator)) {
          setStatus('Web Serial not available in this browser (use Chrome on desktop). Try Print via USB or Download .prn.');
          return;
        }
        var port;
        try {
          // No USB-vendor filters — a Windows “printer” install is not a serial device.
          // Show Bluetooth COM ports and any real serial ports.
          port = await navigator.serial.requestPort(
            bluetoothOnly
              ? { allowedBluetoothServiceClassIds: [0x1101], filters: [{ bluetoothServiceClassId: 0x1101 }] }
              : { allowedBluetoothServiceClassIds: [0x1101] }
          );
        } catch (filterErr) {
          if (filterErr && /cancel|denied|No port selected/i.test(String(filterErr.message || filterErr))) {
            throw filterErr;
          }
          port = await navigator.serial.requestPort();
        }
        await port.open({ baudRate: 115200, bufferSize: 16384 });
        var writer = port.writable.getWriter();
        var bytes = escPosBytes();
        var chunkSize = bluetoothOnly ? 128 : 512;
        for (var offset = 0; offset < bytes.length; offset += chunkSize) {
          await writer.write(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
        }
        writer.releaseLock();
        await port.close();
        setStatus(bluetoothOnly
          ? 'Sent one-label job over Bluetooth.'
          : 'Sent one-label ESC/POS job over serial.');
      } catch (err) {
        var msg = (err && err.message) ? err.message : 'Could not send to printer';
        if (/cancel|denied|No port selected|compatible devices/i.test(msg)) {
          msg =
            'No serial/COM port found. The Bixolon under Printers & scanners is a Windows printer driver, not a COM port. ' +
            'Use Print via USB, or pair Bluetooth and use Print via Bluetooth, or Download .prn.';
        }
        setStatus(msg);
        alert(msg);
      }
    }
    document.getElementById('usb-btn').onclick = function () { void sendOverUsb(); };
    document.getElementById('bluetooth-btn').onclick = function () { void sendOverSerial(true); };
    document.getElementById('serial-btn').onclick = function () { void sendOverSerial(false); };
  </script>
</body>
</html>`)
  popup.document.close()
}

/**
 * Print inventory QR label(s) for Bixolon SPP-R200III.
 *
 * With the Windows printer driver installed (test page works), open the helper so
 * the user can Print to Windows Bixolon. Auto WebUSB/Serial usually fails because
 * that driver owns the USB device and there is no COM port.
 */
export async function printInventoryQrToBixolon(
  items: InventoryBixolonLabelItem[],
  overrides: BixolonLabelPrintOverrides = {},
): Promise<BixolonPrintResult> {
  const printable = items.filter((item) => Boolean(item.qr_code_data_url?.trim()))
  if (!printable.length) {
    throw new Error('Select at least one item with a QR code')
  }

  const canvases: HTMLCanvasElement[] = []
  for (const item of printable) {
    canvases.push(await renderLabelCanvas(item, overrides))
  }

  openBixolonPrintHelper(canvases)
  return {
    method: 'html',
    message:
      'Print helper opened. Windows print feeds ~5 ft if paper is still 58×3276 — add custom 58×50 mm (Receipt) in Bixolon Printing preferences first, or use Bluetooth / .prn for one label.',
  }
}
