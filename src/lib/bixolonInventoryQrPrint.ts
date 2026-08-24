import type { InventoryRecord } from './inventory'
import {
  BIXOLON_SPP_R200III,
  dotsToMm,
  formatInches,
  mmToDots,
  resolveBixolonLabelSettings,
  type BixolonLabelPrintOverrides,
} from '../constants/bixolonSppR200III'
import { buildBixolonLabelEscPos, sendEscPosOverWebSerial, sendEscPosOverWebUsb } from './bixolonEscPos'
import {
  BIXOLON_LOCAL_SDK_BASES,
  BIXOLON_MPRINT_DEFAULT_PRINTER,
  BIXOLON_MPRINT_FETCH_TIMEOUT_MS,
  BIXOLON_MPRINT_PRINTER_STORAGE_KEY,
  getStoredMPrintPrinterName,
} from './bixolonMPrint'

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
    <div class="warn no-print" id="warn-desktop">
      <strong>USB cable:</strong> Windows often installs a printer driver that blocks raw USB from Chrome.
      If USB fails, pick Bluetooth <span class="mono">COM3</span> (outgoing) — not <span class="mono">COM4</span>.
      <p style="margin:0.75rem 0 0">
        Use <strong>Send via Serial/USB port</strong> or <strong>Print via Bluetooth / COM port</strong> below.
      </p>
    </div>
    <div class="warn no-print" id="warn-ios" style="display:none">
      <strong>Print with mPrint in one tap</strong>
      Keep Bixolon <strong>mPrint</strong> (or Web Print SDK) open with the SPP-R200III paired and registered
      (logical name usually <span class="mono">Printer1</span>). Tap <strong>Print with mPrint</strong> —
      the label is sent to the app so you can print.
      <ol>
        <li>Printer in <strong>iOS / MFi mode</strong>; pair in iPad Settings if needed.</li>
        <li>In mPrint, add the printer and note the logical name (default <span class="mono">Printer1</span>).</li>
        <li>Leave mPrint running, then tap <strong>Print with mPrint</strong> below.</li>
        <li>If it fails, open this site <em>inside</em> the mPrint / Web Print SDK browser (Safari may block localhost).</li>
      </ol>
    </div>
    <div class="no-print" id="mprint-name-row" style="margin:0 0 0.75rem">
      <label for="printer-name" style="display:block;font-size:12px;font-weight:600;margin-bottom:0.25rem">mPrint / Web Print SDK printer name</label>
      <input id="printer-name" type="text" value="${getStoredMPrintPrinterName().replace(/"/g, '&quot;')}"
        style="width:100%;padding:0.5rem 0.65rem;border:1px solid #cbd5e1;border-radius:8px;font:14px/1.2 system-ui,sans-serif" />
    </div>
    <div class="actions no-print" id="actions-desktop">
      <button type="button" class="primary" id="bluetooth-btn">Print via Bluetooth / COM port</button>
      <button type="button" id="mprint-send-btn">Print with mPrint / Web Print SDK</button>
      <button type="button" id="sdk-check-btn">Check if SDK is running</button>
      <button type="button" id="download-btn">Download .prn (one label)</button>
      <button type="button" id="serial-btn">Send via Serial/USB port</button>
      <button type="button" id="print-btn">Print via Chrome (58×297)</button>
      <button type="button" id="close-btn">Close</button>
    </div>
    <div class="actions no-print" id="actions-ios" style="display:none">
      <button type="button" class="primary" id="mprint-send-ios-btn">Print with mPrint</button>
      <button type="button" id="share-btn">Share / Save label image</button>
      <button type="button" id="print-ios-btn">Open iPad print sheet</button>
      <button type="button" id="mprint-btn">Get Bixolon mPrint</button>
      <button type="button" id="bluetooth-ios-btn">Why Bluetooth won’t work</button>
      <button type="button" id="close-ios-btn">Close</button>
    </div>
    <p class="no-print" id="status" style="color:#475569;min-height:1.25rem;margin:0 0 0.75rem"></p>
    <div class="preview">${previews}</div>
  </div>
  <script>
    var escPosBase64 = ${JSON.stringify(escPosBase64)};
    var labelPngDataUrls = ${JSON.stringify(canvases.map((c) => c.toDataURL('image/png')))};
    var labelPngDataUrl = labelPngDataUrls[0] || '';
    var mprintBases = ${JSON.stringify([...BIXOLON_LOCAL_SDK_BASES])};
    var mprintStorageKey = ${JSON.stringify(BIXOLON_MPRINT_PRINTER_STORAGE_KEY)};
    var mprintDefaultPrinter = ${JSON.stringify(BIXOLON_MPRINT_DEFAULT_PRINTER)};
    var mprintTimeoutMs = ${BIXOLON_MPRINT_FETCH_TIMEOUT_MS};
    var printableWidthDots = ${BIXOLON_SPP_R200III.printableWidthDots};
    function isIos() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    function setStatus(text) {
      var el = document.getElementById('status');
      if (el) el.textContent = text || '';
    }
    function getPrinterName() {
      var input = document.getElementById('printer-name');
      var name = (input && input.value ? String(input.value) : '').trim();
      return name || mprintDefaultPrinter;
    }
    function savePrinterName(name) {
      try { localStorage.setItem(mprintStorageKey, name); } catch (e) {}
    }
    function buildMPrintPayload(dataUrls, widthDots) {
      var functions = {};
      var n = 0;
      function add(fn, args) {
        var o = {};
        o[fn] = args;
        functions['func' + n] = o;
        n += 1;
      }
      add('checkPrinterStatus', []);
      for (var i = 0; i < dataUrls.length; i++) {
        add('printBitmap', [dataUrls[i], widthDots, 1, 1]);
      }
      return JSON.stringify({ id: 1, functions: functions });
    }
    async function sendViaMPrint() {
      var printerName = getPrinterName();
      savePrinterName(printerName);
      if (!labelPngDataUrls.length) {
        setStatus('No label image available.');
        return;
      }
      var sendBtns = [
        document.getElementById('mprint-send-btn'),
        document.getElementById('mprint-send-ios-btn'),
      ];
      sendBtns.forEach(function (btn) { if (btn) btn.disabled = true; });
      setStatus('Trying local mPrint / Web Print SDK…');
      var payload = buildMPrintPayload(labelPngDataUrls, printableWidthDots);
      var errors = [];
      try {
        for (var b = 0; b < mprintBases.length; b++) {
          var baseUrl = mprintBases[b];
          var url = baseUrl + encodeURIComponent(printerName) + '.bxl';
          setStatus('Trying ' + (b + 1) + '/' + mprintBases.length + ': ' + baseUrl);
          var controller = new AbortController();
          var timer = setTimeout(function () { controller.abort(); }, mprintTimeoutMs);
          try {
            var res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: payload,
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (res.status === 404) {
              errors.push(baseUrl + ': No printers (404)');
              continue;
            }
            if (!res.ok) {
              errors.push(baseUrl + ': HTTP ' + res.status);
              continue;
            }
            var text = await res.text();
            var result = text;
            try {
              var parsed = JSON.parse(text);
              if (parsed && typeof parsed.Result === 'string') result = parsed.Result;
            } catch (e) {}
            setStatus('Sent to mPrint (' + printerName + ') via ' + baseUrl + ' — ' + (result || 'ok') + '. Print from the app if it asks.');
            return;
          } catch (err) {
            clearTimeout(timer);
            var errMsg = (err && err.name === 'AbortError')
              ? ('Timed out after ' + mprintTimeoutMs + 'ms')
              : ((err && err.message) ? err.message : String(err));
            errors.push(baseUrl + ': ' + errMsg);
          }
        }
        var msg =
          'Could not reach mPrint / Web Print SDK for "' + printerName + '". ' +
          'On Windows: use Print via Bluetooth — that prints to your paired SPP-R200III without mPrint. ' +
          'mPrint only works if Web Print SDK is installed, running on port 18080, and SSL certificate is enabled. ' +
          errors.slice(0, 2).join(' · ');
        setStatus(msg);
        alert(msg);
      } finally {
        sendBtns.forEach(function (btn) { if (btn) btn.disabled = false; });
      }
    }
    function checkSdkRunning() {
      setStatus('Opening local SDK URLs — if the page fails to load, Web Print SDK / mPrint is not running on port 18080.');
      window.open('https://127.0.0.1:18080/WebPrintSDK/', '_blank');
      window.open('http://127.0.0.1:18080/WebPrintSDK/', '_blank');
    }
    function escPosBytes() {
      var binary = atob(escPosBase64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    function dataUrlToFile(dataUrl, fileName) {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
      var binary = atob(parts[1] || '');
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], fileName, { type: mime });
    }
    if (isIos()) {
      document.getElementById('warn-desktop').style.display = 'none';
      document.getElementById('actions-desktop').style.display = 'none';
      document.getElementById('warn-ios').style.display = 'block';
      document.getElementById('actions-ios').style.display = 'flex';
      setStatus('iPad — keep mPrint open, then tap Print with mPrint.');
    }
    document.getElementById('mprint-send-btn').onclick = function () { void sendViaMPrint(); };
    document.getElementById('mprint-send-ios-btn').onclick = function () { void sendViaMPrint(); };
    document.getElementById('sdk-check-btn').onclick = function () { checkSdkRunning(); };
    document.getElementById('print-btn').onclick = function () { window.print(); };
    document.getElementById('print-ios-btn').onclick = function () { window.print(); };
    document.getElementById('close-btn').onclick = function () { window.close(); };
    document.getElementById('close-ios-btn').onclick = function () { window.close(); };
    document.getElementById('mprint-btn').onclick = function () {
      window.open('https://apps.apple.com/app/mprint/id1439539765', '_blank');
    };
    document.getElementById('bluetooth-ios-btn').onclick = function () {
      var msg = 'This iPad browser cannot send raw Bluetooth print commands. Use Print with mPrint (local bridge), or Share / Save label image. For one-label ESC/POS over Bluetooth, use Windows/Mac Chrome.';
      setStatus(msg);
      alert(msg);
    };
    document.getElementById('share-btn').onclick = async function () {
      try {
        if (!labelPngDataUrl) {
          setStatus('No label image available.');
          return;
        }
        var file = dataUrlToFile(labelPngDataUrl, 'inventory-label.png');
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Inventory QR label',
          });
          setStatus('Shared label image — open it in mPrint or Photos to print.');
          return;
        }
        var a = document.createElement('a');
        a.href = labelPngDataUrl;
        a.download = 'inventory-label.png';
        a.click();
        setStatus('Saved label image — open it in mPrint or Photos to print.');
      } catch (err) {
        if (err && err.name === 'AbortError') {
          setStatus('Share cancelled.');
          return;
        }
        setStatus((err && err.message) ? err.message : 'Could not share label image');
      }
    };
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
    async function sendOverSerial(bluetoothOnly) {
      setStatus(bluetoothOnly
        ? 'Select SPP-R200III or a Bluetooth COM port…'
        : 'Select the Bixolon port…');
      try {
        if (!('serial' in navigator)) {
          var iosMsg = 'This browser cannot print via Bluetooth/serial from the website. Use Chrome on Windows/Mac, or Share / Save on iPad with mPrint.';
          setStatus(iosMsg);
          alert(iosMsg);
          return;
        }
        var serialApi = (window.opener && window.opener.navigator && window.opener.navigator.serial)
          ? window.opener.navigator.serial
          : navigator.serial;
        var port;
        try {
          // Request from opener when possible — Chrome often hides ports in about:blank popups.
          port = bluetoothOnly
            ? await serialApi.requestPort({ allowedBluetoothServiceClassIds: [0x1101] })
            : await serialApi.requestPort({
                allowedBluetoothServiceClassIds: [0x1101],
                filters: [
                  { usbVendorId: 0x1504 },
                  { usbVendorId: 0x0419 },
                  { bluetoothServiceClassId: 0x1101 },
                ],
              });
        } catch (filterErr) {
          if (filterErr && /cancel|denied|No port selected/i.test(String(filterErr.message || filterErr))) {
            throw filterErr;
          }
          port = await serialApi.requestPort();
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
          ? 'Sent one-label job over Bluetooth/COM.'
          : 'Sent one-label ESC/POS job over serial/USB.');
      } catch (err) {
        var msg = (err && err.message) ? err.message : 'Could not send to printer';
        if (/cancel|denied|No port selected/i.test(msg)) {
          msg = 'No port selected. If the list was empty: pair the SPP-R200III in Windows Bluetooth, then check Device Manager for a COM port (Standard Serial over Bluetooth link). Use Google Chrome (not Edge/Safari).';
        }
        setStatus(msg);
        alert(msg);
      }
    }
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
 * Order: WebUSB (cable) → Web Serial (USB/Bluetooth COM) → helper window.
 * On Windows, a USB cable often installs a printer driver that blocks WebUSB;
 * then pick Bluetooth COM3 (outgoing), not COM4.
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

  const jobs = canvases.map((canvas) => buildBixolonLabelEscPos(canvas))
  const combined = new Uint8Array(jobs.reduce((sum, job) => sum + job.length, 0))
  let offset = 0
  for (const job of jobs) {
    combined.set(job, offset)
    offset += job.length
  }

  const labelWord =
    items.length === 1 ? 'label' : `${items.length} labels`

  if ('usb' in navigator) {
    try {
      await sendEscPosOverWebUsb(combined)
      return {
        method: 'usb',
        message: `Sent ${labelWord} to Bixolon over USB`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/cancel|denied|No device selected/i.test(message)) {
        // User dismissed USB picker — fall through to serial / helper
      } else {
        console.warn('Bixolon WebUSB print failed:', error)
      }
    }
  }

  if ('serial' in navigator) {
    try {
      // Include USB serial + Bluetooth COM (not bluetooth-only).
      await sendEscPosOverWebSerial(combined, { bluetoothOnly: false })
      return {
        method: 'usb',
        message: `Sent ${labelWord} to Bixolon over serial / COM`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/cancel|denied|No port selected/i.test(message)) {
        throw new Error(
          'No port selected. For USB: pick BIXOLON in the device list if shown. If Windows owns the USB printer driver, use Bluetooth COM3 (outgoing) instead of COM4.',
        )
      }
      console.warn('Bixolon serial print failed, opening helper:', error)
    }
  }

  openBixolonPrintHelper(canvases)
  return {
    method: 'html',
    message:
      'Print helper opened. USB cable with the Windows printer driver often blocks raw USB — use Send via Serial/USB, or Bluetooth COM3.',
  }
}
