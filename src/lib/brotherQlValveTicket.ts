import { findMedia } from '@thermal-label/brother-ql-core'
import type { RawImageData } from '@thermal-label/brother-ql-core'
import { requestPrinter } from '@thermal-label/brother-ql-web'
import {
  VALVE_TICKET_LABEL_HEIGHT_MM,
  buildValveTicketCardModel,
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

function drawGridLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function estimateCanvasHeightPx(valve: Valve, widthPx: number): number {
  const minHeight = Math.round((VALVE_TICKET_LABEL_HEIGHT_MM / 25.4) * LABEL_DPI)
  const card = buildValveTicketCardModel(valve)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return minHeight

  const left = 8
  const maxWidth = widthPx - 16
  let y = 52
  ctx.font = '18px Arial'
  y = wrapText(ctx, card.description, left, y, maxWidth, 20) + 36
  ctx.font = 'bold 20px Arial'
  y = wrapText(ctx, card.customer, left, y, maxWidth, 24) + 12
  return Math.max(minHeight, y)
}

function renderValveTicketCanvas(valve: Valve, widthPx: number, heightPx: number) {
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare label image')

  const card = buildValveTicketCardModel(valve)
  const half = Math.floor(widthPx / 2)
  const row1 = Math.round(heightPx * 0.28)
  const row2 = Math.round(heightPx * 0.24)
  const row3 = Math.round(heightPx * 0.2)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, widthPx - 2, heightPx - 2)

  const y1 = row1
  const y2 = row1 + row2
  const y3 = row1 + row2 + row3

  ctx.lineWidth = 1
  drawGridLine(ctx, 0, y1, widthPx, y1)
  drawGridLine(ctx, 0, y2, widthPx, y2)
  drawGridLine(ctx, 0, y3, widthPx, y3)
  drawGridLine(ctx, half, 0, half, y1)
  drawGridLine(ctx, half, y2, half, y3)

  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'

  ctx.font = 'bold 28px Arial'
  wrapText(ctx, card.valveId, 8, 8, half - 12, 30)

  ctx.font = 'bold 14px Arial'
  ctx.fillText('Due:', half + 8, 10)
  ctx.font = '16px Arial'
  ctx.fillText(card.dueLabel, half + 8, 28)

  ctx.font = '16px Arial'
  wrapText(ctx, card.description, 8, y1 + 8, widthPx - 16, 18)

  ctx.font = 'bold 14px Arial'
  ctx.fillText('Work Cell:', 8, y2 + 10)
  ctx.font = 'bold 16px Arial'
  wrapText(ctx, card.workCell, half + 8, y2 + 10, half - 12, 18)

  ctx.font = 'bold 22px Arial'
  wrapText(ctx, card.customer, 8, y3 + 10, widthPx - 16, 24)

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
  const heightPx = estimateCanvasHeightPx(valve, widthPx)
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
