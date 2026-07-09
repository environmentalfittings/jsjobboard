import { findMedia } from '@thermal-label/brother-ql-core'
import type { RawImageData } from '@thermal-label/brother-ql-core'
import { requestPrinter } from '@thermal-label/brother-ql-web'
import {
  VALVE_TICKET_LABEL_HEIGHT_MM,
  buildValveTicketLines,
} from './valveTicketPrint'
import type { Valve } from '../types'

const BROTHER_62MM_CONTINUOUS_MEDIA_ID = 259
const LABEL_DPI = 300

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/)
  let line = ''
  let cursorY = y

  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      line = word
      cursorY += lineHeight
    } else {
      line = test
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY)
    cursorY += lineHeight
  }

  return cursorY
}

function renderValveTicketCanvas(valve: Valve, widthPx: number, heightPx: number) {
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare label image')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  let y = 10
  const left = 10
  const maxWidth = widthPx - 20

  for (const line of buildValveTicketLines(valve)) {
    if (line === 'Production Card') {
      ctx.font = 'bold 22px Arial'
      ctx.fillText(line, left, y)
      y += 24
      continue
    }
    if (line === valve.valve_id) {
      ctx.font = 'bold 34px Arial'
      ctx.fillText(line, left, y)
      y += 38
      continue
    }

    ctx.font = '20px Arial'
    y = wrapText(ctx, line, left, y, maxWidth, 22)
    if (y > heightPx - 20) break
  }

  return canvas
}

/** Print directly to a Brother QL printer over USB (Chrome / Edge). */
export async function printValveTicketToBrotherUsb(valve: Valve): Promise<void> {
  if (!('usb' in navigator)) {
    throw new Error('This browser does not support USB printing. Use Chrome or Edge, or download the PDF instead.')
  }

  const media = findMedia(BROTHER_62MM_CONTINUOUS_MEDIA_ID)
  if (!media?.printableDots) {
    throw new Error('Could not load 62 mm Brother tape profile.')
  }

  const widthPx = media.printableDots
  const heightPx = Math.round((VALVE_TICKET_LABEL_HEIGHT_MM / 25.4) * LABEL_DPI)
  const canvas = renderValveTicketCanvas(valve, widthPx, heightPx)
  const imageData = canvas.getContext('2d')!.getImageData(0, 0, widthPx, heightPx)
  const rawImage: RawImageData = {
    width: widthPx,
    height: heightPx,
    data: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength),
  }

  const printer = await requestPrinter()
  try {
    await printer.print(rawImage, media)
  } finally {
    await printer.close()
  }
}
