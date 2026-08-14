import { findMedia } from '@thermal-label/brother-ql-core'
import type { RawImageData } from '@thermal-label/brother-ql-core'
import { requestPrinter } from '@thermal-label/brother-ql-web'
import type { InventoryRecord } from './inventory'

const BROTHER_62MM_CONTINUOUS_MEDIA_ID = 259
const LABEL_DPI = 300
/** Target QR size on 62 mm continuous tape (~1.7 in). */
const QR_SIZE_IN = 1.7

export type InventoryBrotherLabelItem = Pick<
  InventoryRecord,
  'id' | 'js_inventory_id' | 'customer' | 'customer_id_no' | 'qr_code_data_url' | 'hf_acid'
>

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  let cursorY = y
  let lines = 0

  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      lines += 1
      if (lines >= maxLines) return cursorY + lineHeight
      line = word
      cursorY += lineHeight
    } else {
      line = test
    }
  }

  if (line && lines < maxLines) {
    ctx.fillText(line, x, cursorY)
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

function renderInventoryLabelCanvas(
  item: InventoryBrotherLabelItem,
  qrImage: HTMLImageElement,
  widthPx: number,
): HTMLCanvasElement {
  const jsId = (item.js_inventory_id ?? '').trim() || 'JS inventory'
  const customerId = (item.customer_id_no ?? '').trim() || '—'
  const customer = (item.customer ?? '').trim()
  const qrPx = Math.min(Math.round(QR_SIZE_IN * LABEL_DPI), widthPx - 32)
  const pad = 16
  const maxTextWidth = widthPx - pad * 2

  let textHeight = 48 // JS ID
  textHeight += 32 // Customer ID
  if (customer) textHeight += 28
  if (item.hf_acid) textHeight += 24
  textHeight += 16

  const heightPx = pad + textHeight + qrPx + pad
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare label image')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  let y = pad
  ctx.font = 'bold 34px Arial'
  y = wrapText(ctx, jsId, pad, y, maxTextWidth, 38, 2)

  ctx.font = 'bold 22px Arial'
  y = wrapText(ctx, `Customer ID: ${customerId}`, pad, y, maxTextWidth, 26, 2)

  if (customer) {
    ctx.font = '20px Arial'
    y = wrapText(ctx, customer, pad, y, maxTextWidth, 24, 2)
  }

  if (item.hf_acid) {
    ctx.font = 'bold 18px Arial'
    ctx.fillText('HF ACID', pad, y)
    y += 24
  }

  y += 10
  const qrX = Math.round((widthPx - qrPx) / 2)
  ctx.drawImage(qrImage, qrX, y, qrPx, qrPx)

  return canvas
}

async function printOneInventoryLabel(item: InventoryBrotherLabelItem, media: NonNullable<ReturnType<typeof findMedia>>) {
  const qrSrc = item.qr_code_data_url?.trim()
  if (!qrSrc) throw new Error('This item does not have a QR code yet')

  const widthPx = media.printableDots
  if (!widthPx) throw new Error('Could not load 62 mm Brother tape profile.')

  const qrImage = await loadImage(qrSrc)
  const canvas = renderInventoryLabelCanvas(item, qrImage, widthPx)
  const imageData = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  const rawImage: RawImageData = {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength),
  }

  const printer = await requestPrinter()
  try {
    await printer.print(rawImage, media)
  } finally {
    await printer.close()
  }
}

/**
 * Print inventory QR label(s) on a Brother QL over USB (Chrome / Edge).
 * Label shows JS inventory ID, customer ID #, and the QR code.
 */
export async function printInventoryQrToBrotherUsb(
  items: InventoryBrotherLabelItem[],
): Promise<void> {
  if (!('usb' in navigator)) {
    throw new Error('This browser does not support USB printing. Use Chrome or Edge.')
  }

  const printable = items.filter((item) => Boolean(item.qr_code_data_url?.trim()))
  if (!printable.length) {
    throw new Error('Select at least one item with a QR code')
  }

  const media = findMedia(BROTHER_62MM_CONTINUOUS_MEDIA_ID)
  if (!media?.printableDots) {
    throw new Error('Could not load 62 mm Brother tape profile.')
  }

  for (const item of printable) {
    await printOneInventoryLabel(item, media)
  }
}
