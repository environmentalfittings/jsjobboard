import { findMedia } from '@thermal-label/brother-ql-core'
import type { RawImageData } from '@thermal-label/brother-ql-core'
import { requestPrinter } from '@thermal-label/brother-ql-web'
import type { InventoryRecord } from './inventory'
import { renderBixolonInventoryLabelCanvas } from './bixolonInventoryQrPrint'
import { BIXOLON_SPP_R200III, mmToDots } from '../constants/bixolonSppR200III'

const BROTHER_62MM_CONTINUOUS_MEDIA_ID = 259

export type InventoryBrotherLabelItem = Pick<
  InventoryRecord,
  'id' | 'js_inventory_id' | 'customer' | 'customer_id_no' | 'qr_code_data_url' | 'hf_acid'
>

async function printOneInventoryLabel(
  item: InventoryBrotherLabelItem,
  media: NonNullable<ReturnType<typeof findMedia>>,
) {
  const qrSrc = item.qr_code_data_url?.trim()
  if (!qrSrc) throw new Error('This item does not have a QR code yet')

  const widthPx = media.printableDots
  if (!widthPx) throw new Error('Could not load 62 mm Brother tape profile.')

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not load QR image'))
    el.src = qrSrc
  })

  const labelHeightMm = BIXOLON_SPP_R200III.labelHeightMm
  const canvas = renderBixolonInventoryLabelCanvas(item, img, { labelHeightMm })
  const scaled = document.createElement('canvas')
  scaled.width = widthPx
  scaled.height = Math.round((canvas.height / canvas.width) * widthPx) || mmToDots(labelHeightMm, 300)
  const sctx = scaled.getContext('2d')
  if (!sctx) throw new Error('Could not prepare label image')
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, scaled.width, scaled.height)
  sctx.imageSmoothingEnabled = false
  sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)

  const imageData = sctx.getImageData(0, 0, scaled.width, scaled.height)
  const rawImage: RawImageData = {
    width: scaled.width,
    height: scaled.height,
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
 * Desktop-only: print inventory QR label(s) on a Brother QL over USB (Chrome / Edge).
 * Inventory “Print on barcode printer” uses printInventoryQrToBixolon for iPad / SPP-R200III.
 */
export async function printInventoryQrToBrotherUsb(
  items: InventoryBrotherLabelItem[],
): Promise<void> {
  if (!('usb' in navigator)) {
    throw new Error('This browser does not support USB printing. Use Chrome or Edge on a desktop.')
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
